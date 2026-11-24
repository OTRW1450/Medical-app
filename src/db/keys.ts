// Passcode & data-key management.
//
// A random 256-bit data key encrypts all records. That data key is itself
// encrypted ("wrapped") with a key derived from the passcode (PBKDF2-SHA256,
// 600k iterations), so changing the passcode doesn't require re-encrypting
// everything, and the passcode itself is never stored.
import { db, type KeyMeta } from './db';

const ITERATIONS = 600_000;
let dataKey: CryptoKey | null = null;
let rawKey: Uint8Array<ArrayBuffer> | null = null;
const listeners = new Set<() => void>();

export const subscribeLock = (f: () => void) => (listeners.add(f), () => void listeners.delete(f));
const emit = () => listeners.forEach((f) => f());

export function currentKey(): CryptoKey {
  if (!dataKey) throw new Error('Locked');
  return dataKey;
}
export const isUnlocked = () => dataKey !== null;

async function kek(pass: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function install(raw: Uint8Array<ArrayBuffer>) {
  rawKey = raw;
  dataKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function wrap(raw: Uint8Array<ArrayBuffer>, pass: string): Promise<KeyMeta> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await kek(pass, salt, ITERATIONS), raw);
  return { id: 'key', salt, iv, wrapped, iterations: ITERATIONS, createdAt: Date.now() };
}

export async function hasPasscode(): Promise<boolean> {
  return (await db.meta.get('key')) !== undefined;
}

export async function setupPasscode(pass: string) {
  if (await hasPasscode()) throw new Error('A passcode is already set.');
  const raw = crypto.getRandomValues(new Uint8Array(32));
  await db.meta.put(await wrap(raw, pass));
  await install(raw);
  emit();
}

export async function unlock(pass: string) {
  const m = await db.meta.get('key');
  if (!m) throw new Error('No passcode set.');
  let raw: ArrayBuffer;
  try {
    raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: m.iv as Uint8Array<ArrayBuffer> }, await kek(pass, m.salt as Uint8Array<ArrayBuffer>, m.iterations), m.wrapped);
  } catch {
    throw new Error('Wrong passcode.');
  }
  await install(new Uint8Array(raw));
  emit();
}

export async function changePasscode(oldPass: string, newPass: string) {
  await unlock(oldPass); // verifies the old passcode
  await db.meta.put(await wrap(rawKey!, newPass));
}

export function lock() {
  dataKey = null;
  rawKey = null;
  emit();
}

/** Irreversibly deletes all data on this device. */
export async function eraseEverything() {
  lock();
  await db.delete();
  localStorage.clear();
  location.reload();
}

export const MIN_PASSCODE = 8;

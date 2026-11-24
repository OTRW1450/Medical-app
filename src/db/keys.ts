// Passcode, recovery key & data-key management.
//
// A random 256-bit data key encrypts all records. That data key is stored
// only in "wrapped" (encrypted) form, twice:
//   1. wrapped with a key derived from the passcode, and
//   2. wrapped with a key derived from the recovery key (optional but
//      strongly recommended), a 160-bit random code shown once to the user.
// Either one can unlock the data key. Neither the passcode nor the recovery
// key is ever stored. There is no server, so no-one else can reset access.
import { db, type KeyMeta, type ThrottleMeta } from './db';

const ITERATIONS = 600_000;
let dataKey: CryptoKey | null = null;
let rawKey: Uint8Array<ArrayBuffer> | null = null;
const listeners = new Set<() => void>();

export const subscribeLock = (f: () => void) => (listeners.add(f), () => void listeners.delete(f));
const emit = () => listeners.forEach((f) => f());
/** Tell the UI the app is unlocked (used after showing a new recovery key). */
export const notifyUnlocked = emit;

export function currentKey(): CryptoKey {
  if (!dataKey) throw new Error('Locked');
  return dataKey;
}
export const isUnlocked = () => dataKey !== null;

async function kek(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function install(raw: Uint8Array<ArrayBuffer>) {
  rawKey = raw;
  dataKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function wrap(id: KeyMeta['id'], raw: Uint8Array<ArrayBuffer>, secret: string): Promise<KeyMeta> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await kek(secret, salt, ITERATIONS), raw);
  return { id, salt, iv, wrapped, iterations: ITERATIONS, createdAt: Date.now() };
}

async function unwrap(id: KeyMeta['id'], secret: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const m = (await db.meta.get(id)) as KeyMeta | undefined;
  if (!m) return null;
  try {
    const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: m.iv as Uint8Array<ArrayBuffer> }, await kek(secret, m.salt as Uint8Array<ArrayBuffer>, m.iterations), m.wrapped);
    return new Uint8Array(raw);
  } catch {
    return null;
  }
}

// ---------- Throttling of failed attempts ----------
// Slows down someone guessing at the lock screen. (A determined attacker with a
// copy of the device storage could bypass the UI – the real protection is the
// strength of the passcode and the slow PBKDF2 key derivation.)

const FREE_ATTEMPTS = 5;

export async function lockoutRemainingMs(): Promise<number> {
  const t = (await db.meta.get('throttle')) as ThrottleMeta | undefined;
  return t ? Math.max(0, t.until - Date.now()) : 0;
}

async function registerFailure() {
  const t = ((await db.meta.get('throttle')) as ThrottleMeta | undefined) ?? { id: 'throttle', fails: 0, until: 0 };
  const fails = t.fails + 1;
  const delay = fails < FREE_ATTEMPTS ? 0 : Math.min(15 * 60_000, 30_000 * 2 ** (fails - FREE_ATTEMPTS));
  await db.meta.put({ id: 'throttle', fails, until: Date.now() + delay });
}

async function clearFailures() {
  await db.meta.delete('throttle');
}

async function guard() {
  const ms = await lockoutRemainingMs();
  if (ms > 0) throw new Error(`Too many attempts. Try again in ${Math.ceil(ms / 1000)} seconds.`);
}

// ---------- Passcode ----------

export async function hasPasscode(): Promise<boolean> {
  return (await db.meta.get('key')) !== undefined;
}

/**
 * Creates the data key and the passcode. Also creates a recovery key, which is
 * returned and must be shown to the user. Call notifyUnlocked() once they have
 * saved it.
 */
export async function setupPasscode(pass: string): Promise<string> {
  if (await hasPasscode()) throw new Error('A passcode is already set.');
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const code = generateRecoveryCode();
  await db.meta.bulkPut([await wrap('key', raw, pass), await wrap('recovery', raw, normalizeRecoveryCode(code))]);
  await install(raw);
  return code;
}

export async function unlock(pass: string) {
  await guard();
  const raw = await unwrap('key', pass);
  if (!raw) {
    await registerFailure();
    throw new Error('Wrong passcode.');
  }
  await clearFailures();
  await install(raw);
  emit();
}

export async function changePasscode(oldPass: string, newPass: string) {
  await unlock(oldPass); // verifies the old passcode (and is throttled)
  await db.meta.put(await wrap('key', rawKey!, newPass));
}

export function lock() {
  dataKey = null;
  rawKey = null;
  emit();
}

// ---------- Recovery key ----------

// Crockford base32: no I, L, O or U, so it is easy to read back and type.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20)); // 160 bits
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g)!.join('-'); // 32 chars → 8 groups of 4
}

/** Accepts lower case, spaces, missing dashes and look-alike letters. */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');
}

export const isPlausibleRecoveryCode = (s: string) => normalizeRecoveryCode(s).length === 32;

export async function hasRecoveryKey(): Promise<boolean> {
  return (await db.meta.get('recovery')) !== undefined;
}

/** Creates (or replaces) the recovery key while unlocked. The old one stops working. */
export async function createRecoveryKey(): Promise<string> {
  if (!rawKey) throw new Error('Locked');
  const code = generateRecoveryCode();
  await db.meta.put(await wrap('recovery', rawKey, normalizeRecoveryCode(code)));
  return code;
}

/** Checks a saved recovery key without changing anything (while unlocked). */
export async function verifyRecoveryKey(code: string): Promise<boolean> {
  const raw = await unwrap('recovery', normalizeRecoveryCode(code));
  return !!raw && !!rawKey && raw.every((b, i) => b === rawKey![i]);
}

/**
 * Forgot-passcode flow: unlocks with the recovery key, sets a new passcode and
 * issues a NEW recovery key (the used one is retired). Returns the new key,
 * which must be shown to the user; call notifyUnlocked() afterwards.
 */
export async function recoverWithKey(code: string, newPass: string): Promise<string> {
  await guard();
  const raw = await unwrap('recovery', normalizeRecoveryCode(code));
  if (!raw) {
    await registerFailure();
    throw new Error('That recovery key is not correct.');
  }
  await clearFailures();
  const fresh = generateRecoveryCode();
  await db.meta.bulkPut([await wrap('key', raw, newPass), await wrap('recovery', raw, normalizeRecoveryCode(fresh))]);
  await install(raw);
  return fresh;
}

/** Irreversibly deletes all data on this device. */
export async function eraseEverything() {
  lock();
  await db.delete();
  localStorage.clear();
  location.reload();
}

export const MIN_PASSCODE = 8;

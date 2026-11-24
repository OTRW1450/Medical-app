// Export / import of a patient's whole record, optionally encrypted with a
// passphrase (AES-GCM, key derived with PBKDF2-SHA256, 600k iterations).
import { db } from './db';
import type { Attachment, PatientData } from '../types';
import { uid } from '../lib/id';

const FORMAT = 'pain-chronicle-backup';
const VERSION = 1;

interface SerializedAttachment extends Omit<Attachment, 'blob'> {
  data: string; // base64
}

interface BackupFile extends PatientData {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  attachments: SerializedAttachment[];
}

interface EncryptedFile {
  format: typeof FORMAT;
  encrypted: true;
  salt: string;
  iv: string;
  data: string;
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(pass: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function exportPatient(patientId: string, passphrase?: string): Promise<Blob> {
  const [patient, events, meds, labs, logs, questions, atts] = await Promise.all([
    db.patients.get(patientId),
    db.events.where('patientId').equals(patientId).toArray(),
    db.meds.where('patientId').equals(patientId).toArray(),
    db.labs.where('patientId').equals(patientId).toArray(),
    db.logs.where('patientId').equals(patientId).toArray(),
    db.questions.where('patientId').equals(patientId).toArray(),
    db.attachments.where('patientId').equals(patientId).toArray(),
  ]);
  if (!patient) throw new Error('Patient not found');
  const attachments: SerializedAttachment[] = [];
  for (const a of atts) {
    const { blob, ...rest } = a;
    attachments.push({ ...rest, data: b64(await blob.arrayBuffer()) });
  }
  const file: BackupFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    patient,
    events,
    meds,
    labs,
    logs,
    questions,
    attachments,
  };
  const json = JSON.stringify(file);
  if (!passphrase) return new Blob([json], { type: 'application/json' });
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json));
  const enc: EncryptedFile = { format: FORMAT, encrypted: true, salt: b64(salt), iv: b64(iv), data: b64(ct) };
  return new Blob([JSON.stringify(enc)], { type: 'application/json' });
}

export function isEncryptedBackup(text: string): boolean {
  try {
    const j = JSON.parse(text);
    return j?.format === FORMAT && j?.encrypted === true;
  } catch {
    return false;
  }
}

/** Imports a backup as a NEW patient (ids are re-generated so nothing is overwritten). */
export async function importBackup(text: string, passphrase?: string): Promise<string> {
  let j = JSON.parse(text);
  if (j?.format !== FORMAT) throw new Error('This is not a Pain Chronicle backup file.');
  if (j.encrypted) {
    if (!passphrase) throw new Error('This backup is encrypted – a passphrase is required.');
    const key = await deriveKey(passphrase, unb64(j.salt));
    let pt: ArrayBuffer;
    try {
      pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(j.iv) }, key, unb64(j.data));
    } catch {
      throw new Error('Wrong passphrase, or the file is damaged.');
    }
    j = JSON.parse(new TextDecoder().decode(pt));
  }
  const f = j as BackupFile;
  return importData(f, f.attachments ?? []);
}

export async function importData(f: PatientData, attachments: SerializedAttachment[] = []): Promise<string> {
  const pid = uid();
  const evMap = new Map<string, string>();
  for (const e of f.events) evMap.set(e.id, uid());
  await db.transaction('rw', [db.patients, db.events, db.meds, db.labs, db.logs, db.questions, db.attachments], async () => {
    await db.patients.add({ ...f.patient, id: pid });
    await db.events.bulkAdd(f.events.map((e) => ({ ...e, id: evMap.get(e.id)!, patientId: pid })));
    await db.meds.bulkAdd(f.meds.map((m) => ({ ...m, id: uid(), patientId: pid })));
    await db.labs.bulkAdd(f.labs.map((l) => ({ ...l, id: uid(), patientId: pid, eventId: l.eventId ? evMap.get(l.eventId) : undefined })));
    await db.logs.bulkAdd(f.logs.map((l) => ({ ...l, id: uid(), patientId: pid })));
    await db.questions.bulkAdd((f.questions ?? []).map((q) => ({ ...q, id: uid(), patientId: pid })));
    await db.attachments.bulkAdd(
      attachments.map(({ data, ...a }) => ({
        ...a,
        id: uid(),
        patientId: pid,
        eventId: a.eventId ? evMap.get(a.eventId) : undefined,
        blob: new Blob([unb64(data)], { type: a.mime }),
      })),
    );
  });
  return pid;
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

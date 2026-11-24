// Encrypted repository. All reads/writes of patient data go through here.
// Rows on disk are { id, patientId?, eventId?, iv, ct } – see db.ts.
import { db, RECORD_TABLES, type EncRow, type RecordTable } from './db';
import { currentKey } from './keys';
import type { Attachment, DailyLog, InsightState, LabResult, MedicalEvent, Medication, Patient, PatientData, Question } from '../types';

interface TableTypes {
  patients: Patient;
  events: MedicalEvent;
  meds: Medication;
  labs: LabResult;
  logs: DailyLog;
  insightStates: InsightState;
  questions: Question;
}
type Row<T extends RecordTable> = TableTypes[T];

const enc = new TextEncoder();
const dec = new TextDecoder();

async function seal(bytes: Uint8Array<ArrayBuffer>) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, currentKey(), bytes);
  return { iv, ct };
}
async function open(iv: Uint8Array, ct: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> }, currentKey(), ct);
}

export async function encryptRow(obj: { id: string; patientId?: string; eventId?: string }): Promise<EncRow> {
  const { iv, ct } = await seal(enc.encode(JSON.stringify(obj)));
  const row: EncRow = { id: obj.id, iv, ct };
  if (obj.patientId) row.patientId = obj.patientId;
  if (obj.eventId) row.eventId = obj.eventId;
  return row;
}

export async function decryptRow<T>(row: EncRow): Promise<T> {
  if (!row.ct || !row.iv) return row as unknown as T; // legacy plaintext (pre-migration)
  return JSON.parse(dec.decode(await open(row.iv, row.ct))) as T;
}

const tbl = (t: RecordTable | 'attachments') => db[t];

export const store = {
  async put<T extends RecordTable>(t: T, obj: Row<T>) {
    await tbl(t).put(await encryptRow(obj));
  },
  async bulkPut<T extends RecordTable>(t: T, objs: Row<T>[]) {
    const rows = await Promise.all(objs.map((o) => encryptRow(o)));
    await tbl(t).bulkPut(rows);
  },
  async get<T extends RecordTable>(t: T, id: string): Promise<Row<T> | undefined> {
    const r = await tbl(t).get(id);
    return r ? decryptRow<Row<T>>(r) : undefined;
  },
  async update<T extends RecordTable>(t: T, id: string, patch: Partial<Row<T>>) {
    const cur = await store.get(t, id);
    if (cur) await store.put(t, { ...cur, ...patch });
  },
  async remove(t: RecordTable, id: string) {
    await tbl(t).delete(id);
  },
  async byPatient<T extends RecordTable>(t: T, patientId: string): Promise<Row<T>[]> {
    const rows = await tbl(t).where('patientId').equals(patientId).toArray();
    return Promise.all(rows.map((r) => decryptRow<Row<T>>(r)));
  },
  async allPatients(): Promise<Patient[]> {
    const rows = await db.patients.toArray();
    const ps = await Promise.all(rows.map((r) => decryptRow<Patient>(r)));
    return ps.sort((a, b) => a.name.localeCompare(b.name));
  },
};

// ---------------- Attachments (file bytes encrypted separately) ----------------

export type AttachmentMeta = Omit<Attachment, 'blob'>;

export const attachments = {
  async put(a: Attachment) {
    const { blob, ...meta } = a;
    const row = await encryptRow(meta);
    const { iv, ct } = await seal(new Uint8Array(await blob.arrayBuffer()));
    await db.attachments.put({ ...row, biv: iv, bct: ct });
  },
  async metaByEvent(eventId: string): Promise<AttachmentMeta[]> {
    const rows = await db.attachments.where('eventId').equals(eventId).toArray();
    return Promise.all(rows.map((r) => decryptRow<AttachmentMeta>(r)));
  },
  async metaByPatient(patientId: string): Promise<AttachmentMeta[]> {
    const rows = await db.attachments.where('patientId').equals(patientId).toArray();
    return Promise.all(rows.map((r) => decryptRow<AttachmentMeta>(r)));
  },
  async get(id: string): Promise<Attachment | undefined> {
    const r = await db.attachments.get(id);
    if (!r) return undefined;
    const meta = await decryptRow<AttachmentMeta & { blob?: Blob }>(r);
    if (meta.blob instanceof Blob) return meta as Attachment; // legacy plaintext row
    const bytes = await open(r.biv!, r.bct!);
    return { ...meta, blob: new Blob([bytes], { type: meta.mime }) };
  },
  async remove(id: string) {
    await db.attachments.delete(id);
  },
  async removeByEvent(eventId: string) {
    await db.attachments.where('eventId').equals(eventId).delete();
  },
};

// ---------------- Whole-patient helpers ----------------

export async function loadPatientData(patientId: string): Promise<(PatientData & { insightStates: InsightState[] }) | undefined> {
  const [patient, events, meds, labs, logs, questions, insightStates] = await Promise.all([
    store.get('patients', patientId),
    store.byPatient('events', patientId),
    store.byPatient('meds', patientId),
    store.byPatient('labs', patientId),
    store.byPatient('logs', patientId),
    store.byPatient('questions', patientId),
    store.byPatient('insightStates', patientId),
  ]);
  if (!patient) return undefined;
  events.sort((a, b) => a.date.localeCompare(b.date));
  meds.sort((a, b) => a.startDate.localeCompare(b.startDate));
  labs.sort((a, b) => a.date.localeCompare(b.date));
  logs.sort((a, b) => a.date.localeCompare(b.date));
  return { patient, events, meds, labs, logs, questions, insightStates };
}

export async function deletePatient(patientId: string) {
  const tables = [db.events, db.meds, db.labs, db.logs, db.attachments, db.insightStates, db.questions];
  await db.transaction('rw', [db.patients, ...tables], async () => {
    for (const t of tables) await t.where('patientId').equals(patientId).delete();
    await db.patients.delete(patientId);
  });
}

/** Encrypt any rows still stored in plaintext (from before the passcode existed). */
export async function encryptLegacyRows(): Promise<number> {
  let n = 0;
  for (const t of [...RECORD_TABLES, 'attachments'] as const) {
    const rows = await tbl(t).toArray();
    const legacy = rows.filter((r) => !r.ct);
    if (!legacy.length) continue;
    const out: EncRow[] = [];
    for (const r of legacy) {
      if (t === 'attachments') {
        const { blob, ...meta } = r as unknown as Attachment;
        const row = await encryptRow(meta);
        const { iv, ct } = await seal(new Uint8Array(await blob.arrayBuffer()));
        out.push({ ...row, biv: iv, bct: ct });
      } else {
        // v1 insight-state IDs embedded the insight key (e.g. a lab name) – replace with a random ID.
        const obj = r as unknown as { id: string };
        if (t === 'insightStates') obj.id = crypto.randomUUID();
        out.push(await encryptRow(obj));
      }
    }
    await db.transaction('rw', tbl(t), async () => {
      await tbl(t).bulkDelete(legacy.map((r) => r.id));
      await tbl(t).bulkPut(out);
    });
    n += out.length;
  }
  return n;
}

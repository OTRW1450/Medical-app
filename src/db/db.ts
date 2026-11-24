import Dexie, { type Table } from 'dexie';

/**
 * On-disk shape of every record: only random IDs are stored in the clear;
 * all content (names, dates, findings, values…) is AES-GCM encrypted.
 */
export interface EncRow {
  id: string;
  patientId?: string;
  eventId?: string;
  iv?: Uint8Array;
  ct?: ArrayBuffer;
  /** attachments only: separately encrypted file bytes */
  biv?: Uint8Array;
  bct?: ArrayBuffer;
}

export interface KeyMeta {
  /** 'key' = data key wrapped by the passcode; 'recovery' = data key wrapped by the recovery key */
  id: 'key' | 'recovery';
  salt: Uint8Array;
  iv: Uint8Array;
  wrapped: ArrayBuffer;
  iterations: number;
  createdAt: number;
}

/** Failed-attempt counter, kept in the same database so it can't be reset by clearing site settings alone. */
export interface ThrottleMeta {
  id: 'throttle';
  fails: number;
  until: number;
}

export const RECORD_TABLES = ['patients', 'events', 'meds', 'labs', 'logs', 'insightStates', 'questions'] as const;
export type RecordTable = (typeof RECORD_TABLES)[number];

class ChronicleDB extends Dexie {
  patients!: Table<EncRow, string>;
  events!: Table<EncRow, string>;
  meds!: Table<EncRow, string>;
  labs!: Table<EncRow, string>;
  logs!: Table<EncRow, string>;
  attachments!: Table<EncRow, string>;
  insightStates!: Table<EncRow, string>;
  questions!: Table<EncRow, string>;
  meta!: Table<KeyMeta | ThrottleMeta, string>;

  constructor() {
    super('pain-chronicle');
    // v1 (unencrypted, content indexes) – kept so existing installs upgrade cleanly.
    this.version(1).stores({
      patients: 'id, name',
      events: 'id, patientId, [patientId+date], type',
      meds: 'id, patientId, startDate',
      labs: 'id, patientId, [patientId+test], date, eventId',
      logs: 'id, patientId, [patientId+date]',
      attachments: 'id, patientId, eventId',
      insightStates: 'id, patientId',
      questions: 'id, patientId',
    });
    // v2: only opaque IDs are indexed; content is encrypted (see store.ts).
    this.version(2).stores({
      patients: 'id',
      events: 'id, patientId',
      meds: 'id, patientId',
      labs: 'id, patientId',
      logs: 'id, patientId',
      attachments: 'id, patientId, eventId',
      insightStates: 'id, patientId',
      questions: 'id, patientId',
      meta: 'id',
    });
  }
}

export const db = new ChronicleDB();

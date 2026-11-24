import Dexie, { type EntityTable } from 'dexie';
import type {
  Attachment,
  DailyLog,
  InsightState,
  LabResult,
  MedicalEvent,
  Medication,
  Patient,
  Question,
} from '../types';

class ChronicleDB extends Dexie {
  patients!: EntityTable<Patient, 'id'>;
  events!: EntityTable<MedicalEvent, 'id'>;
  meds!: EntityTable<Medication, 'id'>;
  labs!: EntityTable<LabResult, 'id'>;
  logs!: EntityTable<DailyLog, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;
  insightStates!: EntityTable<InsightState, 'id'>;
  questions!: EntityTable<Question, 'id'>;

  constructor() {
    super('pain-chronicle');
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
  }
}

export const db = new ChronicleDB();

const PATIENT_TABLES = ['events', 'meds', 'labs', 'logs', 'attachments', 'insightStates', 'questions'] as const;

export async function deletePatient(patientId: string) {
  await db.transaction('rw', [db.patients, ...PATIENT_TABLES.map((t) => db[t])], async () => {
    for (const t of PATIENT_TABLES) await db[t].where('patientId').equals(patientId).delete();
    await db.patients.delete(patientId);
  });
}

export async function loadPatientData(patientId: string) {
  const [patient, events, meds, labs, logs, questions] = await Promise.all([
    db.patients.get(patientId),
    db.events.where('patientId').equals(patientId).toArray(),
    db.meds.where('patientId').equals(patientId).toArray(),
    db.labs.where('patientId').equals(patientId).toArray(),
    db.logs.where('patientId').equals(patientId).toArray(),
    db.questions.where('patientId').equals(patientId).toArray(),
  ]);
  if (!patient) return undefined;
  events.sort((a, b) => a.date.localeCompare(b.date));
  meds.sort((a, b) => a.startDate.localeCompare(b.startDate));
  labs.sort((a, b) => a.date.localeCompare(b.date));
  logs.sort((a, b) => a.date.localeCompare(b.date));
  return { patient, events, meds, labs, logs, questions };
}

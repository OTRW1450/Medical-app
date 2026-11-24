// Core data model. Everything is stored locally in the browser (IndexedDB).

export type ISODate = string; // yyyy-mm-dd

export interface Patient {
  id: string;
  name: string;
  dob?: ISODate;
  sex?: 'female' | 'male' | 'intersex' | 'unspecified';
  allergies?: string;
  familyHistory?: string;
  background?: string; // free-text summary of the story so far
  goals?: string; // what the patient wants answered
  createdAt: number;
}

export const EVENT_TYPES = [
  'symptom',
  'diagnosis',
  'visit',
  'imaging',
  'lab',
  'procedure',
  'surgery',
  'hospitalization',
  'injury',
  'illness',
  'life',
  'note',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  symptom: 'Symptom onset / change',
  diagnosis: 'Diagnosis',
  visit: 'Appointment / consult',
  imaging: 'Imaging / scan',
  lab: 'Lab / test panel',
  procedure: 'Procedure / injection',
  surgery: 'Surgery',
  hospitalization: 'ER / hospital stay',
  injury: 'Injury / accident',
  illness: 'Infection / acute illness',
  life: 'Life event (pregnancy, move, stress…)',
  note: 'Note',
};

export type DatePrecision = 'day' | 'month' | 'year';

export type DiagnosisStatus = 'active' | 'resolved' | 'suspected' | 'ruled-out';

export interface MedicalEvent {
  id: string;
  patientId: string;
  type: EventType;
  date: ISODate;
  datePrecision: DatePrecision;
  endDate?: ISODate;
  title: string;
  provider?: string;
  specialty?: string;
  facility?: string;
  bodyRegions: string[];
  systems: string[];
  tags: string[];
  /** Report text / findings / impression – the raw words matter for pattern matching. */
  findings?: string;
  notes?: string;
  status?: DiagnosisStatus; // for diagnoses
  modality?: string; // for imaging: MRI, CT, X-ray, US, …
  followUpRecommended?: boolean;
  followUpDone?: boolean;
  importance?: 1 | 2 | 3; // 3 = key event
  createdAt: number;
  updatedAt: number;
}

export interface Medication {
  id: string;
  patientId: string;
  name: string;
  drugClass?: string;
  dose?: string;
  reason?: string;
  prescriber?: string;
  startDate: ISODate;
  endDate?: ISODate;
  /** -2 made worse … 0 no effect … +2 very helpful */
  effectiveness?: -2 | -1 | 0 | 1 | 2;
  sideEffects?: string;
  stopReason?: string;
  createdAt: number;
}

export interface LabResult {
  id: string;
  patientId: string;
  date: ISODate;
  test: string;
  value?: number;
  textValue?: string; // e.g. "positive", "negative", "1:160 speckled"
  unit?: string;
  refLow?: number;
  refHigh?: number;
  flag?: 'H' | 'L' | 'A' | ''; // as reported by the lab
  eventId?: string;
  createdAt: number;
}

export interface RegionPain {
  region: string;
  intensity: number; // 0-10
  qualities: string[];
}

export interface DailyLog {
  id: string;
  patientId: string;
  date: ISODate;
  pain: number; // overall 0-10
  regions: RegionPain[];
  fatigue?: number; // 0-10
  sleepHours?: number;
  sleepQuality?: number; // 0-10 (10 = great)
  mood?: number; // 0-10 (10 = great)
  stress?: number; // 0-10
  activity?: number; // 0-10
  function?: number; // 0-10 how much could you do (10 = everything)
  symptoms: string[]; // other symptoms that day
  triggers: string[]; // suspected triggers / exposures
  menstruating?: boolean;
  notes?: string;
  createdAt: number;
}

export interface Attachment {
  id: string;
  patientId: string;
  eventId?: string;
  name: string;
  mime: string;
  size: number;
  blob: Blob;
  addedAt: number;
}

export interface InsightState {
  id: string; // `${patientId}:${insightKey}`
  patientId: string;
  key: string;
  state: 'pinned' | 'dismissed';
  note?: string;
}

export interface Question {
  id: string;
  patientId: string;
  text: string;
  forSpecialty?: string;
  source?: string; // insight key it came from
  done: boolean;
  answer?: string;
  createdAt: number;
}

export interface PatientData {
  patient: Patient;
  events: MedicalEvent[];
  meds: Medication[];
  labs: LabResult[];
  logs: DailyLog[];
  questions: Question[];
}

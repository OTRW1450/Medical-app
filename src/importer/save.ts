import { attachments, store } from '../db/store';
import { uid } from '../lib/id';
import type { PatientData } from '../types';
import type { ParsedDoc } from './parse';

export interface SaveResult {
  records: number;
  diagnoses: number;
  labs: number;
  meds: number;
  allergies: number;
  mainEventId: string;
}

/** Writes only the items the user left ticked. */
export async function saveImport(doc: ParsedDoc, data: PatientData, file?: { file: File; sha256?: string }): Promise<SaveResult> {
  const pid = data.patient.id;
  const main = doc.main.event;
  await store.put('events', { ...main, updatedAt: Date.now() });
  if (file)
    await attachments.put({
      id: uid(), patientId: pid, eventId: main.id, name: file.file.name, mime: file.file.type || 'application/octet-stream',
      size: file.file.size, blob: file.file, addedAt: Date.now(), sha256: file.sha256,
    });

  const dx = doc.diagnoses.filter((d) => d.include);
  for (const d of dx) await store.put('events', { ...d.event, updatedAt: Date.now() });

  const labs = doc.labs.filter((l) => l.include);
  if (labs.length) await store.bulkPut('labs', labs.map((l) => ({ ...l.lab, eventId: main.id })));

  const meds = doc.meds.filter((m) => m.include);
  for (const m of meds) {
    const existing = m.existingId ? data.meds.find((x) => x.id === m.existingId) : undefined;
    if (existing && (m.action === 'stop' || m.action === 'change')) {
      await store.put('meds', {
        ...existing,
        ...(m.action === 'stop' ? { endDate: m.med.endDate, stopReason: m.med.stopReason ?? existing.stopReason } : { dose: m.med.dose }),
      });
    } else {
      await store.put('meds', { ...m.med, id: existing ? uid() : m.med.id, patientId: pid });
    }
  }

  const allergies = doc.allergies.filter((a) => a.include);
  if (allergies.length) {
    const cur = data.patient.allergies?.trim();
    await store.put('patients', { ...data.patient, allergies: [cur, ...allergies.map((a) => a.text)].filter(Boolean).join('; ') });
  }
  return { records: 1, diagnoses: dx.length, labs: labs.length, meds: meds.length, allergies: allergies.length, mainEventId: main.id };
}

// Helpers for documents that were split into several sessions.
import type { PatientData } from '../types';
import type { ParsedDoc } from './parse';

/** Marks records that exist only as proposals from an earlier session of the same file. */
export const PENDING_TAG = '__pending-import';

/**
 * Returns the record as it would look if this session's ticked items were saved,
 * so later sessions don't propose the same diagnosis or medication again.
 */
export function withProposals(data: PatientData, doc: ParsedDoc): PatientData {
  const tag = (t: string[]) => [...t, PENDING_TAG];
  const events = [...data.events];
  if (doc.main.include) events.push({ ...doc.main.event, tags: tag(doc.main.event.tags) });
  for (const d of doc.diagnoses) if (d.include) events.push({ ...d.event, tags: tag(d.event.tags) });
  let meds = [...data.meds];
  for (const m of doc.meds) {
    if (!m.include) continue;
    if ((m.action === 'stop' || m.action === 'change') && m.existingId) meds = meds.map((x) => (x.id === m.existingId ? { ...x, ...(m.action === 'stop' ? { endDate: m.med.endDate } : { dose: m.med.dose }) } : x));
    else meds.push(m.med);
  }
  const labs = [...data.labs, ...doc.labs.filter((l) => l.include).map((l) => l.lab)];
  const allergies = [data.patient.allergies, ...doc.allergies.filter((a) => a.include).map((a) => a.text)].filter(Boolean).join('; ');
  return { ...data, patient: { ...data.patient, allergies }, events, meds, labs };
}

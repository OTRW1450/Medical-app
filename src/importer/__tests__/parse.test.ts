import { describe, expect, it } from 'vitest';
import { parseDocument, type ParseOptions } from '../parse';
import { findDates, parseLabLine, detectProvider } from '../text';
import { buildDemo } from '../../db/demo';
import type { PatientData } from '../../types';
import { AVS, DISCHARGE, LAB_US, MRI, RHEUM_LETTER } from './fixtures';

const empty: PatientData = { patient: { id: 'p', name: 'Test', dob: '1990-04-12', createdAt: 0 }, events: [], meds: [], labs: [], logs: [], questions: [] };
const opts = (data: PatientData = empty, defaultOrder: 'dmy' | 'mdy' = 'mdy'): ParseOptions => ({ data, defaultOrder, today: '2026-11-25' });

describe('lab lines', () => {
  it('reads columns, flags, ranges and qualitative results', () => {
    expect(parseLabLine('C-Reactive Protein        9.1      H      mg/L     0.0 - 5.0')).toMatchObject({ test: 'C-Reactive Protein', value: 9.1, flag: 'H', unit: 'mg/L', refLow: 0, refHigh: 5 });
    expect(parseLabLine('Vitamin D 25 OH 18 ng/mL 30-100')).toMatchObject({ test: 'Vitamin D 25 OH', value: 18 });
    expect(parseLabLine('HLA-B27                   Positive                 Negative')).toMatchObject({ test: 'HLA-B27', textValue: 'Positive' });
    expect(parseLabLine('Glucose 5.4H mmol/L (3.9-5.5)')).toMatchObject({ value: 5.4, flag: 'H', refLow: 3.9, refHigh: 5.5 });
    expect(parseLabLine('CRP <1 mg/L <5')).toMatchObject({ value: 1, refHigh: 5 });
    expect(parseLabLine('Patient: Demo, Alex DOB: 04/12/1990')).toBeNull();
    expect(parseLabLine('Collected: 09/30/2024 08:15')).toBeNull();
    expect(parseLabLine('Page 1 of 1')).toBeNull();
    expect(parseLabLine('She was seen in clinic in 2019 and improved.')).toBeNull();
  });
});

describe('dates & people', () => {
  it('reads many date styles and labels', () => {
    const d = findDates('DOB: 12/04/1990\nExam date: 14 March 2025\nSigned March 15, 2025\n2025-03-16', 'dmy');
    expect(d.map((x) => [x.iso, x.role])).toEqual([['1990-04-12', 'dob'], ['2025-03-14', 'exam'], ['2025-03-15', 'report'], ['2025-03-16', 'none']]);
  });
  it('finds the author, not the letter recipient', () => {
    expect(detectProvider(RHEUM_LETTER)).toBe('Dr Priya Shah');
    expect(detectProvider(AVS)).toBe('Jordan Lee, NP');
    expect(detectProvider(MRI)).toBe('Dr Sam Patel, FRCR');
  });
});

describe('documents', () => {
  it('lab report', () => {
    const r = parseDocument(LAB_US, opts());
    expect(r.kind).toBe('lab');
    expect(r.date).toBe('2024-09-30');
    expect(r.labs.map((l) => l.lab.test)).toEqual(['C-Reactive Protein', 'Erythrocyte Sed Rate', 'Ferritin', 'TSH', 'Hemoglobin', 'HLA-B27', 'Vitamin D, 25-Hydroxy']);
    expect(r.labs.every((l) => l.lab.date === '2024-09-30' && l.lab.eventId === r.main.event.id)).toBe(true);
    expect(r.main.event.findings).toMatch(/C-Reactive Protein 9.1 mg\/L.*Ferritin 13.*HLA-B27 Positive/);
  });

  it('marks lab results already in the record', () => {
    const d = buildDemo(0);
    const r = parseDocument('Collected: 2024-09-30\nCRP 9.1 mg/L 0-5 H\nTSH 4.3 mIU/L 0.4-4.0\nFerritin 30 ng/mL 15-150\nB12 400 pg/mL 200-900', opts(d));
    expect(r.labs.filter((l) => l.duplicate).map((l) => l.lab.test)).toEqual(['CRP', 'TSH']);
  });

  it('imaging report', () => {
    const r = parseDocument(MRI, opts(empty, 'dmy'));
    expect(r.kind).toBe('imaging');
    expect(r.main.event).toMatchObject({ type: 'imaging', modality: 'MRI', date: '2025-03-14', title: 'MRI sacroiliac joints without contrast', provider: 'Dr Sam Patel, FRCR', followUpRecommended: true });
    expect(r.main.event.bodyRegions).toContain('sacrum/SI');
    expect(r.main.event.findings).toMatch(/^Impression: 1\. Active right sacroiliitis/);
  });

  it('specialist letter: diagnoses with status, medication changes, plan, allergies', () => {
    const r = parseDocument(RHEUM_LETTER, opts(empty, 'dmy'));
    expect(r.kind).toBe('visit');
    expect(r.main.event).toMatchObject({ type: 'visit', date: '2025-06-12', specialty: 'Rheumatology', provider: 'Dr Priya Shah', title: 'Rheumatology consultation', followUpRecommended: true });
    expect(r.main.event.bodyRegions).toContain('sacrum/SI');
    expect(r.diagnoses.map((d) => [d.event.title, d.event.status])).toEqual([
      ['Axial spondyloarthritis', 'suspected'],
      ['Hypermobility spectrum disorder', 'active'],
      ['Mast cell activation syndrome', 'suspected'],
    ]);
    expect(r.meds.map((m) => [m.action, m.med.name, m.med.dose ?? ''])).toEqual([
      ['start', 'Naproxen', '500 mg twice daily'],
      ['start', 'Omeprazole', '20 mg daily'],
      ['stop', 'Amitriptyline', ''],
      ['list', 'Cetirizine', '10 mg twice daily'],
    ]);
    expect(r.meds[2].med.stopReason).toBe('it has not helped');
    expect(r.planItems.join(' | ')).toMatch(/Test ordered: MRI of the sacroiliac joints.*Referral: Refer to physiotherapy.*Follow-up: Review in 3 months/);
    expect(r.allergies.map((a) => a.text)).toEqual(['Codeine (vomiting)']);
    expect(r.main.event.findings).toMatch(/History: Low back pain since age 20/);
    expect(r.dates.find((d) => d.iso === '1990-04-12')?.role).toBe('dob');
  });

  it('letter against an existing record: no duplicates, stops the right medication', () => {
    const d = buildDemo(0);
    d.meds.push({ id: 'ami', patientId: d.patient.id, name: 'Amitriptyline', startDate: '2025-01-01', createdAt: 0 });
    const r = parseDocument(RHEUM_LETTER, opts(d, 'dmy'));
    const mcas = r.diagnoses.find((x) => x.event.title === 'Mast cell activation syndrome')!;
    expect(mcas.include).toBe(false);
    expect(mcas.note).toMatch(/Already in the record/);
    expect(r.meds.find((m) => m.med.name === 'Naproxen')).toBeUndefined(); // already taking it
    const stop = r.meds.find((m) => m.action === 'stop')!;
    expect(stop.existingId).toBe('ami');
    expect(stop.med.endDate).toBe('2025-06-12');
    expect(r.allergies[0].include).toBe(false); // codeine already listed
  });

  it('patient-portal visit summary', () => {
    const r = parseDocument(AVS, opts());
    expect(r.kind).toBe('visit');
    expect(r.main.event).toMatchObject({ date: '2025-03-05', specialty: 'General practice', provider: 'Jordan Lee, NP' });
    expect(r.main.event.title).toBe('General practice visit – Fatigue; Dizziness on standing');
    expect(r.diagnoses.map((d) => [d.event.title, d.event.status])).toEqual([
      ['Fatigue, unspecified type', 'active'],
      ['Postural orthostatic tachycardia syndrome', 'suspected'],
      ['Iron deficiency', 'active'],
    ]);
    expect(r.meds.map((m) => [m.action, m.med.name])).toEqual([['start', 'Ferrous sulfate']]);
    expect(r.planItems).toEqual(expect.arrayContaining(['Test ordered: CBC with differential', 'Test ordered: Ferritin', 'Test ordered: Tilt table test']));
    expect(r.planItems.some((p) => /Return in 6 weeks/.test(p))).toBe(true);
  });

  it('discharge summary', () => {
    const r = parseDocument(DISCHARGE, opts());
    expect(r.kind).toBe('discharge');
    expect(r.main.event).toMatchObject({ type: 'hospitalization', date: '2023-02-10', endDate: '2023-02-14' });
    expect(r.main.event.title).toBe('Hospital stay – Severe abdominal pain and vomiting');
    expect(r.diagnoses.map((d) => [d.event.title, d.event.status])).toEqual([
      ['Acute pancreatitis, gallstone related', 'active'],
      ['Hypokalaemia', 'resolved'],
    ]);
    expect(r.meds.map((m) => [m.action, m.med.name])).toEqual([['list', 'Paracetamol'], ['list', 'Ondansetron']]);
    expect(r.planItems.some((p) => /General surgery clinic in 6 weeks/.test(p))).toBe(true);
  });
});

describe('fixes from real-app testing', () => {
  it('reads a British letter day-first even when the default is US', () => {
    const r = parseDocument(RHEUM_LETTER, opts(empty, 'mdy'));
    expect(r.date).toBe('2025-06-12');
    expect(r.warnings.join(' ')).toMatch(/wording suggests day\/month/);
  });
  it('does not warn about an ambiguous date of birth when the chosen date is clear', () => {
    expect(parseDocument(LAB_US, opts()).warnings).toEqual([]);
  });
  it('leaves medications from old documents unticked', () => {
    const r = parseDocument(DISCHARGE, opts()); // 2023 document
    expect(r.meds.every((m) => !m.include && /older document/.test(m.note ?? ''))).toBe(true);
  });
  it('does not re-stop a medication that was already stopped', () => {
    const d = buildDemo(0); // amitriptyline stopped in 2018
    const stop = parseDocument(RHEUM_LETTER, opts(d, 'dmy')).meds.find((m) => m.action === 'stop')!;
    expect(stop.include).toBe(false);
    expect(stop.note).toMatch(/Already recorded as stopped on 2018-11-01/);
  });
  it('a routine review is not flagged as an open follow-up, an ordered test is', () => {
    expect(parseDocument(DISCHARGE, opts()).main.event.followUpRecommended).toBeFalsy();
    expect(parseDocument(RHEUM_LETTER, opts(empty, 'dmy')).main.event.followUpRecommended).toBe(true);
  });
});

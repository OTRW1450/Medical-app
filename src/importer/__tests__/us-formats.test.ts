import { describe, expect, it } from 'vitest';
import { parseDocument, type ParseOptions } from '../parse';
import type { PatientData } from '../../types';
import { EPIC_AVS, EPIC_NOTE, LABCORP, MYCHART_LAB, QUEST } from './fixtures';

const empty: PatientData = { patient: { id: 'p', name: 'Test', dob: '1990-04-12', createdAt: 0 }, events: [], meds: [], labs: [], logs: [], questions: [] };
const opts: ParseOptions = { data: empty, defaultOrder: 'mdy', today: '2026-11-25' };
const labs = (r: ReturnType<typeof parseDocument>) => r.labs.map((l) => [l.lab.test, l.lab.value ?? l.lab.textValue, l.lab.unit, l.lab.refLow, l.lab.refHigh, l.lab.flag]);

describe('US lab layouts', () => {
  it('MyChart block layout (name / normal range / value on separate lines)', () => {
    const r = parseDocument(MYCHART_LAB, opts);
    expect(r.kind).toBe('lab');
    expect(r.date).toBe('2024-09-30');
    expect(labs(r)).toEqual([
      ['Hemoglobin', 12.4, 'g/dL', 12, 15.5, undefined],
      ['WBC', 3.2, 'K/uL', 4, 11, 'L'],
      ['Platelet Count', 210, 'K/uL', 150, 400, undefined],
      ['C-Reactive Protein', 9.1, 'mg/L', 0, 5, 'H'],
      ['HLA-B27', 'Positive', undefined, undefined, undefined, 'A'],
    ]);
    expect(r.main.event.findings ?? '').not.toMatch(/MyChart®|Printed on|Page 1 of 1/);
  });

  it('Quest: in-range / out-of-range columns, header blocks ignored', () => {
    const r = parseDocument(QUEST, opts);
    expect(r.kind).toBe('lab');
    expect(r.date).toBe('2024-09-30');
    expect(labs(r)).toEqual([
      ['C-REACTIVE PROTEIN', 9.1, 'mg/L', undefined, 8, 'H'],
      ['FERRITIN', 13, 'ng/mL', 16, 232, 'L'],
      ['TSH', 2.1, 'mIU/L', 0.4, 4.5, undefined],
      ['VITAMIN D,25-OH,TOTAL,IA', 18, 'ng/mL', 30, 100, 'L'],
      ['HLA-B27 ANTIGEN', 'NEGATIVE', undefined, undefined, undefined, undefined],
    ]);
  });

  it('Labcorp: flag words, units and lab code column', () => {
    const r = parseDocument(LABCORP, opts);
    expect(r.date).toBe('2024-09-30');
    expect(labs(r)).toEqual([
      ['C-Reactive Protein, Quant', 9.1, 'mg/L', 0, 4.9, 'H'],
      ['Ferritin, Serum', 13, 'ng/mL', 15, 150, 'L'],
      ['Vitamin B12', 290, 'pg/mL', 232, 1245, undefined],
      ['Sed Rate (ESR)', 12, 'mm/hr', 0, 32, undefined],
      ['Hemoglobin A1c', 5.4, '%', 4.8, 5.6, undefined],
    ]);
  });
});

describe('Epic notes', () => {
  it('progress note', () => {
    const r = parseDocument(EPIC_NOTE, opts);
    expect(r.kind).toBe('visit');
    expect(r.main.event).toMatchObject({ date: '2025-03-05', provider: 'Jordan Lee, NP', specialty: 'General practice', title: 'General practice visit – Fatigue, Dizziness', followUpRecommended: true });
    expect(r.diagnoses.map((d) => [d.event.title, d.event.status])).toEqual([
      ['Fatigue, unspecified type', 'active'],
      ['Orthostatic tachycardia', 'active'],
      ['POTS', 'suspected'],
      ['Iron deficiency anemia, unspecified iron deficiency anemia type', 'active'],
    ]);
    expect(r.meds.map((m) => [m.action, m.med.name, m.med.dose])).toEqual([
      ['start', 'Ferrous sulfate', '325 MG daily'],
      ['list', 'Cetirizine', '10 MG 2 times daily'],
      ['list', 'Naproxen', '500 MG 2 times daily'],
    ]);
    expect(r.planItems).toEqual(expect.arrayContaining(['Test ordered: CBC with Differential', 'Test ordered: Tilt table test']));
    expect(r.planItems.some((p) => /Referral to Cardiology/i.test(p))).toBe(true);
    expect(r.planItems.some((p) => /Return in about 6 weeks/.test(p))).toBe(true);
    expect(r.allergies.map((a) => a.text)).toEqual(['Codeine Nausea And Vomiting']);
  });

  it('after visit summary with START / CHANGE / STOP / CONTINUE lists', () => {
    const r = parseDocument(EPIC_AVS, opts);
    expect(r.kind).toBe('visit');
    expect(r.main.event).toMatchObject({ date: '2025-03-05', provider: 'Jordan Lee, NP', specialty: 'General practice' });
    expect(r.main.event.title).toBe('General practice visit – Fatigue, Dizziness');
    expect(r.diagnoses.map((d) => d.event.title)).toEqual(['Fatigue, unspecified type', 'Orthostatic tachycardia', 'Iron deficiency anemia']);
    expect(r.meds.map((m) => [m.action, m.med.name, m.med.dose ?? ''])).toEqual([
      ['start', 'Ferrous sulfate', '325 MG daily'],
      ['change', 'Naproxen', '500 MG 2 times daily'],
      ['stop', 'Amitriptyline', ''],
      ['list', 'Cetirizine', '10 MG 2 times daily'],
    ]);
    expect(r.planItems).toEqual(expect.arrayContaining(['Test ordered: CBC with Differential', 'Test ordered: Ferritin']));
    expect(r.main.event.findings ?? '').not.toMatch(/MyChart®|Printed on|MRN/);
  });
});

import { looksLikeGibberish, normalizeText } from '../extract';
import { itemsToLines } from '../extract';
describe('reading clean-up', () => {
  it('spots a garbage text layer but accepts real documents', () => {
    expect(looksLikeGibberish('Tbe pa1ient wa5 seeu iu cliuic 0f r$ ~ 1l #@ fxq zzkt lmnr pqst vwxz bcdf ghjk')).toBe(true);
    expect(looksLikeGibberish(EPIC_NOTE)).toBe(false);
    expect(looksLikeGibberish(QUEST)).toBe(false);
    expect(looksLikeGibberish(MYCHART_LAB)).toBe(false);
  });
  it('normalises ligatures and non-breaking spaces', () => {
    expect(normalizeText('ﬁndings of‑note')).toBe('findings of-note');
  });
  it('rebuilds table rows from positioned text, keeping column gaps', () => {
    const items = [
      { str: 'Ferritin', x: 40, y: 700, w: 40, size: 10 },
      { str: '13', x: 200, y: 700, w: 10, size: 10 },
      { str: 'L', x: 260, y: 701, w: 5, size: 10 },
      { str: '15-150', x: 320, y: 700, w: 30, size: 10 },
      { str: 'TSH', x: 40, y: 686, w: 20, size: 10 },
      { str: '2.1', x: 200, y: 686, w: 12, size: 10 },
    ];
    expect(itemsToLines(items)).toEqual(['Ferritin   13   L   15-150', 'TSH   2.1']);
  });
});

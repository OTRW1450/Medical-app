import { describe, expect, it } from 'vitest';
import { splitSessions } from '../split';
import { parseDocument } from '../parse';
import type { PatientData } from '../../types';
import { AVS, COUNSELLING_LOG, DISCHARGE, EPIC_AVS, EPIC_NOTE, LAB_US, MRI, MYCHART_LAB, PHYSIO_SESSIONS, QUEST, RHEUM_LETTER } from './fixtures';

describe('splitting one PDF into sessions', () => {
  it('splits dated treatment notes, ignoring a page header repeated with the same date', () => {
    const segs = splitSessions(PHYSIO_SESSIONS, 'dmy');
    expect(segs.map((s) => s.date)).toEqual(['2025-01-07', '2025-01-14', '2025-01-21', '2025-02-04']);
    expect(segs[1].text).toMatch(/Flare after prolonged sitting/);
    expect(segs[1].text).toMatch(/ergonomic assessment/); // the continued page stays with its session
    expect(segs[0].text).toMatch(/^Riverside Physiotherapy Clinic/); // header stays with the first session
    expect(segs[2].text).not.toMatch(/Flare after prolonged sitting/);
  });

  it('splits a log where each entry starts with a date', () => {
    const segs = splitSessions(COUNSELLING_LOG, 'dmy');
    expect(segs.map((s) => s.date)).toEqual(['2025-01-14', '2025-01-21', '2025-01-28']);
    expect(segs[0].text).toMatch(/^Pain psychology/);
  });

  it('does not split single documents', () => {
    for (const [doc, order] of [[RHEUM_LETTER, 'dmy'], [MRI, 'dmy'], [DISCHARGE, 'mdy'], [AVS, 'mdy'], [EPIC_NOTE, 'mdy'], [EPIC_AVS, 'mdy'], [LAB_US, 'mdy'], [MYCHART_LAB, 'mdy'], [QUEST, 'mdy']] as const)
      expect(splitSessions(doc, order, { labDoc: true }).length).toBe(1);
  });

  it('each session parses as its own dated visit', () => {
    const data: PatientData = { patient: { id: 'p', name: 'T', dob: '1990-04-12', createdAt: 0 }, events: [], meds: [], labs: [], logs: [], questions: [] };
    const docs = splitSessions(PHYSIO_SESSIONS, 'dmy').map((s) => parseDocument(s.text, { data, defaultOrder: 'dmy', today: '2026-11-25' }));
    expect(docs.map((d) => [d.kind, d.date, d.main.event.specialty, d.main.event.provider])).toEqual([
      ['visit', '2025-01-07', 'Physiotherapy', 'Sam Rivera, DPT'],
      ['visit', '2025-01-14', 'Physiotherapy', 'Sam Rivera, DPT'],
      ['visit', '2025-01-21', 'Physiotherapy', 'Sam Rivera, DPT'],
      ['visit', '2025-02-04', 'Physiotherapy', 'Sam Rivera, DPT'],
    ]);
    expect(docs[0].main.event.title).toBe('Physiotherapy session');
    expect(docs[3].diagnoses.map((d) => [d.event.title, d.event.status])).toEqual([['Lumbar radiculopathy', 'resolved']]);
    expect(docs[2].diagnoses.map((d) => [d.event.title, d.event.status])).toEqual([
      ['Lumbar radiculopathy, left', 'active'],
      ['Inflammatory back pain given morning stiffness and night pain', 'suspected'],
    ]);
  });
});

import { withProposals } from '../sessions';
describe('across sessions of one file', () => {
  it('proposes a repeated diagnosis once, but keeps a change of status', () => {
    let data: PatientData = { patient: { id: 'p', name: 'T', createdAt: 0 }, events: [], meds: [], labs: [], logs: [], questions: [] };
    const docs = splitSessions(PHYSIO_SESSIONS, 'dmy').map((s) => {
      const d = parseDocument(s.text, { data, defaultOrder: 'dmy', today: '2026-11-25' });
      data = withProposals(data, d);
      return d;
    });
    const rad = docs.map((d) => d.diagnoses.find((x) => /radiculopathy/i.test(x.event.title)));
    expect(rad.map((r) => r?.include)).toEqual([true, false, false, true]); // new, repeat, repeat ("improving"), resolved
    expect(rad[1]!.note).toMatch(/Also in an earlier session of this file \(2025-01-07\)/);
    expect(rad[3]!.event.status).toBe('resolved');
  });
});

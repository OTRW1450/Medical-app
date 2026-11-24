import { describe, expect, it } from 'vitest';
import { buildDemo } from '../db/demo';
import { analyze } from '../analysis';
import { narrative, sectionsToText, timetable, timetableCSV } from './build';

const d = buildDemo(0);
const ins = analyze(d);

describe('reports', () => {
  it('writes a narrative with the key facts', () => {
    const text = sectionsToText('T', narrative(d, ins, {}, 'detailed'));
    expect(text).toMatch(/first being low back pain in Feb 2011 \(age 20\)/);
    expect(text).toMatch(/Ruled out|Suspected but not confirmed: Mast cell activation syndrome/);
    expect(text).toMatch(/Tried without benefit: .*Amitriptyline/);
    expect(text).toMatch(/CRP \(3 of 5 abnormal/);
  });
  it('filters by body system and date', () => {
    const s = narrative(d, ins, { system: 'eyes' }, 'brief');
    const text = sectionsToText('T', s);
    expect(text).toMatch(/Anterior uveitis/);
    expect(text).not.toMatch(/Fibromyalgia \(/);
    const rows = timetable(d, { from: '2016-01-01', to: '2016-12-31', types: [], meds: true, labs: 'abnormal', keyOnly: false, detail: 'compact' });
    expect(rows.every((r) => r.date.startsWith('2016'))).toBe(true);
    expect(rows.some((r) => r.kind === 'lab')).toBe(true);
  });
  it('builds a sorted timetable and CSV', () => {
    const rows = timetable(d, { types: [], meds: true, labs: 'all', keyOnly: false, detail: 'full' });
    expect(rows.map((r) => r.date)).toEqual([...rows.map((r) => r.date)].sort());
    expect(rows.some((r) => r.kind === 'med-start' && r.what.startsWith('Ibuprofen'))).toBe(true);
    const csv = timetableCSV(rows);
    expect(csv.split('\n')[0]).toBe('Date,Age,Type,Event,Clinician / specialty,Details,Flag');
    expect(csv).toContain('"Disc desiccation L4/5 with small disc bulge, no nerve root compression.');
  });
});

import { describe, expect, it } from 'vitest';
import { analyze } from '../index';
import { buildDemo } from '../../db/demo';
import { findAffirmed, labStatus } from '../corpus';
import { slopePerYear } from '../labs';
import { pearson as pearson2 } from '../logs';

describe('negation-aware matching', () => {
  it('ignores negated mentions', () => {
    expect(findAffirmed('No evidence of sacroiliitis.', /sacroiliitis/i)).toBeUndefined();
    expect(findAffirmed('SI joints show sacroiliitis.', /sacroiliitis/i)).toBeDefined();
    expect(findAffirmed('Normal SI joints. Mild sacroiliitis on the left.', /sacroiliitis/i)).toBeDefined();
    expect(findAffirmed('Mild change at L4/5. SI joints unremarkable.', /si joint/i)).toBeUndefined();
    expect(findAffirmed('SI joint X-ray normal.', /si joint/i)).toBeUndefined();
    expect(findAffirmed('Tender SI joint on exam, normal gait', /si joint/i)).toBeDefined();
    expect(findAffirmed('Impression: fibromyalgia, no inflammatory arthritis', /inflammatory arthritis/i)).toBeUndefined();
  });
});

describe('lab status', () => {
  const base = { id: 'x', patientId: 'p', date: '2020-01-01', test: 'CRP', createdAt: 0 };
  it('uses reference ranges and text', () => {
    expect(labStatus({ ...base, value: 9, refHigh: 5 })).toBe('high');
    expect(labStatus({ ...base, value: 3, refLow: 0, refHigh: 5 })).toBe('normal');
    expect(labStatus({ ...base, textValue: 'Positive 1:160' })).toBe('positive');
    expect(labStatus({ ...base, textValue: 'Negative' })).toBe('negative');
    expect(labStatus({ ...base, textValue: 'not detected' })).toBe('negative');
  });
});

describe('stats', () => {
  it('pearson and slope', () => {
    expect(pearson2([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    const y = 365.25 * 86_400_000;
    expect(slopePerYear([{ t: 0, v: 1 }, { t: y, v: 3 }, { t: 2 * y, v: 5 }])).toBeCloseTo(2);
  });
});

describe('demo patient analysis', () => {
  const insights = analyze(buildDemo(0));
  const keys = insights.map((i) => i.key);
  it('finds the axial spondyloarthritis cluster as important', () => {
    const ax = insights.find((i) => i.key === 'cluster:axspa');
    expect(ax).toBeDefined();
    expect(ax!.level).toBe('important');
    expect(ax!.suggestions!.join(' ')).toMatch(/HLA-B27/);
  });
  it('finds lab, follow-up, onset and treatment patterns', () => {
    expect(keys).toContain('labs:persistent:CRP');
    expect(keys).toContain('labs:trend:TSH');
    expect(keys.some((k) => k.startsWith('followup:referral'))).toBe(true);
    expect(keys.some((k) => k.startsWith('followup:suspected'))).toBe(true);
    expect(keys.some((k) => k.startsWith('onset:'))).toBe(true);
    expect(keys).toContain('treat:resistant');
    expect(keys.some((k) => k.startsWith('treat:effect'))).toBe(true);
    expect(keys).toContain('corr:menstrual');
    expect(keys).toContain('corr:trigger:prolonged sitting');
    expect(keys.some((k) => k.startsWith('recur:imaging:bone marrow'))).toBe(true);
  });
  it('does not flag the referral that was followed up', () => {
    expect(insights.filter((i) => i.key.startsWith('followup:referral')).every((i) => !/pain/i.test(i.title))).toBe(true);
  });
});

import { laterRecordShowsDone } from '../followups';
describe('follow-ups cleared by later records', () => {
  it('clears an ordered MRI once a later MRI exists, and a recommended review once that specialty is seen', () => {
    const d = buildDemo(0);
    const base = { patientId: d.patient.id, datePrecision: 'day' as const, bodyRegions: [], systems: [], tags: [], createdAt: 0, updatedAt: 0 };
    const visit = { ...base, id: 'v', type: 'visit' as const, date: '2025-06-12', title: 'Rheumatology consultation', findings: 'Plan: MRI of the sacroiliac joints has been requested.', followUpRecommended: true };
    const scan = { ...base, id: 's', type: 'imaging' as const, date: '2025-03-14', title: 'MRI SI joints', findings: 'Impression: sacroiliitis. Rheumatology review recommended.', followUpRecommended: true };
    expect(laterRecordShowsDone(visit, d)).toBe(false);
    d.events.push(scan, visit);
    expect(laterRecordShowsDone(scan, d)).toBe(true); // rheumatology visit came after the scan
    d.events.push({ ...base, id: 'm2', type: 'imaging', date: '2025-08-01', title: 'MRI sacroiliac joints', modality: 'MRI' });
    expect(laterRecordShowsDone(visit, d)).toBe(true);
  });
});

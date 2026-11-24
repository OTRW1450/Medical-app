import type { PatientData } from '../types';
import { ageAt, today } from '../lib/dates';
import { buildCorpus, findAffirmed, isAbnormal, labLabel, labStatus, type Fact } from './corpus';
import { CONDITIONS, BASELINE_TESTS, type Condition } from './knowledge';
import type { Evidence, Insight } from './types';

export interface ClusterMatch {
  condition: Condition;
  matched: { feature: string; evidence: Evidence[] }[];
  missing: string[];
  against: Evidence[];
  workupDone: string[];
  workupTodo: string[];
  specialtiesInvolved: string[];
}

function evidenceSpecialty(d: PatientData, ev: Evidence): string | undefined {
  if (ev.kind !== 'event' || !ev.id) return undefined;
  const e = d.events.find((x) => x.id === ev.id);
  return e?.specialty?.trim() || undefined;
}

export function matchConditions(d: PatientData, facts: Fact[] = buildCorpus(d)): ClusterMatch[] {
  const age = ageAt(d.patient.dob, today());
  const labsWithStatus = d.labs.map((l) => ({ l, s: labStatus(l) }));
  const everythingTested = [
    ...d.labs.map((l) => l.test),
    ...d.events.map((e) => `${e.title} ${e.findings ?? ''} ${e.modality ?? ''}`),
  ];
  const out: ClusterMatch[] = [];

  for (const c of CONDITIONS) {
    if (c.minAge && (age === undefined || age < c.minAge)) continue;
    const matched: ClusterMatch['matched'] = [];
    const missing: string[] = [];
    const against: Evidence[] = [];

    for (const f of c.features) {
      const ev: Evidence[] = [];
      if (f.text) {
        for (const fact of facts) {
          const q = findAffirmed(fact.text, f.text);
          if (q) ev.push({ ...fact.evidence, quote: q });
          if (ev.length >= 4) break;
        }
      }
      if (f.lab) {
        for (const { l, s } of labsWithStatus) {
          if (!f.lab.test.test(l.test)) continue;
          if (f.lab.when.includes(s)) ev.push({ kind: 'lab', id: l.id, date: l.date, label: labLabel(l), quote: s });
          else if (s !== 'unknown')
            against.push({ kind: 'lab', id: l.id, date: l.date, label: `${labLabel(l)} (${s})`, quote: f.label });
        }
      }
      if (ev.length) matched.push({ feature: f.label, evidence: ev });
      else missing.push(f.label);
    }

    const workupDone: string[] = [];
    const workupTodo: string[] = [];
    for (const w of c.workup) {
      if (everythingTested.some((t) => w.test.test(t))) workupDone.push(w.label);
      else workupTodo.push(w.label);
    }
    const specialties = new Set<string>();
    for (const m of matched) for (const e of m.evidence) {
      const s = evidenceSpecialty(d, e);
      if (s) specialties.add(s);
    }
    out.push({ condition: c, matched, missing, against, workupDone, workupTodo, specialtiesInvolved: [...specialties] });
  }
  return out.sort((a, b) => b.matched.length / b.condition.features.length - a.matched.length / a.condition.features.length);
}

export function clusterInsights(d: PatientData, facts?: Fact[]): Insight[] {
  const insights: Insight[] = [];
  for (const m of matchConditions(d, facts)) {
    const n = m.matched.length;
    if (n < m.condition.minMatches) continue;
    const total = m.condition.features.length;
    const level = n >= m.condition.minMatches + 2 && n / total >= 0.6 ? 'important' : 'notable';
    const spread =
      m.specialtiesInvolved.length >= 2
        ? ` These clues were recorded by ${m.specialtiesInvolved.length} different specialties (${m.specialtiesInvolved.join(', ')}), so they may never have been seen side by side.`
        : '';
    const suggestions = [
      `Ask a ${m.condition.specialty} clinician whether this pattern has been considered.`,
      ...m.workupTodo.map((w) => `Not found in record: ${w}`),
    ];
    if (m.against.length)
      suggestions.push(`Already tested normal/negative: ${m.against.map((a) => a.label).slice(0, 4).join('; ')}`);
    insights.push({
      key: `cluster:${m.condition.id}`,
      category: 'cluster',
      level,
      title: `${n} of ${total} features of ${m.condition.name}`,
      detail: m.condition.summary + spread,
      evidence: m.matched.flatMap((x) => x.evidence.slice(0, 2).map((e) => ({ ...e, label: `${x.feature} — ${e.label}` }))),
      suggestions,
      score: n / total,
      missing: m.missing,
      specialty: m.condition.specialty,
    });
  }
  return insights;
}

export function baselineInsight(d: PatientData): Insight | undefined {
  const names = d.labs.map((l) => l.test).concat(d.events.filter((e) => e.type === 'lab').map((e) => `${e.title} ${e.findings ?? ''}`));
  const missing = BASELINE_TESTS.filter((t) => !names.some((n) => t.test.test(n))).map((t) => t.label);
  if (!missing.length) return undefined;
  const abnormal = d.labs.filter((l) => isAbnormal(labStatus(l))).length;
  return {
    key: 'labs:baseline',
    category: 'labs',
    level: missing.length >= 6 ? 'notable' : 'info',
    title: `${missing.length} common baseline test${missing.length > 1 ? 's' : ''} not on file`,
    detail:
      'These tests are commonly checked when pain is long-standing and unexplained. They may have been done but not entered here – add old results if you have them, or ask whether they are worth doing.' +
      (abnormal ? ` (${abnormal} abnormal result${abnormal > 1 ? 's' : ''} already recorded.)` : ''),
    evidence: [],
    suggestions: missing,
  };
}

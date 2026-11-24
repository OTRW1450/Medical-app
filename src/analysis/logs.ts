// Statistics on daily pain/symptom logs and medication response.
import type { DailyLog, PatientData } from '../types';
import { addDays, daysBetween, fmtDate, monthName, toTime } from '../lib/dates';
import { medClassWords } from './corpus';
import type { Insight } from './types';

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? NaN : num / Math.sqrt(dx * dy);
}

/** Welch's t statistic – used only to avoid reporting differences that are mostly noise. */
export function welchT(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  const va = a.reduce((s, x) => s + (x - ma) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, x) => s + (x - mb) ** 2, 0) / (b.length - 1);
  const se = Math.sqrt(va / a.length + vb / b.length);
  return se === 0 ? (ma === mb ? 0 : Infinity) : (ma - mb) / se;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

type NumField = 'fatigue' | 'sleepHours' | 'sleepQuality' | 'mood' | 'stress' | 'activity';
const FIELDS: { f: NumField; label: string }[] = [
  { f: 'sleepQuality', label: 'sleep quality' },
  { f: 'sleepHours', label: 'hours of sleep' },
  { f: 'stress', label: 'stress' },
  { f: 'activity', label: 'activity level' },
  { f: 'mood', label: 'mood' },
  { f: 'fatigue', label: 'fatigue' },
];

export function correlationInsights(d: PatientData): Insight[] {
  const logs = d.logs;
  const out: Insight[] = [];
  if (logs.length < 14) {
    out.push({
      key: 'corr:need-more',
      category: 'correlation',
      level: 'info',
      title: logs.length ? `Only ${logs.length} daily logs so far` : 'No daily pain logs yet',
      detail:
        'With at least 2–3 weeks of daily logs (pain, sleep, stress, activity, triggers) the app can test which factors actually move your pain – and which suspected triggers do not.',
      evidence: [],
    });
    return out;
  }
  const byDate = new Map(logs.map((l) => [l.date, l] as const));

  // Same-day and next-day correlations
  for (const { f, label } of FIELDS) {
    const same = logs.filter((l) => typeof l[f] === 'number');
    if (same.length >= 14) {
      const r = pearson(same.map((l) => l[f] as number), same.map((l) => l.pain));
      if (Math.abs(r) >= 0.3) {
        out.push({
          key: `corr:same:${f}`,
          category: 'correlation',
          level: Math.abs(r) >= 0.5 ? 'notable' : 'info',
          title: `Pain moves with ${label} (r = ${r.toFixed(2)})`,
          detail: `Across ${same.length} days, higher ${label} goes with ${r > 0 ? 'higher' : 'lower'} pain on the same day. Correlation does not show which causes which.`,
          evidence: [],
        });
      }
    }
    // previous day's value vs today's pain (helps with direction)
    const pairs: [number, number][] = [];
    for (const l of logs) {
      const prev = byDate.get(addDays(l.date, -1));
      if (prev && typeof prev[f] === 'number') pairs.push([prev[f] as number, l.pain]);
    }
    if (pairs.length >= 14) {
      const r = pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
      if (Math.abs(r) >= 0.35) {
        out.push({
          key: `corr:lag:${f}`,
          category: 'correlation',
          level: 'notable',
          title: `Yesterday's ${label} predicts today's pain (r = ${r.toFixed(2)})`,
          detail: `Over ${pairs.length} consecutive-day pairs, ${r > 0 ? 'higher' : 'lower'} ${label} is followed by more pain the next day – a lagged pattern that is easy to miss day to day.`,
          evidence: [],
        });
      }
    }
  }

  // Triggers: same day and next day
  const triggers = new Set(logs.flatMap((l) => l.triggers));
  for (const t of triggers) {
    const withT = logs.filter((l) => l.triggers.includes(t));
    const without = logs.filter((l) => !l.triggers.includes(t));
    if (withT.length < 3 || without.length < 5) continue;
    const a = withT.map((l) => l.pain);
    const b = without.map((l) => l.pain);
    const diff = mean(a) - mean(b);
    const next = withT.map((l) => byDate.get(addDays(l.date, 1))?.pain).filter((x): x is number => x !== undefined);
    const nextDiff = next.length >= 3 ? mean(next) - mean(b) : NaN;
    const t1 = welchT(a, b);
    if (Math.abs(diff) >= 1 && Math.abs(t1) >= 2) {
      out.push({
        key: `corr:trigger:${t}`,
        category: 'correlation',
        level: diff >= 2 ? 'notable' : 'info',
        title: `"${t}" days: pain ${diff > 0 ? '+' : ''}${r1(diff)} vs other days`,
        detail: `Average pain ${r1(mean(a))} on ${withT.length} days with "${t}" vs ${r1(mean(b))} otherwise${
          !Number.isNaN(nextDiff) ? `; the following day averages ${nextDiff > 0 ? '+' : ''}${r1(nextDiff)}` : ''
        }.`,
        evidence: withT.slice(-5).map((l) => ({ kind: 'log', id: l.id, date: l.date, label: `Pain ${l.pain}/10 on ${fmtDate(l.date)}` })),
      });
    } else if (withT.length >= 5 && Math.abs(diff) < 0.5) {
      out.push({
        key: `corr:not-trigger:${t}`,
        category: 'correlation',
        level: 'info',
        title: `"${t}" does not seem to change pain`,
        detail: `Pain averages ${r1(mean(a))} on ${withT.length} days with "${t}" and ${r1(mean(b))} otherwise. Useful to know if you have been avoiding it.`,
        evidence: [],
      });
    }
  }

  // Menstrual cycle
  const mens = logs.filter((l) => l.menstruating);
  if (mens.length >= 4) {
    const notM = logs.filter((l) => !l.menstruating);
    const diff = mean(mens.map((l) => l.pain)) - mean(notM.map((l) => l.pain));
    if (diff >= 1) {
      out.push({
        key: 'corr:menstrual',
        category: 'correlation',
        level: diff >= 2 ? 'important' : 'notable',
        title: `Pain is ${r1(diff)} points higher during menstruation`,
        detail: `Cyclical pain is a clue worth raising with gynecology (e.g., endometriosis/adenomyosis) and can also reflect hormonal effects on mast cells, joints and migraine.`,
        evidence: mens.slice(-4).map((l) => ({ kind: 'log', id: l.id, date: l.date, label: `Pain ${l.pain}/10` })),
      });
    }
  }

  // Symptoms that cluster on bad days
  const high = logs.filter((l) => l.pain >= 7);
  const low = logs.filter((l) => l.pain <= 4);
  if (high.length >= 5 && low.length >= 5) {
    for (const s of new Set(logs.flatMap((l) => l.symptoms))) {
      const ph = high.filter((l) => l.symptoms.includes(s)).length / high.length;
      const pl = low.filter((l) => l.symptoms.includes(s)).length / low.length;
      if (ph >= 0.4 && ph - pl >= 0.3) {
        out.push({
          key: `corr:symptom:${s}`,
          category: 'correlation',
          level: 'info',
          title: `"${s}" travels with pain flares`,
          detail: `Present on ${Math.round(ph * 100)}% of high-pain days vs ${Math.round(pl * 100)}% of low-pain days. Symptoms that flare together may share a mechanism.`,
          evidence: [],
        });
      }
    }
  }

  // Seasonality (needs > 1 year)
  const span = daysBetween(logs[0].date, logs[logs.length - 1].date);
  if (span >= 330) {
    const byMonth: number[][] = Array.from({ length: 12 }, () => []);
    for (const l of logs) byMonth[Number(l.date.slice(5, 7)) - 1].push(l.pain);
    const means = byMonth.map((xs) => (xs.length >= 5 ? mean(xs) : NaN));
    const valid = means.map((m, i) => ({ m, i })).filter((x) => !Number.isNaN(x.m));
    if (valid.length >= 6) {
      valid.sort((a, b) => b.m - a.m);
      const hi = valid.slice(0, 2);
      const lo = valid.slice(-2);
      if (hi[0].m - lo[lo.length - 1].m >= 1.2) {
        out.push({
          key: 'corr:season',
          category: 'correlation',
          level: 'info',
          title: `Seasonal pattern: worst in ${hi.map((x) => monthName(x.i)).join(' & ')}`,
          detail: `Average pain ${r1(hi[0].m)} in ${monthName(hi[0].i)} vs ${r1(lo[lo.length - 1].m)} in ${monthName(lo[lo.length - 1].i)}. Consider weather, light/vitamin D, allergy season, activity or school/work cycles.`,
          evidence: [],
        });
      }
    }
  }

  // Recent trend
  const last = logs[logs.length - 1].date;
  const recent = logs.filter((l) => daysBetween(l.date, last) < 90).map((l) => l.pain);
  const prior = logs.filter((l) => daysBetween(l.date, last) >= 90 && daysBetween(l.date, last) < 180).map((l) => l.pain);
  if (recent.length >= 20 && prior.length >= 20) {
    const diff = mean(recent) - mean(prior);
    if (Math.abs(diff) >= 0.8) {
      out.push({
        key: 'corr:trend',
        category: 'overview',
        level: diff > 0 ? 'notable' : 'info',
        title: `Pain ${diff > 0 ? 'worse' : 'better'} over the last 3 months (${r1(mean(prior))} → ${r1(mean(recent))})`,
        detail: 'Compared with the three months before. Check the timeline for what changed around then.',
        evidence: [],
      });
    }
  }
  return out;
}

export interface MedEffect {
  medId: string;
  name: string;
  before: number;
  after: number;
  nBefore: number;
  nAfter: number;
  delta: number;
  t: number;
}

export function medEffects(d: PatientData): MedEffect[] {
  const out: MedEffect[] = [];
  const logs = d.logs;
  if (logs.length < 10) return out;
  for (const m of d.meds) {
    const s = toTime(m.startDate);
    const before = logs.filter((l) => {
      const t = toTime(l.date);
      return t < s && t >= s - 45 * 86_400_000;
    });
    const endT = m.endDate ? toTime(m.endDate) : Infinity;
    const after = logs.filter((l) => {
      const t = toTime(l.date);
      return t >= s + 14 * 86_400_000 && t <= Math.min(s + 90 * 86_400_000, endT);
    });
    if (before.length < 5 || after.length < 5) continue;
    const a = after.map((l) => l.pain);
    const b = before.map((l) => l.pain);
    out.push({
      medId: m.id,
      name: m.name,
      before: mean(b),
      after: mean(a),
      nBefore: b.length,
      nAfter: a.length,
      delta: mean(a) - mean(b),
      t: welchT(a, b),
    });
  }
  return out;
}

export function treatmentInsights(d: PatientData): Insight[] {
  const out: Insight[] = [];
  for (const e of medEffects(d)) {
    const m = d.meds.find((x) => x.id === e.medId)!;
    if (Math.abs(e.delta) < 0.8 || Math.abs(e.t) < 2) continue;
    const better = e.delta < 0;
    const rated = m.effectiveness;
    const mismatch = rated !== undefined && ((better && rated <= 0) || (!better && rated >= 1));
    out.push({
      key: `treat:effect:${m.id}`,
      category: 'treatment',
      level: mismatch ? 'notable' : 'info',
      title: `Pain ${better ? 'fell' : 'rose'} after starting ${m.name} (${r1(e.before)} → ${r1(e.after)})`,
      detail: `Average daily pain 45 days before vs 2–12 weeks after starting (${e.nBefore} vs ${e.nAfter} logged days).${
        mismatch ? ' This differs from how the medication was rated – worth a second look.' : ''
      } Other changes at the same time can also explain this.`,
      evidence: [{ kind: 'med', id: m.id, date: m.startDate, label: `${m.name} ${m.dose ?? ''}`.trim() }],
    });
  }

  // Many treatments with little benefit for the same reason
  const ineffective = d.meds.filter((m) => m.effectiveness !== undefined && m.effectiveness <= 0);
  if (ineffective.length >= 4) {
    const classes = new Set(ineffective.flatMap((m) => medClassWords(m)));
    out.push({
      key: 'treat:resistant',
      category: 'treatment',
      level: 'important',
      title: `${ineffective.length} treatments tried with little or no benefit`,
      detail: `${ineffective.map((m) => m.name).join(', ')}${classes.size ? ` (${[...classes].join(', ')})` : ''}. When standard treatments repeatedly fail, it can mean the working diagnosis is incomplete – or that the pain has a different mechanism (inflammatory, neuropathic, mechanical, central) than the one being treated.`,
      evidence: ineffective.map((m) => ({ kind: 'med', id: m.id, date: m.startDate, label: `${m.name}: ${m.stopReason ?? 'no benefit'}` })),
      suggestions: ['Bring this list to new appointments so the same drugs are not re-tried.', 'Ask which pain mechanism each treatment targeted.'],
    });
  }

  // Strong responders are diagnostic clues
  for (const m of d.meds.filter((x) => x.effectiveness === 2)) {
    const cls = medClassWords(m);
    let clue = '';
    if (cls.includes('NSAID')) clue = 'A strong NSAID response is one of the features of inflammatory back pain/spondyloarthritis.';
    else if (cls.includes('antihistamine')) clue = 'A strong antihistamine response can point toward mast-cell or histamine-driven symptoms.';
    else if (cls.includes('corticosteroid')) clue = 'A dramatic steroid response suggests an inflammatory or autoimmune component.';
    else if (cls.includes('neuropathic agent')) clue = 'A good response to neuropathic agents suggests nerve-related pain.';
    if (clue)
      out.push({
        key: `treat:responder:${m.id}`,
        category: 'treatment',
        level: 'notable',
        title: `Marked response to ${m.name}`,
        detail: clue,
        evidence: [{ kind: 'med', id: m.id, date: m.startDate, label: m.name }],
      });
  }

  // New symptoms shortly after starting a medication
  const symptomEvents = d.events.filter((e) => e.type === 'symptom');
  for (const m of d.meds) {
    const after = symptomEvents.filter((e) => {
      const gap = daysBetween(m.startDate, e.date);
      return gap >= 0 && gap <= 60 && (!m.endDate || e.date <= m.endDate);
    });
    if (after.length) {
      out.push({
        key: `treat:newsx:${m.id}`,
        category: 'treatment',
        level: 'info',
        title: `New symptom${after.length > 1 ? 's' : ''} began within 2 months of starting ${m.name}`,
        detail: `${after.map((e) => `${e.title} (${fmtDate(e.date, e.datePrecision)})`).join(', ')}. Could be coincidence – or a side effect worth checking against the drug's known effects.`,
        evidence: [
          { kind: 'med', id: m.id, date: m.startDate, label: `Started ${m.name}` },
          ...after.map((e) => ({ kind: 'event' as const, id: e.id, date: e.date, label: e.title })),
        ],
      });
    }
  }
  return out;
}

export function logStats(logs: DailyLog[]) {
  if (!logs.length) return undefined;
  const pains = logs.map((l) => l.pain);
  return {
    n: logs.length,
    mean: mean(pains),
    badDays: pains.filter((p) => p >= 7).length,
    first: logs[0].date,
    last: logs[logs.length - 1].date,
  };
}

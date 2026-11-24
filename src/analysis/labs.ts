import type { LabResult, PatientData } from '../types';
import { daysBetween, fmtDate, fmtSpan, toTime, today } from '../lib/dates';
import { isAbnormal, labLabel, labStatus } from './corpus';
import type { Evidence, Insight } from './types';

const ALIASES: [RegExp, string][] = [
  [/^(25-?oh|25\(oh\)|vit(amin)? ?d|25-hydroxy)/i, 'Vitamin D (25-OH)'],
  [/^(vit(amin)? ?b12|b12|cobalamin)/i, 'Vitamin B12'],
  [/^(crp|c-reactive|hs-?crp)/i, 'CRP'],
  [/^(esr|sed(imentation)? rate)/i, 'ESR'],
  [/^(hba1c|a1c|glycated)/i, 'HbA1c'],
  [/^(hgb|hb|ha?emoglobin)$/i, 'Hemoglobin'],
  [/^(wbc|white (blood )?cells?)/i, 'WBC'],
  [/^(plt|platelets?)/i, 'Platelets'],
  [/^(ck|cpk|creatine kinase)/i, 'CK'],
  [/^(ana|antinuclear)/i, 'ANA'],
  [/^(tsh|thyroid stimulating)/i, 'TSH'],
  [/^ferritin/i, 'Ferritin'],
];

export function normalizeTest(name: string): string {
  const t = name.trim();
  for (const [re, canon] of ALIASES) if (re.test(t)) return canon;
  return t.replace(/\s+/g, ' ');
}

export function groupLabs(labs: LabResult[]): Map<string, LabResult[]> {
  const m = new Map<string, LabResult[]>();
  for (const l of labs) {
    const k = normalizeTest(l.test);
    const arr = m.get(k) ?? [];
    arr.push(l);
    m.set(k, arr);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  return m;
}

/** Ordinary least-squares slope in units per year. */
export function slopePerYear(points: { t: number; v: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;
  const yrs = points.map((p) => p.t / (365.25 * 86_400_000));
  const mx = yrs.reduce((a, b) => a + b, 0) / n;
  const my = points.reduce((a, p) => a + p.v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (yrs[i] - mx) * (points[i].v - my);
    den += (yrs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** "Optimal" thresholds some clinicians use that are stricter than lab normal ranges. */
const SUBOPTIMAL: { test: string; unit: RegExp; below?: number; above?: number; note: string }[] = [
  { test: 'Ferritin', unit: /ng\/ml|µg\/l|ug\/l|mcg\/l/i, below: 30, note: 'ferritin under 30 is widely used to define iron deficiency even when the lab range starts lower; low iron stores are linked to fatigue, restless legs and orthostatic intolerance.' },
  { test: 'Vitamin B12', unit: /pg\/ml|ng\/l/i, below: 300, note: 'B12 in the low-normal range can still be functionally deficient; methylmalonic acid can clarify.' },
  { test: 'Vitamin D (25-OH)', unit: /ng\/ml/i, below: 30, note: 'many guidelines consider under 30 ng/mL insufficient; low vitamin D is associated with bone and muscle pain.' },
  { test: 'Vitamin D (25-OH)', unit: /nmol\/l/i, below: 75, note: 'many guidelines consider under 75 nmol/L insufficient; low vitamin D is associated with bone and muscle pain.' },
];

export function labInsights(d: PatientData): Insight[] {
  const out: Insight[] = [];
  const now = today();
  for (const [test, results] of groupLabs(d.labs)) {
    const statuses = results.map((r) => ({ r, s: labStatus(r) }));
    const abnormal = statuses.filter((x) => isAbnormal(x.s));
    const ev = (xs: typeof statuses): Evidence[] =>
      xs.map(({ r, s }) => ({ kind: 'lab', id: r.id, date: r.date, label: `${labLabel(r)} (${s})` }));

    // 1. Persistently / repeatedly abnormal
    if (abnormal.length >= 2) {
      const span = daysBetween(abnormal[0].r.date, abnormal[abnormal.length - 1].r.date);
      const dirs = new Set(abnormal.map((a) => a.s));
      out.push({
        key: `labs:persistent:${test}`,
        category: 'labs',
        level: abnormal.length >= 3 ? 'important' : 'notable',
        title: `${test} abnormal ${abnormal.length} times over ${fmtSpan(span)}`,
        detail: `${test} was ${[...dirs].join('/')} on ${abnormal.length} of ${results.length} occasions. A repeatedly abnormal result is a signal even when each single value looked "only mildly" out of range.`,
        evidence: ev(abnormal),
        suggestions: [`Ask what could explain a persistently ${[...dirs].join('/')} ${test}, and whether it fits with the other symptoms.`],
      });
    }

    // 2. Abnormal and never re-checked
    const last = statuses[statuses.length - 1];
    if (isAbnormal(last.s) && abnormal.length === 1 && daysBetween(last.r.date, now) > 90) {
      out.push({
        key: `labs:unrechecked:${test}`,
        category: 'followup',
        level: 'notable',
        title: `${test} was ${last.s} on ${fmtDate(last.r.date)} and never re-checked`,
        detail: `No later ${test} result is recorded (${fmtSpan(daysBetween(last.r.date, now))} ago). If it was repeated elsewhere, add the result; otherwise it may be worth repeating.`,
        evidence: ev([last]),
        suggestions: [`Repeat ${test}`],
      });
    }

    // 3. Trend that is drifting toward / across a limit
    const numeric = results.filter((r) => typeof r.value === 'number');
    if (numeric.length >= 3) {
      const ref = numeric.find((r) => r.refLow !== undefined || r.refHigh !== undefined);
      const pts = numeric.map((r) => ({ t: toTime(r.date), v: r.value as number }));
      const slope = slopePerYear(pts);
      const spanYears = (pts[pts.length - 1].t - pts[0].t) / (365.25 * 86_400_000);
      const totalChange = slope * spanYears;
      const lo = ref?.refLow;
      const hi = ref?.refHigh;
      const width = lo !== undefined && hi !== undefined ? hi - lo : Math.abs(pts[0].v) || 1;
      const first = pts[0].v;
      const lastV = pts[pts.length - 1].v;
      const towardHigh = hi !== undefined && slope > 0;
      const towardLow = lo !== undefined && slope < 0;
      if (Math.abs(totalChange) >= 0.4 * width && (towardHigh || towardLow) && spanYears >= 0.5) {
        out.push({
          key: `labs:trend:${test}`,
          category: 'labs',
          level: isAbnormal(last.s) ? 'notable' : 'info',
          title: `${test} has been ${slope > 0 ? 'rising' : 'falling'} steadily (${first} → ${lastV}${numeric[0].unit ? ' ' + numeric[0].unit : ''})`,
          detail: `Across ${numeric.length} results over ${spanYears.toFixed(1)} years, ${test} moved ${slope > 0 ? 'up' : 'down'} by about ${Math.abs(slope).toPrecision(2)} per year${
            lo !== undefined || hi !== undefined ? ` (reference ${lo ?? '–'}–${hi ?? '–'})` : ''
          }. Each result may have looked acceptable on its own; the trend is the information.`,
          evidence: numeric.map((r) => ({ kind: 'lab', id: r.id, date: r.date, label: labLabel(r) })),
        });
      }
    }

    // 4. In range but below commonly used "optimal" cut-offs
    for (const s of SUBOPTIMAL) {
      if (s.test !== test) continue;
      const lowOnes = numeric.filter(
        (r) => r.unit && s.unit.test(r.unit) && s.below !== undefined && (r.value as number) < s.below && labStatus(r) === 'normal',
      );
      if (lowOnes.length) {
        out.push({
          key: `labs:suboptimal:${test}`,
          category: 'labs',
          level: 'info',
          title: `${test} "normal" but low (${lowOnes.map((r) => r.value).join(', ')} ${lowOnes[0].unit})`,
          detail: `Within the lab's range, but ${s.note}`,
          evidence: lowOnes.map((r) => ({ kind: 'lab', id: r.id, date: r.date, label: labLabel(r) })),
        });
      }
    }
  }
  return out;
}

// Builds a searchable "corpus" of facts from every part of the record, so
// patterns can be found across providers, years and data types.
import type { LabResult, Medication, PatientData } from '../types';
import type { Evidence } from './types';
import { EVENT_TYPE_LABEL } from '../types';

export interface Fact {
  text: string;
  date?: string;
  evidence: Evidence;
}

const NSAIDS = /\b(ibuprofen|naproxen|diclofenac|celecoxib|meloxicam|etoricoxib|indomethacin|ketorolac|aspirin|nsaid|advil|aleve|motrin|celebrex|voltaren|arcoxia|mobic)\b/i;
const ANTIHISTAMINES = /\b(cetirizine|loratadine|fexofenadine|famotidine|ranitidine|diphenhydramine|hydroxyzine|ketotifen|cromolyn|antihistamine|zyrtec|claritin|allegra|pepcid|benadryl|montelukast)\b/i;
const STEROIDS = /\b(prednisone|prednisolone|methylprednisolone|dexamethasone|medrol|steroid|corticosteroid)\b/i;
const OPIOIDS = /\b(oxycodone|hydrocodone|morphine|tramadol|codeine|tapentadol|fentanyl|buprenorphine|hydromorphone|opioid)\b/i;
const NEUROPATHICS = /\b(gabapentin|pregabalin|duloxetine|amitriptyline|nortriptyline|venlafaxine|lyrica|neurontin|cymbalta)\b/i;

export function medClassWords(m: Pick<Medication, 'name' | 'drugClass'>): string[] {
  const s = `${m.name} ${m.drugClass ?? ''}`;
  const out: string[] = [];
  if (NSAIDS.test(s)) out.push('NSAID');
  if (ANTIHISTAMINES.test(s)) out.push('antihistamine');
  if (STEROIDS.test(s)) out.push('corticosteroid');
  if (OPIOIDS.test(s)) out.push('opioid');
  if (NEUROPATHICS.test(s)) out.push('neuropathic agent');
  if (m.drugClass) out.push(m.drugClass);
  return out;
}

export type LabStatus = 'high' | 'low' | 'positive' | 'negative' | 'normal' | 'unknown';

const POSITIVE = /\b(positive|detected|reactive|present|elevated|abnormal|1:(80|160|320|640|1280))\b/i;
const NEGATIVE = /\b(negative|not detected|non-?reactive|absent|normal|undetectable|none seen)\b/i;

export function labStatus(l: LabResult): LabStatus {
  if (l.flag === 'H') return 'high';
  if (l.flag === 'L') return 'low';
  if (typeof l.value === 'number' && !Number.isNaN(l.value)) {
    if (l.refHigh !== undefined && l.value > l.refHigh) return 'high';
    if (l.refLow !== undefined && l.value < l.refLow) return 'low';
    if (l.refHigh !== undefined || l.refLow !== undefined) return 'normal';
  }
  if (l.textValue) {
    if (NEGATIVE.test(l.textValue)) return 'negative';
    if (POSITIVE.test(l.textValue)) return 'positive';
  }
  if (l.flag === 'A') return 'positive';
  return 'unknown';
}

export function isAbnormal(s: LabStatus) {
  return s === 'high' || s === 'low' || s === 'positive';
}

export function labLabel(l: LabResult): string {
  const v = l.value !== undefined ? `${l.value}${l.unit ? ' ' + l.unit : ''}` : l.textValue ?? '';
  return `${l.test}: ${v}`;
}

export function buildCorpus(d: PatientData): Fact[] {
  const facts: Fact[] = [];
  const p = d.patient;
  for (const [field, label] of [
    ['background', 'Background'],
    ['familyHistory', 'Family history'],
    ['allergies', 'Allergies / reactions'],
  ] as const) {
    const t = p[field];
    if (t) facts.push({ text: t, evidence: { kind: 'patient', label } });
  }

  for (const e of d.events) {
    const text = [
      e.title,
      e.findings,
      e.notes,
      e.tags.join(', '),
      e.bodyRegions.join(', '),
      e.status === 'ruled-out' ? '' : e.systems.join(', '),
    ]
      .filter(Boolean)
      .join('. ');
    // A ruled-out diagnosis should not count as evidence *for* that diagnosis.
    const finalText = e.status === 'ruled-out' ? `ruled out: ${e.title}. ${e.findings ?? ''}` : text;
    facts.push({
      text: finalText,
      date: e.date,
      evidence: { kind: 'event', id: e.id, date: e.date, label: `${EVENT_TYPE_LABEL[e.type]}: ${e.title}` },
    });
  }

  for (const m of d.meds) {
    const classes = medClassWords(m);
    const parts = [`${m.name}`, m.reason ? `for ${m.reason}` : ''];
    if (m.effectiveness !== undefined && m.effectiveness >= 1)
      parts.push(`responded well to ${m.name} (${classes.join(', ')})`);
    if (m.effectiveness !== undefined && m.effectiveness <= 0) parts.push(`little benefit from ${classes.join(', ')}`);
    if (m.sideEffects) parts.push(`side effects: ${m.sideEffects}`);
    if (m.stopReason) parts.push(`stopped: ${m.stopReason}`);
    facts.push({
      text: parts.filter(Boolean).join('. '),
      date: m.startDate,
      evidence: { kind: 'med', id: m.id, date: m.startDate, label: `Medication: ${m.name}` },
    });
  }

  // Daily logs: aggregate (one fact per distinct symptom/trigger/quality) so
  // that 300 days of "fatigue" counts as one piece of evidence, not 300.
  const seen = new Map<string, { first: string; count: number }>();
  const bump = (k: string, date: string) => {
    const s = seen.get(k);
    if (s) s.count++;
    else seen.set(k, { first: date, count: 1 });
  };
  for (const l of d.logs) {
    for (const s of l.symptoms) bump(s, l.date);
    for (const t of l.triggers) bump(`${t} (trigger)`, l.date);
    for (const r of l.regions) {
      if (r.intensity > 0) bump(`${r.region} pain`, l.date);
      for (const q of r.qualities) bump(`${q} pain in ${r.region}`, l.date);
    }
  }
  for (const [k, v] of seen) {
    facts.push({
      text: k,
      date: v.first,
      evidence: { kind: 'log', date: v.first, label: `Daily log: "${k}" on ${v.count} day${v.count === 1 ? '' : 's'}` },
    });
  }
  return facts;
}

// ---------- Negation-aware matching ----------

const NEGATORS =
  /\b(no|not|without|negative for|neg for|denies|denied|ruled out|rule out|r\/o|absence of|free of|unremarkable|resolved|never)\b[^.;:\n]*$/i;

const POST_NEGATORS = /^\W*(\w+\W+){0,2}?((is|are|was|were|appears?|look(s|ed)?)\s+)?(unremarkable|normal|negative|not (seen|present|identified|found)|absent|ruled out)\b/i;

/** Find the first non-negated match of `re` in `text`. Returns the quote. */
export function findAffirmed(text: string, re: RegExp): string | undefined {
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  const g = new RegExp(re.source, flags);
  let m: RegExpExecArray | null;
  while ((m = g.exec(text))) {
    const start = m.index;
    // Only look back within the current clause, max ~60 chars.
    const before = text.slice(Math.max(0, start - 60), start);
    const clause = before.split(/[.;:\n]|\bbut\b|\bhowever\b/i).pop() ?? '';
    const after = text.slice(start + m[0].length, start + m[0].length + 40).split(/[.;:\n,]/)[0];
    if (!NEGATORS.test(clause) && !POST_NEGATORS.test(after)) {
      const s = Math.max(0, start - 40);
      const e = Math.min(text.length, start + m[0].length + 40);
      return (s > 0 ? '…' : '') + text.slice(s, e).trim() + (e < text.length ? '…' : '');
    }
    if (m[0].length === 0) g.lastIndex++;
  }
  return undefined;
}

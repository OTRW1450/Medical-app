import type { PatientData } from '../types';
import { EVENT_TYPE_LABEL } from '../types';
import { daysBetween, fmtDate, fmtSpan, today } from '../lib/dates';
import { findAffirmed } from './corpus';
import type { Insight } from './types';

const FOLLOWUP_RE =
  /\b(follow[- ]?up (is |was )?(recommended|advised|suggested)|recommend(ed)? (repeat|follow[- ]?up|further|correlation|mri|ct|ultrasound|referral)|clinical correlation|further (evaluation|imaging|work-?up) (is )?(recommended|suggested|advised)|incidental(ly)?|indeterminate|consider (an? )?(mri|ct|referral|biopsy|repeat)|repeat (imaging|scan|mri|ct|ultrasound|test|bloods?) in)\b/i;

const REFERRAL_RE = /\brefer(?:red|ral)?\s+(?:back\s+)?to\s+(?:an?\s+|the\s+)?([a-z][a-z-]+(?:\s+[a-z][a-z-]+)?)/gi;

const SPECIALTY_STEMS: [RegExp, string][] = [
  [/rheumat/i, 'rheumat'],
  [/neurolog|neurosurg/i, 'neuro'],
  [/gastro|gi\b/i, 'gastro'],
  [/cardio/i, 'cardio'],
  [/endocrin/i, 'endocrin'],
  [/gyn/i, 'gyn'],
  [/ortho/i, 'ortho'],
  [/pain/i, 'pain'],
  [/physio|physical therap|\bpt\b/i, 'physio'],
  [/psych/i, 'psych'],
  [/allerg|immunol/i, 'allerg'],
  [/dermat/i, 'dermat'],
  [/genetic/i, 'genetic'],
  [/sleep/i, 'sleep'],
  [/urolog/i, 'urolog'],
  [/ophthal|eye/i, 'ophthal'],
  [/hemat|haemat/i, 'hemat'],
];

function stem(s: string): string | undefined {
  for (const [re, st] of SPECIALTY_STEMS) if (re.test(s)) return st;
  return undefined;
}

export function followupInsights(d: PatientData): Insight[] {
  const out: Insight[] = [];
  const now = today();

  // 1. Explicitly flagged follow-ups, or report language suggesting follow-up
  for (const e of d.events) {
    if (e.followUpDone) continue;
    const quote = e.findings ? findAffirmed(e.findings, FOLLOWUP_RE) : undefined;
    if (!e.followUpRecommended && !quote) continue;
    const ago = daysBetween(e.date, now);
    out.push({
      key: `followup:event:${e.id}`,
      category: 'followup',
      level: e.followUpRecommended ? 'important' : 'notable',
      title: `Possible open follow-up: ${e.title} (${fmtDate(e.date, e.datePrecision)})`,
      detail: `${EVENT_TYPE_LABEL[e.type]} ${fmtSpan(ago)} ago ${
        quote ? `contains wording that usually asks for follow-up: “${quote}”` : 'was marked as needing follow-up'
      }. Mark it done on the record if this was dealt with.`,
      evidence: [{ kind: 'event', id: e.id, date: e.date, label: e.title, quote }],
    });
  }

  // 2. Suspected diagnoses never confirmed or excluded
  const diags = d.events.filter((e) => e.type === 'diagnosis');
  for (const e of diags.filter((x) => x.status === 'suspected')) {
    const word = e.title.toLowerCase().split(/[\s(/,]+/).find((w) => w.length > 4) ?? e.title.toLowerCase();
    const resolved = diags.some((x) => x !== e && x.date >= e.date && x.status !== 'suspected' && x.title.toLowerCase().includes(word));
    if (!resolved) {
      out.push({
        key: `followup:suspected:${e.id}`,
        category: 'followup',
        level: 'notable',
        title: `"${e.title}" was suspected but never confirmed or ruled out`,
        detail: `Raised ${fmtDate(e.date, e.datePrecision)}${e.provider ? ` by ${e.provider}` : ''}${e.specialty ? ` (${e.specialty})` : ''}. Nothing later in the record settles it either way.`,
        evidence: [{ kind: 'event', id: e.id, date: e.date, label: e.title }],
        suggestions: ['Ask what test would confirm or exclude it, and whether it is still on the table.'],
      });
    }
  }

  // 3. Referrals with no later visit to that specialty
  const visits = d.events.filter((e) => e.type === 'visit' || e.type === 'procedure' || e.type === 'imaging');
  for (const e of d.events) {
    const text = `${e.findings ?? ''} ${e.notes ?? ''}`;
    for (const m of text.matchAll(REFERRAL_RE)) {
      const st = stem(m[1]);
      if (!st) continue;
      const seen = visits.some((v) => v.date > e.date && stem(`${v.specialty ?? ''} ${v.title}`) === st);
      if (!seen) {
        out.push({
          key: `followup:referral:${e.id}:${st}`,
          category: 'followup',
          level: 'notable',
          title: `Referral to ${m[1]} (${fmtDate(e.date, e.datePrecision)}) – no later ${m[1]} visit recorded`,
          detail: `“${m[0].trim()}” appears in “${e.title}”, but no later appointment with that specialty is in the record. If it happened, add it; if not, it may have fallen through the cracks.`,
          evidence: [{ kind: 'event', id: e.id, date: e.date, label: e.title, quote: m[0] }],
        });
      }
    }
  }
  return out;
}

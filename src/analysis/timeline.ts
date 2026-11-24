// Whole-history patterns: onsets after sentinel events, recurring body regions
// and imaging findings, multi-system spread, fragmented care.
import type { MedicalEvent, PatientData } from '../types';
import { EVENT_TYPE_LABEL } from '../types';
import { ageAt, daysBetween, fmtDate, fmtSpan, today, yearOf } from '../lib/dates';
import { findAffirmed } from './corpus';
import type { Insight } from './types';

const SENTINEL_TYPES = new Set(['surgery', 'injury', 'illness', 'hospitalization', 'life', 'procedure']);

export function onsetInsights(d: PatientData): Insight[] {
  const out: Insight[] = [];
  const onsets = firstAppearances(d.events);
  const sentinels = d.events.filter((e) => SENTINEL_TYPES.has(e.type));
  for (const s of sentinels) {
    const after = onsets.filter((o) => o.id !== s.id && o.date >= s.date && daysBetween(s.date, o.date) <= 365);
    if (after.length < 2) continue;
    const systems = new Set(after.flatMap((a) => a.systems));
    out.push({
      key: `onset:${s.id}`,
      category: 'onset',
      level: after.length >= 3 || systems.size >= 3 ? 'important' : 'notable',
      title: `${after.length} new problems began within a year after: ${s.title}`,
      detail: `${EVENT_TYPE_LABEL[s.type]} on ${fmtDate(s.date, s.datePrecision)} was followed by ${after
        .map((a) => `${a.title} (${fmtSpan(daysBetween(s.date, a.date))} later)`)
        .join(', ')}.${systems.size >= 2 ? ` They span ${systems.size} body systems (${[...systems].join(', ')}).` : ''} ${sentinelHint(s)}`,
      evidence: [s, ...after].map((e) => ({ kind: 'event', id: e.id, date: e.date, label: e.title })),
    });
  }
  return out;
}

function sentinelHint(s: MedicalEvent): string {
  const t = `${s.title} ${s.findings ?? ''} ${s.tags.join(' ')}`.toLowerCase();
  if (s.type === 'illness' || /infect|virus|viral|covid|mono|glandular|strep|lyme|flu|gastroenteritis/.test(t))
    return 'Infections can trigger lasting conditions (post-infectious fatigue/dysautonomia, reactive arthritis, post-infectious IBS, autoimmune flares).';
  if (/pregnan|birth|postpartum|partum|baby/.test(t))
    return 'Pregnancy and the postpartum period are common times for autoimmune conditions, hypermobility symptoms and pelvic issues to emerge.';
  if (s.type === 'injury' || /accident|whiplash|fall|concussion/.test(t))
    return 'An injury can be the start of a chronic process (e.g., CRPS, instability, central sensitization) or unmask an underlying tissue condition.';
  if (s.type === 'surgery' || s.type === 'procedure') return 'Consider complications, nerve injury, anaesthetic/medication effects or a change in physiology after the procedure.';
  return 'Timing alone does not prove cause, but it is worth asking about.';
}

/** First occurrence of each symptom/diagnosis title (normalised). */
export function firstAppearances(events: MedicalEvent[]): MedicalEvent[] {
  const seen = new Set<string>();
  const out: MedicalEvent[] = [];
  for (const e of [...events].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.type !== 'symptom' && e.type !== 'diagnosis') continue;
    if (e.status === 'ruled-out') continue;
    const k = e.title.toLowerCase().replace(/[^a-z ]/g, '').trim();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

const IMAGING_TERMS: [string, RegExp][] = [
  ['bone marrow oedema', /bone marrow (o)?edema|marrow edema|\bbme\b/i],
  ['effusion', /effusion/i],
  ['synovitis', /synovitis/i],
  ['enthesitis / enthesopathy', /enthes(itis|opathy)/i],
  ['erosions', /erosions?|erosive/i],
  ['tendinopathy / tendinosis', /tendin(opathy|osis|itis)|tendon tear/i],
  ['bursitis', /bursitis/i],
  ['degenerative change', /degenerat\w*|spondylosis|osteoarthr\w*|arthrosis/i],
  ['disc bulge / herniation', /disc (bulge|protrusion|herniation|extrusion|desiccation)|herniated disc|bulging disc/i],
  ['labral tear', /labral tear|labrum/i],
  ['cysts (incl. Tarlov / perineural)', /tarlov|perineural cyst|ganglion cyst|\bcyst/i],
  ['stenosis', /stenosis/i],
  ['scoliosis', /scoliosis/i],
  ['osteopenia', /osteopeni\w*/i],
  ['inflammation', /inflammat\w*/i],
  ['lymph node enlargement', /lymphadenopathy|enlarged lymph node/i],
  ['instability / laxity', /instability|laxity|hypermobil\w*|subluxation/i],
];

export function recurrenceInsights(d: PatientData): Insight[] {
  const out: Insight[] = [];

  // Recurring imaging terms across separate scans
  const scans = d.events.filter((e) => e.type === 'imaging' && e.findings);
  for (const [label, re] of IMAGING_TERMS) {
    const hits = scans
      .map((s) => ({ s, q: findAffirmed(s.findings!, re) }))
      .filter((x): x is { s: MedicalEvent; q: string } => !!x.q);
    if (hits.length < 2) continue;
    const regions = new Set(hits.flatMap((h) => h.s.bodyRegions));
    const multiSite = regions.size >= 2;
    out.push({
      key: `recur:imaging:${label}`,
      category: 'recurrence',
      level: multiSite && /oedema|synovitis|enthes|erosion|inflammation|effusion/.test(label) ? 'important' : multiSite ? 'notable' : 'info',
      title: `"${label}" reported on ${hits.length} separate scans${multiSite ? ` in ${regions.size} different areas` : ''}`,
      detail: multiSite
        ? `The same finding in several body areas (${[...regions].join(', ')}) may point to a body-wide process rather than separate local problems – each scan was probably reported in isolation.`
        : `Repeated in ${[...regions].join(', ') || 'the same area'} – check whether it is progressing.`,
      evidence: hits.map((h) => ({ kind: 'event', id: h.s.id, date: h.s.date, label: h.s.title, quote: h.q })),
    });
  }

  // Early degenerative findings
  const age = (date: string) => ageAt(d.patient.dob, date);
  const young = scans.filter((s) => {
    const a = age(s.date);
    return a !== undefined && a < 40 && /degenerat|spondylosis|osteoarthr|arthrosis|disc desiccation/i.test(s.findings!);
  });
  if (young.length) {
    out.push({
      key: 'recur:early-degeneration',
      category: 'recurrence',
      level: young.length >= 2 ? 'notable' : 'info',
      title: `Degenerative ("wear and tear") changes reported before age 40`,
      detail:
        'Degeneration at a young age – especially in several places – is less likely to be ordinary ageing. Hypermobility, inflammatory arthritis, metabolic or crystal disease are worth considering.',
      evidence: young.map((s) => ({ kind: 'event', id: s.id, date: s.date, label: `${s.title} (age ${age(s.date)})` })),
    });
  }

  // Body regions that keep coming back over many years
  const byRegion = new Map<string, MedicalEvent[]>();
  for (const e of d.events) for (const r of e.bodyRegions) byRegion.set(r, [...(byRegion.get(r) ?? []), e]);
  for (const [region, evs] of byRegion) {
    if (region === 'widespread') continue;
    const years = new Set(evs.map((e) => yearOf(e.date)));
    const specialists = new Set(evs.map((e) => e.specialty).filter(Boolean));
    if (years.size >= 3 && specialists.size >= 2) {
      out.push({
        key: `recur:region:${region}`,
        category: 'recurrence',
        level: 'info',
        title: `${region[0].toUpperCase() + region.slice(1)} problems in ${years.size} different years, seen by ${specialists.size} specialties`,
        detail: `${evs.length} records mention the ${region} between ${Math.min(...years)} and ${Math.max(...years)} (${[...specialists].join(', ')}). Has anyone reviewed the whole history of this area together?`,
        evidence: evs.slice(0, 8).map((e) => ({ kind: 'event', id: e.id, date: e.date, label: e.title })),
      });
    }
  }
  return out;
}

export function overviewInsights(d: PatientData): Insight[] {
  const out: Insight[] = [];
  const onsets = firstAppearances(d.events);
  const systems = new Map<string, string>(); // system -> first date
  for (const e of onsets) for (const s of e.systems) if (!systems.has(s)) systems.set(s, e.date);
  if (systems.size >= 3) {
    out.push({
      key: 'overview:multisystem',
      category: 'overview',
      level: systems.size >= 5 ? 'important' : 'notable',
      title: `Problems involve ${systems.size} body systems`,
      detail: `${[...systems.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([s, dt]) => `${s} (from ${fmtDate(dt, 'year')})`)
        .join(', ')}. When many systems are involved, a single underlying condition (connective tissue, autoimmune, autonomic, mast-cell, metabolic) can be more likely than many unrelated ones – a generalist or diagnostic review of the whole picture can help.`,
      evidence: onsets.slice(0, 10).map((e) => ({ kind: 'event', id: e.id, date: e.date, label: `${e.title} [${e.systems.join(', ')}]` })),
    });
  }

  const specialties = new Map<string, number>();
  for (const e of d.events) if (e.specialty) specialties.set(e.specialty, (specialties.get(e.specialty) ?? 0) + 1);
  const firstSx = onsets[0];
  const ruledOut = d.events.filter((e) => e.status === 'ruled-out');
  if (firstSx) {
    const yrs = daysBetween(firstSx.date, today());
    out.push({
      key: 'overview:journey',
      category: 'overview',
      level: 'info',
      title: `${fmtSpan(yrs)} since first recorded problem; ${specialties.size} specialties involved`,
      detail: `First recorded: ${firstSx.title} (${fmtDate(firstSx.date, firstSx.datePrecision)}). ${d.events.filter((e) => e.type === 'visit').length} appointments, ${
        d.events.filter((e) => e.type === 'imaging').length
      } scans, ${d.labs.length} lab results, ${d.meds.length} medications recorded.${ruledOut.length ? ` Ruled out so far: ${ruledOut.map((e) => e.title).join(', ')}.` : ''}`,
      evidence: [...specialties.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ kind: 'event', label: `${s}: ${n} record${n > 1 ? 's' : ''}` })),
    });
  }
  return out;
}

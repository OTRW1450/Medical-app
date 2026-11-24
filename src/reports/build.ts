// Turns the record into readable reports. Pure functions – no network, no AI:
// everything is assembled from what has been entered, so it is reproducible
// and every statement can be traced back to a record.
import type { EventType, MedicalEvent, PatientData } from '../types';
import { EVENT_TYPE_LABEL } from '../types';
import { ageAt, daysBetween, fmtDate, fmtSpan, today, yearOf } from '../lib/dates';
import { regionGroup } from '../lib/taxonomy';
import { firstAppearances } from '../analysis/timeline';
import { groupLabs } from '../analysis/labs';
import { isAbnormal, labLabel, labStatus } from '../analysis/corpus';
import { mean, medEffects } from '../analysis/logs';
import type { Insight } from '../analysis';

export interface ReportFilter {
  from?: string; // yyyy-mm-dd
  to?: string;
  system?: string;
  area?: string; // regionGroup name
}

export function filterEvents(events: MedicalEvent[], f: ReportFilter) {
  return events.filter(
    (e) =>
      (!f.from || e.date >= f.from) &&
      (!f.to || e.date <= f.to) &&
      (!f.system || e.systems.includes(f.system)) &&
      (!f.area || e.bodyRegions.some((r) => regionGroup(r) === f.area)),
  );
}

const firstSentence = (s?: string, max = 220, n = 1) => {
  if (!s) return '';
  const one = s.split(/(?<=[.!?])\s+/).slice(0, n).join(' ').trim();
  return one.length > max ? one.slice(0, max - 1) + '…' : one;
};
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const lc = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const EFFECT = ['made things worse', 'made things slightly worse', 'had no effect', 'helped', 'helped a lot'];

export interface Section {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export function narrative(d: PatientData, insights: Insight[], f: ReportFilter, detail: 'brief' | 'detailed'): Section[] {
  const p = d.patient;
  const now = today();
  const events = filterEvents(d.events, f);
  const inRange = (date: string) => (!f.from || date >= f.from) && (!f.to || date <= f.to);
  const onsets = firstAppearances(events);
  const sections: Section[] = [];
  const age = ageAt(p.dob, now);
  const focus = [f.system, f.area].filter(Boolean).join(' / ');
  const period = f.from || f.to ? ` between ${f.from ? fmtDate(f.from) : 'the start'} and ${f.to ? fmtDate(f.to) : 'now'}` : '';

  // ---- Overview
  const systems = [...new Set(onsets.flatMap((e) => e.systems))];
  const specialties = [...new Set(events.map((e) => e.specialty).filter(Boolean) as string[])];
  const who = [p.name, age !== undefined ? `${age} years old` : '', p.sex && p.sex !== 'unspecified' ? p.sex : ''].filter(Boolean).join(', ');
  const ov: string[] = [];
  if (onsets.length) {
    const first = onsets[0];
    const a = ageAt(p.dob, first.date);
    if (focus || period) ov.push(`Scope of this summary: ${focus || 'all records'}${period}.`);
    ov.push(
      `${who}. The record shows ${onsets.length} distinct problem${onsets.length > 1 ? 's' : ''}, the first being ${lc(first.title)} in ${fmtDate(first.date, first.datePrecision)}${a !== undefined ? ` (age ${a})` : ''} – ${fmtSpan(daysBetween(first.date, now))} ago.`,
    );
  } else ov.push(`${who}. No symptoms or diagnoses recorded${focus ? ` for ${focus}` : ''}${period}.`);
  if (systems.length) ov.push(`Body systems involved: ${list(systems)}.`);
  if (specialties.length)
    ov.push(
      `${events.filter((e) => e.type === 'visit').length} appointments, ${events.filter((e) => e.type === 'imaging').length} scans/tests and ${d.labs.filter((l) => inRange(l.date)).length} lab results are recorded, across ${specialties.length} specialt${specialties.length > 1 ? 'ies' : 'y'} (${list(specialties)}).`,
    );
  if (p.goals) ov.push(`Main question: ${p.goals}`);
  sections.push({ heading: 'Overview', paragraphs: ov });

  // ---- How it developed
  if (onsets.length) {
    const paras: string[] = [];
    const chain = onsets.slice(0, detail === 'brief' ? 5 : 12).map((e) => `${lc(e.title)} (${fmtDate(e.date, e.datePrecision)}${p.dob ? `, age ${ageAt(p.dob, e.date)}` : ''})`);
    paras.push(`In order of first appearance: ${list(chain)}${onsets.length > chain.length ? `, plus ${onsets.length - chain.length} more` : ''}.`);
    const triggers = insights.filter((i) => i.category === 'onset');
    for (const t of triggers) paras.push(`${t.title}. ${t.detail.split('. ').slice(-1)[0]}`);
    sections.push({ heading: 'How it developed', paragraphs: paras });
  }

  // ---- Year by year (detailed) / key events (brief)
  const notable = detail === 'brief' ? events.filter((e) => e.importance === 3 || e.type === 'diagnosis' || e.type === 'surgery' || e.type === 'hospitalization') : events;
  if (notable.length) {
    const byYear = new Map<number, MedicalEvent[]>();
    for (const e of notable) byYear.set(yearOf(e.date), [...(byYear.get(yearOf(e.date)) ?? []), e]);
    const bullets = [...byYear.entries()].map(
      ([y, es]) =>
        `${y}${p.dob ? ` (age ${ageAt(p.dob, es[0].date)})` : ''}: ` +
        es
          .map((e) => {
            const find = detail === 'detailed' ? firstSentence(e.findings, 160) : '';
            return `${e.title}${e.status && e.status !== 'active' ? ` [${e.status}]` : ''}${e.specialty ? ` (${e.specialty})` : ''}${find ? ` – ${find}` : ''}`;
          })
          .join('; ') +
        '.',
    );
    sections.push({ heading: detail === 'brief' ? 'Key events' : 'Year by year', paragraphs: [], bullets });
  }

  // ---- Diagnoses
  const dx = events.filter((e) => e.type === 'diagnosis');
  if (dx.length) {
    const by = (s: string) => dx.filter((e) => (e.status ?? 'active') === s).map((e) => `${e.title} (${fmtDate(e.date, e.datePrecision)}${e.specialty ? `, ${e.specialty}` : ''})`);
    const paras: string[] = [];
    if (by('active').length) paras.push(`Current diagnoses: ${list(by('active'))}.`);
    if (by('suspected').length) paras.push(`Suspected but not confirmed: ${list(by('suspected'))}.`);
    if (by('resolved').length) paras.push(`Resolved: ${list(by('resolved'))}.`);
    if (by('ruled-out').length) paras.push(`Ruled out: ${list(by('ruled-out'))}.`);
    sections.push({ heading: 'Diagnoses', paragraphs: paras });
  }

  // ---- Investigations
  const scans = events.filter((e) => e.type === 'imaging');
  const labParas: string[] = [];
  const abnormalTests: string[] = [];
  for (const [test, rs] of groupLabs(d.labs.filter((l) => inRange(l.date)))) {
    const ab = rs.filter((r) => isAbnormal(labStatus(r)));
    if (ab.length) abnormalTests.push(`${test} (${ab.length} of ${rs.length} abnormal; latest ${labLabel(rs[rs.length - 1]).split(': ')[1]} on ${fmtDate(rs[rs.length - 1].date)})`);
  }
  if (abnormalTests.length) labParas.push(`Abnormal lab results: ${list(abnormalTests)}.`);
  const labIns = insights.filter((i) => i.key.startsWith('labs:trend') || i.key.startsWith('labs:suboptimal'));
  for (const i of labIns) labParas.push(`${i.title}.`);
  if (scans.length || labParas.length) {
    sections.push({
      heading: 'Scans & tests',
      paragraphs: labParas,
      bullets: scans.slice(detail === 'brief' ? -5 : 0).map((s) => `${fmtDate(s.date, s.datePrecision)} – ${s.title}${s.findings ? `: ${detail === 'brief' ? firstSentence(s.findings, 300, 2) : s.findings}` : ''}`),
    });
  }

  // ---- Treatments
  const meds = d.meds.filter((m) => (!f.from || (m.endDate ?? now) >= f.from) && (!f.to || m.startDate <= f.to));
  if (meds.length) {
    const current = meds.filter((m) => !m.endDate || m.endDate >= now);
    const helped = meds.filter((m) => (m.effectiveness ?? -9) >= 1);
    const didnt = meds.filter((m) => m.effectiveness !== undefined && m.effectiveness <= 0);
    const fx = new Map(medEffects(d).map((e) => [e.medId, e]));
    const paras: string[] = [];
    if (current.length) paras.push(`Currently taking: ${list(current.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ''}${m.reason ? ` for ${m.reason}` : ''}`))}.`);
    if (helped.length) paras.push(`Helped: ${list(helped.map((m) => `${m.name}${m.reason ? ` (${m.reason})` : ''}`))}.`);
    if (didnt.length)
      paras.push(
        `Tried without benefit: ${didnt
          .map((m) => `${m.name} (${EFFECT[(m.effectiveness ?? 0) + 2]}${m.stopReason && !/^no (benefit|effect)\b/i.test(m.stopReason.trim()) ? `; stopped because of ${lc(m.stopReason)}` : ''})`)
          .join('; ')}.`,
      );
    const se = meds.filter((m) => m.sideEffects).map((m) => `${m.name}: ${m.sideEffects}`);
    if (se.length && detail === 'detailed') paras.push(`Side effects reported – ${se.join('; ')}.`);
    for (const m of meds) {
      const e = fx.get(m.id);
      if (e && Math.abs(e.delta) >= 0.8) paras.push(`Diary pain went from ${e.before.toFixed(1)} to ${e.after.toFixed(1)} after starting ${m.name}.`);
    }
    sections.push({ heading: 'Treatments', paragraphs: paras });
  }

  // ---- Day to day (diary)
  const logs = d.logs.filter((l) => inRange(l.date));
  if (logs.length) {
    const last = logs[logs.length - 1].date;
    const recent = logs.filter((l) => daysBetween(l.date, last) < 90);
    const areas = new Map<string, number>();
    const quals = new Map<string, number>();
    for (const l of recent)
      for (const r of l.regions) {
        areas.set(r.region, (areas.get(r.region) ?? 0) + 1);
        for (const q of r.qualities) quals.set(q, (quals.get(q) ?? 0) + 1);
      }
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
    const paras = [
      `Over the last ${recent.length} logged days (to ${fmtDate(last)}), average pain was ${mean(recent.map((l) => l.pain)).toFixed(1)}/10, with ${recent.filter((l) => l.pain >= 7).length} days at 7 or more.${areas.size ? ` Most affected: ${list(top(areas))}.` : ''}${quals.size ? ` Usually described as ${list(top(quals))}.` : ''}`,
    ];
    const corr = insights.filter((i) => i.category === 'correlation' && i.level !== 'info' && !i.key.startsWith('corr:need'));
    if (corr.length) paras.push(`From the diary: ${list(corr.map((i) => lc(i.title)))}.`);
    sections.push({ heading: 'Day to day', paragraphs: paras });
  }

  // ---- Patterns & open questions
  const pats = insights.filter((i) => i.level === 'important' && i.category !== 'onset');
  const loose = insights.filter((i) => i.category === 'followup');
  if (pats.length || loose.length) {
    sections.push({
      heading: 'Patterns & loose ends worth discussing',
      paragraphs: ['Generated from the record by a pattern-finding tool; offered as questions for clinicians, not conclusions.'],
      bullets: [...pats, ...(detail === 'detailed' ? loose : loose.slice(0, 4))].map((i) => `${i.title}.`),
    });
  }
  const qs = d.questions.filter((q) => !q.done);
  if (qs.length) sections.push({ heading: 'My questions', paragraphs: [], bullets: qs.map((q) => q.text) });
  return sections;
}

export function sectionsToText(title: string, sections: Section[]): string {
  return [
    title,
    '='.repeat(title.length),
    '',
    ...sections.flatMap((s) => [s.heading.toUpperCase(), ...s.paragraphs, ...(s.bullets ?? []).map((b) => `• ${b}`), '']),
  ].join('\n');
}

// ---------------- Timetable of events ----------------

export type RowKind = EventType | 'med-start' | 'med-stop' | 'lab';

export interface TimetableRow {
  id: string;
  date: string;
  precision: 'day' | 'month' | 'year';
  age?: number;
  kind: RowKind;
  kindLabel: string;
  what: string;
  who: string;
  details: string;
  key: boolean;
  flag?: string;
}

export interface TimetableOptions extends ReportFilter {
  types: EventType[]; // empty = all
  meds: boolean;
  labs: 'none' | 'abnormal' | 'all';
  keyOnly: boolean;
  detail: 'compact' | 'full';
}

export function timetable(d: PatientData, o: TimetableOptions): TimetableRow[] {
  const rows: TimetableRow[] = [];
  const age = (date: string) => ageAt(d.patient.dob, date);
  for (const e of filterEvents(d.events, o)) {
    if (o.types.length && !o.types.includes(e.type)) continue;
    if (o.keyOnly && e.importance !== 3) continue;
    rows.push({
      id: e.id,
      date: e.date,
      precision: e.datePrecision,
      age: age(e.date),
      kind: e.type,
      kindLabel: EVENT_TYPE_LABEL[e.type].split(' /')[0] + (e.modality ? ` (${e.modality})` : ''),
      what: e.title + (e.status && e.status !== 'active' ? ` [${e.status}]` : ''),
      who: [e.specialty, e.provider, e.facility].filter(Boolean).join(' · '),
      details: o.detail === 'full' ? [e.findings, e.notes ? `Note: ${e.notes}` : ''].filter(Boolean).join(' ') : firstSentence(e.findings, 140),
      key: e.importance === 3,
      flag: e.followUpRecommended && !e.followUpDone ? 'follow-up open' : undefined,
    });
  }
  const inRange = (date: string) => (!o.from || date >= o.from) && (!o.to || date <= o.to);
  if (o.meds && !o.keyOnly && !o.system && !o.area) {
    for (const m of d.meds) {
      const eff = m.effectiveness !== undefined ? EFFECT[m.effectiveness + 2] : '';
      if (inRange(m.startDate))
        rows.push({ id: `${m.id}:s`, date: m.startDate, precision: 'day', age: age(m.startDate), kind: 'med-start', kindLabel: 'Started medication', what: `${m.name}${m.dose ? ` ${m.dose}` : ''}`, who: m.prescriber ?? '', details: [m.reason && `For ${m.reason}.`, eff && `Effect: ${eff}.`].filter(Boolean).join(' '), key: false });
      if (m.endDate && inRange(m.endDate))
        rows.push({ id: `${m.id}:e`, date: m.endDate, precision: 'day', age: age(m.endDate), kind: 'med-stop', kindLabel: 'Stopped medication', what: m.name, who: '', details: [m.stopReason && `Reason: ${m.stopReason}.`, m.sideEffects && `Side effects: ${m.sideEffects}.`].filter(Boolean).join(' '), key: false });
    }
  }
  if (o.labs !== 'none' && !o.keyOnly && !o.system && !o.area) {
    const byDate = new Map<string, typeof d.labs>();
    for (const l of d.labs) {
      if (!inRange(l.date)) continue;
      if (o.labs === 'abnormal' && !isAbnormal(labStatus(l))) continue;
      byDate.set(l.date, [...(byDate.get(l.date) ?? []), l]);
    }
    for (const [date, ls] of byDate)
      rows.push({
        id: `lab:${date}`,
        date,
        precision: 'day',
        age: age(date),
        kind: 'lab',
        kindLabel: o.labs === 'abnormal' ? 'Abnormal lab results' : 'Lab results',
        what: ls.map((l) => l.test).join(', '),
        who: '',
        details: ls.map((l) => `${labLabel(l)}${isAbnormal(labStatus(l)) ? ` (${labStatus(l)})` : ''}`).join('; '),
        key: false,
      });
  }
  const order: Record<string, number> = { 'med-stop': 0 };
  return rows.sort((a, b) => a.date.localeCompare(b.date) || (order[a.kind] ?? 1) - (order[b.kind] ?? 1));
}

export function timetableCSV(rows: TimetableRow[]): string {
  const esc = (s: string | number | undefined) => {
    const v = String(s ?? '');
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return [
    ['Date', 'Age', 'Type', 'Event', 'Clinician / specialty', 'Details', 'Flag'].join(','),
    ...rows.map((r) => [fmtDate(r.date, r.precision), r.age, r.kindLabel, r.what, r.who, r.details, r.flag ?? (r.key ? 'key event' : '')].map(esc).join(',')),
  ].join('\n');
}

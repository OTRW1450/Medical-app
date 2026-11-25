// Turns the text of one medical document into *proposed* records for review.
// Nothing here writes to the database; the user approves every item first.
import type { DiagnosisStatus, LabResult, MedicalEvent, Medication, PatientData } from '../types';
import { uid } from '../lib/id';
import { normalizeTest } from '../analysis/labs';
import { findAffirmed, labStatus, isAbnormal } from '../analysis/corpus';
import { MODALITIES } from '../lib/taxonomy';
import {
  bodyRegions, bodySystems, dateOrderEvidence, detectProvider, detectSpecialty, findDates, listItems, medFromLine,
  parseLabBlocks, parseLabLine, sectionText, splitSections, stripBoilerplate, type DateOrder, type FoundDate, type Section,
} from './text';
import { PENDING_TAG } from './sessions';

export type DocKind = 'lab' | 'imaging' | 'visit' | 'discharge' | 'other';
export const DOC_KIND_LABEL: Record<DocKind, string> = {
  lab: 'Lab / blood test results',
  imaging: 'Scan / imaging report',
  visit: 'Visit note / clinic letter',
  discharge: 'Hospital discharge summary',
  other: 'Other document',
};

interface Base {
  id: string;
  include: boolean;
  /** text from the document this was taken from */
  source?: string;
  note?: string;
}
export interface ProposedEvent extends Base { kind: 'event'; event: MedicalEvent }
export interface ProposedLab extends Base { kind: 'lab'; lab: LabResult; duplicate?: boolean }
export interface ProposedMed extends Base { kind: 'med'; action: 'start' | 'stop' | 'change' | 'list'; med: Medication; existingId?: string }
export interface ProposedAllergy extends Base { kind: 'allergy'; text: string }

export interface ParsedDoc {
  kind: DocKind;
  scores: Record<DocKind, number>;
  date?: string;
  endDate?: string;
  dateOrder: DateOrder;
  dates: FoundDate[];
  main: ProposedEvent;
  diagnoses: ProposedEvent[];
  labs: ProposedLab[];
  meds: ProposedMed[];
  allergies: ProposedAllergy[];
  planItems: string[];
  warnings: string[];
}

export interface ParseOptions {
  data: PatientData;
  fileName?: string;
  forceKind?: DocKind;
  dateOrder?: DateOrder; // force
  defaultOrder: DateOrder; // from the user's locale
  today: string;
}

// ------------------------------------------------------------ classification

const MODALITY_RE: [RegExp, string][] = [
  [/\b(mri|magnetic resonance|mr (scan|imaging)|mra)\b/i, 'MRI'],
  [/\b(ct|cat scan|computed tomography|ct scan)\b/i, 'CT'],
  [/\b(x-?ray|radiograph\w*|xr)\b/i, 'X-ray'],
  [/\b(ultrasound|sonograph\w*|us scan|doppler|usg)\b/i, 'Ultrasound'],
  [/\b(emg|nerve conduction|ncs)\b/i, 'EMG/NCS'],
  [/\b(bone scan|scintigraph\w*|nuclear medicine)\b/i, 'Bone scan'],
  [/\b(dexa|dxa|bone density)\b/i, 'DEXA'],
  [/\b(pet(-ct)?|pet scan)\b/i, 'PET'],
  [/\b(endoscopy|colonoscopy|gastroscopy|egd)\b/i, 'Endoscopy'],
  [/\b(echocardiogra\w*|echo)\b/i, 'Echo'],
  [/\b(holter|ecg|ekg|electrocardiogra\w*)\b/i, 'ECG/Holter'],
  [/\b(tilt[- ]table)\b/i, 'Tilt table'],
  [/\b(polysomnograph\w*|sleep study)\b/i, 'Sleep study'],
];

export function classify(text: string, sections: Section[]): Record<DocKind, number> {
  const head = text.split('\n').slice(0, 15).join('\n');
  const keys = new Set(sections.map((s) => s.key));
  const labLines = text.split('\n').filter((l) => parseLabLine(l)).length + parseLabBlocks(text).length;
  const count = (re: RegExp, s = text) => (s.match(re) ?? []).length;
  const scores: Record<DocKind, number> = { lab: 0, imaging: 0, visit: 0, discharge: 0, other: 2 };
  scores.lab = Math.min(labLines, 12) * 1.5 + count(/\b(reference (range|interval)|ref\.? range|specimen|laboratory|pathology|ha?ematology|biochemistry|chemistry|lab report|test name|units)\b/gi) * 2;
  scores.imaging =
    (MODALITY_RE.slice(0, 9).some(([re]) => re.test(head)) ? 6 : 0) +
    (keys.has('findings') ? 4 : 0) + (keys.has('technique') ? 3 : 0) + (keys.has('indication') ? 2 : 0) +
    count(/\b(radiolog\w*|radiologist|contrast|sequences|axial|sagittal|coronal|views?)\b/gi);
  scores.discharge = count(/\bdischarge summary\b/gi) * 8 + count(/\b(date of admission|admission date|date of discharge|discharge date|admitted|discharged|length of stay|inpatient)\b/gi) * 2 + (keys.has('course') ? 5 : 0) + (keys.has('dischargeMeds') ? 4 : 0);
  scores.visit =
    ['reason', 'history', 'exam', 'assessment', 'plan', 'ap', 'pmh', 'ros'].filter((k) => keys.has(k as Section['key'])).length * 2.5 +
    count(/\b(dear (dr|doctor|colleague)|thank you for (referring|seeing|asking)|clinic letter|consultation|progress note|office visit|after visit summary|visit summary|follow[- ]up visit|telehealth|seen (today|in clinic)|clinic review|new patient|reviewed (her|him|them|the patient) (today|in clinic))\b/gi) * 3;
  return scores;
}

function pickKind(scores: Record<DocKind, number>): DocKind {
  return (Object.entries(scores) as [DocKind, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

// ------------------------------------------------------------ dates

const ROLE_PREF: Record<DocKind, FoundDate['role'][]> = {
  lab: ['collected', 'exam', 'visit', 'report', 'generic', 'none'],
  imaging: ['exam', 'visit', 'collected', 'report', 'generic', 'none'],
  visit: ['visit', 'generic', 'exam', 'none', 'report'],
  discharge: ['admit', 'visit', 'generic', 'none', 'report'],
  other: ['visit', 'exam', 'collected', 'generic', 'report', 'none'],
};

function pickDate(dates: FoundDate[], kind: DocKind, dob: string | undefined, today: string): string | undefined {
  const usable = dates.filter((d) => d.role !== 'dob' && d.iso !== dob && d.iso <= today);
  for (const role of ROLE_PREF[kind]) {
    const hit = usable.find((d) => d.role === role);
    if (hit) return hit.iso;
  }
  return usable[0]?.iso;
}

// ------------------------------------------------------------ helpers

const STOP = new Set(['chronic', 'acute', 'of', 'the', 'with', 'and', 'left', 'right', 'bilateral', 'mild', 'moderate', 'severe', 'unspecified', 'nos', 'likely', 'possible', 'probable', 'suspected', 'query', 'syndrome', 'disease', 'disorder', 'in', 'a', 'an', 'to', 'due', 'secondary']);
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)));
export function similar(a: string, b: string): boolean {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return false;
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / Math.min(A.size, B.size) >= 0.8 || inter / new Set([...A, ...B]).size >= 0.6;
}

const SUSPECTED = /\b(possible|possibly|probable|probably|likely|suspected|suspect|suspicious for|query|\?|r\/o|rule out|to rule out|consider|considering|cannot (be )?exclude|differential|vs\.?|versus|concern for|worrying for|in keeping with|may be|might be)\b|\?/i;
const RULED_OUT = /\b(ruled out|excluded|no evidence of|negative for|not consistent with|unlikely)\b/i;
const RESOLVED = /\b(resolved|in remission|healed)\b/i;
const NOT_DIAGNOSIS = /^(name|primary\??|codes?|description|diagnosis|diagnoses|icd|problem|noted|resolved|chronic\??$|future|procedures|medications|continue|start|stop|increase|decrease|reduce|refer|referral|follow|f\/u|review|return|see|check|repeat|order|request|arrange|discussed|advised|plan|patient|we|i |he |she |they |will|to |reassur|educat|counsel|recommend|consider (starting|referral|trial)|rtc|labs|bloods|mri|ct|x-?ray|ultrasound|physio|physical therapy|exercise|lifestyle|diet|weight|time spent|total time)/i;
const ICD = /\(?\b[A-TV-Z]\d{2}(?:\.[0-9A-Z]{1,4})?\b\)?/g;

function cleanDiagnosis(item: string): string | undefined {
  let s = item.replace(/\[[^\]]*\]/g, '').replace(ICD, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/\s+(yes|no|primary)$/i, ''); // "Primary?" column in Epic encounter diagnoses
  s = s.replace(/^(diagnos[ie]s|impression|assessment|problem|dx)\s*[:\-]\s*/i, '');
  s = s.split(/\s+[-–—]\s+|:\s|;\s|\.\s|,\s(?=(?:plan|will|continue|start|refer|for)\b)/i)[0];
  s = s.replace(/^(probable|possible|likely|suspected|query|\?)\s+/i, '').replace(/\?$/, '').replace(/[.,;:]+$/, '').trim();
  s = s.replace(/,?\s*\(?(possible|probable|likely|suspect|suspected|query|provisional|confirmed|concern(?:ing)? for|rule out|r\/o|differential includes)\)?$/i, '').trim();
  if (s.length < 3 || s.length > 90 || NOT_DIAGNOSIS.test(s) || !/[a-z]{3}/i.test(s)) return undefined;
  if (s.split(/\s+/).length > 10) return undefined;
  return s[0].toUpperCase() + s.slice(1);
}

function statusOf(item: string): DiagnosisStatus {
  if (RULED_OUT.test(item)) return 'ruled-out';
  if (SUSPECTED.test(item)) return 'suspected';
  if (RESOLVED.test(item)) return 'resolved';
  return 'active';
}

const FOLLOWUP_RE = /\b(follow[- ]?up|review|return|see (?:you|again|back)|recheck|re-?check|rtc)\b[^.\n]*?\b(?:in|after|within)\s+(?:about\s+|approximately\s+|around\s+|~\s*)?(\d+|one|two|three|four|six|eight|twelve)\s*(?:-\s*\d+\s*)?(day|week|wk|month|mo|year|yr)s?\b/i;
const ORDER_AFTER_RE = /\b(mri|ct|x-?rays?|ultrasound|scan|bloods?|blood tests?|hla-?b27|crp|esr|tilt[- ]table test|sleep study|emg|nerve conduction|echo(?:cardiogram)?|biopsy|colonoscopy|endoscopy|dexa)\b[^.\n]{0,60}?\b(?:has been|have been|was|were|will be|to be|is)?\s*(requested|ordered|arranged|booked|organi[sz]ed)\b/i;
const ORDER_RE = /\b(order(?:ed)?|request(?:ed)?|arrange(?:d)?|book(?:ed)?|obtain|check|send|repeat|will get|get)\b[^.\n]{0,60}?\b(mri|ct|x-?rays?|ultrasound|scan|bloods?|blood tests?|labs?|hla-?b27|crp|esr|ana|tsh|ferritin|b12|vitamin d|tryptase|emg|nerve conduction|echo(?:cardiogram)?|tilt[- ]table|sleep study|biopsy|colonoscopy|endoscopy|dexa)\b[^.\n]*/i;
const REFER_RE = /\brefer(?:red|ral)?\s+(?:back\s+)?(?:to|for)\s+[^.\n]+/i;
const START_RE = /\b(start(?:ed|ing)?|begin|began|commence(?:d)?|trial of|initiate(?:d)?|prescribe(?:d)?|add(?:ed)?|switch(?:ed)? to|change(?:d)? to)\s+(?:a\s+|on\s+|her\s+|him\s+|them\s+)?([^.\n]+)/i;
const STOP_RE = /\b(stop(?:ped)?|discontinue(?:d)?|d\/c|cease(?:d)?|wean(?:ed)? off|taper(?:ed)? off|come off|came off|hold|held)\s+(?:the\s+|her\s+|his\s+|their\s+)?([A-Za-z-]+)([^.\n;]*)/i;
const CHANGE_RE = /\b(increase(?:d)?|decrease(?:d)?|reduce(?:d)?|titrate(?:d)?|uptitrate|up-?titrate|wean)\s+(?:the\s+)?([A-Za-z-]+)\s+(?:dose\s+)?(?:to|from)\s+([^.\n;]+)/i;

function capital(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function event(base: Partial<MedicalEvent> & Pick<MedicalEvent, 'type' | 'title' | 'date' | 'patientId'>): MedicalEvent {
  return { id: uid(), datePrecision: 'day', bodyRegions: [], systems: [], tags: ['imported'], createdAt: Date.now(), updatedAt: Date.now(), ...base };
}

const trimText = (s: string, max = 6000) => (s.length > max ? s.slice(0, max) + '…' : s);

// ------------------------------------------------------------ main

export function parseDocument(rawText: string, o: ParseOptions): ParsedDoc {
  const text = rawText.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n');
  const pid = o.data.patient.id;
  const sections = splitSections(text);
  const scores = classify(text, sections);
  const kind = o.forceKind ?? (Math.max(...Object.values(scores)) < 4 ? 'other' : pickKind(scores));
  const evidence = dateOrderEvidence(text);
  const dateOrder = o.dateOrder ?? evidence.order ?? o.defaultOrder;
  const dates = findDates(text, dateOrder);
  const date = pickDate(dates, kind, o.data.patient.dob, o.today) ?? o.today;
  const warnings: string[] = [];
  if (!dates.some((d) => d.role !== 'dob')) warnings.push('No date found in the document – using today. Please set the correct date.');
  else {
    const chosen = dates.find((d) => d.iso === date && d.role !== 'dob');
    if (chosen?.ambiguous && !o.dateOrder && evidence.from !== 'dates')
      warnings.push(
        `The date ${chosen.raw} could be read as day/month or month/day. ${evidence.from === 'spelling' ? `The document’s wording suggests ${dateOrder === 'dmy' ? 'day/month (British style)' : 'month/day (US style)'}` : 'Using your default setting'} – please check it.`,
      );
  }
  const specialty = detectSpecialty(text) ?? (kind === 'imaging' ? 'Radiology' : undefined);
  const provider = detectProvider(text);
  const sec = (...k: Section['key'][]) => sectionText(sections, ...k);

  const diagnoses: ProposedEvent[] = [];
  const labs: ProposedLab[] = [];
  const meds: ProposedMed[] = [];
  const allergies: ProposedAllergy[] = [];
  const planItems: string[] = [];
  let main: ProposedEvent;

  // ---------------- lab results (any document kind may contain some)
  const labDate = pickDate(dates, 'lab', o.data.patient.dob, o.today) ?? date;
  const labLinesSource = kind === 'lab' ? text : sec('results');
  const found: { r: NonNullable<ReturnType<typeof parseLabLine>>; line: string }[] = [];
  for (const line of labLinesSource.split('\n')) {
    const r = parseLabLine(line);
    if (r) found.push({ r, line });
  }
  for (const b of parseLabBlocks(labLinesSource)) if (!found.some((f) => f.r.test === b.lab.test)) found.push({ r: b.lab, line: b.source });
  // keep the order they appear in the document
  found.sort((a, b) => labLinesSource.indexOf(a.line.split(' | ')[0]) - labLinesSource.indexOf(b.line.split(' | ')[0]));
  for (const { r, line } of found) {
    const lab: LabResult = { id: uid(), patientId: pid, date: kind === 'lab' ? labDate : date, createdAt: Date.now(), ...r };
    const dup = o.data.labs.some((x) => normalizeTest(x.test) === normalizeTest(lab.test) && x.date === lab.date && (x.value === lab.value || x.textValue === lab.textValue));
    labs.push({ kind: 'lab', id: lab.id, include: !dup, duplicate: dup, lab, source: line.trim(), note: dup ? 'Already in the record or in an earlier session' : undefined });
  }

  // ---------------- main record
  if (kind === 'lab') {
    const abn = labs.filter((l) => isAbnormal(labStatus(l.lab)));
    main = {
      kind: 'event', id: uid(), include: true,
      event: event({
        patientId: pid, type: 'lab', date: labDate, specialty, provider,
        title: `Lab results (${labs.length} test${labs.length === 1 ? '' : 's'})`,
        findings: abn.length ? `Abnormal: ${abn.map((l) => `${l.lab.test} ${l.lab.value ?? l.lab.textValue ?? ''}${l.lab.unit ? ' ' + l.lab.unit : ''}`).join('; ')}` : labs.length ? 'All results within reference ranges.' : undefined,
      }),
    };
  } else if (kind === 'imaging') {
    const head = text.split('\n').slice(0, 25).join('\n');
    const modality = MODALITY_RE.find(([re]) => re.test(head))?.[1];
    const titleLine =
      sections.find((s) => /^(exam|examination|study|procedure|title)$/i.test(s.heading))?.text.split('\n')[0] ??
      head.split('\n').find((l) => MODALITY_RE.some(([re]) => re.test(l)) && l.trim().length < 90 && !/^(clinical|indication|history|comparison)/i.test(l.trim()));
    const title = titleLine ? capital(titleLine.trim().replace(/^(exam|examination|study|procedure)\s*[:\-]\s*/i, '').replace(/\s+/g, ' ').toLowerCase().replace(/\b(mri|ct|mra|pet|dexa|emg)\b/g, (x) => x.toUpperCase()).replace(/\bx-?ray\b/, 'X-ray').replace(/\bsi\b/g, 'SI')) : `${modality ?? 'Scan'} report`;
    const impression = sec('assessment', 'ap');
    const findings = sec('findings');
    const body = stripBoilerplate([impression && `Impression: ${impression}`, findings && `Findings: ${findings}`].filter(Boolean).join('\n\n') || sec('preamble'));
    main = {
      kind: 'event', id: uid(), include: true,
      event: event({
        patientId: pid, type: 'imaging', date, modality: MODALITIES.includes(modality ?? '') ? modality : modality ? 'Other' : undefined,
        title, specialty, provider, findings: trimText(body),
        notes: sec('indication', 'history', 'reason') ? `Reason for scan: ${sec('indication', 'history', 'reason').slice(0, 400)}` : undefined,
        bodyRegions: bodyRegions(`${title}\n${impression}`),
        systems: [...new Set(['musculoskeletal', ...bodySystems(impression)])].slice(0, 3),
        followUpRecommended: !!findAffirmed(body, /\b(follow[- ]?up (is |was )?(recommended|advised|suggested)|recommend(ed)? (repeat|follow[- ]?up|further|correlation|mri|ct)|clinical correlation|further (evaluation|imaging)|(review|referral|opinion) (is )?(recommended|advised|suggested)|consider (an? )?(mri|ct|referral|biopsy|repeat)|repeat (imaging|scan|mri|ct|ultrasound) in)\b/i) || undefined,
      }),
    };
  } else if (kind === 'visit' || kind === 'discharge' || kind === 'other') {
    const isDischarge = kind === 'discharge';
    const reason = sec('reason') || (isDischarge ? '' : '');
    const assessment = sec('assessment', 'ap');
    const parts: [string, string][] = [
      ['Reason', reason],
      ['History', sec('history')],
      ['Hospital course', sec('course')],
      ['Procedures', sec('procedures')],
      ['Examination', sec('exam')],
      ['Results', sec('results')],
      ['Assessment', sec('assessment')],
      ['Assessment & plan', sec('ap')],
      ['Plan', sec('plan')],
    ];
    let findings = stripBoilerplate(parts.filter(([, t]) => t).map(([h, t]) => `${h}: ${t}`).join('\n\n'));
    if (!findings) findings = stripBoilerplate(text);
    const admit = dates.find((d) => d.role === 'admit')?.iso;
    const discharge = dates.find((d) => d.role === 'discharge')?.iso;
    const firstReason = listItems(reason)
      .filter((x) => !/^(patient )?(presents|presenting|is here|comes in|here) (with|for|today)\b/i.test(x))
      .slice(0, 3)
      .join(', ')
      .replace(/[.;]+$/, '');
    const title = isDischarge
      ? `Hospital stay${firstReason ? ` – ${firstReason.slice(0, 60)}` : ''}`
      : kind === 'other'
        ? (o.fileName?.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ') ?? text.split('\n').find((l) => l.trim())?.trim().slice(0, 70) ?? 'Document')
        : `${specialty ?? 'Clinic'} ${
            /\b(session|treatment note|daily note|soap note|therapy note)\b/i.test(text) || /^(Physiotherapy|Occupational therapy|Psychiatry\/Psychology|Chiropractic|Acupuncture|Massage therapy|Speech therapy)$/.test(specialty ?? '')
              ? 'session'
              : /consult|new patient|thank you for referring/i.test(text) ? 'consultation' : /telehealth|telephone|video/i.test(text) ? 'telehealth visit' : 'visit'
          }${firstReason ? ` – ${firstReason.slice(0, 50)}` : ''}`;
    main = {
      kind: 'event', id: uid(), include: true,
      event: event({
        patientId: pid,
        type: isDischarge ? 'hospitalization' : kind === 'other' ? 'note' : 'visit',
        date: isDischarge ? (admit ?? date) : date,
        endDate: isDischarge ? discharge : undefined,
        title, specialty, provider,
        findings: trimText(findings),
        bodyRegions: bodyRegions(`${reason}\n${assessment}\n${sec('exam')}`),
        systems: bodySystems(`${reason}\n${assessment}`),
      }),
    };

    // ---- diagnoses from assessment / impression / discharge diagnoses / problem list
    const dxSources: [string[], boolean][] = [
      [problemsInAP(sec('ap')), true],
      [listItems(sec('assessment')), true],
      [listItems(sec('pmh')), false],
    ];
    const seen = new Set<string>();
    for (const [items, primary] of dxSources) {
      for (const item of items) {
        const title = cleanDiagnosis(item);
        if (!title || seen.has(title.toLowerCase())) continue;
        // plan sentences inside A&P are not diagnoses
        if (!primary && item.length > 80) continue;
        seen.add(title.toLowerCase());
        const status = primary ? statusOf(item) : 'active';
        const existing = o.data.events.find((e) => e.type === 'diagnosis' && similar(e.title, title));
        const upgrade = existing && existing.status === 'suspected' && status === 'active';
        const dup = !!existing && !upgrade && (existing.status === status || (status === 'active' && existing.status !== 'ruled-out'));
        diagnoses.push({
          kind: 'event', id: uid(),
          include: !dup && (primary || !existing),
          source: item,
          note: dup ? (existing!.tags.includes(PENDING_TAG) ? `Also in an earlier session of this file (${existing!.date})` : `Already in the record (${existing!.title}, ${existing!.date})`) : upgrade ? `Was suspected on ${existing!.date} – now stated as a diagnosis` : !primary ? 'From the past history / problem list' : undefined,
          event: event({
            patientId: pid, type: 'diagnosis', date: main.event.date, title, status,
            specialty, provider, systems: bodySystems(title), bodyRegions: bodyRegions(title),
            findings: item !== title ? item : undefined,
            datePrecision: 'day',
          }),
        });
      }
    }

    // ---- plan: medication changes, tests ordered, referrals, follow-up
    function proposeStart(sm: NonNullable<ReturnType<typeof medFromLine>>, line: string) {
      if (meds.some((x) => similar(x.med.name, sm.name))) return;
      const existing = o.data.meds.find((x) => similar(x.name, sm.name) && !x.endDate);
      if (existing) return; // already taking it
      meds.push({
        kind: 'med', id: uid(), include: true, action: 'start', source: line,
        med: { id: uid(), patientId: pid, name: sm.name, dose: sm.dose, startDate: main.event.date, reason: diagnoses.find((d) => d.include)?.event.title, prescriber: provider, createdAt: Date.now() },
      });
    }
    const planLines = [...listItems(sec('plan')), ...apPlanLines(sec('ap'))].filter((x, i, a) => a.indexOf(x) === i).flatMap((l) => l.split(/(?<=\.)\s+(?=[A-Z])/));
    for (const line of planLines) {
      const stop = line.match(STOP_RE);
      if (stop && medFromLine(stop[2] + stop[3])) {
        const m = medFromLine(stop[2] + stop[3])!;
        const existing = o.data.meds.find((x) => similar(x.name, m.name) && !x.endDate);
        const stoppedBefore = !existing ? o.data.meds.find((x) => similar(x.name, m.name) && x.endDate) : undefined;
        const why = stop[3].match(/\b(?:due to|because of|as|given|owing to)\s+([^.;]+)/i)?.[1];
        meds.push({
          kind: 'med', id: uid(), include: !stoppedBefore, action: 'stop', existingId: existing?.id, source: line,
          note: existing ? `Will mark ${existing.name} as stopped on this date` : stoppedBefore ? `Already recorded as stopped on ${stoppedBefore.endDate}` : 'Not in your medication list – will be added as a past medication',
          med: { ...(existing ?? { id: uid(), patientId: pid, name: m.name, startDate: main.event.date, createdAt: Date.now() }), endDate: main.event.date, stopReason: why ?? existing?.stopReason },
        });
        continue;
      }
      const change = line.match(CHANGE_RE);
      if (change && isDrugish(change[2])) {
        const existing = o.data.meds.find((x) => similar(x.name, change[2]) && !x.endDate);
        meds.push({
          kind: 'med', id: uid(), include: true, action: 'change', existingId: existing?.id, source: line,
          note: existing ? `Dose change for ${existing.name}` : 'Not in your medication list – will be added',
          med: { ...(existing ?? { id: uid(), patientId: pid, name: capital(change[2]), startDate: main.event.date, createdAt: Date.now() }), dose: change[3].trim().slice(0, 60) },
        });
        continue;
      }
      const start = line.match(START_RE);
      const started = start ? start[2].split(/\s+(?:with|and|plus|\+|alongside)\s+(?=[a-z]+\s+\d)|,\s*(?=[a-z]+\s+\d)/i).map(medFromLine).filter((x): x is NonNullable<typeof x> => !!x) : [];
      if (started.length) {
        for (const sm of started) proposeStart(sm, line);
        continue;
      }
      const ord = line.match(ORDER_RE) ?? line.match(ORDER_AFTER_RE);
      if (ord) planItems.push(`Test ordered: ${line.trim().replace(/^[-•*]\s*/, '')}`);
      const ref = line.match(REFER_RE);
      if (ref) planItems.push(`Referral: ${ref[0].trim()}`);
    }
    for (const line of medItems(sec('medsStarted'))) {
      const sm = medFromLine(line);
      if (sm) proposeStart(sm, line);
    }
    for (const line of medItems(sec('medsChanged'))) {
      const m = medFromLine(line);
      if (!m || meds.some((x) => similar(x.med.name, m.name))) continue;
      const existing = o.data.meds.find((x) => similar(x.name, m.name) && !x.endDate);
      meds.push({
        kind: 'med', id: uid(), include: true, action: 'change', existingId: existing?.id, source: line,
        note: existing ? `Dose/instructions change for ${existing.name}` : 'Not in your medication list – will be added',
        med: { ...(existing ?? { id: uid(), patientId: pid, name: m.name, startDate: main.event.date, createdAt: Date.now() }), dose: m.dose ?? existing?.dose },
      });
    }
    for (const line of medItems(sec('medsStopped'))) {
      const m = medFromLine(line);
      if (!m || meds.some((x) => similar(x.med.name, m.name))) continue;
      const existing = o.data.meds.find((x) => similar(x.name, m.name) && !x.endDate);
      const stoppedBefore = !existing ? o.data.meds.find((x) => similar(x.name, m.name) && x.endDate) : undefined;
      meds.push({
        kind: 'med', id: uid(), include: !stoppedBefore, action: 'stop', existingId: existing?.id, source: line,
        note: existing ? `Will mark ${existing.name} as stopped on this date` : stoppedBefore ? `Already recorded as stopped on ${stoppedBefore.endDate}` : 'Not in your medication list – will be added as a past medication',
        med: { ...(existing ?? { id: uid(), patientId: pid, name: m.name, startDate: main.event.date, createdAt: Date.now() }), endDate: main.event.date },
      });
    }
    for (const item of listItems(sec('orders'))) {
      if (/^(procedures|medications|labs?|imaging|referrals?|other orders)$/i.test(item)) continue; // sub-headings
      if (medFromLine(item)) continue; // medication orders are handled above
      if (/\brefer/i.test(item)) planItems.push(`Referral: ${item}`);
      else planItems.push(`Test ordered: ${item}`);
    }
    const planWithHeadings = sections.filter((x) => x.key === 'plan' || x.key === 'ap').map((x) => `${x.heading}: ${x.text}`).join('\n');
    const fu = planWithHeadings.match(FOLLOWUP_RE) ?? text.match(FOLLOWUP_RE);
    if (fu) planItems.push(`Follow-up: ${fu[0].trim()}`);
    // Flag for follow-up only when something concrete was ordered; referrals are tracked separately
    // and a routine "review in 3 months" isn't a loose end on its own.
    if (planItems.some((x) => x.startsWith('Test ordered'))) main.event.followUpRecommended = true;

    // ---- medication lists (current / discharge)
    for (const line of medItems(sec('meds', 'dischargeMeds'))) {
      const m = medFromLine(line);
      if (!m) continue;
      if (meds.some((x) => similar(x.med.name, m.name))) continue;
      const existing = o.data.meds.find((x) => similar(x.name, m.name));
      if (existing && !existing.endDate) continue; // already known and current
      const old = daysBetweenISO(main.event.date, o.today) > 180;
      meds.push({
        kind: 'med', id: uid(), include: !existing && !old, action: 'list', existingId: existing?.id, source: line,
        note: existing
          ? `Recorded before as stopped on ${existing.endDate}`
          : old
            ? 'Listed in an older document – tick to add it as a current medication if you still take it'
            : 'On the medication list – the real start date may be earlier',
        med: { id: uid(), patientId: pid, name: m.name, dose: m.dose, startDate: main.event.date, createdAt: Date.now() },
      });
    }

    // ---- allergies
    const known = (o.data.patient.allergies ?? '').toLowerCase();
    for (const item of listItems(sec('allergies'))) {
      if (/\b(nkda|nka|no known|none known|nil known|none)\b/i.test(item)) continue;
      if (/^(allergen|reactions?|severity|noted|type|reaction type)(\s+(allergen|reactions?|severity|noted))*$/i.test(item)) continue; // table headers
      const name = item.split(/[-–:(]/)[0].trim();
      if (!name || name.length > 60) continue;
      allergies.push({ kind: 'allergy', id: uid(), include: !known.includes(name.toLowerCase()), text: item.slice(0, 120), source: item, note: known.includes(name.toLowerCase()) ? 'Already listed' : undefined });
    }
  } else {
    main = { kind: 'event', id: uid(), include: true, event: event({ patientId: pid, type: 'note', date, title: o.fileName ?? 'Document', findings: trimText(text) }) };
  }

  for (const l of labs) l.lab.eventId = main.event.id;
  // A document imported twice?
  const twin = o.data.events.find((e) => e.type === main.event.type && e.date === main.event.date && similar(e.title, main.event.title));
  if (twin) warnings.push(`This may already be in the record: “${twin.title}” on ${twin.date}.`);
  if (kind === 'lab' && !labs.length) warnings.push('No lab values could be read. If this is a scan of paper, the text may not have been recognised well.');

  return {
    kind, scores, date: main.event.date, endDate: main.event.endDate, dateOrder, dates,
    main, diagnoses, labs, meds, allergies, planItems: [...new Set(planItems)], warnings,
  };
}

function daysBetweenISO(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function isDrugish(w: string) {
  return !!medFromLine(w);
}

/** In an "Assessment & Plan" section: numbered / unbulleted lines are problems; "Suspect X" adds a suspected one. */
function problemsInAP(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[-•*–·▪●o]\s+/.test(line)) continue; // bullet = plan item
    const numbered = line.match(/^(?:#?\d{1,2}[.)]|problem\s*\d*:)\s*(.+)$/i);
    if (numbered) {
      out.push(numbered[1]);
      continue;
    }
    for (const m of line.matchAll(/\b(suspect(?:ed)?|possible|probable|likely|concern(?:ing)? for|query|rule out|r\/o|differential includes)\s+([A-Za-z][A-Za-z0-9' -]{1,50}?)(?=[.;,]|\s+(?:vs|versus|or|given|due|based)\b|$)/gi))
      out.push(`${m[2]} (${m[1].toLowerCase()})`);
    if (!/[.!?]\s|\b(will|we|plan|advised|discussed|increase|decrease|continue|start|stop)\b/i.test(line) && line.length < 90 && !out.length) out.push(line);
  }
  return out;
}

/** Plan lines inside an "Assessment & Plan" section (bullets and sentences under each problem). */
function apPlanLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(?:#?\d{1,2}[.)])\s/.test(l))
    .map((l) => l.replace(/^[-•*–·▪●o]\s+/, ''));
}

/** Medication list items, joining instruction lines ("Take 1 tablet…") to the drug line above. */
function medItems(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/^[-•*–·▪●]\s+/, '');
    if (!line) continue;
    if (out.length && /^(take|use|apply|inject|inhale|place|instill|dissolve|chew|commonly known as|what changed|how much|when to take|instructions|sig:?|dose:?|\d+ (tablet|capsule|ml|puff))/i.test(line)) out[out.length - 1] += ' ' + line;
    else out.push(line);
  }
  return out;
}

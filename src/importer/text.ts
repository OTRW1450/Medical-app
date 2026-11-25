// Text utilities for reading medical documents: dates, sections, lab lines,
// medication names, body areas. Pure functions – unit-tested, no network.
import type { LabResult } from '../types';

// ---------------------------------------------------------------- Dates

export type DateOrder = 'dmy' | 'mdy';
export type DateRole = 'visit' | 'collected' | 'exam' | 'admit' | 'discharge' | 'report' | 'dob' | 'generic' | 'none';

export interface FoundDate {
  iso: string;
  index: number;
  raw: string;
  role: DateRole;
  /** numeric date where day/month order could not be told apart */
  ambiguous: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const ROLE_LABELS: [RegExp, DateRole][] = [
  [/(d\.?\s?o\.?\s?b\.?|date of birth|birth\s?date|born)\W*$/i, 'dob'],
  [/(date of service|service date|visit date|date of visit|encounter date|appointment date|appt date|seen on|clinic date|consultation date|date seen|date of consultation|letter date|visit|office visit|clinic visit|video visit|telemedicine visit|telephone (?:visit|encounter)|you saw [^\n]{0,60} on|you were seen [^\n]{0,60} on|appointment on)\W*$/i, 'visit'],
  [/(collected|collection date|date collected|collection|specimen collected|drawn|sample (?:taken|date|collected)|date of collection)\W*(?:on|date)?\W*$/i, 'collected'],
  [/(exam date|date of exam(?:ination)?|study date|date of study|scan date|date of scan|procedure date|examination date|date of procedure|exam)\W*$/i, 'exam'],
  [/(admission date|date of admission|admitted(?: on)?|admit date|date admitted)\W*$/i, 'admit'],
  [/(discharge date|date of discharge|discharged(?: on)?)\W*$/i, 'discharge'],
  [/(report(?:ed)? date|date reported|reported(?: on)?|date of report|signed(?: on)?|electronically signed[^\n]*|dictated|transcribed|printed(?: on| by[^\n]{0,60})?|generated(?: on)?|downloaded(?: on)?|resulted(?: on)?|result date|verified|authori[sz]ed|received|around|due|next appointment|follow[- ]?up(?: on)?)\W*$/i, 'report'],
  [/(^|\n)\s*date\W*$/i, 'generic'],
];

function valid(y: number, m: number, d: number) {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const fullYear = (y: string) => (y.length === 2 ? (Number(y) > 40 ? 1900 : 2000) + Number(y) : Number(y));

const UK_CUES = /\b(yours sincerely|yours faithfully|programme|haemo\w*|anaem\w*|oedema|colour|paracetamol|consultant|registrar|gp\b|general practitioner|nhs|a&e|mmol\/l|paediatric|orthopaedic|gynaecolog\w*|oesophag\w*|centre|behaviour|favour|organis\w*|recognis\w*|realis\w*|mobilis\w*|tds|qds|bd\b|nocte|mane|surgery\b(?= hours)|postcode)\b/gi;
const US_CUES = /\b(acetaminophen|tylenol|family medicine|primary care physician|pcp|md\b|pa-c|mg\/dl|anemia|edema|color|center|behavior|organiz\w*|recogniz\w*|pediatric|orthopedic|gynecolog\w*|esophag\w*|zip|insurance|copay|medicare|medicaid|bid|tid|qid|q\d+h|er visit|emergency room|after visit summary|mychart)\b/gi;

/** Evidence for day/month order: unambiguous dates first, then British vs American conventions. */
export function dateOrderEvidence(text: string): { order?: DateOrder; from: 'dates' | 'spelling' | 'none' } {
  let dmy = 0;
  let mdy = 0;
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  if (dmy !== mdy) return { order: dmy > mdy ? 'dmy' : 'mdy', from: 'dates' };
  const uk = (text.match(UK_CUES) ?? []).length;
  const us = (text.match(US_CUES) ?? []).length;
  if (uk >= us + 2) return { order: 'dmy', from: 'spelling' };
  if (us >= uk + 2) return { order: 'mdy', from: 'spelling' };
  return { from: 'none' };
}

export function detectDateOrder(text: string, fallback: DateOrder): DateOrder {
  return dateOrderEvidence(text).order ?? fallback;
}

export function findDates(text: string, order: DateOrder): FoundDate[] {
  const out: FoundDate[] = [];
  const push = (index: number, raw: string, y: number, m: number, d: number, ambiguous = false) => {
    if (!valid(y, m, d)) return;
    if (out.some((o) => o.index === index)) return;
    const before = text.slice(Math.max(0, index - 60), index);
    const lineBefore = (before.split('\n').pop() ?? '').replace(/(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\s*$/i, '');
    let role: DateRole = 'none';
    for (const [re, r] of ROLE_LABELS) {
      if (re.test(lineBefore) || (r === 'generic' && re.test(before.slice(-12)))) {
        role = r;
        break;
      }
    }
    out.push({ iso: iso(y, m, d), index, raw, role, ambiguous });
  };
  for (const m of text.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) push(m.index!, m[0], +m[1], +m[2], +m[3]);
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g)) {
    // skip if part of an ISO date already matched, or looks like a ratio (1:160) etc.
    if (/\d[-/.]$/.test(text.slice(Math.max(0, m.index! - 2), m.index!))) continue;
    const a = +m[1];
    const b = +m[2];
    const y = fullYear(m[3]);
    const [d, mo] = order === 'dmy' ? [a, b] : [b, a];
    push(m.index!, m[0], y, mo, d, a <= 12 && b <= 12 && a !== b);
  }
  const dmyRe = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+${MON}\\.?,?[\\s-]+(\\d{4}|\\d{2})\\b`, 'gi');
  for (const m of text.matchAll(dmyRe)) push(m.index!, m[0], fullYear(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  const mdyRe = new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi');
  for (const m of text.matchAll(mdyRe)) push(m.index!, m[0], +m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  return out.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------- Sections

export type SectionKey =
  | 'preamble' | 'reason' | 'history' | 'pmh' | 'meds' | 'dischargeMeds' | 'allergies' | 'exam' | 'vitals' | 'ros'
  | 'social' | 'family' | 'results' | 'assessment' | 'plan' | 'ap' | 'findings' | 'technique' | 'indication' | 'course' | 'procedures'
  | 'medsStarted' | 'medsStopped' | 'medsChanged' | 'orders' | 'signoff';

const HEADINGS: [RegExp, SectionKey][] = [
  [/^(reason for (your )?(visit|referral|consultation|appointment|admission|attendance)|visit reason|why you were seen|presenting problem|chief complaints?|presenting complaints?|c\/?c|referral reason|indication for visit|reason for exam)$/i, 'reason'],
  [/^(history of present(ing)? (illness|complaint)|hpi|history|subjective|interval history|clinical history|clinical information|clinical details|history of presenting complaint|hpc)$/i, 'history'],
  [/^(indications?|clinical indications?|clinical question)$/i, 'indication'],
  [/^(past medical history|pmh|pmhx|past history|medical history|problem list|active problems|patient active problem list|active problem list|past medical\/surgical history|past medical and surgical history|ongoing problems)$/i, 'pmh'],
  [/^(medications?|current medications?|medication list|your medication list|meds|current meds|outpatient medications|home medications|regular medications|drug history|dh|current outpatient medications|current outpatient (medications|prescriptions)( on file)?( prior to visit)?|outpatient medications prior to visit|medications prior to (visit|admission)|prior to admission medications|continue taking( these medications)?|keep taking( these medications)?)$/i, 'meds'],
  [/^(discharge medications?|medications on discharge|medications at discharge|tto)$/i, 'dischargeMeds'],
  [/^(stop taking( these medications)?|medications? discontinued( during this (encounter|visit))?|discontinued medications?|stopped medications?|medications? stopped)$/i, 'medsStopped'],
  [/^(change how you take( these medications)?|changed medications?|medication changes|medications? changed|dose changes?)$/i, 'medsChanged'],
  [/^(medications? started( (this|during this) (visit|encounter))?|new medications?|medications? prescribed|prescriptions?( this visit)?|start taking( these medications)?|new prescriptions?)$/i, 'medsStarted'],
  [/^(orders( placed)?( this (visit|encounter))?|tests? ordered|investigations (requested|ordered)|labs? ordered|lab orders|imaging ordered|procedures ordered|done today|tests done today|labs done today)$/i, 'orders'],
  [/^(allerg(y|ies)( and intolerances| \/ intolerances)?|drug allergies|adverse reactions|known allergies)$/i, 'allergies'],
  [/^(physical exam(ination)?|exam(ination)?|objective|on examination|o\/e|clinical examination|examination findings|exam findings)$/i, 'exam'],
  [/^(vital signs|vitals|observations)$/i, 'vitals'],
  [/^(review of systems|ros|systems review|systemic enquiry)$/i, 'ros'],
  [/^(social history|sh|social hx)$/i, 'social'],
  [/^(family history|fh|family hx)$/i, 'family'],
  [/^(results|investigations|labs|lab results|data|relevant results|test results|recent results|imaging)$/i, 'results'],
  [/^(assessment and plan|assessment\/plan|assessment & plan|a\/p|a&p|impression and plan|impression\/plan)$/i, 'ap'],
  [/^(assessment|impressions?|diagnos[ie]s|encounter diagnos[ie]s|your diagnos[ie]s|today'?s diagnos[ie]s|problem list items addressed( this visit)?|working diagnosis|discharge diagnos[ie]s|final diagnos[ie]s|principal diagnosis|primary diagnosis|secondary diagnos[ie]s|summary|opinion|clinical impression|problems? addressed|conclusions?|diagnoses this visit|visit diagnoses)$/i, 'assessment'],
  [/^(plan|management|recommendations?|treatment plan|plan of care|next steps|actions?|follow[- ]?up|disposition|patient instructions|instructions|instructions from .{2,60}|what'?s next|what you need to do|referrals?)$/i, 'plan'],
  [/^(findings|report|result)$/i, 'findings'],
  [/^(technique|protocol|comparison|procedure details|sequences)$/i, 'technique'],
  [/^(hospital course|course in hospital|clinical course|brief hospital course|course)$/i, 'course'],
  [/^(procedures?( performed)?|operations?( performed)?|interventions)$/i, 'procedures'],
];

export interface Section {
  key: SectionKey;
  heading: string;
  text: string;
}

export function headingKey(h: string): SectionKey | undefined {
  const t = h.trim().replace(/\s+/g, ' ').replace(/[:.]$/, '');
  for (const [re, k] of HEADINGS) if (re.test(t)) return k;
  return undefined;
}

/** Split a document into its headed sections ("Assessment:", "PLAN", …). */
export function splitSections(text: string): Section[] {
  const sections: Section[] = [{ key: 'preamble', heading: '', text: '' }];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    let m = line.match(/^([A-Za-z][A-Za-z /&()'-]{0,48}?)\s*[:：]\s*(.*)$/);
    let key = m ? headingKey(m[1]) : undefined;
    if (!key && line.length <= 70 && line.split(/\s+/).length <= 9) {
      key = headingKey(line);
      if (key) m = [line, line, ''] as unknown as RegExpMatchArray;
    }
    if (/^(yours sincerely|yours faithfully|sincerely|kind regards|best regards|with best wishes|warm regards|regards|electronically signed|cc\b|copy to|dictated but not (read|signed))/i.test(line)) {
      sections.push({ key: 'signoff', heading: '', text: raw + '\n' });
      continue;
    }
    // "Procedures" / "Medications" / "Labs" are sub-headings inside an orders list, not new sections
    const cur = sections[sections.length - 1].key;
    if (key && cur === 'orders' && !line.includes(':') && /^(procedures|medications?|labs?|imaging|referrals?|other orders)$/i.test(line)) key = undefined;
    if (key && m) {
      sections.push({ key, heading: m[1].trim(), text: m[2] ? m[2] + '\n' : '' });
    } else sections[sections.length - 1].text += raw + '\n';
  }
  return sections.map((s) => ({ ...s, text: s.text.replace(/\n{3,}/g, '\n\n').trim() })).filter((s) => s.text || s.key !== 'preamble');
}

export function sectionText(sections: Section[], ...keys: SectionKey[]): string {
  return sections.filter((s) => keys.includes(s.key)).map((s) => s.text).filter(Boolean).join('\n');
}

/** Split a list-like section into items (numbered, bulleted, or one per line). */
export function listItems(text: string): string[] {
  const items: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^(?:\d{1,2}[.)]|[-•*–·▪●o]|\(\w\))\s+/.test(line);
    const cleaned = line.replace(/^(?:\d{1,2}[.)]|[-•*–·▪●o]|\(\w\))\s+/, '').trim();
    if (!bullet && items.length && /^[a-z(]/.test(cleaned)) items[items.length - 1] += ' ' + cleaned; // wrapped line
    else items.push(cleaned);
  }
  // Also split "A; B; C" when a single line holds several items.
  return items.flatMap((i) => (i.length > 40 && i.includes(';') ? i.split(/;\s*/) : [i])).map((s) => s.trim()).filter((s) => s.length > 1);
}

// ---------------------------------------------------------------- Lab lines

const META_START =
  /^(page|date|time|patient|name|dob|d\.o\.b|mrn|nhs|hospital (no|number)|address|phone|tel|fax|age|sex|gender|physician|doctor|dr\b|ordered|ordering|specimen|collected|collection|received|reported|requested|requesting|ref(erence)?\b|lab(oratory)?\b|accession|account|acct|location|comments?|notes?|status|final|preliminary|report|printed|source|clinician|consultant|sample|test name|analyte|component|units?\b|result\b|flag\b|range\b|id\b|visit|encounter|fasting|copy to|cc\b|insurance|plan\b|attending|provider)/i;

const UNIT = /^(%|[a-zµμ]{1,6}\/[a-z0-9.^]+(\/[a-z0-9.]+)?|x?\s?10[\^eE*]?\d+\/[a-zµμ]+|[kKmM]\/u[lL]|fl|pg|sec|secs|s|ratio|index|titre|titer|mm\/hr?|mmhg|bpm|iu|u|units?|cells\/[a-zµμ]+|mmol|umol|nmol)$/i;
const FLAG = /^(h|l|hh|ll|high|low|a|abn|abnormal|\*|\*h|\*l|h\*|l\*|↑|↓|crit|critical|[<>]{1}h?)$/i;
const NUM = /^[<>≤≥]?-?\d+(?:[.,]\d+)?$/;
const QUAL = /\b(positive|negative|detected|not detected|reactive|non-?reactive|present|absent|equivocal|indeterminate|borderline|weakly positive|strongly positive)\b/i;

function num(s: string) {
  return Number(s.replace(/[<>≤≥\s]/g, '').replace(',', '.'));
}

function parseRangeToken(t: string): { lo?: number; hi?: number } | undefined {
  const s = t.replace(/[()[\]]/g, '');
  let m = s.match(/^(-?\d+(?:[.,]\d+)?)-(-?\d+(?:[.,]\d+)?)$/);
  if (m) return { lo: num(m[1]), hi: num(m[2]) };
  m = s.match(/^[<≤](\d+(?:[.,]\d+)?)$/);
  if (m) return { hi: num(m[1]) };
  m = s.match(/^[>≥](\d+(?:[.,]\d+)?)$/);
  if (m) return { lo: num(m[1]) };
  return undefined;
}

function plausibleTestName(name: string): boolean {
  const n = name.trim();
  if (n.length < 2 || n.length > 60) return false;
  if (!/^[A-Za-z(]/.test(n)) return false;
  if (n.split(/\s+/).length > 7) return false;
  if (META_START.test(n)) return false;
  if (/[:#@|]/.test(n)) return false; // "Specimen: AB12  Client #: 123" is header text, not a test
  if (/^(value|result|normal range|standard range|reference range|your value|component|flag|units?|in range|out of range)$/i.test(n)) return false;
  if (/\b(the|and|was|were|is|are|with|you|your|please|we|this|that|which|should|will)\b/i.test(n) && n.split(/\s+/).length > 3) return false;
  return true;
}

/**
 * Parse one line of a lab report, e.g.
 *   "C-Reactive Protein   9.1  H  mg/L   0.0 - 5.0"
 *   "Ferritin: 13 ng/mL (15-150) L"
 *   "HLA-B27   Positive"
 */
export function parseLabLine(line: string): Omit<LabResult, 'id' | 'patientId' | 'date' | 'createdAt'> | null {
  let s = line.replace(/\t/g, '  ').replace(/\s+$/, '');
  if (!s.trim() || s.trim().length > 140) return null;
  // normalise ranges so they become single tokens
  s = s
    .replace(/(\d)\s*(?:-|–|to)\s*(\d)/g, '$1-$2')
    .replace(/([<>≤≥])\s+(\d)/g, '$1$2')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/(\d)\s*:\s*(?=[A-Za-z])/g, '$1 ');
  const tokens = s.trim().split(/\s+/);
  // name may end with ':'
  let vi = -1;
  for (let i = 1; i < tokens.length; i++) {
    let t = tokens[i];
    const glued = t.match(/^([<>]?\d+(?:[.,]\d+)?)([HL])\*?$/);
    if (glued) t = glued[1];
    if (!NUM.test(t)) continue;
    const before = tokens.slice(0, i).join(' ');
    if (!/[A-Za-z]/.test(before)) continue;
    const next = tokens[i + 1];
    // "Vitamin D 25 OH 18 ng/mL": a number followed by a non-unit word, with a later number, is part of the name
    if (next && /^[A-Za-z]+$/.test(next) && !UNIT.test(next) && !FLAG.test(next) && tokens.slice(i + 1).some((x) => NUM.test(x))) continue;
    // a year with nothing after is probably a date, not a result
    if (/^(19|20)\d\d$/.test(t) && !tokens.slice(i + 1).some((x) => UNIT.test(x) || parseRangeToken(x))) return null;
    vi = i;
    break;
  }
  if (vi < 0) {
    // Qualitative result ("ANA  Positive 1:160 speckled")
    const m = s.match(QUAL);
    if (!m || m.index === undefined || m.index < 2) return null;
    const name = s.slice(0, m.index).replace(/[:\-–.\s]+$/, '').trim();
    if (!plausibleTestName(name)) return null;
    // keep only the result column (columns are separated by 2+ spaces), not the reference column
    return { test: name, textValue: s.slice(m.index).split(/\s{2,}/)[0].trim() };
  }
  const name = tokens.slice(0, vi).join(' ').replace(/[:\-–.]+$/, '').trim();
  if (!plausibleTestName(name)) return null;
  const vTok = tokens[vi];
  const glued = vTok.match(/^([<>]?\d+(?:[.,]\d+)?)([HL])\*?$/);
  const value = num(glued ? glued[1] : vTok);
  let flag: LabResult['flag'] = glued ? (glued[2].toUpperCase() as 'H' | 'L') : undefined;
  let unit: string | undefined;
  let lo: number | undefined;
  let hi: number | undefined;
  for (const t of tokens.slice(vi + 1)) {
    const r = parseRangeToken(t);
    if (r && lo === undefined && hi === undefined) {
      ({ lo, hi } = r);
      continue;
    }
    if (FLAG.test(t)) {
      const f = t.replace(/\*/g, '').toUpperCase();
      flag = f.startsWith('H') || f === '↑' || f === '>' || f.startsWith('CRIT') ? 'H' : f.startsWith('L') || f === '↓' || f === '<' ? 'L' : 'A';
      continue;
    }
    if (!unit && UNIT.test(t)) {
      unit = t;
      continue;
    }
    // Allowed extras: previous results / dates (Labcorp), lab site codes ("EN", "01"), "/" separators.
    if (NUM.test(t) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(t) || /^[A-Z0-9]{1,3}$/.test(t) || /^[/|]$/.test(t) || /^(final|corrected|prelim)$/i.test(t)) continue;
    return null; // other words ("tablet", "weeks", "by mouth") mean this isn't a lab line
  }
  if (!Number.isFinite(value)) return null;
  // a bare number with nothing to qualify it is rarely a lab result ("Return in about 6")
  if (unit === undefined && lo === undefined && hi === undefined && !flag && (tokens.length > vi + 1 || name.split(/\s+/).length > 3)) return null;
  if (unit === undefined && lo === undefined && hi === undefined && Math.abs(value) >= 100000) return null; // IDs, phone numbers
  if (/\b(mrn|dob|id|no|number|phone|tel|fax|ext|room|bed|zip|postcode)\.?$/i.test(name)) return null;
  if (isDrugWord(name.split(/\s+/)[0]) && unit && /^(mg|mcg|g|ml|units?|iu)$/i.test(unit)) return null; // a dose, not a result
  return { test: name, value, unit, refLow: lo, refHigh: hi, flag };
}

// ---------------------------------------------------------------- Medications

const DRUGS = `
acetaminophen paracetamol ibuprofen naproxen diclofenac celecoxib meloxicam etoricoxib indomethacin ketorolac aspirin
tramadol codeine oxycodone hydrocodone morphine tapentadol buprenorphine fentanyl hydromorphone methadone
gabapentin pregabalin duloxetine amitriptyline nortriptyline venlafaxine desvenlafaxine milnacipran carbamazepine oxcarbazepine lamotrigine topiramate
sertraline fluoxetine citalopram escitalopram paroxetine bupropion mirtazapine trazodone quetiapine aripiprazole lithium
diazepam clonazepam lorazepam alprazolam zopiclone zolpidem melatonin
baclofen tizanidine cyclobenzaprine methocarbamol orphenadrine
prednisone prednisolone methylprednisolone hydrocortisone dexamethasone triamcinolone budesonide
methotrexate sulfasalazine hydroxychloroquine leflunomide azathioprine mycophenolate cyclosporine tacrolimus
adalimumab etanercept infliximab certolizumab golimumab secukinumab ixekizumab ustekinumab tocilizumab rituximab abatacept tofacitinib upadacitinib baricitinib apremilast
omeprazole esomeprazole lansoprazole pantoprazole rabeprazole famotidine ranitidine ondansetron metoclopramide domperidone loperamide linaclotide lubiprostone mebeverine peppermint
cetirizine levocetirizine loratadine desloratadine fexofenadine diphenhydramine hydroxyzine ketotifen cromolyn montelukast
levothyroxine liothyronine metformin insulin semaglutide
propranolol metoprolol atenolol bisoprolol ivabradine midodrine fludrocortisone amlodipine lisinopril ramipril losartan candesartan atorvastatin simvastatin rosuvastatin
sumatriptan rizatriptan zolmitriptan topiramate erenumab fremanezumab galcanezumab
lidocaine capsaicin
amoxicillin doxycycline azithromycin ciprofloxacin cephalexin clindamycin nitrofurantoin
folic folate cholecalciferol ergocalciferol colecalciferol cyanocobalamin ferrous magnesium calcium vitamin
naltrexone ldn
estradiol progesterone norethisterone dienogest drospirenone levonorgestrel
allopurinol colchicine febuxostat alendronate risedronate denosumab
`.split(/\s+/).filter(Boolean);
const DRUG_SET = new Set(DRUGS);
const DRUG_SUFFIX = /(profen|coxib|olol|pril|sartan|statin|mab|nib|tinib|citinib|zole|prazole|tidine|cillin|mycin|cycline|floxacin|azepam|zolam|oxetine|aline|triptan|parin|dipine|gliptin|formin|thiazide|semide|lukast|tadine|cetirizine|olone|sone|caine|codone|morphone|barbital|amide|zepine|apine|idone|afil)$/i;
const NOT_DRUG = /^(the|a|an|her|his|their|patient|physio|physiotherapy|physical|therapy|exercise|exercises|walking|swimming|yoga|pilates|mri|ct|xray|x-ray|ultrasound|bloods?|labs?|tests?|follow|review|referral|treatment|medication|medications|meds|regular|daily|night|morning|pain|management|plan|on|off|it|this|that|trial|course|dose|taking|work|diet|program|programme|cbt|counselling|counseling|injection|injections|tablets?|capsules?|cream|gel|patch|spray|drops)$/i;

/** Is this word plausibly a medication name? */
export function isDrugWord(w: string): boolean {
  const t = w.toLowerCase().replace(/[^a-z-]/g, '');
  if (t.length < 4 || NOT_DRUG.test(t)) return false;
  return DRUG_SET.has(t) || DRUG_SUFFIX.test(t);
}

const DOSE = /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|ug|g|ml|units?|iu|%)(?![a-z])(?:\s*\/\s*\w+)?/i;
const FREQ = /\b(\d+ times (?:a |per )?(?:day|daily)|every \d+ (?:hours?|days?|weeks?)|at bedtime|(?:once|twice|three times|four times)(?: a| per)? (?:daily|day)|(?:once|twice) (?:at night|in the morning|weekly)|four times daily as needed|once|twice|three times|four times|daily|nightly|at night|bd|bid|tds|tid|qds|qid|od|qd|qhs|nocte|mane|prn|as needed|weekly|every \d+ (?:hours?|days?|weeks?)|q\d+h)\b/i;

export interface MedMention {
  name: string;
  dose?: string;
  text: string;
}

/** Find the medication named in a line like "Naproxen 500 mg tablet twice daily". */
export function medFromLine(rawLine: string): MedMention | undefined {
  // "naproxen (NAPROSYN) 500 MG tablet … 2 (two) times daily": drop bracketed brand names / words
  const line = rawLine.replace(/\([^)]*\)/g, ' ').replace(/\s{2,}/g, ' ');
  const words = line.replace(/[(),;]/g, ' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i < Math.min(words.length, 5); i++) {
    const w = words[i];
    const multi = /^(vitamin|folic|fish|ferrous|magnesium|calcium|low)$/i.test(w) && words[i + 1] ? `${w} ${words[i + 1]}` : w;
    if (isDrugWord(w) || (DRUG_SET.has(w.toLowerCase()) && multi !== w)) {
      const name = (multi !== w && /^(vitamin|folic|fish|ferrous|low)$/i.test(w) ? multi : w).replace(/[^A-Za-z0-9 -]/g, '');
      const rest = line.slice(line.indexOf(words[i]) + words[i].length);
      const d = rest.match(DOSE);
      const f = rest.match(FREQ);
      const dose = [d?.[0].replace(/\s+/g, ' '), f?.[0]].filter(Boolean).join(' ') || undefined;
      return { name: name[0].toUpperCase() + name.slice(1).toLowerCase(), dose, text: rawLine.trim() };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------- Body areas & systems

const REGION_RULES: [RegExp, string | ((side: string) => string[])][] = [
  [/\b(lumbar|lumbosacral|low(?:er)? back|l[1-5](?:\/|-)?(?:l[1-5]|s1)?)\b/i, 'lower back'],
  [/\b(sacroiliac|si joints?|sacrum|sacral|coccyx|sij)\b/i, 'sacrum/SI'],
  [/\b(cervical|neck|c[2-7](?:\/|-)c[3-7])\b/i, 'neck'],
  [/\b(thoracic|mid[- ]back|t\d{1,2}(?:\/|-)t\d{1,2})\b/i, 'mid back'],
  [/\b(upper back|trapezius|scapula)\b/i, 'upper back'],
  [/\b(brain|head|skull|headaches?|migraines?)\b/i, 'head'],
  [/\b(jaw|tmj|temporomandibular|face|facial)\b/i, 'face/jaw'],
  [/\b(chest|thorax|ribs?|sternum)\b/i, 'chest'],
  [/\b(abdomen|abdominal|liver|bowel|stomach)\b/i, 'abdomen'],
  [/\b(pelvis|pelvic)\b/i, 'pelvis'],
];
const SIDED = ['shoulder', 'hip', 'knee', 'ankle', 'foot', 'feet', 'wrist', 'hand', 'arm', 'leg', 'elbow', 'heel', 'thigh'];
const SIDED_TO_REGION: Record<string, string> = {
  shoulder: 'shoulder', hip: 'hip', knee: 'knee', ankle: 'foot/ankle', foot: 'foot/ankle', feet: 'foot/ankle', heel: 'foot/ankle',
  wrist: 'hand/wrist', hand: 'hand/wrist', arm: 'arm', elbow: 'arm', leg: 'leg', thigh: 'leg',
};

export function bodyRegions(text: string): string[] {
  const out = new Set<string>();
  for (const [re, r] of REGION_RULES) if (re.test(text) && typeof r === 'string') out.add(r);
  const re = new RegExp(`\\b(?:(left|right|bilateral|both|l|r|lt|rt)\\.?\\s+)?(${SIDED.join('|')})s?\\b`, 'gi');
  for (const m of text.matchAll(re)) {
    const side = (m[1] ?? '').toLowerCase();
    const part = SIDED_TO_REGION[m[2].toLowerCase()];
    const sides = side.startsWith('l') ? ['left'] : side.startsWith('r') ? ['right'] : side ? ['left', 'right'] : [];
    for (const s of sides) out.add(`${s} ${part}`);
  }
  return [...out];
}

const SYSTEM_RULES: [RegExp, string][] = [
  [/\b(arthritis|arthralgia|spondyl\w*|back pain|joint|tendin\w*|bursitis|fibromyalgia|osteo\w*|sacroiliitis|enthes\w*|myalgia|musculoskeletal|disc|hypermobil\w*|ehlers|sprain|fracture|scoliosis|gout|plantar)\b/i, 'musculoskeletal'],
  [/\b(neuropath\w*|migraine|headache|numbness|tingling|paresthes\w*|neuralgia|radiculopathy|sciatica|seizure|epilep\w*|multiple sclerosis|chiari|tremor)\b/i, 'neurological'],
  [/\b(ibs|irritable bowel|reflux|gerd|colitis|crohn\w*|celiac|coeliac|gastr\w*|bowel|diarrh\w*|constipation|dyspepsia|hepat\w*)\b/i, 'gastrointestinal'],
  [/\b(pots|postural (orthostatic )?tachycardia|dysautonom\w*|orthostatic|syncope)\b/i, 'autonomic'],
  [/\b(hypertension|tachycardia|palpitations|arrhythm\w*|cardiac|heart)\b/i, 'cardiovascular'],
  [/\b(allerg\w*|urticaria|mast cell|mcas|anaphyla\w*|angioedema|immunodeficien\w*|lupus|sle|sj[oö]gren\w*|autoimmune|vasculitis)\b/i, 'immune/allergic'],
  [/\b(thyroid|hypothyroid\w*|hyperthyroid\w*|diabet\w*|prediabet\w*|vitamin d deficiency|parathyroid|adrenal|pcos)\b/i, 'endocrine'],
  [/\b(endometriosis|adenomyosis|dysmenorrh\w*|menorrhagia|pelvic pain|ovarian|uterine|pregnan\w*|menopaus\w*)\b/i, 'reproductive/gynecologic'],
  [/\b(cystitis|bladder|urinary|kidney stones?|renal)\b/i, 'urinary'],
  [/\b(psoria\w*|eczema|dermatitis|rash|acne|rosacea|hidradenitis)\b/i, 'skin'],
  [/\b(asthma|copd|bronch\w*|pneumon\w*|dyspn\w*)\b/i, 'respiratory'],
  [/\b(anxiety|depress\w*|ptsd|panic|bipolar|adhd)\b/i, 'psychological'],
  [/\b(uveitis|iritis|conjunctivitis|dry eyes?|optic neuritis|glaucoma)\b/i, 'eyes'],
  [/\b(tinnitus|sinusitis|vertigo|hearing)\b/i, 'ENT'],
  [/\b(insomnia|sleep apn\w*|osa|narcolep\w*|restless legs?)\b/i, 'sleep'],
  [/\b(anemia|anaemia|iron deficiency|thrombocytop\w*|neutropen\w*|hemochromatosis|haemochromatosis)\b/i, 'blood'],
];

export function bodySystems(text: string): string[] {
  return SYSTEM_RULES.filter(([re]) => re.test(text)).map(([, s]) => s);
}

// ---------------------------------------------------------------- Specialties & people

const SPECIALTIES: [RegExp, string][] = [
  [/\brheumatolog\w*/i, 'Rheumatology'],
  [/\bneurosurg\w*/i, 'Neurosurgery'],
  [/\bneurolog\w*/i, 'Neurology'],
  [/\borthop(a)?edic\w*|\borthop(a)?edics\b|\bspine (clinic|surgery)\b/i, 'Orthopedics'],
  [/\bgastroenterolog\w*|\bgi clinic\b/i, 'Gastroenterology'],
  [/\bcardiolog\w*/i, 'Cardiology'],
  [/\bpain (clinic|management|medicine|service|team)\b/i, 'Pain medicine'],
  [/\bphysiotherap\w*|\bphysical therap\w*/i, 'Physiotherapy'],
  [/\ballerg(y|ist)\b|\bimmunolog\w*/i, 'Allergy/Immunology'],
  [/\bdermatolog\w*/i, 'Dermatology'],
  [/\bgyn(a)?ecolog\w*|\bobstetric\w*|\bob\/?gyn\b/i, 'Gynecology'],
  [/\bendocrinolog\w*|\bdiabetes clinic\b/i, 'Endocrinology'],
  [/\bophthalmolog\w*|\beye (clinic|hospital|casualty)\b/i, 'Ophthalmology'],
  [/\bpsychiatr\w*|\bpsycholog\w*|\bmental health\b/i, 'Psychiatry/Psychology'],
  [/\bemergency (department|room|medicine)\b|\b(a&e|a & e|ed visit|er visit)\b/i, 'Emergency'],
  [/\bsleep (medicine|clinic|centre|center|study)\b/i, 'Sleep medicine'],
  [/\burolog\w*/i, 'Urology'],
  [/\bh(a)?ematolog\w*/i, 'Hematology'],
  [/\b(ent|otolaryngolog\w*|ear,? nose and throat)\b/i, 'ENT'],
  [/\bpodiatr\w*/i, 'Podiatry'],
  [/\bsports medicine\b/i, 'Sports medicine'],
  [/\binternal medicine\b|\bgeneral medicine\b/i, 'Internal medicine'],
  [/\b(primary care|family (medicine|practice|physician)|general practi(ce|tioner)|gp surgery|gp practice|medical centre|health centre)\b/i, 'General practice'],
  [/\bradiolog\w*|\bimaging (department|centre|center)\b/i, 'Radiology'],
];

/** Specialty mentioned near the top of a document (letterhead / clinic name). */
export function detectSpecialty(text: string): string | undefined {
  const head = text.split('\n').slice(0, 20).join('\n');
  for (const src of [head, text.slice(0, 3000)]) {
    let best: { s: string; i: number } | undefined;
    for (const [re, s] of SPECIALTIES) {
      const m = src.match(re);
      if (m && m.index !== undefined && (!best || m.index < best.i)) best = { s, i: m.index };
    }
    if (best) return best.s;
  }
  return undefined;
}

const NAME = "[A-Z][a-zA-Z'’-]+(?:\\s+[A-Z]\\.)?(?:\\s+[A-Z][a-zA-Z'’-]+){0,2}";

/** The clinician who wrote the document (not the recipient of a letter). */
export function detectProvider(text: string): string | undefined {
  const nameAt = (rest: string) => {
    const m = rest.match(new RegExp(`^\\s*((?:Dr\\.?\\s+)?${NAME}(?:,?\\s*(?:MD|DO|NP|PA-?C|MBBS|FRCP|FRCR|MRCP|PhD|DPT|RN))?)`));
    return m && !/^(the|a|an|clinic|hospital|department|patient)$/i.test(m[1]) ? tidyName(m[1]) : undefined;
  };
  // 1. Labelled: "Provider: Dr Jane Smith", "Electronically signed by: …"
  for (const m of text.matchAll(/(?:^|\n|[ \t]{2,}|\|)\s*(?:(?:provider|attending(?: physician)?|consultant|clinician|treating physician|physician|author|radiologist)\s*[:\-]|(?:seen|signed|electronically signed|reported|dictated|reviewed) by\s*:?|you saw|you were seen by|visit with|instructions from)[ \t]*([^\n]*)/gi)) {
    const n = nameAt(m[1]);
    if (n) return n;
  }
  // 2. Letter sign-off: "Yours sincerely,\n\nDr Jane Smith"
  const sign = text.match(/(?:yours sincerely|sincerely|kind regards|best regards|with best wishes|regards|yours faithfully)[,.]?[ \t]*\n(?:[ \t]*\n)*([^\n]*)/i);
  if (sign) {
    const n = nameAt(sign[1]);
    if (n) return n;
  }
  // 3. Any "Dr X" that isn't the letter's recipient or a copy-to
  for (const m of text.matchAll(new RegExp(`\\bDr\\.?\\s+(${NAME})`, 'g'))) {
    const before = text.slice(Math.max(0, m.index! - 30), m.index!);
    if (/(dear|cc|copy to|to|referred by|referring(?: physician| doctor)?|gp|family doctor)\s*:?\s*$/i.test(before)) continue;
    return tidyName(`Dr ${m[1]}`);
  }
  const cred = text.match(new RegExp(`(${NAME}),?\\s+(MD|DO|NP|PA-C|MBBS|FRCP)\\b`));
  if (cred) return tidyName(`${cred[1]}, ${cred[2]}`);
  return undefined;
}

function tidyName(s: string) {
  return s.replace(/\s+/g, ' ').replace(/\s*,\s*$/, '').trim();
}

// ---------------------------------------------------------------- Block-style lab results

/** "12.4", "3.2 Low", "9.1 mg/L H" – a value line in a block layout. */
function valueLine(l: string): { value: number; unit?: string; flag?: LabResult['flag'] } | undefined {
  const [first, ...rest] = l.trim().split(/\s+/);
  if (!first || !NUM.test(first)) return undefined;
  let unit: string | undefined;
  let flag: LabResult['flag'];
  for (const t of rest) {
    if (/^(high|low|abnormal|critical|h|l|a|hh|ll)$/i.test(t)) flag = /^(h|crit)/i.test(t) ? 'H' : /^l/i.test(t) ? 'L' : 'A';
    else if (!unit && UNIT.test(t)) unit = t;
    else return undefined;
  }
  return { value: num(first), unit, flag };
}
const RANGE_LINE = /^(?:normal|standard|reference|ref\.?)\s+(?:range|interval|value)s?\s*:?\s*(.+)$/i;
const SKIP_LINE = /^(results?|value|your value|component|view trends|lab and collection|collected on|resulted|ordering provider|performing lab|specimen|comments?|narrative|status|final|show more|show less|flag|units?|reference)\b/i;

/**
 * Patient-portal layouts (e.g. MyChart) put each result on several lines:
 *   Hemoglobin / Normal range: 12.0 - 15.5 g/dL / 12.4
 */
export function parseLabBlocks(text: string): { lab: NonNullable<ReturnType<typeof parseLabLine>>; source: string }[] {
  const lines = text.split('\n').map((l) => l.trim());
  const out: { lab: NonNullable<ReturnType<typeof parseLabLine>>; source: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const name = lines[i];
    if (!name || /\d{2,}/.test(name.replace(/(b12|a1c|25|hla-?b27|t3|t4|c3|c4|ck-?mb|ca 125|ca-125|cd4|cd8)/gi, '')) || SKIP_LINE.test(name) || !plausibleTestName(name)) continue;
    if (parseLabLine(name)) continue; // a one-line result, handled elsewhere
    let range: { lo?: number; hi?: number; unit?: string } | undefined;
    let value: number | undefined;
    let textValue: string | undefined;
    let unit: string | undefined;
    let flag: LabResult['flag'];
    let j = i + 1;
    const end = Math.min(lines.length, i + 6);
    for (; j < end; j++) {
      const l = lines[j];
      if (!l) continue;
      const rm = l.match(RANGE_LINE);
      if (rm) {
        const t = rm[1].replace(/(\d)\s*(?:-|–|to)\s*(\d)/g, '$1-$2').replace(/([<>≤≥])\s+(\d)/g, '$1$2').split(/\s+/);
        const r = parseRangeToken(t[0]);
        if (r) range = { ...r, unit: t[1] && UNIT.test(t[1]) ? t[1] : undefined };
        else if (QUAL.test(rm[1])) range = {};
        continue;
      }
      if (SKIP_LINE.test(l)) continue;
      const vm = valueLine(l);
      if (vm && value === undefined && textValue === undefined) {
        ({ value, unit = unit, flag = flag } = vm);
        continue;
      }
      const qm = l.match(QUAL);
      if (qm && qm.index === 0 && value === undefined && textValue === undefined) {
        textValue = l.split(/\s{2,}/)[0];
        continue;
      }
      if ((value !== undefined || textValue !== undefined) && /^(high|low|abnormal|critical|h|l|a)$/i.test(l)) {
        flag = /^h|^crit/i.test(l) ? 'H' : /^l/i.test(l) ? 'L' : 'A';
        continue;
      }
      break;
    }
    if (value === undefined && textValue === undefined) continue;
    if (!range && value !== undefined && !unit) continue; // a bare number after a heading isn't enough
    out.push({
      lab: { test: name, value, textValue, unit: unit ?? range?.unit, refLow: range?.lo, refHigh: range?.hi, flag },
      source: lines.slice(i, j).filter(Boolean).join(' | '),
    });
    i = j - 1;
  }
  return out;
}

// ---------------------------------------------------------------- Boilerplate removal

const BOILERPLATE = [
  /^page \d+( of \d+)?$/i,
  /\bpage \d+ of \d+\b/i,
  /^printed (on|by|at)\b/i,
  /mychart/i,
  /licensed from epic/i,
  /^©|\bcopyright\b|all rights reserved/i,
  /^(mrn|nhs (no|number)|hospital number|acct|account|csn|fin)\s*[:#]/i,
  /\bmrn\s*[:#]\s*\d+/i,
  /^(dob|d\.o\.b\.?|date of birth)\s*[:\s]/i,
  /^(patient|patient name|name)\s*:\s*/i,
  /^this (document|report) (is|was) (confidential|intended)/i,
  /^confidential/i,
];

/** Removes page footers, print stamps and identifier lines from text kept with a record. */
export function stripBoilerplate(text: string): string {
  const lines = text.split('\n');
  const counts = new Map<string, number>();
  for (const l of lines) {
    const t = l.trim();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return lines
    .filter((l) => {
      const t = l.trim();
      if (!t) return true;
      if (BOILERPLATE.some((re) => re.test(t))) return false;
      if ((counts.get(t) ?? 0) >= 3 && t.length < 80) return false; // repeated running headers
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

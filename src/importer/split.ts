// Splits one long document that holds many sessions / visits / reports
// (therapy session notes, a portal "all notes" export, a records-request
// bundle) into one segment per session, by finding where each one starts.
import { findDates, type DateOrder, type FoundDate } from './text';

export interface Segment {
  text: string;
  date?: string;
  /** first line of the segment, for display */
  heading: string;
}

const MON = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE_START = new RegExp(`^(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\\s*)?(?:\\d{1,4}[/.-]\\d{1,2}[/.-]\\d{1,4}|\\d{1,2}(?:st|nd|rd|th)?\\s+${MON}\\s+\\d{2,4}|${MON}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4})`, 'i');

/** "Date of service: 3/5/2025", "Session date – 14 Jan 2025", "DOS 03/05/25" */
const DATE_LABEL =
  /^(?:date of (?:service|session|visit|treatment|appointment|encounter|consultation|exam(?:ination)?|study|report|procedure)|(?:service|session|visit|treatment|appointment|encounter|consultation|exam|study|clinic|letter|procedure) date|dos|date seen|seen on|date)\s*(?:[:\-–]|\bof\b)?\s*/i;

/** Titles that start a new note. */
const NOTE_TITLE =
  /^(?:progress notes?|office visit|clinic (?:note|visit|letter)|visit note|outpatient note|session(?: note)?(?:\s*(?:#|no\.?|number)?\s*\d+)?|treatment (?:note|session|record)|daily (?:note|treatment note|visit note)|soap note|therapy (?:session|note|visit)|physio(?:therapy)? (?:session|note|treatment|visit)|physical therapy (?:daily note|note|visit|treatment|session|re-?evaluation|evaluation)|occupational therapy (?:note|session|visit)|psychotherapy (?:session|note)|counsell?ing (?:session|note)|chiropractic (?:note|visit|treatment)|follow[- ]?up (?:visit|note|appointment)|telephone (?:encounter|call|note)|tele(?:health|medicine) (?:visit|note)|video visit|consult(?:ation)? note|nursing note|re-?evaluation|initial (?:evaluation|assessment|consultation)|discharge summary|operative report|procedure note|radiology report|imaging report|history and physical|h&p)\b/i;

/** Epic-style author line: "Jordan Lee, PT at 3/5/2025 10:15 AM" */
const AUTHOR_AT = /^[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,3},\s*(?:MD|DO|NP|PA-?C|PT|DPT|OT|OTR\/?L?|SLP|LCSW|LICSW|LMFT|LPC|LMHC|PhD|PsyD|RN|DC|LMT|MSW|APRN|FNP|CNP)\b.*\bat\s+/;

function firstDate(lines: string[], from: number, order: DateOrder, maxAhead = 3): FoundDate | undefined {
  for (let k = from; k < Math.min(lines.length, from + 1 + maxAhead); k++) {
    const d = findDates(lines[k], order).find((x) => x.role !== 'dob');
    if (d) return d;
  }
  return undefined;
}

interface Boundary {
  line: number;
  date?: string;
  strong: boolean; // a note title / labelled date (vs. a bare date line)
}

export function findBoundaries(text: string, order: DateOrder, opts: { labDoc?: boolean } = {}): Boundary[] {
  const lines = text.split('\n');
  const out: Boundary[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l || l.length > 120) continue;
    let b: Boundary | undefined;
    if (NOTE_TITLE.test(l) && l.length < 90) {
      const d = firstDate(lines, i, order);
      if (d) b = { line: i, date: d.iso, strong: true };
    } else if (AUTHOR_AT.test(l)) {
      const d = firstDate(lines, i, order, 0);
      if (d) b = { line: i, date: d.iso, strong: true };
    } else if (DATE_LABEL.test(l) && DATE_START.test(l.replace(DATE_LABEL, ''))) {
      const d = firstDate(lines, i, order, 0);
      if (d) b = { line: i, date: d.iso, strong: true };
    } else if (opts.labDoc && /^(?:collected|collection date|date collected|specimen collected)\b/i.test(l)) {
      const d = firstDate(lines, i, order, 0);
      if (d) b = { line: i, date: d.iso, strong: true };
    } else if (DATE_START.test(l) && l.length <= 60 && !/\d+\s*(mg|ml|mmol|g\/dl|%)/i.test(l)) {
      // a line that *starts* with a date, e.g. "14/01/2025 – Session 4"
      const d = firstDate(lines, i, order, 0);
      if (d) b = { line: i, date: d.iso, strong: false };
    }
    if (!b) continue;
    // A title line just above a labelled date belongs to the same boundary.
    const prev = out[out.length - 1];
    if (prev && i - prev.line <= 3 && (prev.date === b.date || !prev.date)) {
      prev.date ??= b.date;
      prev.strong ||= b.strong;
      continue;
    }
    out.push(b);
  }
  return out;
}

/**
 * Returns one segment per session, or a single segment when the document
 * doesn't look like several dated notes.
 */
export function splitSessions(text: string, order: DateOrder, opts: { labDoc?: boolean } = {}): Segment[] {
  const lines = text.split('\n');
  const all = findBoundaries(text, order, opts);
  // Bare date lines only count if there are several of them (a diary-style log).
  const strong = all.filter((b) => b.strong);
  const bounds = strong.length >= 2 ? strong : all.filter((b) => !b.strong).length >= 3 ? all : [];
  // Start a new session only when the date changes – a header repeated on every
  // page of the same note (same date) doesn't split it.
  const starts: Boundary[] = [];
  for (const b of bounds) {
    const cur = starts[starts.length - 1];
    if (!cur || (b.date && b.date !== cur.date)) starts.push(b);
  }
  if (starts.length < 2 || new Set(starts.map((s) => s.date)).size < 2) return [{ text, heading: lines.find((l) => l.trim())?.trim() ?? '' }];

  // A letterhead / running header just above a session's title belongs to that session.
  const counts = new Map<string, number>();
  for (const l of lines) if (l.trim()) counts.set(l.trim(), (counts.get(l.trim()) ?? 0) + 1);
  const isHeader = (l: string) => (counts.get(l.trim()) ?? 0) >= 2 || /\b(patient|dob|mrn|d\.o\.b)\b\s*[:#]/i.test(l);
  for (const st of starts) {
    let j = st.line;
    for (let back = 0; back < 3 && j > 0; back++) {
      let k = j - 1;
      while (k > 0 && !lines[k].trim()) k--;
      if (k < 0 || !lines[k].trim() || !isHeader(lines[k]) || NOTE_TITLE.test(lines[k].trim())) break;
      j = k;
    }
    st.line = j;
  }
  const segs: Segment[] = [];
  for (let k = 0; k < starts.length; k++) {
    const from = k === 0 ? 0 : starts[k].line; // any cover page goes with the first session
    const to = k + 1 < starts.length ? starts[k + 1].line : lines.length;
    const body = lines.slice(from, to).join('\n').trim();
    const heading = lines.slice(starts[k].line, to).map((l) => l.trim()).find((l) => l && !isHeader(l)) ?? lines[starts[k].line].trim();
    segs.push({ text: body, date: starts[k].date, heading });
  }
  // Merge fragments too short to be a real note into the previous one.
  const merged: Segment[] = [];
  for (const s of segs) {
    if (merged.length && s.text.replace(/\s/g, '').length < 60) merged[merged.length - 1].text += '\n' + s.text;
    else merged.push(s);
  }
  return merged.length >= 2 ? merged : [{ text, heading: lines.find((l) => l.trim())?.trim() ?? '' }];
}

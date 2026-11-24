// Minimal CSV parsing + lab/log importers. Accepts flexible column names.
import type { DailyLog, LabResult } from '../types';
import { uid } from './id';

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === '\t' || c === ';') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

/** Normalise many date styles to yyyy-mm-dd. Day-first is assumed for ambiguous dd/mm/yyyy. */
export function normDate(s: string, monthFirst = false): string | undefined {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${(m[3] ?? '1').padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    const [d, mo] = monthFirst ? [b, a] : [a, b];
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return undefined;
}

const col = (header: string[], ...names: RegExp[]) => header.findIndex((h) => names.some((n) => n.test(h)));

export function parseRange(s: string): { lo?: number; hi?: number } {
  const m = s.match(/(-?[\d.]+)\s*[-–to]+\s*(-?[\d.]+)/);
  if (m) return { lo: Number(m[1]), hi: Number(m[2]) };
  const lt = s.match(/^\s*[<≤]\s*([\d.]+)/);
  if (lt) return { hi: Number(lt[1]) };
  const gt = s.match(/^\s*[>≥]\s*([\d.]+)/);
  if (gt) return { lo: Number(gt[1]) };
  return {};
}

export function labsFromCSV(text: string, patientId: string, monthFirst = false): { labs: LabResult[]; skipped: number } {
  const rows = parseCSV(text);
  if (rows.length < 2) return { labs: [], skipped: 0 };
  const h = rows[0].map((x) => x.toLowerCase());
  const iDate = col(h, /date/, /collected/);
  const iTest = col(h, /test|analyte|name|component/);
  const iVal = col(h, /^value|result/);
  const iUnit = col(h, /unit/);
  const iLo = col(h, /low|min/);
  const iHi = col(h, /high|max/);
  const iRange = col(h, /range|reference|ref/);
  const iFlag = col(h, /flag/);
  if (iDate < 0 || iTest < 0 || iVal < 0) throw new Error('CSV needs at least date, test and value/result columns.');
  const labs: LabResult[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const date = normDate(r[iDate] ?? '', monthFirst);
    const test = r[iTest];
    const raw = r[iVal] ?? '';
    if (!date || !test || !raw) {
      skipped++;
      continue;
    }
    const num = Number(raw.replace(/[<>≤≥,]/g, ''));
    let lo = iLo >= 0 && r[iLo] ? Number(r[iLo]) : undefined;
    let hi = iHi >= 0 && r[iHi] ? Number(r[iHi]) : undefined;
    if (iRange >= 0 && r[iRange] && lo === undefined && hi === undefined) ({ lo, hi } = parseRange(r[iRange]));
    const flag = iFlag >= 0 ? (r[iFlag]?.toUpperCase().slice(0, 1) as LabResult['flag']) : undefined;
    labs.push({
      id: uid(),
      patientId,
      date,
      test,
      value: Number.isFinite(num) && /\d/.test(raw) && !/[a-z]{3,}/i.test(raw) ? num : undefined,
      textValue: Number.isFinite(num) && !/[a-z]{3,}/i.test(raw) ? undefined : raw,
      unit: iUnit >= 0 ? r[iUnit] || undefined : undefined,
      refLow: Number.isFinite(lo) ? lo : undefined,
      refHigh: Number.isFinite(hi) ? hi : undefined,
      flag: flag && ['H', 'L', 'A'].includes(flag) ? flag : undefined,
      createdAt: Date.now(),
    });
  }
  return { labs, skipped };
}

export function logsFromCSV(text: string, patientId: string, monthFirst = false): { logs: DailyLog[]; skipped: number } {
  const rows = parseCSV(text);
  const h = rows[0]?.map((x) => x.toLowerCase()) ?? [];
  const iDate = col(h, /date/);
  const iPain = col(h, /pain/);
  if (iDate < 0 || iPain < 0) throw new Error('CSV needs at least date and pain columns.');
  const num = (r: string[], i: number) => (i >= 0 && r[i] !== '' && Number.isFinite(Number(r[i])) ? Number(r[i]) : undefined);
  const list = (r: string[], i: number) => (i >= 0 && r[i] ? r[i].split(/[|;/]/).map((s) => s.trim()).filter(Boolean) : []);
  const iSleepH = col(h, /sleep ?h(ou)?rs|hours/);
  const iSleepQ = col(h, /sleep ?q/);
  const iFat = col(h, /fatigue|energy/);
  const iMood = col(h, /mood/);
  const iStress = col(h, /stress/);
  const iAct = col(h, /activity|steps/);
  const iSym = col(h, /symptom/);
  const iTrig = col(h, /trigger/);
  const iMens = col(h, /period|mens/);
  const iNotes = col(h, /note/);
  const logs: DailyLog[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const date = normDate(r[iDate] ?? '', monthFirst);
    const pain = num(r, iPain);
    if (!date || pain === undefined) {
      skipped++;
      continue;
    }
    logs.push({
      id: uid(),
      patientId,
      date,
      pain: Math.max(0, Math.min(10, pain)),
      regions: [],
      sleepHours: num(r, iSleepH),
      sleepQuality: num(r, iSleepQ),
      fatigue: num(r, iFat),
      mood: num(r, iMood),
      stress: num(r, iStress),
      activity: num(r, iAct),
      symptoms: list(r, iSym),
      triggers: list(r, iTrig),
      menstruating: iMens >= 0 ? /^(y|yes|1|true|x)$/i.test(r[iMens] ?? '') : undefined,
      notes: iNotes >= 0 ? r[iNotes] || undefined : undefined,
      createdAt: Date.now(),
    });
  }
  return { logs, skipped };
}

/**
 * Best-effort extraction of lab values from text pasted from a lab report/PDF,
 * e.g. "CRP   9.1  mg/L   0.0 - 5.0   H". Every row is shown for review before saving.
 */
export function labsFromText(text: string, date: string, patientId: string): LabResult[] {
  const out: LabResult[] = [];
  const re =
    /^\s*([A-Za-z][A-Za-z0-9 ()+\-/,.'%]*?[A-Za-z)])\s*[:\t ]\s*([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*(\*?[HL]\b|\*)?\s*([a-zA-Zµμ%/^0-9.×]*(?:\/[a-zA-Z0-9.]+)?)?\s*(?:\(?\s*(?:ref(?:erence)?(?: range)?:?\s*)?(-?\d+(?:[.,]\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:[.,]\d+)?)\s*\)?)?\s*(H|L|HIGH|LOW|\*)?\s*$/i;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) continue;
    const [, name, val, flag1, unit, lo, hi, flag2] = m;
    if (/^(page|date|time|patient|dob|collected|received|reported)\b/i.test(name)) continue;
    const f = (flag1 || flag2 || '').replace('*', '').toUpperCase().slice(0, 1);
    const n = (s?: string) => (s === undefined ? undefined : Number(s.replace(',', '.')));
    out.push({
      id: uid(),
      patientId,
      date,
      test: name.trim(),
      value: n(val.replace(/[<>≤≥\s]/g, '')),
      unit: unit && !/^\d/.test(unit) ? unit : undefined,
      refLow: n(lo),
      refHigh: n(hi),
      flag: f === 'H' || f === 'L' ? f : undefined,
      createdAt: Date.now(),
    });
  }
  return out;
}

import type { DatePrecision, ISODate } from '../types';

export const DAY_MS = 86_400_000;

export function toTime(d: ISODate): number {
  // Parse as UTC midnight so arithmetic is timezone-stable.
  const [y, m = 1, day = 1] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

export function fromTime(t: number): ISODate {
  return new Date(t).toISOString().slice(0, 10);
}

export function today(): ISODate {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromTime(toTime(d) + n * DAY_MS);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toTime(b) - toTime(a)) / DAY_MS);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(d: ISODate | undefined, precision: DatePrecision = 'day'): string {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  if (precision === 'year') return String(y);
  if (precision === 'month') return `${MONTHS[m - 1]} ${y}`;
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

export function monthName(m: number): string {
  return MONTHS[m];
}

export function yearOf(d: ISODate): number {
  return Number(d.slice(0, 4));
}

export function fmtSpan(days: number): string {
  const a = Math.abs(days);
  if (a < 60) return `${a} day${a === 1 ? '' : 's'}`;
  if (a < 730) return `${Math.round(a / 30.4)} months`;
  return `${(a / 365.25).toFixed(1)} years`;
}

export function ageAt(dob: ISODate | undefined, at: ISODate): number | undefined {
  if (!dob) return undefined;
  return Math.floor(daysBetween(dob, at) / 365.25);
}

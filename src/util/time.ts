// india has no DST, so IST is a fixed UTC+5:30. doing the math by hand means we don't
// depend on Intl timezone support in the JS engine.
const IST_OFFSET_MIN = 330;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export interface IstParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

export function istParts(date: Date): IstParts {
  const s = new Date(date.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth() + 1,
    day: s.getUTCDate(),
    hour: s.getUTCHours(),
    minute: s.getUTCMinutes(),
    second: s.getUTCSeconds(),
    weekday: WEEKDAYS[s.getUTCDay()],
  };
}

export function istDateString(date: Date): string {
  const p = istParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// ISO 8601 with an explicit +05:30, e.g. 2026-10-16T10:00:00+05:30
export function istIsoString(date: Date): string {
  const p = istParts(date);
  return `${istDateString(date)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}+05:30`;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// true for a real calendar date as YYYY-MM-DD (rejects 2026-02-30)
export function isValidDateString(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

// whole IST days from `from` to the date string `to` (negative means past)
export function daysBetween(from: Date, to: string): number {
  const [y, mo, d] = to.split('-').map(Number);
  const target = Date.UTC(y, mo - 1, d);
  const p = istParts(from);
  const today = Date.UTC(p.year, p.month - 1, p.day);
  return Math.round((target - today) / 86_400_000);
}

// start and end (exclusive) of an IST day
export function istDayRange(dateString: string): { start: Date; end: Date } {
  const [y, mo, d] = dateString.split('-').map(Number);
  const start = new Date(Date.UTC(y, mo - 1, d) - IST_OFFSET_MIN * 60_000);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export const hhmm = (date: Date): string => {
  const p = istParts(date);
  return `${pad(p.hour)}:${pad(p.minute)}`;
};

// "1 hour 30 minutes", "45 seconds": how a timer confirmation should sound
export function describeDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const sec = totalSeconds % 60;
  const part = (n: number, unit: string) => (n ? [`${n} ${unit}${n === 1 ? '' : 's'}`] : []);
  return [...part(h, 'hour'), ...part(m, 'minute'), ...part(sec, 'second')].join(' ') || '0 seconds';
}

import { addDays, daysBetween, describeDuration, hhmm, isValidDateString, istDateString } from '../util/time';
import { calculate, formatNumber } from './calc';
import type { Memory } from './memory';
import type { ToolResult } from './types';

export interface WikiHit {
  title: string;
  summary: string;
  url: string;
}

export interface CalendarEvent {
  title: string;
  start_hhmm: string;
}

export interface WeatherReport {
  city: string;
  date: string;
  max_c: number;
  min_c: number;
  rain_pct: number;
  summary: string;
}

// everything that touches the phone or the network, injected so the logic is testable
export interface ToolBackends {
  setAlarm(a: { hour: number; minute: number; label?: string }): Promise<void>;
  setReminder(r: { when: Date; text: string }): Promise<void>;
  getSchedule(date: string): Promise<CalendarEvent[]>;
  getWeather(city: string, date: string): Promise<WeatherReport>;
  setTimer(t: { seconds: number; label?: string }): Promise<void>;
  // null when nothing matches
  searchWikipedia(query: string, language: 'en' | 'hi'): Promise<WikiHit | null>;
}

export type ToolRunner = (name: string, args: unknown, mem: Memory) => Promise<ToolResult>;

// device tools get generous limits: the first call can include a cold start (content provider,
// channel creation) and, on a busy phone, a system dialog. the agent speaks a filler meanwhile.
const TOOL_TIMEOUT_MS: Record<string, number> = {
  set_alarm: 5000,
  set_reminder: 6000,
  get_schedule: 8000,
  get_weather: 6000,
  set_timer: 5000,
  search_wikipedia: 8000,
  calculate: 1000,
};
const MAX_EVENTS = 6;
const MAX_FORECAST_DAYS = 7;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const invalid = (field: string, why: string): ToolResult => ({ error: 'invalid_argument', field, why });

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// "7:30 AM", the way people say it, so confirmations keep the minutes
export function twelveHour(h: number, m: number): string {
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const HAS_TZ = /(Z|[+-]\d{2}:?\d{2})$/i;

// parses an ISO datetime. no offset means IST, because that's what the user means
export function parseReminderTime(iso: string): Date | null {
  const s = iso.trim();
  const withTz = HAS_TZ.test(s) ? s : `${s}+05:30`;
  const d = new Date(withTz);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function createToolRunner(backends: ToolBackends, now: () => Date = () => new Date()): ToolRunner {
  return async (name, rawArgs, mem) => {
    if (!isObj(rawArgs)) return invalid('arguments', 'must be a JSON object');
    const run = async (): Promise<ToolResult> => {
      switch (name) {
        case 'set_alarm': {
          const { hour, minute, label } = rawArgs;
          if (!Number.isInteger(hour) || (hour as number) < 0 || (hour as number) > 23)
            return invalid('hour', 'integer 0-23');
          if (!Number.isInteger(minute) || (minute as number) < 0 || (minute as number) > 59)
            return invalid('minute', 'integer 0-59');
          if (label !== undefined && typeof label !== 'string') return invalid('label', 'string');
          const h = hour as number;
          const m = minute as number;
          await backends.setAlarm({ hour: h, minute: m, label: label as string | undefined });
          const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          mem.recordAction(`alarm ${t}${label ? ` '${label}'` : ''}`);
          mem.state.last_intent = 'set_alarm';
          return { ok: true, alarm: t, alarm_12h: twelveHour(h, m) };
        }
        case 'set_reminder': {
          const { datetime_iso, text } = rawArgs;
          if (typeof datetime_iso !== 'string') return invalid('datetime_iso', 'ISO 8601 string');
          if (typeof text !== 'string' || !text.trim()) return invalid('text', 'non-empty string');
          const when = parseReminderTime(datetime_iso);
          if (!when) return invalid('datetime_iso', 'not a valid ISO 8601 datetime');
          if (when.getTime() <= now().getTime()) return invalid('datetime_iso', 'must be in the future');
          await backends.setReminder({ when, text: text.trim() });
          const day = istDateString(when);
          mem.recordAction(`reminder ${day} ${hhmm(when)} '${text.trim()}'`);
          mem.state.last_date = day;
          mem.state.last_intent = 'set_reminder';
          return { ok: true, reminder_at: `${day} ${hhmm(when)}` };
        }
        case 'get_schedule': {
          const { date } = rawArgs;
          if (typeof date !== 'string' || !isValidDateString(date)) return invalid('date', 'YYYY-MM-DD');
          const events = (await backends.getSchedule(date)).slice(0, MAX_EVENTS);
          mem.state.last_date = date;
          mem.state.last_intent = 'get_schedule';
          return { ok: true, date, count: events.length, events };
        }
        case 'get_weather': {
          const { city, date } = rawArgs;
          if (typeof city !== 'string' || !city.trim() || city.length > 80)
            return invalid('city', 'non-empty string');
          if (typeof date !== 'string' || !isValidDateString(date)) return invalid('date', 'YYYY-MM-DD');
          const ahead = daysBetween(now(), date);
          if (ahead < 0 || ahead > MAX_FORECAST_DAYS)
            return invalid(
              'date',
              `must be between ${istDateString(now())} and ${istDateString(addDays(now(), MAX_FORECAST_DAYS))}`,
            );
          const report = await backends.getWeather(city.trim(), date);
          mem.state.last_city = report.city;
          mem.state.last_date = date;
          mem.state.last_intent = 'get_weather';
          return { ok: true, ...report };
        }
        case 'set_timer': {
          const { seconds, label } = rawArgs;
          if (!Number.isInteger(seconds) || (seconds as number) < 1 || (seconds as number) > 86_400)
            return invalid('seconds', 'integer 1-86400');
          if (label !== undefined && typeof label !== 'string') return invalid('label', 'string');
          const secs = seconds as number;
          await backends.setTimer({ seconds: secs, label: label as string | undefined });
          const spoken = describeDuration(secs);
          mem.recordAction(`timer ${spoken}`);
          mem.state.last_intent = 'set_timer';
          return { ok: true, timer: spoken };
        }
        case 'search_wikipedia': {
          const { query, language } = rawArgs;
          if (typeof query !== 'string' || !query.trim() || query.length > 200)
            return invalid('query', 'non-empty string, at most 200 characters');
          if (language !== undefined && language !== 'en' && language !== 'hi')
            return invalid('language', "'en' or 'hi'");
          const hit = await backends.searchWikipedia(
            query.trim(),
            (language as 'en' | 'hi' | undefined) ?? 'en',
          );
          mem.state.last_intent = 'search';
          if (!hit) return { error: 'not_found' };
          return { ok: true, title: hit.title, summary: hit.summary, source: 'Wikipedia' };
        }
        case 'calculate': {
          const { expression } = rawArgs;
          if (typeof expression !== 'string' || !expression.trim())
            return invalid('expression', 'non-empty string');
          try {
            const result = formatNumber(calculate(expression));
            mem.state.last_intent = 'calculate';
            return { ok: true, result };
          } catch (e) {
            return invalid('expression', e instanceof Error ? e.message : 'could not evaluate');
          }
        }
        default:
          return { error: 'unknown_tool', name };
      }
    };
    try {
      return await withTimeout(run(), TOOL_TIMEOUT_MS[name] ?? 4000);
    } catch (e) {
      return { error: e instanceof Error ? e.message || 'tool_failed' : 'tool_failed' };
    }
  };
}

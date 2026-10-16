import { describe, expect, it, vi } from 'vitest';
import { Memory } from '../src/agent/memory';
import { createToolRunner, parseReminderTime, twelveHour, type ToolBackends } from '../src/agent/toolRunner';

const NOW = new Date('2026-10-16T04:30:00Z'); // 10:00 IST Friday

function setup(over: Partial<ToolBackends> = {}) {
  const backends: ToolBackends = {
    setAlarm: vi.fn(async () => {}),
    setReminder: vi.fn(async () => {}),
    getSchedule: vi.fn(async () => [{ title: 'Standup', start_hhmm: '10:30' }]),
    getWeather: vi.fn(async (city, date) => ({
      city,
      date,
      max_c: 31,
      min_c: 22,
      rain_pct: 20,
      summary: 'Partly cloudy',
    })),
    ...over,
  };
  const mem = new Memory(() => NOW);
  return { backends, mem, run: createToolRunner(backends, () => NOW) };
}

describe('tool runner validation', () => {
  it.each([
    ['set_alarm', { hour: 24, minute: 0 }, 'hour'],
    ['set_alarm', { hour: 7.5, minute: 0 }, 'hour'],
    ['set_alarm', { hour: 7, minute: 60 }, 'minute'],
    ['set_alarm', { hour: '7', minute: 0 }, 'hour'],
    ['set_reminder', { datetime_iso: 'tomorrow', text: 'x' }, 'datetime_iso'],
    ['set_reminder', { datetime_iso: '2026-10-15T10:00:00+05:30', text: 'x' }, 'datetime_iso'], // past
    ['set_reminder', { datetime_iso: '2026-10-17T10:00:00+05:30', text: '  ' }, 'text'],
    ['get_schedule', { date: '2026-02-30' }, 'date'],
    ['get_weather', { city: '', date: '2026-10-17' }, 'city'],
    ['get_weather', { city: 'Pune', date: '2026-10-30' }, 'date'], // beyond 7 days
    ['get_weather', { city: 'Pune', date: '2026-10-10' }, 'date'], // past
  ])('%s rejects %j', async (name, args, field) => {
    const { run, mem, backends } = setup();
    const r = await run(name, args, mem);
    expect(r).toMatchObject({ error: 'invalid_argument', field });
    for (const fn of Object.values(backends)) expect(fn).not.toHaveBeenCalled();
  });

  it('rejects non-object arguments and unknown tools', async () => {
    const { run, mem } = setup();
    expect(await run('set_alarm', null, mem)).toMatchObject({ error: 'invalid_argument' });
    expect(await run('set_alarm', [1], mem)).toMatchObject({ error: 'invalid_argument' });
    expect(await run('launch_missiles', {}, mem)).toEqual({ error: 'unknown_tool', name: 'launch_missiles' });
  });
});

describe('tool runner success paths update state', () => {
  it('set_alarm', async () => {
    const { run, mem, backends } = setup();
    const r = await run('set_alarm', { hour: 7, minute: 5, label: 'gym' }, mem);
    expect(r).toEqual({ ok: true, alarm: '07:05', alarm_12h: '7:05 AM' });
    expect(backends.setAlarm).toHaveBeenCalledWith({ hour: 7, minute: 5, label: 'gym' });
    expect(mem.state.actions).toEqual(["alarm 07:05 'gym'"]);
  });

  it('set_reminder reads a missing offset as IST', async () => {
    const { run, mem, backends } = setup();
    const r = await run('set_reminder', { datetime_iso: '2026-10-17T17:00:00', text: 'meeting' }, mem);
    expect(r).toEqual({ ok: true, reminder_at: '2026-10-17 17:00' });
    expect((backends.setReminder as any).mock.calls[0][0].when.toISOString()).toBe(
      '2026-10-17T11:30:00.000Z',
    );
    expect(mem.state.last_date).toBe('2026-10-17');
  });

  it('get_weather records city and date for "aur kal?" follow-ups', async () => {
    const { run, mem } = setup();
    const r = await run('get_weather', { city: ' Bangalore ', date: '2026-10-17' }, mem);
    expect(r).toMatchObject({ ok: true, city: 'Bangalore', max_c: 31 });
    expect(mem.state).toMatchObject({
      last_city: 'Bangalore',
      last_date: '2026-10-17',
      last_intent: 'get_weather',
    });
  });

  it('get_schedule caps the event list at 6', async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ title: `e${i}`, start_hhmm: '09:00' }));
    const { run, mem } = setup({ getSchedule: async () => many });
    const r = (await run('get_schedule', { date: '2026-10-16' }, mem)) as any;
    expect(r.count).toBe(6);
  });
});

describe('tool runner failure handling', () => {
  it('converts backend exceptions to JSON errors', async () => {
    const { run, mem } = setup({
      getSchedule: async () => {
        throw new Error('calendar_permission_denied');
      },
    });
    expect(await run('get_schedule', { date: '2026-10-16' }, mem)).toEqual({
      error: 'calendar_permission_denied',
    });
  });

  it('times out slow backends', async () => {
    vi.useFakeTimers();
    const { run, mem } = setup({ getWeather: () => new Promise(() => {}) });
    const p = run('get_weather', { city: 'Pune', date: '2026-10-17' }, mem);
    await vi.advanceTimersByTimeAsync(6001);
    expect(await p).toEqual({ error: 'timeout' });
    vi.useRealTimers();
  });
});

describe('twelveHour', () => {
  it('formats for speech', () => {
    expect(twelveHour(0, 0)).toBe('12:00 AM');
    expect(twelveHour(12, 30)).toBe('12:30 PM');
    expect(twelveHour(17, 5)).toBe('5:05 PM');
  });
});

describe('parseReminderTime', () => {
  it('handles Z, offsets and garbage', () => {
    expect(parseReminderTime('2026-10-17T10:00:00Z')?.toISOString()).toBe('2026-10-17T10:00:00.000Z');
    expect(parseReminderTime('2026-10-17T10:00:00+05:30')?.toISOString()).toBe('2026-10-17T04:30:00.000Z');
    expect(parseReminderTime('soon')).toBeNull();
  });
});

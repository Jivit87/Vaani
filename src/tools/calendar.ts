import * as Calendar from 'expo-calendar';
import type { CalendarEvent } from '../agent/toolRunner';
import { hhmm, istDayRange } from '../util/time';

/** Events starting on the given IST day, sorted by start time. */
export async function getSchedule(date: string): Promise<CalendarEvent[]> {
  const perm = await Calendar.requestCalendarPermissions();
  if (!perm.granted) throw new Error('calendar_permission_denied');

  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const { start, end } = istDayRange(date);
  const events = await Calendar.listEvents(calendars, start, end);

  return (
    events
      .map((e) => ({ e, startAt: new Date(e.startDate) }))
      // Android can return events that began earlier and span into the window; keep only ones starting today.
      .filter(({ startAt }) => startAt >= start && startAt < end)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .map(({ e, startAt }) => ({ title: e.title, start_hhmm: e.allDay ? 'all-day' : hhmm(startAt) }))
  );
}

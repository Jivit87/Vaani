import { fetch as expoFetch } from 'expo/fetch';
import type { ToolBackends } from '../agent/toolRunner';
import { setAlarm } from './alarm';
import { getSchedule } from './calendar';
import { setReminder } from './reminder';
import { fetchWeather } from './weather';

export function createDeviceBackends(): ToolBackends {
  return {
    setAlarm,
    setReminder,
    getSchedule,
    getWeather: (city, date) => fetchWeather(expoFetch as unknown as typeof fetch, city, date),
  };
}

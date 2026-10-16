import type { WeatherReport } from '../agent/toolRunner';

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

const REPORT_TTL_MS = 15 * 60_000;
const MAX_CACHE = 50;
const RETRY_DELAY_MS = 500;

interface Place {
  name?: string;
  latitude: number;
  longitude: number;
}

// City coordinates never change, so they are cached for the life of the app. A follow-up like
// "aur kal?" then costs one request instead of two.
const places = new Map<string, Place>();
const reports = new Map<string, { at: number; report: WeatherReport }>();

const keyOf = (city: string) => city.toLowerCase().trim();

function remember<T>(map: Map<string, T>, key: string, value: T) {
  if (map.size >= MAX_CACHE) map.delete(map.keys().next().value as string);
  map.set(key, value);
}

export function clearWeatherCaches() {
  places.clear();
  reports.clear();
}

// WMO weather interpretation codes → short spoken phrase.
function describeCode(code: number): string {
  if (code === 0) return 'clear sky';
  if (code <= 2) return 'partly cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'foggy';
  if (code >= 51 && code <= 57) return 'light drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain showers';
  if (code >= 95) return 'thunderstorms';
  return 'mixed conditions';
}

export class CityNotFoundError extends Error {
  constructor(city: string) {
    super(`city_not_found: ${city}`);
  }
}

/** One retry for rate limits and server errors; a flaky free API should not fail a demo turn. */
async function getJson(fetchFn: typeof fetch, url: string, signal?: AbortSignal): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn(url, { signal });
    if (res.ok) return res.json();
    const transient = res.status === 429 || res.status >= 500;
    if (!transient || attempt >= 1) throw new Error(`weather_http_${res.status}`);
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
}

async function locate(fetchFn: typeof fetch, city: string, signal?: AbortSignal): Promise<Place> {
  const hit = places.get(keyOf(city));
  if (hit) return hit;
  const geo = await getJson(fetchFn, `${GEO}?name=${encodeURIComponent(city)}&count=1&language=en`, signal);
  const place = geo.results?.[0];
  if (!place) throw new CityNotFoundError(city);
  remember(places, keyOf(city), place as Place);
  return place as Place;
}

/** Open-Meteo needs no API key. City → coordinates → one-day forecast, both steps cached. */
export async function fetchWeather(
  fetchFn: typeof fetch,
  city: string,
  date: string,
  signal?: AbortSignal,
): Promise<WeatherReport> {
  const reportKey = `${keyOf(city)}|${date}`;
  const cached = reports.get(reportKey);
  if (cached && Date.now() - cached.at < REPORT_TTL_MS) return cached.report;

  const place = await locate(fetchFn, city, signal);
  const q = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
    timezone: 'Asia/Kolkata',
    start_date: date,
    end_date: date,
  });
  const data = await getJson(fetchFn, `${FORECAST}?${q}`, signal);
  const d = data.daily;
  if (!d?.time?.length) throw new Error('weather_no_data');
  const report: WeatherReport = {
    city: place.name ?? city,
    date,
    max_c: Math.round(d.temperature_2m_max[0]),
    min_c: Math.round(d.temperature_2m_min[0]),
    rain_pct: Math.round(d.precipitation_probability_max?.[0] ?? 0),
    summary: describeCode(d.weather_code[0]),
  };
  remember(reports, reportKey, { at: Date.now(), report });
  return report;
}

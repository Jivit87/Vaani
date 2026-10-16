import type { WeatherReport } from '../agent/toolRunner';

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

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

async function getJson(fetchFn: typeof fetch, url: string, signal?: AbortSignal): Promise<any> {
  const res = await fetchFn(url, { signal });
  if (!res.ok) throw new Error(`weather_http_${res.status}`);
  return res.json();
}

/** Open-Meteo needs no API key. City → coordinates → one-day forecast. */
export async function fetchWeather(
  fetchFn: typeof fetch,
  city: string,
  date: string,
  signal?: AbortSignal,
): Promise<WeatherReport> {
  const geo = await getJson(fetchFn, `${GEO}?name=${encodeURIComponent(city)}&count=1&language=en`, signal);
  const place = geo.results?.[0];
  if (!place) throw new CityNotFoundError(city);

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
  return {
    city: place.name ?? city,
    date,
    max_c: Math.round(d.temperature_2m_max[0]),
    min_c: Math.round(d.temperature_2m_min[0]),
    rain_pct: Math.round(d.precipitation_probability_max?.[0] ?? 0),
    summary: describeCode(d.weather_code[0]),
  };
}

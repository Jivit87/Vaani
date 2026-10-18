import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CityNotFoundError, clearWeatherCaches, fetchWeather } from '../src/tools/weather';

const json = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

describe('fetchWeather', () => {
  beforeEach(() => clearWeatherCaches());

  it('geocodes then fetches a one-day forecast', async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      if (url.includes('geocoding'))
        return json({ results: [{ name: 'Gorakhpur', latitude: 26.76, longitude: 83.37 }] });
      return json({
        daily: {
          time: ['2026-10-17'],
          temperature_2m_max: [28.6],
          temperature_2m_min: [19.2],
          precipitation_probability_max: [62],
          weather_code: [61],
        },
      });
    }) as unknown as typeof fetch;

    const r = await fetchWeather(fake, 'Gorakhpur', '2026-10-17');
    expect(r).toEqual({
      city: 'Gorakhpur',
      date: '2026-10-17',
      max_c: 29,
      min_c: 19,
      rain_pct: 62,
      summary: 'rain',
    });
    expect(urls[0]).toContain('name=Gorakhpur');
    expect(urls[1]).toContain('start_date=2026-10-17');
    expect(urls[1]).toContain('timezone=Asia%2FKolkata');
  });

  it('encodes unusual city names safely', async () => {
    let geoUrl = '';
    const fake = (async (url: string) => {
      geoUrl = url;
      return json({ results: [] });
    }) as unknown as typeof fetch;
    await expect(fetchWeather(fake, 'a&b=c#d', '2026-10-17')).rejects.toBeInstanceOf(CityNotFoundError);
    expect(geoUrl).toContain('name=a%26b%3Dc%23d');
  });

  it('surfaces HTTP failures', async () => {
    const fake = (async () => json({}, false, 503)) as unknown as typeof fetch;
    await expect(fetchWeather(fake, 'Pune', '2026-10-17')).rejects.toThrow('weather_http_503');
  });

  it('errors when the forecast has no data', async () => {
    const fake = (async (url: string) =>
      url.includes('geocoding')
        ? json({ results: [{ latitude: 1, longitude: 2 }] })
        : json({ daily: { time: [] } })) as unknown as typeof fetch;
    await expect(fetchWeather(fake, 'Pune', '2026-10-17')).rejects.toThrow('weather_no_data');
  });
});

describe('fetchWeather caching and retry', () => {
  const forecast = (max: number) =>
    json({
      daily: {
        time: ['d'],
        temperature_2m_max: [max],
        temperature_2m_min: [20],
        precipitation_probability_max: [10],
        weather_code: [0],
      },
    });
  const counting = () => {
    const calls = { geo: 0, forecast: 0 };
    const fake = (async (url: string) => {
      if (url.includes('geocoding')) {
        calls.geo++;
        return json({ results: [{ name: 'Gorakhpur', latitude: 26.76, longitude: 83.37 }] });
      }
      calls.forecast++;
      return forecast(30 + calls.forecast);
    }) as unknown as typeof fetch;
    return { calls, fake };
  };

  beforeEach(() => clearWeatherCaches());

  it('geocodes a city once and reuses it for other dates ("aur parso?")', async () => {
    const { calls, fake } = counting();
    await fetchWeather(fake, 'Gorakhpur', '2026-10-17');
    await fetchWeather(fake, ' gorakhpur ', '2026-10-18');
    expect(calls).toEqual({ geo: 1, forecast: 2 });
  });

  it('serves an identical question from cache for 15 minutes, then refreshes', async () => {
    vi.useFakeTimers();
    const { calls, fake } = counting();
    const first = await fetchWeather(fake, 'Pune', '2026-10-17');
    expect(await fetchWeather(fake, 'Pune', '2026-10-17')).toEqual(first);
    expect(calls.forecast).toBe(1);
    await vi.advanceTimersByTimeAsync(16 * 60_000);
    await fetchWeather(fake, 'Pune', '2026-10-17');
    expect(calls.forecast).toBe(2);
    vi.useRealTimers();
  });

  it('retries once on 429 and on 5xx, but not on a 404', async () => {
    vi.useFakeTimers();
    let n = 0;
    const flaky = (async (url: string) => {
      if (url.includes('geocoding')) return json({ results: [{ latitude: 1, longitude: 2 }] });
      return ++n === 1 ? json({}, false, 429) : forecast(25);
    }) as unknown as typeof fetch;
    const p = fetchWeather(flaky, 'Goa', '2026-10-17');
    await vi.advanceTimersByTimeAsync(600);
    expect((await p).max_c).toBe(25);
    expect(n).toBe(2);

    let hits = 0;
    const gone = (async () => {
      hits++;
      return json({}, false, 404);
    }) as unknown as typeof fetch;
    await expect(fetchWeather(gone, 'Nowhere', '2026-10-17')).rejects.toThrow('weather_http_404');
    expect(hits).toBe(1);
    vi.useRealTimers();
  });

  it('gives up after one retry', async () => {
    vi.useFakeTimers();
    let hits = 0;
    const down = (async () => {
      hits++;
      return json({}, false, 503);
    }) as unknown as typeof fetch;
    const p = fetchWeather(down, 'Pune', '2026-10-17').catch((e) => e);
    await vi.advanceTimersByTimeAsync(600);
    expect((await p).message).toBe('weather_http_503');
    expect(hits).toBe(2);
    vi.useRealTimers();
  });
});

describe('built-in cities', () => {
  beforeEach(() => clearWeatherCaches());

  it('skips the geocoding call for a common city, whatever the spelling', async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      return json({
        daily: {
          time: ['d'],
          temperature_2m_max: [30],
          temperature_2m_min: [21],
          precipitation_probability_max: [10],
          weather_code: [0],
        },
      });
    }) as unknown as typeof fetch;
    for (const name of ['Bengaluru', ' bangalore ', 'Bombay']) await fetchWeather(fake, name, '2026-10-17');
    expect(urls.every((u) => u.includes('api.open-meteo.com/v1/forecast'))).toBe(true);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain('latitude=12.9716');
    expect(urls[2]).toContain('latitude=19.076');
  });

  it('reports the canonical city name', async () => {
    const fake = (async () =>
      json({
        daily: { time: ['d'], temperature_2m_max: [30], temperature_2m_min: [21], weather_code: [0] },
      })) as unknown as typeof fetch;
    expect((await fetchWeather(fake, 'bengaluru', '2026-10-17')).city).toBe('Bangalore');
  });

  it('still geocodes a city that is not in the list', async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      return url.includes('geocoding')
        ? json({ results: [{ name: 'Tiny Town', latitude: 1, longitude: 2 }] })
        : json({
            daily: { time: ['d'], temperature_2m_max: [30], temperature_2m_min: [21], weather_code: [0] },
          });
    }) as unknown as typeof fetch;
    await fetchWeather(fake, 'Tiny Town', '2026-10-17');
    expect(urls.some((u) => u.includes('geocoding'))).toBe(true);
  });
});

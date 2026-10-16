import { describe, expect, it } from 'vitest';
import { CityNotFoundError, fetchWeather } from '../src/tools/weather';

const json = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

describe('fetchWeather', () => {
  it('geocodes then fetches a one-day forecast', async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      if (url.includes('geocoding'))
        return json({ results: [{ name: 'Bengaluru', latitude: 12.97, longitude: 77.59 }] });
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

    const r = await fetchWeather(fake, 'Bangalore', '2026-10-17');
    expect(r).toEqual({
      city: 'Bengaluru',
      date: '2026-10-17',
      max_c: 29,
      min_c: 19,
      rain_pct: 62,
      summary: 'rain',
    });
    expect(urls[0]).toContain('name=Bangalore');
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

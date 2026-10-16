import { describe, expect, it } from 'vitest';
import { searchWikipedia, trimSummary } from '../src/tools/wikipedia';

const json = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

describe('trimSummary', () => {
  it('drops parenthetical asides and collapses whitespace', () => {
    expect(trimSummary('Narendra Modi (born 17 September 1950)   is an Indian politician.')).toBe(
      'Narendra Modi is an Indian politician.',
    );
  });
  it('cuts at a sentence boundary, never mid-sentence', () => {
    const long = 'First sentence is here. '.repeat(40);
    const out = trimSummary(long, 200);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith('here.')).toBe(true);
  });
  it('handles the Devanagari danda', () => {
    const hi = 'यह पहला वाक्य है। '.repeat(60);
    expect(trimSummary(hi, 120).endsWith('।')).toBe(true);
  });
});

describe('searchWikipedia', () => {
  it('makes one request and returns title, summary and url', async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      return json({
        query: {
          pages: {
            42: {
              title: 'Chandrayaan-3',
              extract: 'Chandrayaan-3 is a lunar mission.',
              fullurl: 'https://en.wikipedia.org/wiki/Chandrayaan-3',
            },
          },
        },
      });
    }) as unknown as typeof fetch;
    const r = await searchWikipedia(fake, 'chandrayaan 3 mission');
    expect(r).toEqual({
      title: 'Chandrayaan-3',
      summary: 'Chandrayaan-3 is a lunar mission.',
      url: 'https://en.wikipedia.org/wiki/Chandrayaan-3',
    });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('https://en.wikipedia.org/w/api.php');
    expect(urls[0]).toContain('gsrsearch=chandrayaan+3+mission');
  });
  it('uses the Hindi wiki on request and returns null when nothing matches', async () => {
    let url = '';
    const none = (async (u: string) => {
      url = u;
      return json({ batchcomplete: '' });
    }) as unknown as typeof fetch;
    expect(await searchWikipedia(none, 'xyzzy', 'hi')).toBeNull();
    expect(url.startsWith('https://hi.wikipedia.org/')).toBe(true);
  });
  it('surfaces HTTP errors', async () => {
    const bad = (async () => json({}, false, 404)) as unknown as typeof fetch;
    await expect(searchWikipedia(bad, 'x')).rejects.toThrow('wikipedia_http_404');
  });
});

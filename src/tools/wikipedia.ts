export interface WikiResult {
  title: string;
  summary: string;
  url: string;
}

const MAX_SUMMARY_CHARS = 600;
const RETRY_DELAY_MS = 500;

/** Keeps whole sentences up to a budget, so the LLM and the speaker never get a half sentence. */
export function trimSummary(text: string, max = MAX_SUMMARY_CHARS): string {
  const clean = text
    .replace(/\s+/g, ' ')
    .replace(/\s*\([^)]*\)/g, '') // pronunciation and date asides read badly aloud
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('। '));
  return end > 80 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

async function getJson(fetchFn: typeof fetch, url: string, signal?: AbortSignal): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn(url, { signal, headers: { 'Api-User-Agent': 'Vaani/1.0 (voice assistant)' } });
    if (res.ok) return res.json();
    const transient = res.status === 429 || res.status >= 500;
    if (!transient || attempt >= 1) throw new Error(`wikipedia_http_${res.status}`);
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
}

/** One request: full-text search for the best page and return its introduction. Null when nothing matches. */
export async function searchWikipedia(
  fetchFn: typeof fetch,
  query: string,
  lang: 'en' | 'hi' = 'en',
  signal?: AbortSignal,
): Promise<WikiResult | null> {
  const q = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '1',
    prop: 'extracts|info',
    exintro: '1',
    explaintext: '1',
    exsentences: '4',
    redirects: '1',
    inprop: 'url',
  });
  const data = await getJson(fetchFn, `https://${lang}.wikipedia.org/w/api.php?${q}`, signal);
  const page = data?.query?.pages ? (Object.values(data.query.pages)[0] as any) : null;
  if (!page?.extract) return null;
  return { title: page.title, summary: trimSummary(page.extract), url: page.fullurl ?? '' };
}

import type { ModelCfg } from '../agent/types';
import type { LlmClient } from '../llm/client';

// the only voice is a hindi voice, and it can't read latin letters. so before a sentence is spoken, a small fast
// model rewrites it in devanagari as it should sound ("Tomorrow in Bangalore" -> "टुमॉरो इन बैंगलोर"). measured on
// the phone's voice with whisper as the listener, this was far easier to understand than rule-based spelling.
const SYSTEM = `You prepare text for a Hindi text-to-speech voice that can only read Devanagari.
Rewrite the sentence in Devanagari exactly as it should sound when spoken aloud.
- English words: spell them the way they sound in English (टुमॉरो, बैंगलोर, क्लाउडी).
- Hindi words, even when typed in Roman letters (kal, mausam, baje): write proper Devanagari Hindi.
- Numbers, times and units: write them as spoken words in Devanagari.
- Keep the punctuation and the meaning. Do not translate, add or remove anything.
Reply with only the rewritten sentence.`;

const EXAMPLES: [string, string][] = [
  ['Tomorrow in Bangalore it will be 30 degrees.', 'टुमॉरो इन बैंगलोर इट विल बी थर्टी डिग्रीज़।'],
  ['Aapka alarm kal subah 7 baje set ho gaya hai.', 'आपका अलार्म कल सुबह सात बजे सेट हो गया है।'],
  ['आज का मौसम overcast है, 34 डिग्री।', 'आज का मौसम ओवरकास्ट है, चौंतीस डिग्री।'],
];

const LATIN = /[A-Za-z]/;
const DEVANAGARI = /[ऀ-ॿ]/;
const TIMEOUT_MS = 3000;
const BACKOFF_MS = 45_000;
const MAX_CACHE = 200;

export type Phoneticizer = (sentence: string) => Promise<string>;

interface Options {
  llm: LlmClient;
  // use a small fast model: this runs for every sentence
  model: ModelCfg;
  now?: () => number;
}

/**
 * Returns a function that rewrites a sentence for the voice. It never fails: on a timeout, an error or an odd
 * answer it gives the sentence back unchanged and the rule-based conversion in normalize.ts takes over.
 * After a failure it stays quiet for a while, so a dead provider doesn't add a timeout to every sentence.
 */
export function createPhoneticizer({ llm, model, now = Date.now }: Options): Phoneticizer {
  const cache = new Map<string, string>();
  let offUntil = 0;

  return async (sentence) => {
    const text = sentence.trim();
    if (!LATIN.test(text)) return sentence; // already devanagari, nothing to do
    const hit = cache.get(text);
    if (hit) return hit;
    if (now() < offUntil) return sentence;

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      let out = '';
      await llm({
        model: { ...model, maxTokens: Math.min(model.maxTokens, 300) },
        tools: [],
        signal: ctl.signal,
        onText: (t) => (out += t),
        messages: [
          { role: 'system', content: SYSTEM },
          ...EXAMPLES.flatMap(([a, b]) => [
            { role: 'user' as const, content: a },
            { role: 'assistant' as const, content: b },
          ]),
          { role: 'user', content: text },
        ],
      });
      const result = out.trim().replace(/^["“]|["”]$/g, '');
      if (!result || !DEVANAGARI.test(result)) return sentence;
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
      cache.set(text, result);
      return result;
    } catch {
      offUntil = now() + BACKOFF_MS;
      return sentence;
    } finally {
      clearTimeout(timer);
    }
  };
}

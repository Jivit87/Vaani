import { ROMAN_TO_DEVANAGARI } from '../tts/hinglishDict';
import type { Lang } from './types';

const DEVANAGARI = /[ऀ-ॿ]/;

// roman hindi words too short to trust on their own ("ka", "ki", "se", "ho")
const MIN_SOLO_LENGTH = 3;

/**
 * Which language the user just used. Devanagari is hindi for sure. For roman letters we look for
 * hindi words from the dictionary, so "kal subah alarm laga do" counts as hinglish but plain english doesn't.
 * `previous` is the language of the last turn.
 */
export function detectLang(text: string, previous?: Lang): Lang {
  if (DEVANAGARI.test(text)) return 'hi';
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const hits = words.filter((w) => ROMAN_TO_DEVANAGARI.has(w));
  if (hits.some((w) => w.length >= MIN_SOLO_LENGTH) || hits.length >= 2) return 'hi';
  // a one or two word answer ("Pune", "yes") carries no language of its own, so it stays in the language
  // of the conversation instead of flipping to english
  if (previous && words.length <= 2) return previous;
  return 'en';
}

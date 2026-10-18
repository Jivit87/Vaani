import { ROMAN_TO_DEVANAGARI } from '../tts/hinglishDict';
import type { Lang } from './types';

const DEVANAGARI = /[ऀ-ॿ]/;

// roman hindi is spelled in many ways ("kahani", "kahaani", "kuch", "kuchh"), so words are compared after
// squeezing the usual variations: doubled vowels and letters, and a trailing h
const squeeze = (w: string) =>
  w
    .replace(/aa/g, 'a')
    .replace(/ee|ii/g, 'i')
    .replace(/oo|uu/g, 'u')
    .replace(/(.)\1+/g, '$1')
    .replace(/h$/, '');

const EXACT_WORDS: ReadonlySet<string> = new Set(ROMAN_TO_DEVANAGARI.keys());
const SQUEEZED_WORDS: ReadonlySet<string> = new Set([...ROMAN_TO_DEVANAGARI.keys()].map(squeeze));

// short words must match exactly ("to" is not "toh", "at" is not "aath"); the loose match is only for longer words
const MIN_LOOSE_LENGTH = 4;
const isHindiWord = (w: string) =>
  EXACT_WORDS.has(w) || (w.length >= MIN_LOOSE_LENGTH && SQUEEZED_WORDS.has(squeeze(w)));

// roman hindi words too short to trust on their own ("ka", "ki", "se", "ho")
const MIN_SOLO_LENGTH = 3;
// an english sentence this long with no hindi in it is a real switch to english
const CLEAR_ENGLISH_WORDS = 5;

function hindiScore(text: string): { devanagari: boolean; hits: string[]; words: string[] } {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return { devanagari: DEVANAGARI.test(text), hits: words.filter(isHindiWord), words };
}

/** True when the message is clearly Hindi/Hinglish: Devanagari, or hindi words from the dictionary. */
export function looksHindi(text: string): boolean {
  const { devanagari, hits } = hindiScore(text);
  return devanagari || hits.some((w) => w.length >= MIN_SOLO_LENGTH) || hits.length >= 2;
}

/**
 * The language of the reply. `current` is what the toggle is set to, and the toggle is the user's choice:
 * - clear Hindi moves an english conversation to Hindi (it's what they meant),
 * - in a Hindi conversation it only goes back to English for a long sentence with no Hindi in it,
 *   because speech recognition can garble a short Hindi utterance into english-looking words,
 * - anything short and neutral ("Pune", "yes") stays where it is.
 */
export function chooseLang(text: string, current: Lang): Lang {
  if (looksHindi(text)) return 'hi';
  if (current === 'en') return 'en';
  const { words } = hindiScore(text);
  return words.length >= CLEAR_ENGLISH_WORDS ? 'en' : 'hi';
}

/** Language of a message with no conversation yet (the eval uses this). */
export function detectLang(text: string, previous?: Lang): Lang {
  if (previous) return chooseLang(text, previous);
  return looksHindi(text) ? 'hi' : 'en';
}

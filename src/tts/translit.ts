// Phonetic Roman → Devanagari for words the dictionaries do not know. Used only with the Hindi-only Piper
// voice, which cannot read Latin letters: a rough Devanagari spelling is far better than letter names.
// Input is Hinglish-style romanisation ("chhota", "rehta", "tumhe"); English words come out as an
// approximation of how they sound ("robot" -> रोबोत), which is understandable.

const CONSONANTS: [string, string][] = [
  ['chh', 'छ'],
  ['ch', 'च'],
  ['kh', 'ख'],
  ['gh', 'घ'],
  ['th', 'थ'],
  ['dh', 'ध'],
  ['ph', 'फ'],
  ['bh', 'भ'],
  ['jh', 'झ'],
  ['sh', 'श'],
  ['k', 'क'],
  ['g', 'ग'],
  ['j', 'ज'],
  ['t', 'त'],
  ['d', 'द'],
  ['n', 'न'],
  ['p', 'प'],
  ['b', 'ब'],
  ['m', 'म'],
  ['y', 'य'],
  ['r', 'र'],
  ['l', 'ल'],
  ['v', 'व'],
  ['w', 'व'],
  ['s', 'स'],
  ['h', 'ह'],
  ['f', 'फ'],
  ['z', 'ज'],
  ['q', 'क'],
  ['x', 'क्स'],
  ['c', 'क'],
];

// [roman, independent letter, matra]; longest first.
const VOWELS: [string, string, string][] = [
  ['aa', 'आ', 'ा'],
  ['ai', 'ऐ', 'ै'],
  ['au', 'औ', 'ौ'],
  ['ee', 'ई', 'ी'],
  ['ii', 'ई', 'ी'],
  ['oo', 'ऊ', 'ू'],
  ['uu', 'ऊ', 'ू'],
  ['ou', 'औ', 'ौ'],
  ['a', 'अ', ''],
  ['i', 'इ', 'ि'],
  ['u', 'उ', 'ु'],
  ['e', 'ए', 'े'],
  ['o', 'ओ', 'ो'],
];
const LONG = new Set(['aa', 'ai', 'au', 'ee', 'ii', 'oo', 'uu', 'ou']);
const VIRAMA = '्';

const startsWithAny = <T extends [string, ...string[]]>(s: string, i: number, table: T[]): T | undefined =>
  table.find((row) => s.startsWith(row[0], i));

/** Converts one lowercase ASCII word. Anything unexpected is returned unchanged. */
export function transliterateWord(word: string): string {
  if (!/^[a-z]+$/.test(word)) return word;
  let out = '';
  let i = 0;
  let afterConsonant = false; // the last thing written was a consonant still waiting for its vowel
  while (i < word.length) {
    const v = startsWithAny(word, i, VOWELS);
    if (v) {
      const [roman, letter, matra] = v;
      const atEnd = i + roman.length === word.length;
      if (afterConsonant) {
        // A final single "a" after a consonant is the long vowel in Hinglish spelling: "tha", "hota".
        out += roman === 'a' && atEnd ? 'ा' : matra;
      } else {
        out += roman === 'a' && atEnd && out === '' ? 'अ' : letter;
      }
      afterConsonant = false;
      i += roman.length;
      // Final "n" after a long vowel is nasalisation: "hoon" -> हूं, "nahin" stays न (see below).
      if (LONG.has(roman) && word.slice(i) === 'n') {
        out += 'ं';
        i += 1;
      }
      continue;
    }
    const c = startsWithAny(word, i, CONSONANTS);
    if (!c) return word;
    if (afterConsonant) out += VIRAMA; // consonant cluster: प्र, म्ह
    out += c[1];
    afterConsonant = true;
    i += c[0].length;
  }
  return out;
}

/** Converts every Latin word in a sentence. Capitalised acronyms (SMS, OTP) are left to the loanword list. */
export function transliterateText(text: string): string {
  return text.replace(/\b[A-Za-z]+\b/g, (w) =>
    /^[A-Z]{2,}$/.test(w) ? w : transliterateWord(w.toLowerCase()),
  );
}

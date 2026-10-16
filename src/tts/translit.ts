// rough roman -> devanagari for words the dictionaries don't know. only used with the
// hindi-only piper voice, which can't read latin letters, and a rough devanagari spelling beats
// letter names. it expects hinglish style spelling ("chhota", "rehta"). english words come out
// as a sound-alike ("robot" -> रोबोत), good enough to understand.

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

// [roman, letter, matra], longest first
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

// converts one lowercase word, returns it unchanged if there's anything odd in it
export function transliterateWord(word: string): string {
  if (!/^[a-z]+$/.test(word)) return word;
  let out = '';
  let i = 0;
  let afterConsonant = false; // last thing written was a consonant waiting for its vowel
  while (i < word.length) {
    const v = startsWithAny(word, i, VOWELS);
    if (v) {
      const [roman, letter, matra] = v;
      const atEnd = i + roman.length === word.length;
      if (afterConsonant) {
        // a lone "a" at the end of a word is a long vowel in hinglish spelling ("tha", "hota")
        out += roman === 'a' && atEnd ? 'ा' : matra;
      } else {
        out += roman === 'a' && atEnd && out === '' ? 'अ' : letter;
      }
      afterConsonant = false;
      i += roman.length;
      // a final "n" after a long vowel is a nasal: "hoon" -> हूं
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

// converts every latin word in a sentence. all-caps acronyms (SMS, OTP) are left alone
export function transliterateText(text: string): string {
  return text.replace(/\b[A-Za-z]+\b/g, (w) =>
    /^[A-Z]{2,}$/.test(w) ? w : transliterateWord(w.toLowerCase()),
  );
}

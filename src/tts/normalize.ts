import { romanizedHindiToDevanagari } from './hinglishDict';
import { loanwordsToDevanagari } from './loanwords';
import { transliterateText } from './translit';
import { numberToEnglish, numberToHindi } from './numbers';

const DEVANAGARI = /[ऀ-ॿ]/;

// emoji and friends
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;

// "7:30" the way people say it
function englishClock(h: number, m: number): string {
  const hour = numberToEnglish(h);
  if (m === 0) return `${hour} o'clock`;
  if (m < 10) return `${hour} oh ${numberToEnglish(m)}`;
  return `${hour} ${numberToEnglish(m)}`;
}

function hindiClock(h: number, m: number): string {
  const word = (n: number) => numberToHindi(n);
  if (m === 0) return `${word(h)} बजे`;
  if (m === 15) return `सवा ${word(h)} बजे`;
  if (m === 30) return h === 1 ? 'डेढ़ बजे' : h === 2 ? 'ढाई बजे' : `साढ़े ${word(h)} बजे`;
  if (m === 45) return `पौने ${word((h % 12) + 1)} बजे`;
  return `${word(h)} बजकर ${word(m)} मिनट`;
}

// last line of defence before TTS. the prompt already asks for speakable text,
// this catches digits, times and symbols that slip through
export interface NormalizeOptions {
  // Hinglish session: convert roman hindi words even if there's no devanagari yet
  hinglish?: boolean;
  // hindi-only voice (piper hi_IN): respell english loanwords in devanagari too
  devanagariLoanwords?: boolean;
}

export function normalizeForTts(raw: string, opts: NormalizeOptions = {}): string {
  // do this first so numbers and times get spoken in hindi for a hinglish sentence
  let input = opts.hinglish || DEVANAGARI.test(raw) ? romanizedHindiToDevanagari(raw) : raw;
  if (opts.devanagariLoanwords) input = transliterateText(loanwordsToDevanagari(input));
  const hindi = DEVANAGARI.test(input);
  const num = hindi ? numberToHindi : numberToEnglish;
  let s = input;

  s = s.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1');
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1'); // markdown links and images, keep the label
  s = s.replace(/^\s{0,3}(#{1,6}|[-*•]|\d+\.)\s+/gm, ''); // headings, bullets, list numbers
  s = s.replace(/[*_~]{1,3}([^*_~\n]+)[*_~]{1,3}/g, '$1'); // bold, italic, strikethrough
  s = s.replace(EMOJI, ' ');

  // 7:30, 17:05 (AM/PM stays as letters). a trailing "बजे" gets eaten because the
  // hindi clock phrase already ends with it
  s = s.replace(/\b(\d{1,2}):(\d{2})\b(?:\s*बजे)?/g, (_, h: string, m: string) => {
    const hh = Number(h);
    const mm = Number(m);
    if (hh > 24 || mm > 59) return `${h} ${m}`;
    const h12 = hh % 12 || 12; // spoken clocks are 12 hour
    return hindi ? hindiClock(h12, mm) : englishClock(h12, mm);
  });

  s = s.replace(
    /(\d+(?:\.\d+)?)\s*°\s*C\b/g,
    (_, n: string) => `${spokenDecimal(n, num)} ${hindi ? 'डिग्री सेल्सियस' : 'degrees Celsius'}`,
  );
  s = s.replace(
    /(\d+(?:\.\d+)?)\s*%/g,
    (_, n: string) => `${spokenDecimal(n, num)} ${hindi ? 'प्रतिशत' : 'percent'}`,
  );
  s = s.replace(/(\d)(AM|PM|am|pm)\b/g, '$1 $2'); // 5PM becomes 5 PM
  s = s.replace(/(\d+)\.(\d+)/g, (_, a: string, b: string) => spokenDecimal(`${a}.${b}`, num));
  s = s.replace(/\d+/g, (d) => num(Number(d)));

  s = s.replace(/&/g, hindi ? ' और ' : ' and ');
  s = s.replace(/[#*_~^|\\<>{}[\]=+@]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function spokenDecimal(n: string, num: (x: number) => string): string {
  const [whole, frac] = n.split('.');
  if (frac === undefined) return num(Number(whole));
  const digits = frac
    .split('')
    .map((d) => num(Number(d)))
    .join(' ');
  return `${num(Number(whole))} ${DEVANAGARI.test(num(1)) ? 'दशमलव' : 'point'} ${digits}`;
}

import { describe, expect, it } from 'vitest';
import { transliterateText, transliterateWord } from '../src/tts/translit';

describe('transliterateWord', () => {
  it.each([
    ['kaam', 'काम'],
    ['hai', 'है'],
    ['tha', 'था'],
    ['hota', 'होता'],
    ['mein', 'मेइन'], // not in the dictionary path; an approximation is fine
    ['namaste', 'नमस्ते'],
    ['tumhe', 'तुम्हे'],
    ['chhota', 'छोता'],
    ['kahaani', 'कहानि'],
    ['kahani', 'कहनि'], // single vowels are read as short: a known limit of rule-based romanisation
    ['hoon', 'हूं'],
    ['ek', 'एक'],
    ['aur', 'और'],
    ['robot', 'रोबोत'],
    ['propeller', 'प्रोपेल्लेर'],
    ['bird', 'बिर्द'],
  ])('%s -> %s', (roman, deva) => {
    expect(transliterateWord(roman)).toBe(deva);
  });

  it('leaves non-letters, digits and mixed tokens alone', () => {
    expect(transliterateWord('r2d2')).toBe('r2d2');
    expect(transliterateWord("o'clock")).toBe("o'clock");
  });
});

describe('transliterateText', () => {
  it('converts words, keeps punctuation, digits and acronyms', () => {
    expect(transliterateText('Ek robot, 5 baje. OTP aaya.')).toBe('एक रोबोत, 5 बजे. OTP आया.');
  });
  it('produces only Devanagari for plain Hinglish words', () => {
    const out = transliterateText('chhota sa propeller aur ek chidiya');
    expect(out).not.toMatch(/[a-z]/i);
  });
});

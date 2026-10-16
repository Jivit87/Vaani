import { describe, expect, it } from 'vitest';
import { SentenceChunker } from '../src/tts/chunker';
import { splitByScript } from '../src/tts/splitByScript';

function collect(tokens: string[]) {
  const out: string[] = [];
  const c = new SentenceChunker((s) => out.push(s));
  tokens.forEach((t) => c.push(t));
  c.end();
  return out;
}

describe('SentenceChunker', () => {
  it('splits on sentence terminators incl. the Devanagari danda', () => {
    expect(collect(['Your alarm is set for seven. ', 'Anything else? ', 'Bye now।', ' ok'])).toEqual([
      'Your alarm is set for seven.',
      'Anything else?',
      'Bye now। ok',
    ]);
  });
  it('does not split inside decimals', () => {
    expect(collect(['It is 3.', '5 degrees outside today.'])).toEqual(['It is 3.5 degrees outside today.']);
  });
  it('flushes the first chunk early on a comma once it is long enough', () => {
    const out: string[] = [];
    const c = new SentenceChunker((s) => out.push(s));
    c.push('Sure, I will set that alarm for you right now, and then ');
    expect(out).toEqual(['Sure, I will set that alarm for you right now,']);
  });
  it('does not early-flush a short first comma clause', () => {
    const out: string[] = [];
    const c = new SentenceChunker((s) => out.push(s));
    c.push('Okay, done and ');
    expect(out).toEqual([]);
  });
  it('merges very short sentences into the next one', () => {
    expect(collect(['Okay. ', 'I have set your alarm for seven AM. '])).toEqual([
      'Okay. I have set your alarm for seven AM.',
    ]);
  });
  it('flushes an unterminated tail at end', () => {
    expect(collect(['No punctuation here at all'])).toEqual(['No punctuation here at all']);
  });
});

describe('splitByScript', () => {
  it('separates Devanagari and Latin runs', () => {
    expect(splitByScript('आपका alarm set हो गया')).toEqual([
      ['आपका ', 'hi'],
      ['alarm set ', 'en'],
      ['हो गया', 'hi'],
    ]);
  });
  it('defaults pure punctuation to en', () => {
    expect(splitByScript('...')).toEqual([['...', 'en']]);
  });
});

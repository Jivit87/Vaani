import { describe, expect, it } from 'vitest';
import { normalizeForTts } from '../src/tts/normalize';
import { numberToEnglish, numberToHindi } from '../src/tts/numbers';

describe('number words', () => {
  it('english', () => {
    expect(numberToEnglish(0)).toBe('zero');
    expect(numberToEnglish(17)).toBe('seventeen');
    expect(numberToEnglish(42)).toBe('forty two');
    expect(numberToEnglish(305)).toBe('three hundred five');
  });
  it('hindi', () => {
    expect(numberToHindi(7)).toBe('सात');
    expect(numberToHindi(99)).toBe('निन्यानवे');
    expect(numberToHindi(100)).toBe('सौ');
  });
});

describe('normalizeForTts', () => {
  it('speaks english times and keeps AM/PM', () => {
    expect(normalizeForTts('Your alarm is at 7:30 AM')).toBe('Your alarm is at seven thirty AM');
    expect(normalizeForTts('Meeting at 5PM')).toBe('Meeting at five PM');
    expect(normalizeForTts('At 9:00')).toBe("At nine o'clock");
    expect(normalizeForTts('At 17:05')).toBe('At five oh five');
  });
  it('speaks hindi times in the Hindi idiom', () => {
    expect(normalizeForTts('अलार्म 7:30 बजे')).toBe('अलार्म साढ़े सात बजे');
    expect(normalizeForTts('मीटिंग 5:15')).toBe('मीटिंग सवा पाँच बजे');
    expect(normalizeForTts('मीटिंग 6:45')).toBe('मीटिंग पौने सात बजे');
  });
  it('speaks units and decimals', () => {
    expect(normalizeForTts('It is 31°C with 20% rain')).toBe(
      'It is thirty one degrees Celsius with twenty percent rain',
    );
    expect(normalizeForTts('3.5 hours')).toBe('three point five hours');
  });
  it('uses Hindi number words in Devanagari sentences', () => {
    expect(normalizeForTts('कल 3 मीटिंग हैं')).toBe('कल तीन मीटिंग हैं');
  });
  it('strips markdown, emoji and symbols', () => {
    expect(normalizeForTts('**Done** ✅ — see [docs](http://x.y)')).toBe('Done — see docs');
    expect(normalizeForTts('- item one\n- item two')).toBe('item one item two');
  });
  it('leaves clean text alone', () => {
    expect(normalizeForTts('सुबह सात बजे का alarm set है।')).toBe('सुबह सात बजे का alarm set है।');
  });
});

describe('Roman Hindi → Devanagari', () => {
  it('converts Hindi words in a Hinglish session and speaks the number in Hindi', () => {
    expect(normalizeForTts('Aapka alarm kal subah 7 baje set ho gaya hai', { hinglish: true })).toBe(
      'आपका alarm कल सुबह सात बजे set हो गया है',
    );
  });
  it('converts Hindi words once the sentence already contains Devanagari', () => {
    expect(normalizeForTts('आपका reminder kal shaam set hai')).toBe('आपका reminder कल शाम set है');
  });
  it('leaves English sentences alone, including words that are also Hindi-looking', () => {
    const en = 'We do it at the main park, and hi to them';
    expect(normalizeForTts(en, { hinglish: true })).toBe(en);
    expect(normalizeForTts('Your alarm is set for seven AM')).toBe('Your alarm is set for seven AM');
  });
  it('never converts the deliberately excluded English homographs', async () => {
    const { ROMAN_TO_DEVANAGARI } = await import('../src/tts/hinglishDict');
    for (const w of ['do', 'main', 'par', 'hum', 'is', 'to', 'hi', 'me', 'us', 'din', 'teen', 'char'])
      expect(ROMAN_TO_DEVANAGARI.has(w)).toBe(false);
  });
  it('has a well-formed dictionary', async () => {
    const { ROMAN_TO_DEVANAGARI } = await import('../src/tts/hinglishDict');
    expect(ROMAN_TO_DEVANAGARI.size).toBeGreaterThan(150);
    for (const [roman, deva] of ROMAN_TO_DEVANAGARI) {
      expect(roman).toMatch(/^[a-z]+$/);
      expect(deva).toMatch(/^[\u0900-\u097f]+$/);
    }
  });
});

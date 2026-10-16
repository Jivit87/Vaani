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

import { describe, expect, it } from 'vitest';
import { detectLang } from '../src/agent/lang';

describe('detectLang', () => {
  it.each([
    ['What is the weather forecast for Bangalore tomorrow?', 'en'],
    ['Can you set a reminder for my meeting at 5 PM?', 'en'],
    ['Tell me a short story about a robot and a bird', 'en'],
    ["I'm feeling a bit low today", 'en'],
    ['Do it at the main park, to me', 'en'], // english words that look like hindi ones
    ['Mujhe kal subah 7 baje ka alarm set karna hai.', 'hi'],
    ['Aaj ka schedule kya hai, aur meri next meeting kab hai?', 'hi'],
    ['kal subah alarm laga do', 'hi'],
    ['पुणे में आज मौसम कैसा है', 'hi'],
    ['set an alarm, कल सुबह', 'hi'], // any devanagari counts
    ['bangalor ka wether btao kal', 'hi'],
  ])('%s is %s', (text, lang) => {
    expect(detectLang(text)).toBe(lang);
  });

  it('keeps a very short neutral answer in the language of the conversation', () => {
    expect(detectLang('Pune', 'hi')).toBe('hi');
    expect(detectLang('yes please', 'hi')).toBe('hi');
    expect(detectLang('Pune', 'en')).toBe('en');
    expect(detectLang('what is the weather in Pune', 'hi')).toBe('en'); // a real english sentence switches back
  });

  it('does not trust one very short word on its own', () => {
    expect(detectLang('ka')).toBe('en');
    expect(detectLang('ho')).toBe('en');
  });
});

import { describe, expect, it } from 'vitest';
import { chooseLang, detectLang } from '../src/agent/lang';

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

  it('understands the spellings the speech model writes for hinglish', () => {
    for (const t of [
      'Mujhe kal subah saath baje ka aalaan set karna hai.',
      'Mujhe ek chhoti si kahaani sunao.',
      'Mujhe bhookh lagi hai kuchh healthy khaane ko batao',
      'Paanch minute ka timer laga do.',
      'Internet kaise kaam karta hai aasaan bhaasha mein samajhao?',
      'Mera mood thik nahin hai kuchh achchha sunao.',
      'Kal shaam paanch baje meeting ka reminder laga do.',
    ])
      expect(detectLang(t)).toBe('hi');
  });

  it('keeps a very short neutral answer in the language of the conversation', () => {
    expect(chooseLang('Pune', 'hi')).toBe('hi');
    expect(chooseLang('yes please', 'hi')).toBe('hi');
    expect(chooseLang('Pune', 'en')).toBe('en');
  });

  it('the toggle wins: a hindi conversation only goes back to english for a long sentence with no hindi', () => {
    expect(chooseLang('Can you set it', 'hi')).toBe('hi'); // short: could be garbled hindi
    expect(chooseLang('Set an alarm for me', 'hi')).toBe('en');
    expect(chooseLang('Mujhe kal ka alarm', 'hi')).toBe('hi');
    expect(chooseLang('Reminder 5', 'hi')).toBe('hi'); // short, probably a garbled hindi request
  });

  it('clear hindi moves an english conversation to hindi', () => {
    expect(chooseLang('Mujhe kal subah 7 baje ka alarm set karna hai.', 'en')).toBe('hi');
    expect(chooseLang('what time is it', 'en')).toBe('en');
  });

  it('does not trust one very short word on its own', () => {
    expect(detectLang('ka')).toBe('en');
    expect(detectLang('ho')).toBe('en');
  });
});

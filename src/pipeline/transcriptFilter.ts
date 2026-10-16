// whisper invents short phrases on silence or noise (mostly youtube sign-offs).
// not in the list on purpose: "yes", "no", "yeah", "right", "namaste", "shukriya".
// those are valid answers to a clarifying question.
const HALLUCINATIONS = new Set([
  'you',
  'thank you',
  'thanks',
  'thanks for watching',
  'thank you for watching',
  'thank you so much',
  'thank you so much for watching',
  'thanks for listening',
  'please subscribe',
  'like and subscribe',
  'subscribe to my channel',
  'dont forget to subscribe',
  'see you next time',
  'see you in the next video',
  'bye',
  'bye bye',
  'okay',
  'ok',
  'hmm',
  'um',
  'uh',
  'music',
  'applause',
  'laughter',
  'silence',
  'subtitles by the amara.org community',
]);

// a lone combining mark (vowel sign, anusvara) is never real text. it only shows up
// when whisper decodes noise, like "र ो ो र ो"
const ORPHAN_MARK = /(^|\s)\p{M}+(?=\s|$)/u;

// whisper tags non-speech like "(static)", "[BLANK_AUDIO]", "[Music]", "*sigh*". nothing to answer there
const ANNOTATION = /^\s*[([*].*[)\]*]\s*$/s;

export function isNoiseTranscript(raw: string): boolean {
  if (ANNOTATION.test(raw)) return true;
  if (ORPHAN_MARK.test(raw.trim())) return true;
  const t = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length < 2) return true;
  if (HALLUCINATIONS.has(t)) return true;
  // repetition loops ("ne ne ne") are a classic decoder failure on noise
  const tokens = t.split(' ');
  const unique = new Set(tokens).size;
  return (tokens.length >= 3 && unique === 1) || (tokens.length >= 4 && unique <= 2);
}

const words = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

// true when a short transcript only has words vaani just said, i.e. the mic caught its
// own speaker. real follow-ups ("and the day after?") have words it didn't say.
export function isEcho(transcript: string, lastSpoken: string, maxWords = 6): boolean {
  const heard = words(transcript);
  if (!heard.length || heard.length > maxWords) return false;
  const said = new Set(words(lastSpoken));
  return heard.every((w) => said.has(w));
}

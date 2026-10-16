// Whisper is known to invent short phrases on near-silence or noise. These are
// ignored so the agent does not answer a cough or the room's air conditioning.
const HALLUCINATIONS = new Set([
  'you',
  'thank you',
  'thanks',
  'thanks for watching',
  'thank you for watching',
  'bye',
  'okay',
  'ok',
  'hmm',
  'um',
  'uh',
  'subtitles by the amara.org community',
]);

// A combining mark (Devanagari vowel sign, anusvara...) on its own is never valid text: it only appears when
// Whisper decodes noise, e.g. "र ो ो र ो".
const ORPHAN_MARK = /(^|\s)\p{M}+(?=\s|$)/u;

// Whisper labels non-speech as "(static)", "[BLANK_AUDIO]", "[Music]", "*sigh*"; none of it is something to answer.
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
  return HALLUCINATIONS.has(t);
}

const words = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * True when a short transcript is made only of words Vaani itself just said: the microphone picked up its
 * own speaker. Real follow-ups ("and the day after?") contain words it did not just say.
 */
export function isEcho(transcript: string, lastSpoken: string, maxWords = 6): boolean {
  const heard = words(transcript);
  if (!heard.length || heard.length > maxWords) return false;
  const said = new Set(words(lastSpoken));
  return heard.every((w) => said.has(w));
}

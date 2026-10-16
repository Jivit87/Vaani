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

export function isNoiseTranscript(raw: string): boolean {
  const t = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length < 2) return true;
  return HALLUCINATIONS.has(t);
}

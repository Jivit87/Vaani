import type { Lang } from '../agent/types';
import type { PackId } from './packs';

/**
 * 'piper' (default): fast VITS voices, English for an English session and Hindi for a Hinglish one.
 * 'kokoro': one multilingual voice; nicer, but on a mid-range phone it synthesizes slower than real time
 * (measured: real-time factor ~1.5 on a Redmi Note 12 Pro 5G, so long answers had ~40 % silence).
 */
export type TtsEngineChoice = 'piper' | 'kokoro';

export interface TtsSpec {
  packId: PackId;
  type: 'vits' | 'kokoro';
  speakerId: number;
  /** Hindi words and English loanwords must be Devanagari for this voice (it cannot read Latin text). */
  devanagariLoanwords: boolean;
}

export function ttsSpecFor(lang: Lang, engine: TtsEngineChoice, kokoroSpeakerId: number): TtsSpec {
  if (engine === 'kokoro')
    return {
      packId: 'kokoro-int8-multi-lang-v1_0',
      type: 'kokoro',
      speakerId: kokoroSpeakerId,
      devanagariLoanwords: false,
    };
  return lang === 'hi'
    ? { packId: 'piper-hi-pratham-medium', type: 'vits', speakerId: 0, devanagariLoanwords: true }
    : { packId: 'piper-en-amy-medium', type: 'vits', speakerId: 0, devanagariLoanwords: false };
}

/** Everything that must be on the phone before the app can run in either language. */
export function requiredPackIdsFor(engine: TtsEngineChoice): PackId[] {
  const tts: PackId[] =
    engine === 'kokoro'
      ? ['kokoro-int8-multi-lang-v1_0']
      : ['piper-en-amy-medium', 'piper-hi-pratham-medium'];
  return ['silero-vad', 'whisper-small-int8', ...tts];
}

import { describe, expect, it } from 'vitest';
import { getPack } from '../src/speech/packs';
import { requiredPackIdsFor, ttsSpecFor } from '../src/speech/ttsSelect';

describe('TTS selection', () => {
  it('piper uses the English voice for English and the Hindi voice for Hinglish', () => {
    expect(ttsSpecFor('en', 'piper', 31)).toMatchObject({
      packId: 'piper-en-amy-medium',
      type: 'vits',
      devanagariLoanwords: false,
    });
    expect(ttsSpecFor('hi', 'piper', 31)).toMatchObject({
      packId: 'piper-hi-pratham-medium',
      type: 'vits',
      devanagariLoanwords: true,
    });
  });
  it('kokoro keeps one voice for both languages and the chosen speaker', () => {
    for (const lang of ['en', 'hi'] as const)
      expect(ttsSpecFor(lang, 'kokoro', 32)).toEqual({
        packId: 'kokoro-int8-multi-lang-v1_0',
        type: 'kokoro',
        speakerId: 32,
        devanagariLoanwords: false,
      });
  });
  it('requires every pack the chosen engine can use, and every pack exists in the manifest', () => {
    expect(requiredPackIdsFor('piper')).toEqual([
      'silero-vad',
      'whisper-small-int8',
      'piper-en-amy-medium',
      'piper-hi-pratham-medium',
    ]);
    expect(requiredPackIdsFor('kokoro')).toContain('kokoro-int8-multi-lang-v1_0');
    for (const id of [...requiredPackIdsFor('piper'), ...requiredPackIdsFor('kokoro')])
      expect(getPack(id).files.length).toBeGreaterThan(0);
  });
});

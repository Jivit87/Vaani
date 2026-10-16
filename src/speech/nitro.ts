import { NitroSTT, NitroTTS } from 'react-native-nitro-voice';
import type { SpeechFactory, SpokenInfo, SttEngine, SttLanguage, TtsEngine } from './types';

export interface NitroPaths {
  whisperDir: string;
  vadPath: string;
  ttsDir: string;
  ttsType: 'kokoro' | 'vits';
  /** Kokoro speaker id (31 = hf_alpha, Hindi female); ignored for Piper. */
  speakerId: number;
  speed: number;
}

/** Kokoro v1.0 voice ids, read from the model's own metadata (id2speaker). */
export const KOKORO_VOICES = { af_heart: 3, hf_alpha: 31, hf_beta: 32, hm_omega: 33, hm_psi: 34 } as const;

export function createNitroSpeech(paths: NitroPaths): SpeechFactory {
  return {
    async createStt(language: SttLanguage): Promise<SttEngine> {
      const stt = await NitroSTT.create({ modelDir: paths.whisperDir, type: 'whisper', language });
      return {
        async listen(onTranscript) {
          await stt.startVADGated(paths.vadPath, { onTranscript });
        },
        pauseMic: () => stt.stopMic(),
        resumeMic: () => stt.startMic(),
        destroy: () => stt.destroy(),
      };
    },

    async createTts(): Promise<TtsEngine> {
      const tts = await NitroTTS.create({
        modelDir: paths.ttsDir,
        type: paths.ttsType,
        speakerId: paths.speakerId,
        speed: paths.speed,
      });
      return {
        sampleRate: tts.sampleRate,
        speak(text) {
          const started = Date.now();
          return new Promise<SpokenInfo>((resolve, reject) => {
            let firstChunkMs = -1;
            let audioMs = 0;
            tts
              .speak(text, {
                // nitro-voice synthesizes the whole sentence, then calls this once and plays it natively.
                onAudioChunk: (samples, sr) => {
                  if (firstChunkMs < 0) firstChunkMs = Date.now() - started;
                  audioMs += (samples.byteLength / 4 / sr) * 1000;
                },
                onComplete: () => resolve({ firstChunkMs: Math.max(firstChunkMs, 0), audioMs }),
              })
              .catch(reject);
          });
        },
        stop: () => tts.stop(),
        destroy: () => tts.destroy(),
      };
    },
  };
}

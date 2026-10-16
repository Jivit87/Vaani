import type { ModelCfg } from './agent/types';
import { isKokoroVoice, KOKORO_VOICES } from './speech/voices';
import {
  BACKUP_MODEL,
  GROQ_BACKUP_MODEL,
  GROQ_BASE_URL,
  GROQ_PRIMARY_MODEL,
  NVIDIA_BASE_URL,
  PRIMARY_MODEL,
} from './llm/models';

// EXPO_PUBLIC_* values are inlined into the JS bundle at build time, so the API key is
// readable by anyone who has the APK. Acceptable for this assignment (see README, Security);
// for a real deployment, put the LLM behind your own proxy instead.
//
// Each variable MUST be read as a literal `process.env.EXPO_PUBLIC_NAME`: Expo's bundler only
// substitutes static accesses, so a helper like `process.env[name]` would silently yield undefined.
const clean = (v: string | undefined): string | undefined => (v && v.trim() ? v.trim() : undefined);

function speakerId(name?: string, id?: string): number {
  if (name && isKokoroVoice(name)) return KOKORO_VOICES[name];
  return Number(id ?? KOKORO_VOICES.hf_alpha);
}

const withId = (base: ModelCfg, id: string | undefined): ModelCfg => (id ? { ...base, id } : base);

const nvidiaKey = clean(process.env.EXPO_PUBLIC_NVIDIA_API_KEY);
const groqKey = clean(process.env.EXPO_PUBLIC_GROQ_API_KEY);
// Explicit choice wins; otherwise use whichever key is present (NVIDIA first).
const provider = (clean(process.env.EXPO_PUBLIC_LLM_PROVIDER) ?? (nvidiaKey ? 'nvidia' : 'groq')) as
  'nvidia' | 'groq';
const groq = provider === 'groq';

export const config = {
  provider,
  llmApiKey: groq ? groqKey : nvidiaKey,
  baseUrl: clean(process.env.EXPO_PUBLIC_LLM_BASE_URL) ?? (groq ? GROQ_BASE_URL : NVIDIA_BASE_URL),
  primary: withId(groq ? GROQ_PRIMARY_MODEL : PRIMARY_MODEL, clean(process.env.EXPO_PUBLIC_LLM_PRIMARY)),
  backup: withId(groq ? GROQ_BACKUP_MODEL : BACKUP_MODEL, clean(process.env.EXPO_PUBLIC_LLM_BACKUP)),
  /** Kokoro speaker id: 31 = hf_alpha (Hindi female), 3 = af_heart (English female). */
  // Name (hf_alpha, hf_beta, hm_omega, hm_psi, af_heart) or raw speaker id; makes A/B listening easy.
  ttsSpeakerId: speakerId(
    clean(process.env.EXPO_PUBLIC_TTS_VOICE),
    clean(process.env.EXPO_PUBLIC_TTS_SPEAKER_ID),
  ),
  ttsSpeed: Number(clean(process.env.EXPO_PUBLIC_TTS_SPEED) ?? 1.0),
  /** 'kokoro' (default) or 'piper-hi' (VITS Hindi fallback if Kokoro Hindi sounds wrong on device). */
  ttsEngine: (clean(process.env.EXPO_PUBLIC_TTS_ENGINE) ?? 'kokoro') as 'kokoro' | 'piper-hi',
};

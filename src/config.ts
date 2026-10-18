import type { ModelCfg } from './agent/types';
import {
  BACKUP_MODEL,
  GROQ_BACKUP_MODEL,
  GROQ_BASE_URL,
  GROQ_PRIMARY_MODEL,
  NVIDIA_BASE_URL,
  PRIMARY_MODEL,
} from './llm/models';

// EXPO_PUBLIC_* values get inlined into the JS bundle at build time, so anyone with the
// APK can read the API key. fine for a demo (see README, Known limits). a real
// deployment should put the LLM behind its own proxy.
//
// every variable has to be read as a literal `process.env.EXPO_PUBLIC_NAME`. expo only
// substitutes static accesses, so something like `process.env[name]` is silently undefined.
const clean = (v: string | undefined): string | undefined => (v && v.trim() ? v.trim() : undefined);

const withId = (base: ModelCfg, id: string | undefined): ModelCfg => (id ? { ...base, id } : base);

const nvidiaKey = clean(process.env.EXPO_PUBLIC_NVIDIA_API_KEY);
const groqKey = clean(process.env.EXPO_PUBLIC_GROQ_API_KEY);
// an explicit choice wins, otherwise use whichever key exists (NVIDIA first)
const provider = (clean(process.env.EXPO_PUBLIC_LLM_PROVIDER) ?? (nvidiaKey ? 'nvidia' : 'groq')) as
  'nvidia' | 'groq';
const groq = provider === 'groq';

export const config = {
  provider,
  llmApiKey: groq ? groqKey : nvidiaKey,
  baseUrl: clean(process.env.EXPO_PUBLIC_LLM_BASE_URL) ?? (groq ? GROQ_BASE_URL : NVIDIA_BASE_URL),
  primary: withId(groq ? GROQ_PRIMARY_MODEL : PRIMARY_MODEL, clean(process.env.EXPO_PUBLIC_LLM_PRIMARY)),
  backup: withId(groq ? GROQ_BACKUP_MODEL : BACKUP_MODEL, clean(process.env.EXPO_PUBLIC_LLM_BACKUP)),
  ttsSpeed: Number(clean(process.env.EXPO_PUBLIC_TTS_SPEED) ?? 1.0),
};

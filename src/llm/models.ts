import type { ModelCfg } from '../agent/types';

// Chosen from a live eval on 2026-10-16 (eval/results.md, docs/DECISIONS.md D10). Catalog IDs get
// retired (llama-3.3-70b was shut down 2026-08-26): re-run `npm run eval:tools` before relying on them.
export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export const PRIMARY_MODEL: ModelCfg = {
  id: 'deepseek-ai/deepseek-v4.1-flash',
  maxTokens: 200,
};

export const BACKUP_MODEL: ModelCfg = {
  id: 'nvidia/nemotron-3.5-lightning-30b-a3b',
  maxTokens: 200,
};

// Groq free tier (OpenAI-compatible). ~30 requests/min per model, so tool turns (2 calls) are rate-limited.
// gpt-oss are reasoning models: keep reasoning low or the small token cap is spent before any answer.
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export const GROQ_PRIMARY_MODEL: ModelCfg = {
  id: 'openai/gpt-oss-120b',
  maxTokens: 300,
  extraBody: { reasoning_effort: 'low' },
};

export const GROQ_BACKUP_MODEL: ModelCfg = {
  id: 'openai/gpt-oss-20b',
  maxTokens: 300,
  extraBody: { reasoning_effort: 'low' },
};

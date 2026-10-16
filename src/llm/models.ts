import type { ModelCfg } from '../agent/types';

// picked from a live eval on 2026-10-16 (eval/results.md, docs/DECISIONS.md D10). catalog ids
// get retired (llama-3.3-70b was shut down 2026-08-26), so re-run `npm run eval:tools` before trusting them.
export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export const PRIMARY_MODEL: ModelCfg = {
  id: 'deepseek-ai/deepseek-v4.1-flash',
  maxTokens: 500,
};

export const BACKUP_MODEL: ModelCfg = {
  id: 'nvidia/nemotron-3.5-lightning-30b-a3b',
  maxTokens: 500,
};

// groq free tier, OpenAI compatible. limits for gpt-oss-120b: 8k tokens/min and 200k tokens/day
// (see DECISIONS D19). gpt-oss are reasoning models, so keep reasoning low or the token cap
// gets spent before any answer.
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export const GROQ_PRIMARY_MODEL: ModelCfg = {
  id: 'openai/gpt-oss-120b',
  maxTokens: 700,
  extraBody: { reasoning_effort: 'low' },
};

export const GROQ_BACKUP_MODEL: ModelCfg = {
  id: 'openai/gpt-oss-20b',
  maxTokens: 700,
  extraBody: { reasoning_effort: 'low' },
};

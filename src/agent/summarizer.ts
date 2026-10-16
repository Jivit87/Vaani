import { SUMMARY_SYSTEM_PROMPT } from '../llm/prompts';
import type { LlmClient } from '../llm/client';
import type { Summarizer } from './memory';
import type { ModelCfg } from './types';

export function createSummarizer(client: LlmClient, model: ModelCfg): Summarizer {
  return async (previous, evicted) => {
    const turns = evicted
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `${m.role}: ${m.content ?? ''}`)
      .join('\n');
    let out = '';
    await client({
      model: { ...model, maxTokens: 100 },
      tools: [],
      onText: (t) => (out += t),
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: `Previous summary: ${previous || '(none)'}\nNew turns:\n${turns}` },
      ],
    });
    return out;
  };
}

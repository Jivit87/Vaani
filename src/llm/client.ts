import type { Msg, ModelCfg, StepResult, ToolCall } from '../agent/types';
import { SseParser, ThinkFilter } from './sse';
import type { ToolSchema } from './tools.schema';

export class LlmHttpError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`LLM HTTP ${status}: ${detail}`);
  }
}
export class LlmTimeoutError extends Error {
  constructor() {
    super('LLM first-token timeout');
  }
}

export interface LlmRequest {
  model: ModelCfg;
  messages: Msg[];
  tools: ToolSchema[];
  /** Called with speakable text only (reasoning and <think> blocks removed). */
  onText: (t: string) => void;
  signal?: AbortSignal;
}

export type LlmClient = (req: LlmRequest) => Promise<StepResult>;

export interface LlmClientConfig {
  /** `expo/fetch` in the app (streaming bodies), global `fetch` in Node. */
  fetch: typeof fetch;
  apiKey: string;
  baseUrl: string;
  firstTokenTimeoutMs?: number;
  clock?: () => number;
}

interface Delta {
  content?: string | null;
  tool_calls?: {
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }[];
}

export function createLlmClient(cfg: LlmClientConfig): LlmClient {
  const clock = cfg.clock ?? (() => Date.now());
  const ttftTimeout = cfg.firstTokenTimeoutMs ?? 5000;

  return async ({ model, messages, tools, onText, signal }) => {
    const started = clock();
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal?.addEventListener('abort', onAbort);
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, ttftTimeout);
    const stopTimer = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };

    try {
      const res = await cfg.fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: model.id,
          stream: true,
          temperature: 0.3,
          max_tokens: model.maxTokens,
          ...model.extraBody,
          messages,
          ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
        }),
        signal: ctl.signal,
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 200);
        throw new LlmHttpError(res.status, detail);
      }
      if (!res.body) throw new Error('LLM response has no body');

      const sse = new SseParser();
      const think = new ThinkFilter();
      const decoder = new TextDecoder();
      const calls: Record<number, ToolCall> = {};
      let text = '';
      let ttftMs: number | null = null;
      let done = false;

      const emit = (visible: string) => {
        if (!visible) return;
        text += visible;
        onText(visible);
      };

      const reader = res.body.getReader();
      while (!done) {
        const { value, done: eof } = await reader.read();
        if (eof) break;
        stopTimer(); // bytes are flowing; from here the caller's own limits apply
        for (const data of sse.push(decoder.decode(value, { stream: true }))) {
          if (data.trim() === '[DONE]') {
            done = true;
            break;
          }
          let delta: Delta;
          try {
            delta = (JSON.parse(data).choices?.[0]?.delta ?? {}) as Delta;
          } catch {
            continue; // keep-alive or malformed fragment
          }
          if (delta.content) {
            if (ttftMs === null) ttftMs = clock() - started;
            emit(think.push(delta.content));
          }
          for (const tc of delta.tool_calls ?? []) {
            if (ttftMs === null) ttftMs = clock() - started;
            const i = tc.index ?? 0;
            const c = (calls[i] ??= { id: '', type: 'function', function: { name: '', arguments: '' } });
            if (tc.id) c.id = tc.id;
            if (tc.function?.name) c.function.name = tc.function.name;
            if (tc.function?.arguments) c.function.arguments += tc.function.arguments;
          }
        }
      }
      void reader.cancel().catch(() => undefined);
      emit(think.flush());

      const toolCalls = Object.entries(calls)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([i, c]) => ({ ...c, id: c.id || `call_${i}` }));
      return { text, toolCalls, ttftMs, totalMs: clock() - started };
    } catch (e) {
      if (timedOut) throw new LlmTimeoutError();
      throw e;
    } finally {
      stopTimer();
      signal?.removeEventListener('abort', onAbort);
    }
  };
}

export const safeParse = (s: string): unknown | null => {
  try {
    const v = JSON.parse(s || '{}');
    return typeof v === 'object' && v !== null ? v : null;
  } catch {
    return null;
  }
};

export interface ModelPair {
  primary: ModelCfg;
  backup?: ModelCfg;
}

/**
 * Tries the primary model, then the backup. Falls back only if nothing was
 * spoken yet, so the user never hears the start of an answer twice.
 */
export async function callWithFallback(
  client: LlmClient,
  models: ModelPair,
  req: Omit<LlmRequest, 'model'>,
): Promise<{ result: StepResult; model: ModelCfg }> {
  let emitted = false;
  const onText = (t: string) => {
    emitted = true;
    req.onText(t);
  };
  try {
    return { result: await client({ ...req, onText, model: models.primary }), model: models.primary };
  } catch (e) {
    const aborted = req.signal?.aborted;
    if (!models.backup || emitted || aborted) throw e;
    return { result: await client({ ...req, onText, model: models.backup }), model: models.backup };
  }
}

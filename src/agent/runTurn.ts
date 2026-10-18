import { callWithFallback, safeParse, type LlmClient, type ModelPair } from '../llm/client';
import { TOOLS, type ToolSchema } from '../llm/tools.schema';
import { SentenceChunker } from '../tts/chunker';
import { chooseLang } from './lang';
import { LINES } from './lines';
import type { Memory } from './memory';
import type { ToolRunner } from './toolRunner';
import type { Lang, Msg, ModelCfg, TraceEvent } from './types';

export const MAX_STEPS = 3;

export interface Speaker {
  // text for the screen, as it streams
  show(text: string): void;
  // queue a finished sentence for the voice (already written as it should sound)
  say(sentence: string): void;
  // play a filler line so a slow tool isn't dead air
  playFiller(lang: Lang): void;
}

export interface AgentDeps {
  llm: LlmClient;
  models: ModelPair;
  runTool: ToolRunner;
  speaker: Speaker;
  tools?: ToolSchema[];
  clock?: () => number;
  onTrace?: (e: TraceEvent) => void;
}

interface TurnTimings {
  llmTtftMs: number | null; // first token of the first LLM step
  toolMs: number; // time spent in tools this turn
  llmSteps: number;
  totalMs: number;
}

export interface TurnResult {
  // what was shown on screen (this is also what goes into memory)
  spoken: string;
  toolsCalled: { name: string; args: unknown; result: Record<string, unknown> }[];
  model: ModelCfg;
  timings: TurnTimings;
}

// one user turn: stream the LLM, run the tools it asks for, feed the results back,
// repeat (max MAX_STEPS). text is spoken as it streams.
export async function runTurn(
  userText: string,
  mem: Memory,
  deps: AgentDeps,
  signal?: AbortSignal,
): Promise<TurnResult> {
  const clock = deps.clock ?? (() => Date.now());
  const started = clock();
  const lang = chooseLang(userText, mem.state.lang);
  mem.setLang(lang);
  const chunker = new SentenceChunker((s) => deps.speaker.say(s));
  const scratch: Msg[] = []; // this turn's tool calls and results, never kept long-term
  const toolsCalled: TurnResult['toolsCalled'] = [];
  let shown = '';
  let toolMs = 0;
  let llmTtftMs: number | null = null;
  let llmSteps = 0;
  let model = deps.models.primary;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const lastStep = step === MAX_STEPS - 1;
      const { result, model: used } = await callWithFallback(deps.llm, deps.models, {
        messages: mem.buildMessages(userText, scratch),
        tools: lastStep ? [] : (deps.tools ?? TOOLS), // the last step has no tools, so it has to answer in words
        signal,
        onText: (t) => {
          shown += t;
          deps.speaker.show(t);
          chunker.push(t);
        },
      });
      model = used;
      llmSteps++;
      if (step === 0) llmTtftMs = result.ttftMs;
      if (!result.toolCalls.length || lastStep) break;

      // filler only if the model hasn't already said something
      if (step === 0 && !result.text.trim()) deps.speaker.playFiller(lang);
      scratch.push({
        role: 'assistant',
        content: result.text || null,
        tool_calls: result.toolCalls,
      });

      const results = await Promise.all(
        result.toolCalls.map(async (tc) => {
          const t0 = clock();
          const args = safeParse(tc.function.arguments);
          const res = args
            ? await deps.runTool(tc.function.name, args, mem)
            : { error: 'bad_arguments_json' };
          const ms = clock() - t0;
          toolsCalled.push({ name: tc.function.name, args, result: res });
          deps.onTrace?.({ kind: 'tool', name: tc.function.name, args, result: res, ms });
          return { msg: { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify(res) }, ms };
        }),
      );
      toolMs += Math.max(...results.map((r) => r.ms)); // tools run in parallel, so the slowest one counts
      scratch.push(...results.map((r) => r.msg));
    }

    if (!shown.trim()) {
      const succeeded = toolsCalled.some((t) => !('error' in t.result));
      const line = (succeeded ? LINES.done : LINES.noAnswer)[lang];
      shown = line.show;
      deps.speaker.show(line.show);
      chunker.push(line.say);
    }
    chunker.end();
  } catch (e) {
    // a cancelled turn shouldn't speak half a sentence
    if (!signal?.aborted) chunker.end();
    throw e;
  }

  mem.commitTurn(userText, shown);
  return {
    spoken: shown.trim(),
    toolsCalled,
    model,
    timings: { llmTtftMs, toolMs, llmSteps, totalMs: clock() - started },
  };
}

import { callWithFallback, safeParse, type LlmClient, type ModelPair } from '../llm/client';
import { TOOLS, type ToolSchema } from '../llm/tools.schema';
import { SentenceChunker } from '../tts/chunker';
import type { Memory } from './memory';
import type { ToolRunner } from './toolRunner';
import type { Lang, Msg, ModelCfg, TraceEvent } from './types';

export const MAX_STEPS = 3;

export interface Speaker {
  // queue a finished sentence for synthesis
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

export interface TurnTimings {
  llmTtftMs: number | null; // first token of the first LLM step
  toolMs: number; // time spent in tools this turn
  llmSteps: number;
  totalMs: number;
}

export interface TurnResult {
  spoken: string;
  toolsCalled: { name: string; args: unknown; result: Record<string, unknown> }[];
  model: ModelCfg;
  timings: TurnTimings;
}

// only used when the model said nothing. we say "Done" only if a tool really worked,
// otherwise the user should hear that nothing happened, never that an alarm was set
const DONE_REPLY: Record<Lang, string> = { en: 'Done.', hi: 'हो गया।' };
const NO_ANSWER_REPLY: Record<Lang, string> = {
  en: "Sorry, I didn't get that. Could you say it again?",
  hi: 'माफ़ कीजिए, मैं समझ नहीं पाई। क्या आप फिर से बोल सकते हैं?',
};

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
  const chunker = new SentenceChunker((s) => deps.speaker.say(s));
  const scratch: Msg[] = []; // this turn's tool calls and results, never kept long-term
  const toolsCalled: TurnResult['toolsCalled'] = [];
  let spoken = '';
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
          spoken += t;
          chunker.push(t);
        },
      });
      model = used;
      llmSteps++;
      if (step === 0) llmTtftMs = result.ttftMs;
      if (!result.toolCalls.length || lastStep) break;

      // filler only if the model hasn't already said something
      if (step === 0 && !result.text.trim()) deps.speaker.playFiller(mem.state.lang);
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

    if (!spoken.trim()) {
      const succeeded = toolsCalled.some((t) => !('error' in t.result));
      spoken = (succeeded ? DONE_REPLY : NO_ANSWER_REPLY)[mem.state.lang];
      chunker.push(spoken);
    }
  } catch (e) {
    // a cancelled turn shouldn't speak half a sentence
    if (!signal?.aborted) chunker.end();
    throw e;
  }
  chunker.end();

  mem.commitTurn(userText, spoken);
  return {
    spoken: spoken.trim(),
    toolsCalled,
    model,
    timings: { llmTtftMs, toolMs, llmSteps, totalMs: clock() - started },
  };
}

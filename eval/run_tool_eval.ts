// tool-calling eval: replays eval/tool_cases.json through the real agent loop
// (runTurn + Memory + tool validation) against live models.
//
//   NVIDIA_API_KEY=nvapi-... npx tsx eval/run_tool_eval.ts --models <id>,<id>
//
// other providers: --base-url https://api.groq.com/openai/v1 --key-env GROQ_API_KEY
// options: --cases <path>  --out <dir>  --delay-ms <n> (pause between turns, default 2500)
//          --only <caseId,...>  --extra-body '<json>' (e.g. reasoning_effort)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Memory } from '../src/agent/memory';
import { runTurn } from '../src/agent/runTurn';
import { createToolRunner, type ToolBackends } from '../src/agent/toolRunner';
import { searchWikipedia } from '../src/tools/wikipedia';
import { SentenceChunker } from '../src/tts/chunker';
import { normalizeForTts } from '../src/tts/normalize';
import { createPhoneticizer } from '../src/tts/phonetic';
import { createLlmClient } from '../src/llm/client';
import { NVIDIA_BASE_URL } from '../src/llm/models';
import { markdownTable, scoreTurn, summarizeScores, type Case, type Observed, type TurnScore } from './score';

const P90_TTFT_WARN_MS = 6000;

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function loadKey(name: string): string {
  if (process.env[name]) return process.env[name]!;
  for (const f of ['.env', '.env.local']) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(new RegExp(`^(?:EXPO_PUBLIC_)?${name}=(.+)$`, 'm'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error(`Set ${name} (env var or .env)`);
}

const fixtures: ToolBackends = {
  setAlarm: async () => {},
  setReminder: async () => {},
  setTimer: async () => {},
  // real Wikipedia, so the eval also exercises the live integration
  searchWikipedia: (query, language) => searchWikipedia(fetch, query, language),
  getSchedule: async () => [
    { title: 'Team standup', start_hhmm: '10:30' },
    { title: 'Lunch with Rahul', start_hhmm: '13:00' },
  ],
  getWeather: async (city, date) => ({
    city,
    date,
    max_c: 30,
    min_c: 21,
    rain_pct: 20,
    summary: 'partly cloudy',
  }),
};

async function main() {
  const models = (arg('models') ?? '').split(',').filter(Boolean);
  if (!models.length) throw new Error('Pass --models <id>[,<id>...]');
  const file = JSON.parse(readFileSync(resolve(arg('cases', 'eval/tool_cases.json')!), 'utf8'));
  const only = arg('only')?.split(',');
  const cases: Case[] = file.cases.filter((c: Case) => !only || only.includes(c.id));
  const NOW = new Date(file.now);
  const delay = Number(arg('delay-ms', '2500'));
  const outDir = resolve(arg('out', 'eval/out')!);
  mkdirSync(outDir, { recursive: true });

  const extra = arg('extra-body') ? JSON.parse(arg('extra-body')!) : undefined;
  const llm = createLlmClient({
    fetch,
    apiKey: loadKey(arg('key-env', 'NVIDIA_API_KEY')!),
    baseUrl: arg('base-url', NVIDIA_BASE_URL)!,
    firstTokenTimeoutMs: 20_000,
  });
  const runTool = createToolRunner(fixtures, () => NOW);
  // the app rewrites each sentence for the voice with the smaller model, so the eval does the same
  const phoneticize = createPhoneticizer({
    llm,
    model: { id: arg('voice-model', models[models.length - 1])!, maxTokens: 300, extraBody: extra },
  });
  const voiceTextOf = async (reply: string) => {
    const sentences: string[] = [];
    const chunker = new SentenceChunker((x) => sentences.push(x));
    chunker.push(reply);
    chunker.end();
    // the same two steps as the app: the small model first, then the rule-based clean-up for anything it left
    const rewritten = await Promise.all(sentences.map(phoneticize));
    return rewritten.map((x) => normalizeForTts(x, { hinglish: true, devanagariLoanwords: true })).join(' ');
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const table: { model: string; s: ReturnType<typeof summarizeScores> }[] = [];
  const failures: string[] = [];

  for (const modelId of models) {
    const scores: TurnScore[] = [];
    const observed: Observed[] = [];
    for (const c of cases) {
      const mem = new Memory(() => NOW);
      for (const turn of c.turns) {
        let obs: Observed = { tools: [], spoken: 'ERROR not run', speech: '', ttftMs: null, totalMs: 0 };
        // free tiers cap tokens per minute: on a 429, cool down and retry instead of scoring a rate limit
        for (let attempt = 0; attempt < 4; attempt++) {
          let throttled = false;
          try {
            const r = await runTurn(turn.user, mem, {
              llm,
              models: { primary: { id: modelId, maxTokens: 700, extraBody: extra } },
              runTool,
              speaker: { show: () => {}, say: () => {}, playFiller: () => {} },
            });
            obs = {
              tools: r.toolsCalled.map((t) => ({ name: t.name, args: t.args })),
              spoken: r.spoken,
              speech: await voiceTextOf(r.spoken),
              ttftMs: r.timings.llmTtftMs,
              totalMs: r.timings.totalMs,
            };
          } catch (e) {
            const msg = (e as Error).message;
            throttled = /HTTP 429/.test(msg);
            obs = { tools: [], spoken: `ERROR ${msg}`, speech: '', ttftMs: null, totalMs: 0 };
          }
          if (!throttled) break;
          console.log(`  (429 rate limit, cooling down 40 s, attempt ${attempt + 1})`);
          await sleep(40_000);
        }
        const s = scoreTurn(c.id, turn, obs, mem.state.lang);
        scores.push(s);
        observed.push(obs);
        const ok = s.toolOk && s.argsOk !== false && s.clarifyOk !== false && s.styleOk && s.speechOk;
        if (!ok) failures.push(`[${modelId}] ${c.id}: "${turn.user}" → ${s.detail}`);
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${modelId}  ${c.id}  ${obs.ttftMs ?? '-'}ms`);
        await sleep(delay);
      }
    }
    const ttfts = observed.flatMap((o) => (o.ttftMs === null ? [] : [o.ttftMs])).sort((a, c) => a - c);
    const p90 = ttfts.length ? ttfts[Math.min(ttfts.length - 1, Math.ceil(0.9 * ttfts.length) - 1)] : null;
    if (p90 !== null && p90 > P90_TTFT_WARN_MS)
      console.warn(`WARNING ${modelId}: p90 TTFT ${p90} ms exceeds ${P90_TTFT_WARN_MS} ms`);
    table.push({ model: modelId, s: summarizeScores(scores, observed) });
    writeFileSync(
      `${outDir}/${modelId.replace(/[^\w.-]/g, '_')}.json`,
      JSON.stringify({ scores, observed }, null, 1),
    );
  }

  const md = `${markdownTable(table)}\n\n### Failures\n${failures.map((f) => `- ${f}`).join('\n') || '- none'}\n`;
  writeFileSync(`${outDir}/results.md`, md);
  console.log(`\n${md}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});

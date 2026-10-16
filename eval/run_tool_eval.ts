/**
 * Tool-calling eval: replays eval/tool_cases.json through the real agent loop
 * (runTurn + Memory + tool validation) against live NVIDIA models.
 *
 *   NVIDIA_API_KEY=nvapi-... npx tsx eval/run_tool_eval.ts --models <id>,<id>
 *
 * Other providers: --base-url https://api.groq.com/openai/v1 --key-env GROQ_API_KEY
 * Options: --cases <path>  --out <dir>  --delay-ms <n> (pause between LLM turns, default 2500)
 *          --only <caseId,...>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Memory } from '../src/agent/memory';
import { runTurn } from '../src/agent/runTurn';
import { createToolRunner, type ToolBackends } from '../src/agent/toolRunner';
import { searchWikipedia } from '../src/tools/wikipedia';
import { createLlmClient } from '../src/llm/client';
import { NVIDIA_BASE_URL } from '../src/llm/models';
import { markdownTable, scoreTurn, summarizeScores, type Case, type Observed, type TurnScore } from './score';

const HINGLISH =
  /[\u0900-\u097f]|\b(ka|kal|aaj|baje|bje|karna|laga|kya|hai|mujhe|parso|shaam|subah|aur|dena|btao|kehte|khane|bhookh|motivate|karo|batao)\b/i;

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
  // Real Wikipedia, so the eval also exercises the live integration.
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
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const table: { model: string; s: ReturnType<typeof summarizeScores> }[] = [];
  const failures: string[] = [];

  for (const modelId of models) {
    const scores: TurnScore[] = [];
    const observed: Observed[] = [];
    for (const c of cases) {
      const mem = new Memory(() => NOW);
      // Hinglish cases run in a Hinglish session, as the app's toggle would be set for them.
      mem.setLang(HINGLISH.test(c.turns.map((t) => t.user).join(' ')) ? 'hi' : 'en');
      for (const turn of c.turns) {
        let obs: Observed = { tools: [], spoken: 'ERROR not run', ttftMs: null, totalMs: 0 };
        // Free tiers cap tokens per minute: on a 429, cool down and retry instead of scoring a rate limit.
        for (let attempt = 0; attempt < 4; attempt++) {
          let throttled = false;
          try {
            const r = await runTurn(turn.user, mem, {
              llm,
              models: { primary: { id: modelId, maxTokens: 700, extraBody: extra } },
              runTool,
              speaker: { say: () => {}, playFiller: () => {} },
            });
            obs = {
              tools: r.toolsCalled.map((t) => ({ name: t.name, args: t.args })),
              spoken: r.spoken,
              ttftMs: r.timings.llmTtftMs,
              totalMs: r.timings.totalMs,
            };
          } catch (e) {
            const msg = (e as Error).message;
            throttled = /HTTP 429/.test(msg);
            obs = { tools: [], spoken: `ERROR ${msg}`, ttftMs: null, totalMs: 0 };
          }
          if (!throttled) break;
          console.log(`  (429 rate limit, cooling down 40 s, attempt ${attempt + 1})`);
          await sleep(40_000);
        }
        const s = scoreTurn(c.id, turn, obs);
        scores.push(s);
        observed.push(obs);
        const ok = s.toolOk && s.argsOk !== false && s.clarifyOk !== false && s.styleOk;
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

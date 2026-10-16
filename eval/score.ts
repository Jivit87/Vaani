// Pure scoring for the tool-calling eval; imported by run_tool_eval.ts and by tests.
export interface Expect {
  tool?: string | null;
  tools?: string[];
  args?: Record<string, unknown>;
  asks_question?: boolean;
  /** Tools the model may call without penalty when `tool` is null (e.g. a fact it could look up or answer). */
  allow?: string[];
  /** Spoken-reply word limit for this turn (default 130). */
  max_words?: number;
}
export interface Turn {
  user: string;
  expect: Expect;
}
export interface Case {
  id: string;
  turns: Turn[];
}
export interface Observed {
  tools: { name: string; args: unknown }[];
  spoken: string;
  ttftMs: number | null;
  totalMs: number;
}
export interface TurnScore {
  caseId: string;
  user: string;
  toolOk: boolean;
  /** null when the turn has no argument expectation. */
  argsOk: boolean | null;
  /** null unless the turn expects a clarifying question. */
  clarifyOk: boolean | null;
  /** Spoken reply is non-empty, plain speech (no markdown or links) and not too long. */
  styleOk: boolean;
  detail: string;
}

const DEFAULT_MAX_WORDS = 130;
const MARKDOWN = /(^|\n)\s*([-*•]|\d+[.)])\s|[*#`~_]{1,}|https?:\/\/|\[[^\]]*\]\(/;

/** Voice replies must be plain speech and reasonably short. */
export function checkStyle(spoken: string, maxWords: number): boolean {
  const text = spoken.trim();
  if (!text || text.startsWith('ERROR')) return false;
  return !MARKDOWN.test(text) && text.split(/\s+/).length <= maxWords;
}

const norm = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v);

export function valueMatches(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) return expected.some((e) => valueMatches(e, actual));
  if (typeof expected === 'string' && expected.startsWith('~'))
    return typeof actual === 'string' && actual.startsWith(expected.slice(1));
  return norm(expected) === norm(actual);
}

export function argsMatch(expected: Record<string, unknown>, actual: unknown): boolean {
  if (typeof actual !== 'object' || actual === null) return false;
  return Object.entries(expected).every(([k, v]) => valueMatches(v, (actual as Record<string, unknown>)[k]));
}

export function scoreTurn(caseId: string, turn: Turn, obs: Observed): TurnScore {
  const { expect } = turn;
  const names = obs.tools.map((t) => t.name);
  let toolOk: boolean;
  let argsOk: boolean | null = null;
  let clarifyOk: boolean | null = null;

  if (expect.tools) {
    toolOk = expect.tools.every((n) => names.includes(n));
  } else if (expect.tool) {
    toolOk = names.includes(expect.tool);
    if (expect.args) {
      argsOk = obs.tools.filter((t) => t.name === expect.tool).some((t) => argsMatch(expect.args!, t.args));
    }
  } else {
    // chit-chat and clarification must not call tools, except ones the case explicitly allows
    toolOk = names.every((n) => expect.allow?.includes(n));
  }
  if (expect.asks_question) clarifyOk = names.length === 0 && /[?？]/.test(obs.spoken);
  const styleOk = checkStyle(obs.spoken, expect.max_words ?? DEFAULT_MAX_WORDS);

  const detail = `tools=[${names.join(',')}] args=${JSON.stringify(obs.tools.map((t) => t.args))} said="${obs.spoken}"`;
  return { caseId, user: turn.user, toolOk, argsOk, clarifyOk, styleOk, detail };
}

export interface ModelSummary {
  turns: number;
  toolAcc: number;
  argAcc: number | null;
  clarifyAcc: number | null;
  styleAcc: number;
  medianTtftMs: number | null;
  medianTotalMs: number | null;
}

const ratio = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

export function summarizeScores(scores: TurnScore[], obs: Observed[]): ModelSummary {
  return {
    turns: scores.length,
    toolAcc: ratio(scores.map((s) => s.toolOk)) ?? 0,
    argAcc: ratio(scores.flatMap((s) => (s.argsOk === null ? [] : [s.argsOk]))),
    clarifyAcc: ratio(scores.flatMap((s) => (s.clarifyOk === null ? [] : [s.clarifyOk]))),
    styleAcc: ratio(scores.map((s) => s.styleOk)) ?? 0,
    medianTtftMs: median(obs.flatMap((o) => (o.ttftMs === null ? [] : [o.ttftMs]))),
    medianTotalMs: median(obs.map((o) => o.totalMs)),
  };
}

export const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(0)}%`);

export function markdownTable(rows: { model: string; s: ModelSummary }[]): string {
  const head =
    '| Model | Turns | Tool choice | Arguments | Clarification | Style | Median TTFT (ms) | Median turn (ms) |\n|---|---|---|---|---|---|---|---|';
  const body = rows.map(
    ({ model, s }) =>
      `| ${model} | ${s.turns} | ${pct(s.toolAcc)} | ${pct(s.argAcc)} | ${pct(s.clarifyAcc)} | ${pct(s.styleAcc)} | ${s.medianTtftMs ?? 'n/a'} | ${s.medianTotalMs ?? 'n/a'} |`,
  );
  return [head, ...body].join('\n');
}

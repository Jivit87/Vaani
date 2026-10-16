// Pure scoring for the tool-calling eval; imported by run_tool_eval.ts and by tests.
export interface Expect {
  tool?: string | null;
  tools?: string[];
  args?: Record<string, unknown>;
  asks_question?: boolean;
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
  detail: string;
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
    toolOk = names.length === 0; // chit-chat and clarification must not call tools
  }
  if (expect.asks_question) clarifyOk = names.length === 0 && /[?？]/.test(obs.spoken);

  const detail = `tools=[${names.join(',')}] args=${JSON.stringify(obs.tools.map((t) => t.args))} said="${obs.spoken}"`;
  return { caseId, user: turn.user, toolOk, argsOk, clarifyOk, detail };
}

export interface ModelSummary {
  turns: number;
  toolAcc: number;
  argAcc: number | null;
  clarifyAcc: number | null;
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
    medianTtftMs: median(obs.flatMap((o) => (o.ttftMs === null ? [] : [o.ttftMs]))),
    medianTotalMs: median(obs.map((o) => o.totalMs)),
  };
}

export const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(0)}%`);

export function markdownTable(rows: { model: string; s: ModelSummary }[]): string {
  const head =
    '| Model | Turns | Tool choice | Arguments | Clarification | Median TTFT (ms) | Median turn (ms) |\n|---|---|---|---|---|---|---|';
  const body = rows.map(
    ({ model, s }) =>
      `| ${model} | ${s.turns} | ${pct(s.toolAcc)} | ${pct(s.argAcc)} | ${pct(s.clarifyAcc)} | ${s.medianTtftMs ?? 'n/a'} | ${s.medianTotalMs ?? 'n/a'} |`,
  );
  return [head, ...body].join('\n');
}

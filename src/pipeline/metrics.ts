export interface TurnMetrics {
  at: string; // ISO timestamp
  user: string;
  spoken: string;
  model: string;
  tools: string; // e.g. "get_weather;get_schedule"
  llmSteps: number;
  llmTtftMs: number | null;
  toolMs: number;
  // transcript received to first synthesized audio. STT decode and endpointing aren't included (see README)
  firstAudioMs: number | null;
  ttsFirstChunkMs: number | null;
  totalMs: number; // transcript received to whole reply spoken
  error?: string;
}

const COLUMNS: (keyof TurnMetrics)[] = [
  'at',
  'user',
  'spoken',
  'model',
  'tools',
  'llmSteps',
  'llmTtftMs',
  'toolMs',
  'firstAudioMs',
  'ttsFirstChunkMs',
  'totalMs',
  'error',
];

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CSV_HEADER = COLUMNS.join(',');
export const toCsvRow = (m: TurnMetrics) => COLUMNS.map((c) => esc(m[c])).join(',');
export const toCsv = (rows: TurnMetrics[]) => [CSV_HEADER, ...rows.map(toCsvRow)].join('\n');

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

export interface Summary {
  n: number;
  median: number | null;
  p90: number | null;
}

// direct answers and tool turns have very different latency, so report them separately
export function summarize(rows: TurnMetrics[]): { direct: Summary; tool: Summary } {
  const part = (list: TurnMetrics[]): Summary => {
    const v = list.map((r) => r.firstAudioMs).filter((x): x is number => x !== null);
    return { n: v.length, median: percentile(v, 50), p90: percentile(v, 90) };
  };
  const ok = rows.filter((r) => !r.error);
  return { direct: part(ok.filter((r) => !r.tools)), tool: part(ok.filter((r) => r.tools)) };
}

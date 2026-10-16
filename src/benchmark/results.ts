/** One decode of one recording by one model; the shape benchmarks/run_wer.py reads. */
export interface BenchmarkRow {
  model: string;
  language: 'en' | 'hi';
  file: string;
  hyp: string;
  decode_ms: number;
  audio_ms: number;
}

export interface BenchmarkFile {
  device: string;
  created: string;
  rows: BenchmarkRow[];
}

export const realTimeFactor = (r: Pick<BenchmarkRow, 'decode_ms' | 'audio_ms'>) =>
  r.audio_ms > 0 ? r.decode_ms / r.audio_ms : 0;

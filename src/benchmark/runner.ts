import { NitroSTT } from 'react-native-nitro-voice';
import { Directory, File, Paths } from 'expo-file-system';
import { modelsRoot, toNativePath } from '../speech/fsOps';
import type { BenchmarkFile, BenchmarkRow } from './results';
import { parseWav } from './wav';

const benchmarkAudioDir = () => new Directory(Paths.document, 'benchmark', 'audio');

// whisper model folders under models/ (push extra candidates with adb, see README)
export function listWhisperModels(): string[] {
  const root = new Directory(modelsRoot());
  if (!root.exists) return [];
  return root
    .list()
    .filter((e): e is Directory => e instanceof Directory && new File(e.uri, 'encoder.onnx').exists)
    .map((d) => d.name);
}

export function listRecordings(): string[] {
  const dir = benchmarkAudioDir();
  if (!dir.exists) return [];
  return dir
    .list()
    .filter((e): e is File => e instanceof File && e.name.toLowerCase().endsWith('.wav'))
    .map((f) => f.name)
    .sort();
}

const SILENCE_TAIL_S = 1.5; // lets the VAD see the end of speech so it flushes the utterance
const FIRST_TRANSCRIPT_TIMEOUT_MS = 30_000;
const EXTRA_SEGMENT_WAIT_MS = 600;

// language comes from the file prefix: en_*.wav / hi_*.wav
const languageOf = (file: string): 'en' | 'hi' => (file.toLowerCase().startsWith('hi_') ? 'hi' : 'en');

export async function runBenchmark(
  models: string[],
  files: string[],
  vadPath: string,
  onProgress: (msg: string) => void,
  device: string,
): Promise<BenchmarkFile> {
  const rows: BenchmarkRow[] = [];
  for (const model of models) {
    for (const language of ['en', 'hi'] as const) {
      const subset = files.filter((f) => languageOf(f) === language);
      if (!subset.length) continue;
      onProgress(`Loading ${model} (${language})…`);
      const stt = await NitroSTT.create({
        modelDir: toNativePath(`${modelsRoot()}/${model}`),
        type: 'whisper',
        language,
      });
      let pending: string[] = [];
      let wake: (() => void) | null = null;
      await stt.startVADGated(
        vadPath,
        {
          onTranscript: (t) => {
            pending.push(t);
            wake?.();
          },
        },
        { mic: false },
      );
      try {
        for (const file of subset) {
          onProgress(`${model} · ${file}`);
          const wav = parseWav(new Uint8Array(await new File(benchmarkAudioDir(), file).arrayBuffer()));
          const padded = new Float32Array(wav.samples.length + Math.round(wav.sampleRate * SILENCE_TAIL_S));
          padded.set(wav.samples);
          pending = [];
          const t0 = Date.now();
          const first = new Promise<void>((resolve, reject) => {
            wake = resolve;
            setTimeout(() => reject(new Error('timeout')), FIRST_TRANSCRIPT_TIMEOUT_MS);
          });
          stt.feedAudio(padded.buffer as ArrayBuffer, wav.sampleRate);
          let hyp = '';
          try {
            await first;
            await new Promise((r) => setTimeout(r, EXTRA_SEGMENT_WAIT_MS)); // wait a bit for later VAD segments
            hyp = pending.join(' ').trim();
          } catch {
            hyp = '';
          }
          rows.push({
            model,
            language,
            file,
            hyp,
            decode_ms: Date.now() - t0 - (hyp ? EXTRA_SEGMENT_WAIT_MS : 0),
            audio_ms: (wav.samples.length / wav.sampleRate) * 1000,
          });
        }
      } finally {
        await stt.destroy();
      }
    }
  }
  return { device, created: new Date().toISOString(), rows };
}

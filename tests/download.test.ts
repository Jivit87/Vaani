import { describe, expect, it, vi } from 'vitest';
import { ensurePack, isPackComplete, type FsOps } from '../src/speech/download';
import { getPack, packBytes, PACKS } from '../src/speech/packs';

const pack = {
  id: 't',
  files: [
    { path: 'a.bin', url: 'http://x/a', size: 100 },
    { path: 'sub/b.bin', url: 'http://x/b', size: 50 },
    { path: 'sub/c.txt', url: 'http://x/c', size: 10 },
  ],
};

function memFs(
  initial: Record<string, number> = {},
  behave: (url: string, n: number) => 'ok' | 'fail' | 'short' = () => 'ok',
) {
  const files = new Map(Object.entries(initial));
  const calls: string[] = [];
  const attempts = new Map<string, number>();
  const sizes = new Map(pack.files.map((f) => [f.url, f.size]));
  const fs: FsOps = {
    sizeOf: async (p) => files.get(p) ?? null,
    download: vi.fn(async (url: string, dest: string) => {
      calls.push(url);
      const n = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, n);
      const mode = behave(url, n);
      if (mode === 'fail') throw new Error('network');
      files.set(dest, mode === 'short' ? 1 : sizes.get(url)!);
    }),
    remove: async (p) => void files.delete(p),
    ensureDirFor: async () => {},
  };
  return { fs, files, calls };
}
const noSleep = async () => {};

describe('ensurePack', () => {
  it('downloads everything into the pack dir and reports progress to 100%', async () => {
    const { fs, files } = memFs();
    const prog: number[] = [];
    await ensurePack(pack, '/m/t', fs, { sleep: noSleep, onProgress: (p) => prog.push(p.bytesDone) });
    expect([...files.keys()].sort()).toEqual(['/m/t/a.bin', '/m/t/sub/b.bin', '/m/t/sub/c.txt']);
    expect(prog.at(-1)).toBe(160);
    expect(prog[0]).toBe(0);
  });

  it('skips files that are already complete', async () => {
    const { fs, calls } = memFs({ '/m/t/a.bin': 100 });
    await ensurePack(pack, '/m/t', fs, { sleep: noSleep });
    expect(calls).toEqual(['http://x/b', 'http://x/c']);
  });

  it('re-downloads a file left with the wrong size by an interrupted download', async () => {
    const { fs, calls, files } = memFs({ '/m/t/a.bin': 37 });
    await ensurePack(pack, '/m/t', fs, { sleep: noSleep });
    expect(calls).toContain('http://x/a');
    expect(files.get('/m/t/a.bin')).toBe(100);
  });

  it('retries transient failures with backoff', async () => {
    const delays: number[] = [];
    const { fs } = memFs({}, (url, n) => (url === 'http://x/b' && n < 3 ? 'fail' : 'ok'));
    await ensurePack(pack, '/m/t', fs, { sleep: async (ms) => void delays.push(ms) });
    expect(delays).toEqual([500, 1000]);
  });

  it('treats a truncated download as a failure and retries it', async () => {
    const { fs, files } = memFs({}, (url, n) => (url === 'http://x/a' && n === 1 ? 'short' : 'ok'));
    await ensurePack(pack, '/m/t', fs, { sleep: noSleep });
    expect(files.get('/m/t/a.bin')).toBe(100);
  });

  it('fails after exhausting retries and leaves no partial file behind', async () => {
    const { fs, files } = memFs({}, (url) => (url === 'http://x/c' ? 'fail' : 'ok'));
    await expect(
      ensurePack(pack, '/m/t', fs, { sleep: noSleep, retries: 2, concurrency: 1 }),
    ).rejects.toThrow('network');
    expect(files.has('/m/t/sub/c.txt')).toBe(false);
  });

  it('respects the concurrency limit', async () => {
    let live = 0;
    let peak = 0;
    const { fs } = memFs();
    const inner = fs.download;
    fs.download = async (u, d, s) => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      await inner(u, d, s);
      live--;
    };
    await ensurePack(pack, '/m/t', fs, { sleep: noSleep, concurrency: 2 });
    expect(peak).toBe(2);
  });

  it('stops when aborted', async () => {
    const ctl = new AbortController();
    ctl.abort();
    const { fs } = memFs();
    await expect(ensurePack(pack, '/m/t', fs, { signal: ctl.signal, sleep: noSleep })).rejects.toThrow(
      'aborted',
    );
  });
});

describe('isPackComplete', () => {
  it('is true only when every file has the exact size', async () => {
    const { fs } = memFs({ '/m/t/a.bin': 100, '/m/t/sub/b.bin': 50, '/m/t/sub/c.txt': 10 });
    expect(await isPackComplete(pack, '/m/t', fs)).toBe(true);
    const bad = memFs({ '/m/t/a.bin': 100, '/m/t/sub/b.bin': 49, '/m/t/sub/c.txt': 10 });
    expect(await isPackComplete(pack, '/m/t', bad.fs)).toBe(false);
  });
});

describe('generated manifest', () => {
  it('has the files and names nitro-voice expects', () => {
    const names = (id: Parameters<typeof getPack>[0]) => getPack(id).files.map((f) => f.path);
    expect(names('whisper-small-int8')).toEqual(['encoder.onnx', 'decoder.onnx', 'tokens.txt']);
    expect(names('kokoro-int8-multi-lang-v1_0')).toEqual(
      expect.arrayContaining(['model.onnx', 'voices.bin', 'tokens.txt']),
    );
    expect(names('kokoro-int8-multi-lang-v1_0').some((p) => p.startsWith('espeak-ng-data/'))).toBe(true);
    expect(names('piper-hi-pratham-medium')).toEqual(expect.arrayContaining(['model.onnx', 'tokens.txt']));
  });
  it('has https URLs, positive sizes and unique destination paths', () => {
    for (const p of PACKS) {
      expect(new Set(p.files.map((f) => f.path)).size).toBe(p.files.length);
      for (const f of p.files) {
        expect(f.url.startsWith('https://')).toBe(true);
        expect(f.size).toBeGreaterThan(0);
      }
    }
    expect(packBytes(getPack('whisper-small-int8'))).toBeGreaterThan(300e6);
  });
});

describe('manifest URLs', () => {
  it('are valid, fully percent-encoded URLs (espeak data has names like "!v/Mr serious")', () => {
    for (const p of PACKS)
      for (const f of p.files) {
        expect(f.url).not.toMatch(/[ !'()*]/);
        expect(() => new URL(f.url)).not.toThrow();
      }
  });
});

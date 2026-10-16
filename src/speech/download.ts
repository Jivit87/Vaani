import type { ModelPack, PackFile } from './packs';

/** Filesystem + network primitives, injected so the policy below is unit-testable. */
export interface FsOps {
  /** File size in bytes, or null if the file does not exist. */
  sizeOf(path: string): Promise<number | null>;
  download(url: string, dest: string, signal?: AbortSignal): Promise<void>;
  remove(path: string): Promise<void>;
  ensureDirFor(path: string): Promise<void>;
}

export interface DownloadProgress {
  bytesDone: number;
  bytesTotal: number;
  filesDone: number;
  filesTotal: number;
}

export interface EnsureOptions {
  concurrency?: number;
  retries?: number;
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Makes sure every file of a pack is on disk with exactly the expected size.
 * A file whose size is wrong (e.g. a download killed halfway) is re-fetched,
 * which is also the resume mechanism: complete files are never downloaded twice.
 */
export async function ensurePack(
  pack: ModelPack,
  dir: string,
  fs: FsOps,
  opts: EnsureOptions = {},
): Promise<void> {
  const { concurrency = 6, retries = 3, sleep = defaultSleep, signal } = opts;
  const total = pack.files.reduce((n, f) => n + f.size, 0);
  let bytesDone = 0;
  let filesDone = 0;
  const report = () =>
    opts.onProgress?.({ bytesDone, bytesTotal: total, filesDone, filesTotal: pack.files.length });

  const fetchOne = async (f: PackFile) => {
    const dest = `${dir}/${f.path}`;
    if ((await fs.sizeOf(dest)) !== f.size) {
      await fs.ensureDirFor(dest);
      let lastErr: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (signal?.aborted) throw new Error('download aborted');
        try {
          await fs.download(f.url, dest, signal);
          const got = await fs.sizeOf(dest);
          if (got === f.size) {
            lastErr = undefined;
            break;
          }
          await fs.remove(dest);
          lastErr = new Error(`size mismatch for ${f.path}: expected ${f.size}, got ${got}`);
        } catch (e) {
          lastErr = e;
          await fs.remove(dest).catch(() => undefined);
        }
        if (attempt < retries) await sleep(500 * 2 ** attempt);
      }
      if (lastErr) throw lastErr;
    }
    bytesDone += f.size;
    filesDone++;
    report();
  };

  report();
  const queue = [...pack.files];
  let failure: unknown;
  const worker = async () => {
    while (queue.length && failure === undefined) {
      const f = queue.shift()!;
      try {
        await fetchOne(f);
      } catch (e) {
        failure ??= e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, pack.files.length) }, worker));
  if (failure !== undefined) throw failure;
}

/** True if every file of the pack is already present at the right size. */
export async function isPackComplete(pack: ModelPack, dir: string, fs: FsOps): Promise<boolean> {
  for (const f of pack.files) if ((await fs.sizeOf(`${dir}/${f.path}`)) !== f.size) return false;
  return true;
}

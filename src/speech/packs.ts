import manifest from './manifest.generated.json';

export interface PackFile {
  /** Destination path relative to the pack directory (the name nitro-voice expects). */
  path: string;
  url: string;
  size: number;
}
export interface ModelPack {
  id: string;
  files: PackFile[];
}

export type PackId = 'whisper-small-int8' | 'piper-hi-pratham-medium' | 'piper-en-amy-medium' | 'silero-vad';

export const PACKS = manifest.packs as ModelPack[];

export function getPack(id: PackId): ModelPack {
  const p = PACKS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown model pack: ${id}`);
  return p;
}

export const packBytes = (p: ModelPack) => p.files.reduce((n, f) => n + f.size, 0);

// everything the app needs on the phone: speech recognition, voice activity detection and the two voices
export const REQUIRED_PACKS: PackId[] = [
  'silero-vad',
  'whisper-small-int8',
  'piper-hi-pratham-medium',
  'piper-en-amy-medium',
];

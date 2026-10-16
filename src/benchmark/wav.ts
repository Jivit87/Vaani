export interface Wav {
  sampleRate: number;
  /** Mono float samples in [-1, 1]. */
  samples: Float32Array;
}

/** Parses a RIFF/WAVE file (PCM 16-bit, or 32-bit float). Multi-channel audio is averaged to mono. */
export function parseWav(bytes: Uint8Array): Wav {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) =>
    String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (bytes.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE')
    throw new Error('not a RIFF/WAVE file');

  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  let dataStart = -1;
  let dataLen = 0;
  for (let o = 12; o + 8 <= bytes.byteLength;) {
    const id = tag(o);
    const size = dv.getUint32(o + 4, true);
    if (id === 'fmt ') {
      fmt = {
        format: dv.getUint16(o + 8, true),
        channels: dv.getUint16(o + 10, true),
        rate: dv.getUint32(o + 12, true),
        bits: dv.getUint16(o + 22, true),
      };
    } else if (id === 'data') {
      dataStart = o + 8;
      dataLen = Math.min(size, bytes.byteLength - dataStart); // tolerate truncated/streamed files
      break;
    }
    o += 8 + size + (size % 2); // chunks are word-aligned
  }
  if (!fmt) throw new Error('WAV has no fmt chunk');
  if (dataStart < 0) throw new Error('WAV has no data chunk');

  const isInt16 = fmt.format === 1 && fmt.bits === 16;
  const isFloat32 = fmt.format === 3 && fmt.bits === 32;
  if (!isInt16 && !isFloat32)
    throw new Error(`unsupported WAV format ${fmt.format}/${fmt.bits}-bit (use 16-bit PCM)`);

  const bytesPer = fmt.bits / 8;
  const frames = Math.floor(dataLen / (bytesPer * fmt.channels));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const p = dataStart + (i * fmt.channels + c) * bytesPer;
      sum += isInt16 ? dv.getInt16(p, true) / 32768 : dv.getFloat32(p, true);
    }
    out[i] = sum / fmt.channels;
  }
  return { sampleRate: fmt.rate, samples: out };
}

/** Minimal 16-bit mono PCM encoder; used by tests and by tooling that needs fixtures. */
export function encodeWav16(samples: Float32Array, sampleRate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const dv = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF');
  dv.setUint32(4, 36 + samples.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  w(36, 'data');
  dv.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => dv.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, s)) * 32767), true));
  return new Uint8Array(buf);
}

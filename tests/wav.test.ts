import { describe, expect, it } from 'vitest';
import { realTimeFactor } from '../src/benchmark/results';
import { encodeWav16, parseWav } from '../src/benchmark/wav';

describe('wav', () => {
  it('round-trips 16-bit mono', () => {
    const src = Float32Array.from([0, 0.5, -0.5, 1, -1]);
    const wav = parseWav(encodeWav16(src, 16000));
    expect(wav.sampleRate).toBe(16000);
    expect(wav.samples).toHaveLength(5);
    src.forEach((v, i) => expect(wav.samples[i]).toBeCloseTo(v, 3));
  });

  it('averages stereo to mono and skips unknown chunks', () => {
    // build: RIFF, LIST chunk (odd size so it needs padding), fmt (stereo), data
    const list = new Uint8Array([...'LIST'].map((c) => c.charCodeAt(0)).concat([3, 0, 0, 0, 1, 2, 3, 0]));
    const fmt = new DataView(new ArrayBuffer(24));
    [...'fmt '].forEach((c, i) => fmt.setUint8(i, c.charCodeAt(0)));
    fmt.setUint32(4, 16, true);
    fmt.setUint16(8, 1, true);
    fmt.setUint16(10, 2, true);
    fmt.setUint32(12, 8000, true);
    fmt.setUint32(16, 32000, true);
    fmt.setUint16(20, 4, true);
    fmt.setUint16(22, 16, true);
    const data = new DataView(new ArrayBuffer(8 + 8));
    [...'data'].forEach((c, i) => data.setUint8(i, c.charCodeAt(0)));
    data.setUint32(4, 8, true);
    [16384, -16384, 32767, 0].forEach((v, i) => data.setInt16(8 + i * 2, v, true));
    const head = new Uint8Array(12);
    [...'RIFF'].forEach((c, i) => (head[i] = c.charCodeAt(0)));
    [...'WAVE'].forEach((c, i) => (head[8 + i] = c.charCodeAt(0)));
    const bytes = new Uint8Array([
      ...head,
      ...list,
      ...new Uint8Array(fmt.buffer),
      ...new Uint8Array(data.buffer),
    ]);
    const wav = parseWav(bytes);
    expect(wav.sampleRate).toBe(8000);
    expect(wav.samples).toHaveLength(2);
    expect(wav.samples[0]).toBeCloseTo(0, 3); // (0.5 + -0.5) / 2
    expect(wav.samples[1]).toBeCloseTo(0.5, 2); // (1 + 0) / 2
  });

  it('rejects non-WAV input and unsupported formats', () => {
    expect(() => parseWav(new Uint8Array(100))).toThrow('not a RIFF/WAVE');
    const w = encodeWav16(new Float32Array(4), 16000);
    new DataView(w.buffer).setUint16(34, 8, true); // 8-bit
    expect(() => parseWav(w)).toThrow('unsupported WAV format');
  });

  it('tolerates a truncated data chunk', () => {
    const w = encodeWav16(new Float32Array(10), 16000).slice(0, 44 + 7); // cut mid-sample
    expect(parseWav(w).samples).toHaveLength(3);
  });
});

describe('realTimeFactor', () => {
  it('is decode time over audio time', () => {
    expect(realTimeFactor({ decode_ms: 600, audio_ms: 3000 })).toBeCloseTo(0.2);
    expect(realTimeFactor({ decode_ms: 600, audio_ms: 0 })).toBe(0);
  });
});

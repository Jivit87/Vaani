/** Kokoro v1.0 voice ids, read from the model's own metadata (id2speaker). */
export const KOKORO_VOICES = { af_heart: 3, hf_alpha: 31, hf_beta: 32, hm_omega: 33, hm_psi: 34 } as const;
export type KokoroVoice = keyof typeof KOKORO_VOICES;

export const isKokoroVoice = (v: string): v is KokoroVoice => v in KOKORO_VOICES;

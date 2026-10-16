import type { Lang } from '../agent/types';

/** Speech-to-text with built-in endpointing: one transcript per utterance. */
export interface SttEngine {
  /** Starts the mic and VAD-gated recognition; resolves once listening. */
  listen(onTranscript: (text: string) => void): Promise<void>;
  /** Half-duplex: stop capturing while the agent speaks so it never hears itself. */
  pauseMic(): void;
  resumeMic(): Promise<void>;
  destroy(): Promise<void>;
}

export interface SpokenInfo {
  /** ms from speak() call to the first synthesized audio being available. */
  firstChunkMs: number;
  audioMs: number;
}

/** Text-to-speech that also plays the audio it synthesizes. */
export interface TtsEngine {
  sampleRate: number;
  /** Resolves when the sentence has been synthesized and handed to the audio output. */
  speak(text: string): Promise<SpokenInfo>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
}

export type SttLanguage = 'en' | 'hi';

export interface SpeechFactory {
  createStt(language: SttLanguage): Promise<SttEngine>;
  createTts(): Promise<TtsEngine>;
}

export const FILLER_TEXT: Record<Lang, string> = {
  en: 'One second, let me check.',
  hi: 'एक second, मैं check करती हूँ।',
};

export const OFFLINE_TEXT: Record<Lang, string> = {
  en: "I can't reach the internet right now, but I can still hear you.",
  hi: 'अभी internet नहीं है, पर मैं सुन सकती हूँ।',
};

export const RATE_LIMIT_TEXT: Record<Lang, string> = {
  en: "I've used up my free thinking quota for a bit. Please try again in a few minutes.",
  hi: 'मेरा free कोटा अभी ख़त्म हो गया है। कुछ मिनट बाद फिर कोशिश कीजिए।',
};

export const ERROR_TEXT: Record<Lang, string> = {
  en: 'Sorry, something went wrong. Please try again.',
  hi: 'माफ़ कीजिए, कुछ गड़बड़ हो गई। फिर से कोशिश कीजिए।',
};

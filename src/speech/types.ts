// speech-to-text with built-in endpointing, one transcript per utterance
export interface SttEngine {
  // starts the mic and VAD-gated recognition, resolves once it's listening
  listen(onTranscript: (text: string) => void): Promise<void>;
  // half-duplex: stop capturing while the agent speaks so it doesn't hear itself
  pauseMic(): void;
  resumeMic(): Promise<void>;
  destroy(): Promise<void>;
}

export interface SpokenInfo {
  // ms from the speak() call until the first audio is ready
  firstChunkMs: number;
  audioMs: number;
}

// text-to-speech that also plays what it synthesizes
export interface TtsEngine {
  sampleRate: number;
  // resolves when the sentence is synthesized and handed to the audio output
  speak(text: string): Promise<SpokenInfo>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
}

export interface TtsOptions {
  // native directory of the voice pack
  dir: string;
  type: 'kokoro' | 'vits';
  // kokoro speaker id (31 = hf_alpha). piper voices are single speaker, so 0
  speakerId: number;
  speed: number;
}

export interface SpeechFactory {
  // whisper detects english or hindi from the audio itself
  createStt(): Promise<SttEngine>;
  createTts(options: TtsOptions): Promise<TtsEngine>;
}

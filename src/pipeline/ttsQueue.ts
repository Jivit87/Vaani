import { normalizeForTts } from '../tts/normalize';
import type { TtsEngine } from '../speech/types';

export interface QueueEvents {
  /** Fires once per turn when the first sentence's audio exists (end of the perceived wait). */
  onFirstAudio?: (firstChunkMs: number) => void;
  onError?: (e: unknown) => void;
}

/**
 * Speaks sentences strictly one after another. nitro-voice synthesizes a whole
 * sentence per call, so sentence N+1 starts generating as soon as N has been
 * handed to the audio output, while N's tail is still playing.
 */
export class TtsQueue {
  private tail: Promise<void> = Promise.resolve();
  private epoch = 0; // bumped by cancel() so queued items from an old turn are dropped
  private firstAudioReported = false;

  constructor(
    private readonly tts: TtsEngine,
    private readonly events: QueueEvents = {},
  ) {}

  /** Call at the start of each turn. */
  beginTurn() {
    this.firstAudioReported = false;
  }

  say(sentence: string) {
    const text = normalizeForTts(sentence);
    if (!text || !/[\p{L}\p{N}]/u.test(text)) return;
    const mine = this.epoch;
    this.tail = this.tail.then(async () => {
      if (mine !== this.epoch) return;
      try {
        const info = await this.tts.speak(text);
        if (!this.firstAudioReported && mine === this.epoch) {
          this.firstAudioReported = true;
          this.events.onFirstAudio?.(info.firstChunkMs);
        }
      } catch (e) {
        this.events.onError?.(e); // one bad sentence must not wedge the queue
      }
    });
  }

  /** Resolves when everything queued so far has been spoken. */
  drain(): Promise<void> {
    return this.tail;
  }

  async cancel() {
    this.epoch++;
    await this.tts.stop().catch(() => undefined);
  }
}

import { normalizeForTts } from '../tts/normalize';
import type { TtsEngine } from '../speech/types';

/** Android AudioTrack buffer used by nitro-voice: at least one second of audio. */
const PLAYER_BUFFER_MS = 1000;
const HARDWARE_MARGIN_MS = 350;

export interface QueueEvents {
  /** Fires once per turn when the first sentence's audio exists (end of the perceived wait). */
  onFirstAudio?: (firstChunkMs: number) => void;
  onError?: (e: unknown) => void;
  /** True while the session language is Hinglish (enables Roman → Devanagari conversion). */
  hinglish?: () => boolean;
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
  private lastAudioMs = 0;

  constructor(
    private readonly tts: TtsEngine,
    private readonly events: QueueEvents = {},
  ) {}

  /** Call at the start of each turn. */
  beginTurn() {
    this.firstAudioReported = false;
  }

  say(sentence: string) {
    const text = normalizeForTts(sentence, { hinglish: this.events.hinglish?.() ?? false });
    if (!text || !/[\p{L}\p{N}]/u.test(text)) return;
    const mine = this.epoch;
    this.tail = this.tail.then(async () => {
      if (mine !== this.epoch) return;
      try {
        const info = await this.tts.speak(text);
        this.lastAudioMs = info.audioMs;
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

  /**
   * `speak()` resolves once audio is copied into the player's buffer (about one second), not when it has
   * finished playing. Wait out that tail plus a little hardware latency before the mic is reopened, or the
   * recogniser hears the end of our own sentence.
   */
  async playbackDone(): Promise<void> {
    await this.tail;
    const epoch = this.epoch;
    const tailMs = Math.min(this.lastAudioMs, PLAYER_BUFFER_MS) + HARDWARE_MARGIN_MS;
    this.lastAudioMs = 0;
    if (tailMs > HARDWARE_MARGIN_MS) await new Promise((r) => setTimeout(r, tailMs));
    if (epoch !== this.epoch) return; // cancelled while waiting: nothing is playing any more
  }

  async cancel() {
    this.epoch++;
    await this.tts.stop().catch(() => undefined);
  }
}

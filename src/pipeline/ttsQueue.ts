import { normalizeForTts, type NormalizeOptions } from '../tts/normalize';
import type { TtsEngine } from '../speech/types';

/** Android AudioTrack buffer used by nitro-voice: at least one second of audio. */
const PLAYER_BUFFER_MS = 1000;
const HARDWARE_MARGIN_MS = 350;
/**
 * Sentences handed to the engine at once. While sentence N plays, N+1 is already being synthesized, which
 * hides most of the synthesis time. nitro-voice (patched) writes audio strictly in call order, so two in
 * flight is safe; more would only add memory and CPU contention.
 */
const MAX_IN_FLIGHT = 2;

export interface QueueEvents {
  /** Fires once per turn when the first sentence's audio exists (end of the perceived wait). */
  onFirstAudio?: (firstChunkMs: number) => void;
  onError?: (e: unknown) => void;
  /** Text normalisation for the current session (Hinglish, Hindi-only voice). Read per sentence. */
  normalizeOptions?: () => NormalizeOptions;
}

interface Job {
  text: string;
  epoch: number;
  done: () => void;
}

/** Speaks sentences in order, keeping the next one synthesizing while the current one plays. */
export class TtsQueue {
  private jobs: Job[] = [];
  private inFlight = 0;
  private settled: Promise<void>[] = [];
  private epoch = 0; // bumped by cancel() so queued items from an old turn are dropped
  private firstAudioReported = false;
  private lastAudioMs = 0;

  constructor(
    private tts: TtsEngine,
    private readonly events: QueueEvents = {},
  ) {}

  /** Swap the voice (language change). Only call while nothing is being spoken. */
  setEngine(tts: TtsEngine) {
    this.tts = tts;
  }

  /** Call at the start of each turn. */
  beginTurn() {
    this.firstAudioReported = false;
  }

  say(sentence: string) {
    const text = normalizeForTts(sentence, this.events.normalizeOptions?.() ?? {});
    if (!text || !/[\p{L}\p{N}]/u.test(text)) return;
    this.settled.push(
      new Promise<void>((done) => {
        this.jobs.push({ text, epoch: this.epoch, done });
      }),
    );
    this.pump();
  }

  private pump() {
    while (this.inFlight < MAX_IN_FLIGHT && this.jobs.length) {
      const job = this.jobs.shift()!;
      if (job.epoch !== this.epoch) {
        job.done(); // cancelled before it was sent
        continue;
      }
      this.inFlight++;
      this.tts
        .speak(job.text)
        .then((info) => {
          // The engine resolves calls in the order they were made, so the first result is the first sentence.
          this.lastAudioMs = info.audioMs;
          if (!this.firstAudioReported && job.epoch === this.epoch) {
            this.firstAudioReported = true;
            this.events.onFirstAudio?.(info.firstChunkMs);
          }
        })
        .catch((e) => this.events.onError?.(e)) // one bad sentence must not wedge the queue
        .finally(() => {
          this.inFlight--;
          job.done();
          this.pump();
        });
    }
  }

  /** Resolves when everything queued so far has been handed to the player. */
  async drain(): Promise<void> {
    while (this.inFlight > 0 || this.jobs.length > 0) await Promise.all(this.settled.slice());
    this.settled = [];
  }

  /**
   * `speak()` resolves once audio is copied into the player's buffer (about one second), not when it has
   * finished playing. Wait out that tail plus a little hardware latency before the mic is reopened, or the
   * recogniser hears the end of our own sentence.
   */
  async playbackDone(): Promise<void> {
    await this.drain();
    const epoch = this.epoch;
    const tailMs = Math.min(this.lastAudioMs, PLAYER_BUFFER_MS) + HARDWARE_MARGIN_MS;
    this.lastAudioMs = 0;
    if (tailMs > HARDWARE_MARGIN_MS) await new Promise((r) => setTimeout(r, tailMs));
    if (epoch !== this.epoch) return; // cancelled while waiting: nothing is playing any more
  }

  async cancel() {
    this.epoch++;
    for (const job of this.jobs.splice(0)) job.done();
    await this.tts.stop().catch(() => undefined);
  }
}

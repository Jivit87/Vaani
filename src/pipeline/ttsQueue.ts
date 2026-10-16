import { normalizeForTts, type NormalizeOptions } from '../tts/normalize';
import type { TtsEngine } from '../speech/types';

// nitro-voice's AudioTrack buffer holds about a second of audio
const PLAYER_BUFFER_MS = 1000;
const HARDWARE_MARGIN_MS = 350;
// how many sentences we hand to the engine at once. 2 means the next one is already
// synthesizing while the current one plays. the native side writes audio in call order,
// so this is safe. more than 2 just eats cpu.
const MAX_IN_FLIGHT = 2;

export interface QueueEvents {
  // fires once per turn, when the first sentence is ready
  onFirstAudio?: (firstChunkMs: number) => void;
  onError?: (e: unknown) => void;
  // how to clean text up for this session (hinglish, hindi-only voice)
  normalizeOptions?: () => NormalizeOptions;
}

interface Job {
  text: string;
  epoch: number;
  done: () => void;
}

// speaks sentences in order, with the next one already synthesizing
export class TtsQueue {
  private jobs: Job[] = [];
  private inFlight = 0;
  private settled: Promise<void>[] = [];
  private epoch = 0; // bumped on cancel so leftovers from an old turn get dropped
  private firstAudioReported = false;
  private lastAudioMs = 0;

  constructor(
    private tts: TtsEngine,
    private readonly events: QueueEvents = {},
  ) {}

  // swap voices (language change). only when nothing is being spoken
  setEngine(tts: TtsEngine) {
    this.tts = tts;
  }

  // call at the start of every turn
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
        job.done(); // cancelled before we sent it
        continue;
      }
      this.inFlight++;
      this.tts
        .speak(job.text)
        .then((info) => {
          // the engine finishes calls in the order we made them, so the first result is sentence 1
          this.lastAudioMs = info.audioMs;
          if (!this.firstAudioReported && job.epoch === this.epoch) {
            this.firstAudioReported = true;
            this.events.onFirstAudio?.(info.firstChunkMs);
          }
        })
        .catch((e) => this.events.onError?.(e)) // one bad sentence shouldn't block the rest
        .finally(() => {
          this.inFlight--;
          job.done();
          this.pump();
        });
    }
  }

  // waits until everything queued has been handed to the player
  async drain(): Promise<void> {
    while (this.inFlight > 0 || this.jobs.length > 0) await Promise.all(this.settled.slice());
    this.settled = [];
  }

  // speak() resolves when the audio is copied into the player buffer (about a second),
  // not when it finishes playing. wait that out before reopening the mic, or the
  // recognizer hears the end of our own sentence.
  async playbackDone(): Promise<void> {
    await this.drain();
    const epoch = this.epoch;
    const tailMs = Math.min(this.lastAudioMs, PLAYER_BUFFER_MS) + HARDWARE_MARGIN_MS;
    this.lastAudioMs = 0;
    if (tailMs > HARDWARE_MARGIN_MS) await new Promise((r) => setTimeout(r, tailMs));
    if (epoch !== this.epoch) return; // cancelled while waiting, nothing's playing anymore
  }

  async cancel() {
    this.epoch++;
    for (const job of this.jobs.splice(0)) job.done();
    await this.tts.stop().catch(() => undefined);
  }
}

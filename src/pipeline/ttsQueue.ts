import { normalizeForTts } from '../tts/normalize';
import type { TtsEngine } from '../speech/types';

// nitro-voice's AudioTrack buffer holds about a second of audio
const PLAYER_BUFFER_MS = 1000;
const HARDWARE_MARGIN_MS = 350;
// how many sentences we hand to the engine at once. 2 means the next one is already
// synthesizing while the current one plays. the native side writes audio in call order,
// so this is safe. more than 2 just eats cpu.
const MAX_IN_FLIGHT = 2;

// the only voice is a hindi one: anything still in latin letters gets converted before it is spoken
const SPEECH_OPTIONS = { hinglish: true, devanagariLoanwords: true } as const;

const HAS_LETTERS = /[\p{L}\p{N}]/u;

export interface QueueEvents {
  // fires once per turn, when the first sentence is ready
  onFirstAudio?: (firstChunkMs: number) => void;
  onError?: (e: unknown) => void;
  // rewrites a sentence for the voice (see tts/phonetic.ts). it starts the moment a sentence arrives,
  // so the rewrite of sentence 2 runs while sentence 1 is still being spoken
  prepare?: (sentence: string) => Promise<string>;
}

interface Job {
  prepared: Promise<string>;
  epoch: number;
  // resolves when the previous sentence has been handed to the engine, so calls stay in order
  prevIssued: Promise<void>;
  issue: () => void;
  done: () => void;
}

// speaks sentences in order, with the next one already being prepared and synthesized
export class TtsQueue {
  private jobs: Job[] = [];
  private inFlight = 0;
  private settled: Promise<void>[] = [];
  private lastIssued: Promise<void> = Promise.resolve();
  private epoch = 0; // bumped on cancel so leftovers from an old turn get dropped
  private firstAudioReported = false;
  private lastAudioMs = 0;

  constructor(
    private readonly tts: TtsEngine,
    private readonly events: QueueEvents = {},
  ) {}

  // call at the start of every turn
  beginTurn() {
    this.firstAudioReported = false;
  }

  say(sentence: string) {
    if (!HAS_LETTERS.test(sentence)) return;
    const prepared = (this.events.prepare?.(sentence) ?? Promise.resolve(sentence)).catch(() => sentence);
    const prevIssued = this.lastIssued;
    let issue!: () => void;
    this.lastIssued = new Promise<void>((r) => (issue = r));
    this.settled.push(
      new Promise<void>((done) => {
        this.jobs.push({ prepared, epoch: this.epoch, prevIssued, issue, done });
      }),
    );
    this.pump();
  }

  private pump() {
    while (this.inFlight < MAX_IN_FLIGHT && this.jobs.length) {
      const job = this.jobs.shift()!;
      if (job.epoch !== this.epoch) {
        job.issue(); // cancelled before we started it
        job.done();
        continue;
      }
      this.inFlight++;
      void this.run(job);
    }
  }

  private async run(job: Job) {
    try {
      const raw = await job.prepared;
      await job.prevIssued;
      if (job.epoch !== this.epoch) return; // cancelled while it was being prepared
      const text = normalizeForTts(raw, SPEECH_OPTIONS);
      if (!HAS_LETTERS.test(text)) return;
      const speaking = this.tts.speak(text);
      job.issue(); // handed over in call order, the next sentence may go now
      const info = await speaking;
      // the engine finishes calls in the order we made them, so the first result is sentence 1
      this.lastAudioMs = info.audioMs;
      if (!this.firstAudioReported && job.epoch === this.epoch) {
        this.firstAudioReported = true;
        this.events.onFirstAudio?.(info.firstChunkMs);
      }
    } catch (e) {
      this.events.onError?.(e); // one bad sentence shouldn't block the rest
    } finally {
      job.issue();
      this.inFlight--;
      job.done();
      this.pump();
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
    for (const job of this.jobs.splice(0)) {
      job.issue();
      job.done();
    }
    await this.tts.stop().catch(() => undefined);
  }
}

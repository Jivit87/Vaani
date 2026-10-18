import type { Lang } from '../agent/types';
import { normalizeForTts } from '../tts/normalize';
import type { SpokenInfo, TtsEngine } from '../speech/types';

// nitro-voice's AudioTrack buffer holds about a second of audio
const PLAYER_BUFFER_MS = 1000;
const HARDWARE_MARGIN_MS = 350;
// how many sentences we hand to the engine at once. 2 means the next one is already
// synthesizing while the current one plays. the native side writes audio in call order,
// so this is safe. more than 2 just eats cpu.
const MAX_IN_FLIGHT = 2;

const HAS_LETTERS = /[\p{L}\p{N}]/u;
const DEVANAGARI = /[ऀ-ॿ]/;

// the hindi voice can only read devanagari, so anything it gets in latin letters is converted first
const HINDI_VOICE_OPTIONS = { hinglish: true, devanagariLoanwords: true } as const;

type VoiceName = 'en' | 'hi';

export interface Voices {
  en: TtsEngine;
  hi: TtsEngine;
}

export interface QueueEvents {
  // fires once per turn, when the first sentence is ready
  onFirstAudio?: (firstChunkMs: number) => void;
  onError?: (e: unknown) => void;
  // rewrites a sentence for the hindi voice (see tts/phonetic.ts). it starts the moment a sentence arrives,
  // so the rewrite of sentence 2 runs while sentence 1 is still being spoken
  prepare?: (sentence: string) => Promise<string>;
}

interface Job {
  voice: VoiceName;
  prepared: Promise<string>;
  epoch: number;
  // resolves when the previous sentence has been handed to its engine, so calls stay in order
  prevIssued: Promise<void>;
  issue: () => void;
  // when the previous sentence used the other voice, its audio must finish before this one starts
  prevVoice: VoiceName | undefined;
  prevSpoke: Promise<number>;
  spoke: (audioMs: number) => void;
  done: () => void;
}

// speaks sentences in order with two voices: amy for english, pratham for hindi. the next sentence is
// already being prepared and synthesized while the current one plays.
export class TtsQueue {
  private jobs: Job[] = [];
  private inFlight = 0;
  private settled: Promise<void>[] = [];
  private lastIssued: Promise<void> = Promise.resolve();
  private lastSpoke: Promise<number> = Promise.resolve(0);
  private lastVoiceQueued: VoiceName | undefined;
  private epoch = 0; // bumped on cancel so leftovers from an old turn get dropped
  private lang: Lang = 'en';
  private firstAudioReported = false;
  private lastAudioMs = 0;

  constructor(
    private readonly voices: Voices,
    private readonly events: QueueEvents = {},
  ) {}

  // call at the start of every turn, with the language of the reply
  beginTurn(lang: Lang) {
    this.lang = lang;
    this.firstAudioReported = false;
    this.lastVoiceQueued = undefined;
  }

  // a sentence with devanagari needs the hindi voice whatever the reply language is (a translation, a
  // hindi word in an english answer). otherwise the reply language picks the voice.
  private voiceFor(sentence: string): VoiceName {
    if (DEVANAGARI.test(sentence)) return 'hi';
    return this.lang === 'en' ? 'en' : 'hi';
  }

  say(sentence: string) {
    if (!HAS_LETTERS.test(sentence)) return;
    const voice = this.voiceFor(sentence);
    const prepared =
      voice === 'hi'
        ? (this.events.prepare?.(sentence) ?? Promise.resolve(sentence)).catch(() => sentence)
        : Promise.resolve(sentence);
    const prevIssued = this.lastIssued;
    const prevSpoke = this.lastSpoke;
    const prevVoice = this.lastVoiceQueued;
    this.lastVoiceQueued = voice;
    let issue!: () => void;
    let spoke!: (audioMs: number) => void;
    this.lastIssued = new Promise<void>((r) => (issue = r));
    this.lastSpoke = new Promise<number>((r) => (spoke = r));
    this.settled.push(
      new Promise<void>((done) => {
        this.jobs.push({
          voice,
          prepared,
          epoch: this.epoch,
          prevIssued,
          issue,
          prevVoice,
          prevSpoke,
          spoke,
          done,
        });
      }),
    );
    this.pump();
  }

  private pump() {
    while (this.inFlight < MAX_IN_FLIGHT && this.jobs.length) {
      const job = this.jobs.shift()!;
      if (job.epoch !== this.epoch) {
        job.issue(); // cancelled before we started it
        job.spoke(0);
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
      if (job.prevVoice && job.prevVoice !== job.voice) {
        // two voices play through two separate players, so let the last words of the first one finish
        const lastMs = await job.prevSpoke;
        await new Promise((r) => setTimeout(r, Math.min(lastMs, PLAYER_BUFFER_MS) + HARDWARE_MARGIN_MS));
        if (job.epoch !== this.epoch) return;
      }
      const text = job.voice === 'hi' ? normalizeForTts(raw, HINDI_VOICE_OPTIONS) : normalizeForTts(raw);
      if (!HAS_LETTERS.test(text)) return;
      // visible in adb logcat (ReactNativeJS): which voice read which sentence
      console.warn(`[tts] ${job.voice}: ${JSON.stringify(text.slice(0, 60))}`);
      const speaking: Promise<SpokenInfo> = this.voices[job.voice].speak(text);
      job.issue(); // handed over in call order, the next sentence may go now
      const info = await speaking;
      this.lastAudioMs = info.audioMs;
      job.spoke(info.audioMs);
      // the engine finishes calls in the order we made them, so the first result is sentence 1
      if (!this.firstAudioReported && job.epoch === this.epoch) {
        this.firstAudioReported = true;
        this.events.onFirstAudio?.(info.firstChunkMs);
      }
    } catch (e) {
      this.events.onError?.(e); // one bad sentence shouldn't block the rest
    } finally {
      job.issue();
      job.spoke(0);
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
      job.spoke(0);
      job.done();
    }
    await Promise.all([this.voices.en.stop(), this.voices.hi.stop()].map((p) => p.catch(() => undefined)));
  }
}

import { detectLang } from '../agent/lang';
import { LINES } from '../agent/lines';
import type { Memory } from '../agent/memory';
import { runTurn, type AgentDeps } from '../agent/runTurn';
import type { Lang, TraceEvent } from '../agent/types';
import { isRateLimit } from '../llm/client';
import type { SttEngine } from '../speech/types';
import type { TurnMetrics } from './metrics';
import { TtsQueue } from './ttsQueue';
import { isEcho, isNoiseTranscript } from './transcriptFilter';

export type AgentStatus = 'idle' | 'listening' | 'muted' | 'thinking' | 'acting' | 'speaking' | 'error';

export interface VoiceAgentEvents {
  onStatus(s: AgentStatus): void;
  onTranscript(text: string): void;
  onReply(text: string): void;
  // reply text for the screen, as it streams
  onShow?(text: string): void;
  // the app noticed you switched language, so the toggle can follow
  onLanguage?(lang: Lang): void;
  onTrace(e: TraceEvent): void;
  onMetrics(m: TurnMetrics): void;
}

export interface VoiceAgentDeps {
  stt: SttEngine;
  queue: TtsQueue;
  memory: Memory;
  // everything runTurn needs except the speaker, which this class supplies
  agent: Omit<AgentDeps, 'speaker' | 'onTrace'>;
  summarize?: () => Promise<void>;
  events: VoiceAgentEvents;
  now?: () => number;
}

// for this long after a reply, short transcripts made of its own words count as echo
const ECHO_WINDOW_MS = 8000;

const isNetworkError = (e: unknown) => {
  if (e instanceof TypeError) return true; // fetch throws this when there's no network
  const code = (e as { code?: unknown } | null)?.code;
  if (code === 'ECONNABORTED' || code === 'ENETUNREACH' || code === 'ENOTFOUND' || code === 'ECONNREFUSED')
    return true;
  return /network|fetch|timeout|Failed to connect|ENOTFOUND|ECONNREFUSED|ERR_NETWORK|Unable to resolve host/i.test(
    String((e as Error)?.message ?? e),
  );
};

// half-duplex loop: listen, mic off, think/act, speak, mic on.
// anything heard while a turn is running is dropped, not queued.
export class VoiceAgent {
  private status: AgentStatus = 'idle';
  private busy = false;
  private mode: 'agent' | 'transcribe' = 'agent';
  private muted = false;
  private lastSpoken = '';
  private lastSpokenAt = 0;
  private ctl: AbortController | null = null;
  private firstAudioMs: number | null = null;
  private ttsFirstChunkMs: number | null = null;

  constructor(private readonly d: VoiceAgentDeps) {}

  async start() {
    await this.d.stt.listen((t) => void this.handleTranscript(t));
    this.setStatus('listening');
  }

  async stop() {
    this.ctl?.abort();
    await this.d.queue.cancel();
    await this.d.stt.destroy();
    this.setStatus('idle');
  }

  // 'transcribe' just reports what was heard and never calls the LLM (offline STT test)
  setMode(mode: 'agent' | 'transcribe') {
    this.mode = mode;
  }

  // mic off: nothing is heard until unmuted. a turn already running finishes normally.
  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.busy) return; // the end of the turn applies it
    if (muted) {
      this.d.stt.pauseMic();
      this.setStatus('muted');
    } else {
      void this.d.stt.resumeMic().then(() => this.setStatus('listening'));
    }
  }

  // the toggle: takes effect from the next message, nothing has to be reloaded
  setLanguage(lang: Lang) {
    this.d.memory.setLang(lang);
  }

  // typed input, used by the text box and the tests
  submitText(text: string) {
    return this.handleTranscript(text, false);
  }

  // stop button: cancel the LLM stream and the speech, go back to listening
  async interrupt() {
    this.ctl?.abort();
    await this.d.queue.cancel();
  }

  // call once after building the TtsQueue
  onFirstAudio = (firstChunkMs: number) => {
    this.ttsFirstChunkMs = firstChunkMs;
    this.firstAudioMs = (this.d.now ?? Date.now)() - this.turnStart;
  };
  private turnStart = 0;

  private setStatus(s: AgentStatus) {
    this.status = s;
    this.d.events.onStatus(s);
  }

  // fromMic is false for typed text, which mute shouldn't block
  private async handleTranscript(raw: string, fromMic = true) {
    const text = raw.trim();
    if (this.muted && fromMic) return;
    // shows in adb logcat (ReactNativeJS): what the recognizer gave us and why a turn got skipped
    const recent = (this.d.now ?? Date.now)() - this.lastSpokenAt < ECHO_WINDOW_MS;
    const skip = this.busy
      ? 'busy'
      : isNoiseTranscript(text)
        ? 'noise'
        : fromMic && recent && isEcho(text, this.lastSpoken)
          ? 'echo'
          : null;
    console.warn(`[stt] ${skip ? `ignored (${skip})` : 'heard'}: ${JSON.stringify(text)}`);
    if (skip) return;
    if (this.mode === 'transcribe') {
      this.d.events.onTranscript(text);
      return;
    }
    this.busy = true;
    const now = this.d.now ?? Date.now;
    this.turnStart = now();
    this.firstAudioMs = null;
    this.ttsFirstChunkMs = null;
    this.ctl = new AbortController();
    // the reply language follows what the user just said. a short neutral message ("Pune") stays in the
    // language the toggle is on, and a clear switch moves the toggle
    const previous = this.d.memory.state.lang;
    const lang = detectLang(text, previous);
    this.d.memory.setLang(lang);
    if (lang !== previous) this.d.events.onLanguage?.(lang);
    let spokenAloud = '';

    this.d.stt.pauseMic(); // half-duplex: don't let the speaker feed the VAD
    this.d.events.onTranscript(text);
    this.setStatus('thinking');
    this.d.queue.beginTurn(lang);

    const metrics: TurnMetrics = {
      at: new Date().toISOString(),
      user: text,
      spoken: '',
      model: '',
      tools: '',
      llmSteps: 0,
      llmTtftMs: null,
      toolMs: 0,
      firstAudioMs: null,
      ttsFirstChunkMs: null,
      totalMs: 0,
    };

    try {
      const result = await runTurn(
        text,
        this.d.memory,
        {
          ...this.d.agent,
          speaker: {
            show: (t) => this.d.events.onShow?.(t),
            say: (s) => {
              this.setStatus('speaking');
              spokenAloud += `${s} `;
              this.d.queue.say(s);
            },
            playFiller: (l) => this.d.queue.say(LINES.filler[l].say),
          },
          onTrace: (e) => {
            this.setStatus('acting');
            this.d.events.onTrace(e);
          },
        },
        this.ctl.signal,
      );
      metrics.spoken = result.spoken;
      metrics.model = result.model.id;
      metrics.tools = result.toolsCalled.map((t) => t.name).join(';');
      metrics.llmSteps = result.timings.llmSteps;
      metrics.llmTtftMs = result.timings.llmTtftMs;
      metrics.toolMs = result.timings.toolMs;
      this.d.events.onReply(result.spoken);
    } catch (e) {
      if (!this.ctl.signal.aborted) {
        metrics.error = e instanceof Error ? e.message : String(e);
        const line = (isRateLimit(e) ? LINES.rateLimit : isNetworkError(e) ? LINES.offline : LINES.error)[
          lang
        ];
        this.d.events.onShow?.(line.show);
        this.d.queue.say(line.say);
        spokenAloud += line.say;
      }
    }

    await this.d.queue.drain();
    metrics.firstAudioMs = this.firstAudioMs;
    metrics.ttsFirstChunkMs = this.ttsFirstChunkMs;
    metrics.totalMs = now() - this.turnStart;
    this.d.events.onMetrics(metrics);
    this.lastSpoken = `${metrics.spoken} ${spokenAloud}`; // echo can come back as either text
    await this.d.queue.playbackDone();
    this.lastSpokenAt = (this.d.now ?? Date.now)();

    this.busy = false;
    this.ctl = null;
    if (this.muted) {
      this.setStatus('muted');
    } else {
      await this.d.stt.resumeMic().catch(() => this.setStatus('error'));
      if (this.status !== 'error') this.setStatus('listening');
    }
    void this.d.summarize?.();
  }
}

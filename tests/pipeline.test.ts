import { describe, expect, it, vi } from 'vitest';
import { Memory } from '../src/agent/memory';
import type { StepResult } from '../src/agent/types';
import type { LlmClient } from '../src/llm/client';
import { CSV_HEADER, percentile, summarize, toCsvRow, type TurnMetrics } from '../src/pipeline/metrics';
import { isEcho, isNoiseTranscript } from '../src/pipeline/transcriptFilter';
import { TtsQueue } from '../src/pipeline/ttsQueue';
import { VoiceAgent, type AgentStatus } from '../src/pipeline/voiceAgent';
import type { SttEngine, TtsEngine } from '../src/speech/types';

function fakeTts() {
  const spoken: string[] = [];
  const tts: TtsEngine = {
    sampleRate: 24000,
    speak: vi.fn(async (t: string) => {
      spoken.push(t);
      return { firstChunkMs: 120, audioMs: 1000 };
    }),
    stop: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
  };
  return { tts, spoken };
}

describe('TtsQueue', () => {
  it('speaks sentences in order, normalized, and reports first audio once per turn', async () => {
    const { tts, spoken } = fakeTts();
    const first = vi.fn();
    const q = new TtsQueue(tts, { onFirstAudio: first });
    q.beginTurn();
    q.say('अलार्म 7:30 बजे।');
    q.say('✅');
    q.say('डन।');
    await q.drain();
    expect(spoken).toEqual(['अलार्म साढ़े सात बजे।', 'डन।']);
    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith(120);
  });

  it('keeps going after a failing sentence', async () => {
    const { tts, spoken } = fakeTts();
    (tts.speak as any).mockImplementationOnce(async () => {
      throw new Error('synth failed');
    });
    const onError = vi.fn();
    const q = new TtsQueue(tts, { onError });
    q.say('पहला वाक्य यहाँ है।');
    q.say('दूसरा वाक्य यहाँ है।');
    await q.drain();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(spoken).toEqual(['दूसरा वाक्य यहाँ है।']);
  });

  it('cancel drops sentences not yet handed to the engine and stops it', async () => {
    const { tts, spoken } = fakeTts();
    const releases: (() => void)[] = [];
    (tts.speak as any).mockImplementation(
      (t: string) =>
        new Promise((r) => {
          spoken.push(t);
          releases.push(() => r({ firstChunkMs: 1, audioMs: 1 }));
        }),
    );
    const q = new TtsQueue(tts);
    q.say('अभी बज रहा है।');
    q.say('अगला बन रहा है।');
    q.say('इंजन तक नहीं पहुँचा।');
    await new Promise((r) => setTimeout(r, 0));
    expect(spoken).toEqual(['अभी बज रहा है।', 'अगला बन रहा है।']); // two in flight, third waits
    await q.cancel();
    releases.forEach((r) => r());
    await q.drain();
    expect(tts.stop).toHaveBeenCalled();
    expect(spoken).toHaveLength(2); // the third was dropped
  });

  it('keeps two sentences in flight so the next one synthesizes while the current plays', async () => {
    const { tts } = fakeTts();
    let live = 0;
    let peak = 0;
    const order: string[] = [];
    (tts.speak as any).mockImplementation(async (t: string) => {
      live++;
      peak = Math.max(peak, live);
      order.push(t);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return { firstChunkMs: 1, audioMs: 1 };
    });
    const q = new TtsQueue(tts);
    ['पहला वाक्य यहाँ है।', 'दूसरा वाक्य यहाँ है।', 'तीसरा वाक्य यहाँ है।', 'चौथा वाक्य यहाँ है।'].forEach(
      (x) => q.say(x),
    );
    await q.drain();
    expect(peak).toBe(2);
    expect(order).toEqual([
      'पहला वाक्य यहाँ है।',
      'दूसरा वाक्य यहाँ है।',
      'तीसरा वाक्य यहाँ है।',
      'चौथा वाक्य यहाँ है।',
    ]);
  });
});

describe('TtsQueue with a rewrite step', () => {
  it('rewrites every sentence before speaking it', async () => {
    const { tts, spoken } = fakeTts();
    const q = new TtsQueue(tts, { prepare: async (s) => (s === 'Hello.' ? 'हेलो।' : s) });
    q.say('Hello.');
    q.say('नमस्ते।');
    await q.drain();
    expect(spoken).toEqual(['हेलो।', 'नमस्ते।']);
  });

  it('keeps sentences in order even when a later rewrite finishes first', async () => {
    const { tts, spoken } = fakeTts();
    const delays: Record<string, number> = { 'एक।': 30, 'दो।': 1, 'तीन।': 10 };
    const q = new TtsQueue(tts, {
      prepare: (s) => new Promise((r) => setTimeout(() => r(s), delays[s])),
    });
    ['एक।', 'दो।', 'तीन।'].forEach((x) => q.say(x));
    await q.drain();
    expect(spoken).toEqual(['एक।', 'दो।', 'तीन।']);
  });

  it('falls back to the original sentence when the rewrite throws', async () => {
    const { tts, spoken } = fakeTts();
    const q = new TtsQueue(tts, {
      prepare: async () => {
        throw new Error('down');
      },
    });
    q.say('नमस्ते दोस्त।');
    await q.drain();
    expect(spoken).toEqual(['नमस्ते दोस्त।']);
  });

  it('drops a sentence whose rewrite was still running when the turn was cancelled', async () => {
    const { tts, spoken } = fakeTts();
    let release!: (s: string) => void;
    const q = new TtsQueue(tts, { prepare: () => new Promise<string>((r) => (release = r)) });
    q.say('Slow one.');
    await new Promise((r) => setTimeout(r, 0));
    await q.cancel();
    release('धीमा।');
    await q.drain();
    expect(spoken).toEqual([]);
  });
});

describe('isNoiseTranscript', () => {
  it.each([
    '',
    ' ',
    '.',
    'you',
    'Thank you.',
    'Thanks for watching!',
    'hmm',
    'र ो ो र ो',
    'ो ं',
    '(static)',
    '[BLANK_AUDIO]',
    '[Music]',
    '*sigh*',
    '(silence)',
    'Please subscribe!',
    'like and subscribe',
    'ने ने ने',
    'okay okay okay okay',
    'a b a b',
  ])('drops %j', (t) => expect(isNoiseTranscript(t)).toBe(true));
  it.each([
    'set an alarm',
    'कल का मौसम',
    'ok set it for seven',
    'हाँ',
    'ना',
    'turn on (the) light',
    'मुझे अलार्म चाहिए',
  ])('keeps %j', (t) => expect(isNoiseTranscript(t)).toBe(false));
});

describe('isEcho', () => {
  const said = 'The weather in Pune tomorrow will be overcast with a high of thirty four degrees Celsius.';
  it('catches the tail of our own sentence', () => {
    expect(isEcho('Celsius.', said)).toBe(true);
    expect(isEcho('degrees Celsius', said)).toBe(true);
  });
  it('lets real follow-ups through', () => {
    expect(isEcho('and the day after?', said)).toBe(false);
    expect(isEcho('What about Mumbai', said)).toBe(false);
  });
  it('ignores long transcripts and empty input', () => {
    expect(isEcho('the weather in Pune tomorrow will be overcast with a high', said)).toBe(false);
    expect(isEcho('', said)).toBe(false);
  });
});

describe('TtsQueue.playbackDone', () => {
  it('waits out the player buffer (capped at 1 s) plus margin after the last sentence', async () => {
    vi.useFakeTimers();
    const tts: TtsEngine = {
      sampleRate: 24000,
      speak: vi.fn(async () => ({ firstChunkMs: 10, audioMs: 4000 })),
      stop: vi.fn(async () => {}),
      destroy: vi.fn(async () => {}),
    };
    const q = new TtsQueue(tts);
    q.say('A long sentence that plays for several seconds.');
    let done = false;
    void q.playbackDone().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toBe(false); // 1 s buffer + 350 ms margin not yet elapsed
    await vi.advanceTimersByTimeAsync(400);
    expect(done).toBe(true);
    vi.useRealTimers();
  });
});

describe('metrics', () => {
  const row = (over: Partial<TurnMetrics>): TurnMetrics => ({
    at: 't',
    user: 'u',
    spoken: 's',
    model: 'm',
    tools: '',
    llmSteps: 1,
    llmTtftMs: 300,
    toolMs: 0,
    firstAudioMs: 1000,
    ttsFirstChunkMs: 200,
    totalMs: 2000,
    ...over,
  });
  it('escapes CSV fields', () => {
    expect(toCsvRow(row({ user: 'a, "b"\nc' }))).toContain('"a, ""b""\nc"');
    expect(CSV_HEADER.split(',')).toHaveLength(12);
  });
  it('computes percentiles', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([], 50)).toBeNull();
  });
  it('summarizes direct and tool turns separately and skips errors', () => {
    const s = summarize([
      row({ firstAudioMs: 1000 }),
      row({ firstAudioMs: 2000 }),
      row({ tools: 'set_alarm', firstAudioMs: 3000 }),
      row({ error: 'boom', firstAudioMs: 99999 }),
    ]);
    expect(s.direct).toEqual({ n: 2, median: 1000, p90: 2000 });
    expect(s.tool).toEqual({ n: 1, median: 3000, p90: 3000 });
  });
});

describe('VoiceAgent', () => {
  function setup(llmImpl: LlmClient) {
    const { tts, spoken } = fakeTts();
    const events = {
      statuses: [] as AgentStatus[],
      replies: [] as string[],
      shown: [] as string[],
      metrics: [] as TurnMetrics[],
    };
    const stt: SttEngine = {
      listen: vi.fn(async () => {}),
      pauseMic: vi.fn(),
      resumeMic: vi.fn(async () => {}),
      destroy: vi.fn(async () => {}),
    };
    const memory = new Memory();
    let agent!: VoiceAgent;
    const queue = new TtsQueue(tts, { onFirstAudio: (ms) => agent.onFirstAudio(ms) });
    agent = new VoiceAgent({
      stt,
      queue,
      memory,
      agent: {
        llm: llmImpl,
        models: { primary: { id: 'p', maxTokens: 50 } },
        runTool: async () => ({ ok: true }),
      },
      events: {
        onStatus: (s) => events.statuses.push(s),
        onTranscript: () => {},
        onReply: (r) => events.replies.push(r),
        onShow: (t) => events.shown.push(t),
        onTrace: () => {},
        onMetrics: (m) => events.metrics.push(m),
      },
    });
    return { agent, stt, spoken, events, memory };
  }
  const say =
    (text: string): LlmClient =>
    async (req) => {
      req.onText(text);
      return { text, toolCalls: [], ttftMs: 5, totalMs: 9 } as StepResult;
    };

  it('pauses the mic during a turn, speaks the reply, resumes and records metrics', async () => {
    const h = setup(say('हेलो देयर फ्रेंड।'));
    await h.agent.start();
    await h.agent.submitText('hello');
    expect(h.stt.pauseMic).toHaveBeenCalledTimes(1);
    expect(h.stt.resumeMic).toHaveBeenCalledTimes(1);
    expect(h.spoken).toEqual(['हेलो देयर फ्रेंड।']);
    expect(h.events.statuses.at(-1)).toBe('listening');
    expect(h.events.metrics[0]).toMatchObject({ model: 'p', llmTtftMs: 5, ttsFirstChunkMs: 120, tools: '' });
    expect(h.events.metrics[0].firstAudioMs).not.toBeNull();
  });

  it('ignores noise transcripts and transcripts that arrive mid-turn', async () => {
    let release!: () => void;
    const slow: LlmClient = async (req) => {
      await new Promise<void>((r) => (release = r));
      req.onText('Finished answer here.');
      return { text: 'x', toolCalls: [], ttftMs: 1, totalMs: 1 };
    };
    const h = setup(slow);
    await h.agent.start();
    await h.agent.submitText('you'); // hallucination, ignored
    expect(h.stt.pauseMic).not.toHaveBeenCalled();
    const first = h.agent.submitText('what time is it');
    await h.agent.submitText('second question while busy'); // dropped
    release();
    await first;
    expect(h.stt.pauseMic).toHaveBeenCalledTimes(1);
    expect(h.events.metrics).toHaveLength(1);
  });

  it('speaks an offline line, in the language of the question, when the network fails', async () => {
    const h = setup(async () => {
      throw new TypeError('Network request failed');
    });
    await h.agent.start();
    await h.agent.submitText('mujhe kal ka weather batao');
    expect(h.spoken[0]).toContain('इंटरनेट');
    expect(h.spoken[0]).toMatch(/[ऀ-ॿ]/);
    expect(h.events.metrics[0].error).toContain('Network');
    expect(h.stt.resumeMic).toHaveBeenCalled(); // never leaves the mic off
  });

  it('transcribe-only mode reports the transcript without calling the LLM or the mic', async () => {
    const llm = vi.fn();
    const h = setup(llm as unknown as LlmClient);
    const heard: string[] = [];
    (h.agent as any).d.events.onTranscript = (t: string) => heard.push(t);
    h.agent.setMode('transcribe');
    await h.agent.start();
    await h.agent.submitText('set an alarm please');
    expect(heard).toEqual(['set an alarm please']);
    expect(llm).not.toHaveBeenCalled();
    expect(h.stt.pauseMic).not.toHaveBeenCalled();
  });

  it('answers each message in its own language: an english question after a hinglish one gets english', async () => {
    const h = setup(async () => {
      throw new Error('HTTP 500');
    });
    await h.agent.start();
    await h.agent.submitText('mujhe kal subah alarm laga do');
    expect(h.memory.state.lang).toBe('hi');
    expect(h.events.shown.join('')).toContain('कुछ गड़बड़');
    h.events.shown.length = 0;
    await h.agent.submitText('what is the weather like');
    expect(h.memory.state.lang).toBe('en');
    expect(h.events.shown.join('')).toContain('went wrong');
  });

  it('mute stops hearing, pauses the mic, and survives a turn in flight', async () => {
    const h = setup(say('हेलो देयर फ्रेंड।'));
    await h.agent.start();
    h.agent.setMuted(true);
    expect(h.stt.pauseMic).toHaveBeenCalledTimes(1);
    expect(h.events.statuses.at(-1)).toBe('muted');
    await (h.agent as any).handleTranscript('anyone there'); // heard by the mic while muted: ignored
    expect(h.events.metrics).toHaveLength(0);
    await h.agent.submitText('typed while muted'); // typing still works
    expect(h.events.metrics).toHaveLength(1);
    expect(h.events.statuses.at(-1)).toBe('muted');
    h.agent.setMuted(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(h.stt.resumeMic).toHaveBeenCalledTimes(1);
    expect(h.events.statuses.at(-1)).toBe('listening');
    await h.agent.submitText('hello');
    expect(h.events.metrics).toHaveLength(2);
  });

  it('tells the user plainly when the free quota is used up', async () => {
    const { LlmHttpError } = await import('../src/llm/client');
    const h = setup(async () => {
      throw new LlmHttpError(429, 'Rate limit reached');
    });
    await h.agent.start();
    await h.agent.submitText('hello there');
    expect(h.events.shown.join('')).toContain('quota');
  });

  it('speaks a generic error line for other failures', async () => {
    const h = setup(async () => {
      throw new Error('HTTP 500');
    });
    await h.agent.start();
    await h.agent.submitText('hello there');
    expect(h.events.shown.join('')).toContain('went wrong');
  });
});

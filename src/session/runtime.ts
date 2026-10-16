import { fetch as expoFetch } from 'expo/fetch';
import { Memory } from '../agent/memory';
import { createSummarizer } from '../agent/summarizer';
import { createToolRunner } from '../agent/toolRunner';
import type { Lang } from '../agent/types';
import { config } from '../config';
import { createLlmClient } from '../llm/client';
import { TtsQueue } from '../pipeline/ttsQueue';
import { VoiceAgent, type VoiceAgentEvents } from '../pipeline/voiceAgent';
import { getPack, type PackId } from '../speech/packs';
import { createNitroSpeech } from '../speech/nitro';
import { modelsRoot, toNativePath } from '../speech/fsOps';
import type { SttEngine, TtsEngine } from '../speech/types';
import { createDeviceBackends } from '../tools';

export const packDir = (id: PackId) => `${modelsRoot()}/${id}`;

const speechPaths = () => {
  const piper = config.ttsEngine === 'piper-hi';
  return {
    whisperDir: toNativePath(packDir('whisper-small-int8')),
    vadPath: toNativePath(`${packDir('silero-vad')}/silero_vad.onnx`),
    ttsDir: toNativePath(packDir(piper ? 'piper-hi-pratham-medium' : 'kokoro-int8-multi-lang-v1_0')),
    ttsType: piper ? ('vits' as const) : ('kokoro' as const),
    speakerId: config.ttsSpeakerId,
    speed: config.ttsSpeed,
  };
};

export const requiredPackIds = (): PackId[] => [
  'silero-vad',
  'whisper-small-int8',
  config.ttsEngine === 'piper-hi' ? 'piper-hi-pratham-medium' : 'kokoro-int8-multi-lang-v1_0',
];
export const requiredPacks = () => requiredPackIds().map(getPack);

export interface Runtime {
  agent: VoiceAgent;
  memory: Memory;
  tts: TtsEngine;
  /** Re-creates the Whisper engine: its language is fixed when the engine is created. */
  setLanguage(lang: Lang): Promise<void>;
  /** Speaks a line without the LLM (used by the offline test). */
  speakDirect(text: string): Promise<void>;
  /** Subscribe to every accepted transcript; returns an unsubscribe function. */
  onHeard(cb: (text: string) => void): () => void;
  destroy(): Promise<void>;
}

export async function createRuntime(lang: Lang, uiEvents: VoiceAgentEvents): Promise<Runtime> {
  if (!config.llmApiKey) throw new Error(`No API key for provider '${config.provider}' (see .env.example)`);

  const heardListeners = new Set<(t: string) => void>();
  const events: VoiceAgentEvents = {
    ...uiEvents,
    onTranscript: (t) => {
      uiEvents.onTranscript(t);
      heardListeners.forEach((cb) => cb(t));
    },
  };

  const speech = createNitroSpeech(speechPaths());
  const tts = await speech.createTts();
  let stt: SttEngine = await speech.createStt(lang);

  const memory = new Memory(() => new Date(), undefined, lang);
  const llm = createLlmClient({
    fetch: expoFetch as unknown as typeof fetch,
    apiKey: config.llmApiKey,
    baseUrl: config.baseUrl,
    // Measured median TTFT on the shared NVIDIA endpoint is ~3 s with a long tail (eval/results.md).
    firstTokenTimeoutMs: 15_000,
  });
  const summarizer = createSummarizer(llm, config.backup);

  // The agent needs the queue and the queue reports back to the agent, so wire them lazily.
  let agent: VoiceAgent;
  const queue = new TtsQueue(tts, { onFirstAudio: (ms) => agent.onFirstAudio(ms) });

  const build = (engine: SttEngine) =>
    new VoiceAgent({
      stt: engine,
      queue,
      memory,
      agent: {
        llm,
        models: { primary: config.primary, backup: config.backup },
        runTool: createToolRunner(createDeviceBackends()),
      },
      summarize: () => memory.summarizeIfIdle(summarizer),
      events,
    });
  agent = build(stt);

  // Warm up so the first real turn does not pay model-load or first-inference cost.
  await tts.speak('.').catch(() => undefined);

  return {
    get agent() {
      return agent;
    },
    memory,
    tts,
    async setLanguage(next) {
      await agent.stop();
      stt = await speech.createStt(next);
      memory.setLang(next);
      agent = build(stt);
      await agent.start();
    },
    async speakDirect(text) {
      await tts.speak(text);
    },
    onHeard(cb) {
      heardListeners.add(cb);
      return () => void heardListeners.delete(cb);
    },
    async destroy() {
      await agent.stop();
      await tts.destroy();
    },
  } as Runtime;
}

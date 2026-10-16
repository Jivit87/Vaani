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
import { requiredPackIdsFor, ttsSpecFor, type TtsEngineChoice } from '../speech/ttsSelect';
import { createNitroSpeech } from '../speech/nitro';
import { modelsRoot, toNativePath } from '../speech/fsOps';
import type { SttEngine, TtsEngine, TtsOptions } from '../speech/types';
import { createDeviceBackends } from '../tools';

export const packDir = (id: PackId) => `${modelsRoot()}/${id}`;

const speechPaths = () => ({
  whisperDir: toNativePath(packDir('whisper-small-int8')),
  vadPath: toNativePath(`${packDir('silero-vad')}/silero_vad.onnx`),
});

// voice for a session language: piper english / piper hindi, or kokoro for both
const voiceFor = (lang: Lang, engine: TtsEngineChoice) => {
  const spec = ttsSpecFor(lang, engine, config.ttsSpeakerId);
  const options: TtsOptions = {
    dir: toNativePath(packDir(spec.packId)),
    type: spec.type,
    speakerId: spec.speakerId,
    speed: config.ttsSpeed,
  };
  return { spec, options };
};

export const requiredPackIds = (): PackId[] => requiredPackIdsFor(config.ttsEngine);
export const requiredPacks = () => requiredPackIds().map(getPack);

export interface Runtime {
  agent: VoiceAgent;
  memory: Memory;
  tts: TtsEngine;
  // 'piper' (fast) or 'kokoro' (nicer, but slower than real time on mid-range phones)
  readonly ttsEngine: TtsEngineChoice;
  // whisper's language is fixed when it's created, so this rebuilds it
  setLanguage(lang: Lang): Promise<void>;
  // switch voice engine (its packs have to be on the phone)
  setTtsEngine(engine: TtsEngineChoice): Promise<void>;
  // say a line without the LLM (offline test)
  speakDirect(text: string): Promise<void>;
  // listen to every accepted transcript, returns an unsubscribe function
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
  let engineChoice: TtsEngineChoice = config.ttsEngine;
  let currentLang = lang;
  let voice = voiceFor(lang, engineChoice);
  let tts: TtsEngine = await speech.createTts(voice.options);
  let stt: SttEngine = await speech.createStt(lang);

  const memory = new Memory(() => new Date(), undefined, lang);
  const llm = createLlmClient({
    fetch: expoFetch as unknown as typeof fetch,
    apiKey: config.llmApiKey,
    baseUrl: config.baseUrl,
    // median first-token time on the shared NVIDIA endpoint is ~3 s with a long tail (eval/results.md)
    firstTokenTimeoutMs: 15_000,
  });
  const summarizer = createSummarizer(llm, config.backup);

  // the agent needs the queue and the queue calls back into the agent, so wire them lazily
  let agent: VoiceAgent;
  const queue = new TtsQueue(tts, {
    onFirstAudio: (ms) => agent.onFirstAudio(ms),
    normalizeOptions: () => ({
      hinglish: memory.state.lang === 'hi',
      devanagariLoanwords: voice.spec.devanagariLoanwords,
    }),
  });

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

  // warm up so the first real turn doesn't pay for model load
  await tts.speak('.').catch(() => undefined);
  // open the TLS connection to the LLM now (fire and forget) so the first turn skips the handshake
  void llm({
    model: { ...config.primary, maxTokens: 4 },
    messages: [{ role: 'user', content: 'hi' }],
    tools: [],
    onText: () => undefined,
  }).catch(() => undefined);

  // stop the agent, swap the voice if needed, rebuild whisper for the language, restart
  async function reconfigure(nextLang: Lang, nextEngine: TtsEngineChoice) {
    await agent.stop();
    const nextVoice = voiceFor(nextLang, nextEngine);
    if (nextVoice.spec.packId !== voice.spec.packId) {
      // different voice: free the old one first so memory stays flat
      await tts.destroy();
      tts = await speech.createTts(nextVoice.options);
      queue.setEngine(tts);
      await tts.speak('.').catch(() => undefined);
    }
    voice = nextVoice;
    engineChoice = nextEngine;
    currentLang = nextLang;
    stt = await speech.createStt(nextLang);
    memory.setLang(nextLang);
    agent = build(stt);
    await agent.start();
  }

  return {
    get agent() {
      return agent;
    },
    memory,
    get tts() {
      return tts;
    },
    get ttsEngine() {
      return engineChoice;
    },
    setLanguage: (next) => reconfigure(next, engineChoice),
    setTtsEngine: (next) => reconfigure(currentLang, next),
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

import { fetch as expoFetch } from 'expo/fetch';
import { Memory } from '../agent/memory';
import { createSummarizer } from '../agent/summarizer';
import { createToolRunner } from '../agent/toolRunner';
import { config } from '../config';
import { createLlmClient } from '../llm/client';
import { TtsQueue } from '../pipeline/ttsQueue';
import { VoiceAgent, type VoiceAgentEvents } from '../pipeline/voiceAgent';
import { createPhoneticizer } from '../tts/phonetic';
import { getPack, REQUIRED_PACKS, type PackId } from '../speech/packs';
import { createNitroSpeech } from '../speech/nitro';
import { modelsRoot, toNativePath } from '../speech/fsOps';
import type { TtsEngine } from '../speech/types';
import { createDeviceBackends } from '../tools';

export const packDir = (id: PackId) => `${modelsRoot()}/${id}`;

export const requiredPacks = () => REQUIRED_PACKS.map(getPack);

export interface Runtime {
  agent: VoiceAgent;
  memory: Memory;
  tts: TtsEngine;
  // say a line without the LLM (offline test)
  speakDirect(text: string): Promise<void>;
  // listen to every accepted transcript, returns an unsubscribe function
  onHeard(cb: (text: string) => void): () => void;
  destroy(): Promise<void>;
}

export async function createRuntime(uiEvents: VoiceAgentEvents): Promise<Runtime> {
  if (!config.llmApiKey) throw new Error(`No API key for provider '${config.provider}' (see .env.example)`);

  const heardListeners = new Set<(t: string) => void>();
  const events: VoiceAgentEvents = {
    ...uiEvents,
    onTranscript: (t) => {
      uiEvents.onTranscript(t);
      heardListeners.forEach((cb) => cb(t));
    },
  };

  // one hindi voice (piper priyamvada) speaks everything. english comes out right because each sentence is first
  // rewritten in devanagari as it sounds, see src/tts/phonetic.ts. whisper detects the language by itself.
  const speech = createNitroSpeech({
    whisperDir: toNativePath(packDir('whisper-small-int8')),
    vadPath: toNativePath(`${packDir('silero-vad')}/silero_vad.onnx`),
  });
  const tts = await speech.createTts({
    dir: toNativePath(packDir('piper-hi-priyamvada-medium')),
    type: 'vits',
    speakerId: 0,
    speed: config.ttsSpeed,
  });
  const stt = await speech.createStt();

  const memory = new Memory(() => new Date());
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
  // the small model also rewrites each sentence into spoken devanagari for the hindi voice
  const queue = new TtsQueue(tts, {
    onFirstAudio: (ms) => agent.onFirstAudio(ms),
    prepare: createPhoneticizer({ llm, model: config.backup }),
  });
  agent = new VoiceAgent({
    stt,
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

  // warm up so the first real turn doesn't pay for model load
  await tts.speak('.').catch(() => undefined);
  // open the TLS connection to the LLM now (fire and forget) so the first turn skips the handshake
  void llm({
    model: { ...config.primary, maxTokens: 4 },
    messages: [{ role: 'user', content: 'hi' }],
    tools: [],
    onText: () => undefined,
  }).catch(() => undefined);

  return {
    agent,
    memory,
    tts,
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
  };
}

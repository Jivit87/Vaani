import { fetch as expoFetch } from 'expo/fetch';
import { Memory } from '../agent/memory';
import { createSummarizer } from '../agent/summarizer';
import { createToolRunner } from '../agent/toolRunner';
import type { Lang } from '../agent/types';
import { config } from '../config';
import { createLlmClient } from '../llm/client';
import { TtsQueue } from '../pipeline/ttsQueue';
import { VoiceAgent, type VoiceAgentEvents } from '../pipeline/voiceAgent';
import { createPhoneticizer } from '../tts/phonetic';
import { getPack, REQUIRED_PACKS, type PackId } from '../speech/packs';
import { createNitroSpeech } from '../speech/nitro';
import { modelsRoot, toNativePath } from '../speech/fsOps';
import { createDeviceBackends } from '../tools';

export const packDir = (id: PackId) => `${modelsRoot()}/${id}`;

export const requiredPacks = () => REQUIRED_PACKS.map(getPack);

export interface Runtime {
  agent: VoiceAgent;
  memory: Memory;
  // say a line with the voice for that language, without the LLM (offline test)
  speakDirect(text: string, lang: Lang): Promise<void>;
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

  // two voices, both kept loaded so switching language is instant: amy speaks english, pratham speaks hindi.
  // a hindi sentence in latin letters is first rewritten in devanagari as it sounds, see src/tts/phonetic.ts.
  // one speech model hears both languages: whisper detects which one you spoke, so listening needs no switch either.
  const speech = createNitroSpeech({
    whisperDir: toNativePath(packDir('hinglish-swift-int8')),
    vadPath: toNativePath(`${packDir('silero-vad')}/silero_vad.onnx`),
  });
  const voice = (pack: PackId) =>
    speech.createTts({
      dir: toNativePath(packDir(pack)),
      type: 'vits',
      speakerId: 0,
      speed: config.ttsSpeed,
    });
  const voices = { en: await voice('piper-en-amy-medium'), hi: await voice('piper-hi-pratham-medium') };
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
  const queue = new TtsQueue(voices, {
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
  await Promise.all([voices.en.speak('.'), voices.hi.speak('.')]).catch(() => undefined);
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
    async speakDirect(text, lang) {
      await voices[lang === 'hi' ? 'hi' : 'en'].speak(text);
    },
    onHeard(cb) {
      heardListeners.add(cb);
      return () => void heardListeners.delete(cb);
    },
    async destroy() {
      await agent.stop();
      await Promise.all([voices.en.destroy(), voices.hi.destroy()]);
    },
  };
}

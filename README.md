# Vaani — on-device Hinglish voice agent (React Native, Android)

Speak English or Hinglish; the agent answers out loud. **Speech recognition and speech synthesis run on
the phone** (sherpa-onnx: Silero VAD + Whisper-small int8 + Kokoro-82M int8). The language model is in the
cloud (Groq free tier by default, or the NVIDIA API; both OpenAI-compatible) and runs inside a small tool-using **agent loop** with bounded memory.
Built for the IISc Computational Intelligence Lab assignment; design rationale is in `about.md`.

## What works, honestly

|                                                                                                                                   | Status                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Agent loop, tool validation, memory, SSE client, chunker, normalizer, downloader, metrics, eval harness                           | **Built and unit-tested** (136 tests)                                                                         |
| JS bundle, native project generation, debug APK build (Gradle + NDK)                                                              | **Verified**                                                                                                  |
| Live LLM tool-calling eval (27 cases / 33 turns)                                                                                  | **Measured** on 2026-10-16: Groq `gpt-oss-120b` 100 % / 100 % / 100 %, ~0.7 s first token (`eval/results.md`) |
| Running on an **Android emulator** with typed input: install, model download, engines load, weather / alarm / reminder end to end | **Verified** (alarm appears in the system Clock app)                                                          |
| Calendar read (`get_schedule`)                                                                                                    | **Not verified** (timed out once on a starved emulator)                                                       |
| Real microphone speech, STT accuracy (WER), Hindi/English audio quality, latency numbers, offline screen                          | **Not verified**: needs a phone. Placeholders in `benchmarks/results.md`                                      |

`docs/TASKS.md` lists exactly what to do on real hardware, in order.

## Requirements

- Node 20+, npm
- JDK 17 (recommended for React Native; newer JDKs untested here), Android SDK + NDK (via Android Studio), `adb`
- A physical Android phone, API 29+, ≥ 6 GB RAM, ~1 GB free storage (models ≈ 540 MB)
- An LLM key: **Groq** (free, <https://console.groq.com/keys>, default; ~30 requests/min) or **NVIDIA** (<https://build.nvidia.com>). Each turn costs 1–3 requests

## Setup

```bash
npm ci
cp .env.example .env            # set EXPO_PUBLIC_GROQ_API_KEY (and EXPO_PUBLIC_LLM_PROVIDER=groq)
npm run prebuild                # generates ./android (gitignored)
npm run android                 # builds the dev client, installs on the connected phone
```

After editing `.env`, restart Metro with `npx expo start --clear` — Expo caches inlined env values.
First launch downloads the speech models (Wi-Fi recommended); the download resumes and verifies sizes.

## Using the app

- **Agent tab:** talk, or type. EN / Hinglish toggle re-creates the Whisper engine (a few seconds). _Stop_ interrupts; _New chat_ clears memory; _Export CSV_ shares the per-turn latency table. The overlay shows time to first audio, LLM TTFT, tool time, TTS first chunk, medians for direct vs tool turns, and the last tool calls.
- **Offline tab:** shows a live "internet reachable?" probe; _Transcribe only_ (STT, no LLM) and _Speak_ buttons prove the on-device path under airplane mode.
- **Benchmark tab:** see below.

Try: "What's the weather in Bangalore tomorrow?" → "And the day after?" · "Mujhe kal subah 7 baje ka alarm set karna hai" · "Alarm laga do" → "Kitne baje?" → "saat baje" · "Aaj ka schedule kya hai?"

## Commands

|                                         |                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run check`                         | typecheck + eslint + prettier + tests (what CI runs)                                        |
| `npm test` / `npm run test:watch`       | Vitest                                                                                      |
| `npm run eval:tools -- --models a,b`    | tool-calling eval against live NVIDIA models (needs key; ~225 requests for 3 models, paced) |
| `npm run android:release`               | release build — **use this for latency numbers and the demo**                               |
| `python3 scripts/gen_model_manifest.py` | regenerate model file lists/sizes from Hugging Face                                         |

## Measuring

**Latency.** The app reports _transcript received → first audio_. nitro-voice's VAD-gated STT does not expose the end-of-speech instant, so add two terms for true voice-to-voice: the VAD wait (0.5 s, fixed inside the library) and the median Whisper decode time from the benchmark. Report direct and tool turns separately.

**STT accuracy.** Record 40 sentences (20 EN, 20 Hinglish; name them `en_01.wav`…, `hi_01.wav`…; 16 kHz mono, 16-bit) → put references in `benchmarks/test_sentences.tsv`. Push audio: `adb push en_01.wav /sdcard/` then copy into the app dir with `adb shell run-as com.vaani.voiceagent` (debug builds), or place files via Android Studio's Device Explorer under `files/benchmark/audio/`. To compare other Whisper exports, put each in `files/models/<name>/` with `encoder.onnx`, `decoder.onnx`, `tokens.txt`. Run the Benchmark tab, _Share results JSON_, save it as `benchmarks/benchmark_results.json`, then:

```bash
pip install jiwer
python3 benchmarks/run_wer.py benchmarks/benchmark_results.json benchmarks/test_sentences.tsv
```

**Agent quality.** `eval/tool_cases.json` (27 cases): tool choice, argument accuracy, clarification behaviour, TTFT per model. This is also how the LLM is chosen.

## Layout

```
App.tsx                 tab shell
src/agent/              runTurn loop, Memory, ToolRunner, summarizer
src/llm/                SSE client + fallback, prompts, tool schemas, model defaults
src/tts/                sentence chunker, normalizer (EN/HI numbers & times), script splitter
src/pipeline/           VoiceAgent state machine, TtsQueue, metrics, transcript filter
src/speech/             nitro-voice adapters, model packs + downloader, generated manifest
src/tools/              alarm, reminder, calendar, weather
src/session/            runtime wiring, permissions
src/ui/                 screens
src/benchmark/          WAV parser, result types, on-device runner
eval/  benchmarks/      tool-calling eval; WER tooling
docs/                   PRD, ARCHITECTURE, DECISIONS, TASKS
tests/                  Vitest (Node)
```

## Troubleshooting

| Symptom                                   | Likely cause / fix                                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| "No API key for provider …"               | `.env` missing the key for the chosen `EXPO_PUBLIC_LLM_PROVIDER`, or Metro cache stale: `npx expo start --clear`            |
| Model download stalls                     | re-run; complete files are skipped, partial ones re-fetched. Check storage space                                            |
| Hindi sounds wrong or spelled out         | Devanagari is read by espeak inside Kokoro; try voices 32/33/34, else `EXPO_PUBLIC_TTS_ENGINE=piper-hi` (docs/DECISIONS D7) |
| Agent answers its own speech              | half-duplex relies on `stopMic()`; check the phone's audio route / use headphones and report                                |
| Empty or odd replies on a reasoning model | give `maxTokens` headroom or add reasoning-off in `src/llm/models.ts` (`extraBody` / `systemSuffix`)                        |
| Alarm intent does nothing                 | merged manifest must contain `com.android.alarm.permission.SET_ALARM` (use prebuild, not Expo Go)                           |
| Reminder fires late                       | Android 14+ denies exact alarms by default; battery optimisation; prefer the Clock alarm for time-critical use              |
| Build fails on a new JDK                  | use JDK 17                                                                                                                  |
| App process dies when TTS loads           | nitro-voice 0.1.1 needs `patches/` applied (`npm install` runs `patch-package`); see docs/DECISIONS                         |
| "LLM first-token timeout"                 | provider endpoint is slow or down (NVIDIA hung for 12+ min once); switch `EXPO_PUBLIC_LLM_PROVIDER`                         |
| Emulator freezes                          | needs ~4 GB free RAM next to Metro/Gradle; a real phone is far better                                                       |

## Security

The LLM key (Groq or NVIDIA) is compiled into the app (`EXPO_PUBLIC_*`) — fine for a coursework demo, **revoke it afterwards**; a real product would proxy the LLM. `.env` is gitignored; `.env.example` has placeholders. Tool arguments from the model are validated before use. Audio is never uploaded. `npm audit` reports 22 advisories, all in build-time tooling (Metro/Expo CLI/node-forge); none ship in the APK, and the fix requires a breaking Expo downgrade (`--force`).

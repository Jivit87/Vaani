# Hinglish Voice Agent (React Native, Android): End-to-End Build Guide

**Assignment:** IISc Computational Intelligence Lab. On-device STT + on-device TTS, cloud LLM, English + Hinglish.
**Deadline:** Sunday 18 Oct 2026, EOD. This revision was written Fri 16 Oct, so you have **about 2.5 days**. The plan in §12 is sized for that.
**Judged on:** end-to-end latency, transcription accuracy (EN + Hinglish), pronunciation quality (especially Hinglish).

> **What changed from the Kotlin version.** The pipeline, models, prompt, benchmarking method and demo are the same. What changes is the glue: sherpa-onnx is reached through a React Native native module instead of the Kotlin API, audio playback is handled by that module, and the LLM/tools run in TypeScript. Two things are new risks and get their own gate in §4: (1) the RN sherpa-onnx wrappers are young and differ in what they support, (2) every token and audio chunk now crosses the JS bridge.
>
> **What changed in this revision.** (1) The LLM is the **NVIDIA API catalog** (`integrate.api.nvidia.com`, OpenAI-compatible) instead of Groq/Gemini. (2) The assistant is now a real **agent**: a multi-step tool loop, clarifying questions, filler speech during tool calls, and a bounded three-layer memory (§7). (3) A **tool-calling eval** sits next to the WER benchmark. (4) Fixes to the streaming client (tool-call ids, safe JSON parsing, reasoning tokens), the latency budget (tool round trips), and section references.
>
> **Corrections found while implementing (checked against the package source, 16 Oct).** Where this guide and the code differ, the code is right; `docs/DECISIONS.md` has the reasoning.
>
> 1. **nitro-voice plays audio itself.** `speak()` synthesizes the whole sentence, calls `onAudioChunk` **once**, and writes it to a native `AudioTrack`. There is no incremental TTS streaming and **no need for `react-native-audio-api`** (playing the chunk again would double the audio). Pipelining is per sentence.
> 2. **Hardcoded inside nitro-voice's VAD-gated STT:** Whisper `numThreads = 2`, VAD `minSilenceDuration = 0.5 s`. They are not configurable; changing them means patching the library (`patch-package`).
> 3. **Kokoro pack:** use `kokoro-int8-multi-lang-v1_0` (54 voices; `hf_alpha`=31, `hf_beta`=32, `hm_omega`=33, `hm_psi`=34, `af_heart`=3, 24 kHz). `kokoro-multi-lang-v1_1` is the Chinese/English model and has **no Hindi voices**.
> 4. **Model files** must be named `encoder.onnx` / `decoder.onnx` / `tokens.txt` (Whisper) and `model.onnx` / `voices.bin` / `tokens.txt` / `espeak-ng-data/` (Kokoro). sherpa releases are `.tar.bz2`, which no RN extractor handles, so the app downloads **individual files from Hugging Face and renames them** (`scripts/gen_model_manifest.py`).
> 5. **Hindi pronunciation risk:** nitro-voice does not pass Kokoro's espeak `lang`, so Devanagari may not be read correctly. Keep Piper `hi_IN` as the fallback (`EXPO_PUBLIC_TTS_ENGINE=piper-hi`) and decide by ear.
> 6. **Streaming HTTP** uses `expo/fetch` (one client for the app and the Node eval); `react-native-sse` is not used.
> 7. **Filler line** is an ordinary queued sentence (there is no hook to replay cached PCM).
> 8. **Latency:** the VAD-gated STT gives no end-of-speech timestamp, so the app measures _transcript → first audio_; add the 0.5 s VAD wait and the benchmark's decode time for voice-to-voice.
> 9. **Expo env vars** must be read as literal `process.env.EXPO_PUBLIC_X`; dynamic lookups silently become `undefined` in the bundle.
> 10. **LLM models:** the guide's example IDs were stale (`meta/llama-3.3-70b-instruct` was retired 2026-08-26). Models were chosen by the live eval; see `eval/results.md`.
> 11. **Keep the project out of iCloud-synced folders.** See `docs/TASKS.md` (incident).

---

## 0. The strategy in one paragraph

Use **React Native (Expo, prebuilt dev client) + a sherpa-onnx native module** for VAD, STT and TTS, and stream an **NVIDIA-hosted LLM** over SSE inside a small **agent loop** (tool call → result → answer, with memory). Win the three criteria like this:

| Criterion                                | Main lever                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Latency**                              | VAD endpointing, int8 models kept warm, LLM streaming, **sentence-level TTS pipelining** (speak sentence 1 while the LLM writes sentence 2), a **spoken filler** during tool calls, a **bounded prompt** (memory never grows the request), and **keeping the JS thread light**. Show a live latency overlay in the demo.                     |
| **Transcription**                        | Benchmark 2–3 Whisper variants on _your own_ 40-sentence test set and pick by measured WER and speed. Tell the LLM the transcript may be noisy.                                                                                                                                                                                              |
| **Pronunciation**                        | **Make the LLM write TTS-ready text**: Hindi words in Devanagari, English words in Latin, numbers/times spelled out in words. This matters more than which TTS model you pick.                                                                                                                                                               |
| _Agentic behaviour (beyond the rubric)_  | Multi-step tool loop, clarifying questions for missing details, follow-ups that use memory ("aur kal?"), an on-screen agent trace, and a measured tool-calling accuracy table.                                                                                                                                                                |

---

## 1. Architecture

```
 Mic (16 kHz mono, captured natively by the sherpa module)
   │
   ▼
 Silero VAD ── endpoint after ~500 ms silence ──┐
                                                ▼
                            STT: Whisper int8 (sherpa-onnx, native, on-device)
                                                │ text   (JS: onTranscript)
                                                ▼
 ┌──────────────── Agent loop (TS, max 3 steps) ─────────────────┐
 │  Memory: window (last 4 turns) + rolling summary + state JSON │
 │  LLM: NVIDIA API (OpenAI-compatible SSE, tool calling)        │
 │     │ tokens                         │ tool calls             │
 │     │                                ▼                        │
 │     │                  RN tools: alarm intent, reminder,      │
 │     │                  calendar read, weather (Open-Meteo)    │
 │     │                                │ one-line JSON result   │
 │     │                                └──► back to the LLM ⟲   │
 └─────┼─────────────────────────────────────────────────────────┘
       ▼
 Sentence chunker (TS)  ◄── filler line ("एक second…") if a tool runs first
       ▼
 TTS: Kokoro or Piper (sherpa-onnx, native)
       │ synthesizes one sentence at a time
       ▼
 Playback: native (nitro-voice AudioTrack, or sherpa RN's PCM player in Option B)
```

Everything except the LLM and weather calls is offline. The VAD/STT/TTS inference runs in native C++; JS only orchestrates.

---

## 2. Tech stack

| Layer            | Choice                                                                                                                                                           | Why / caveat                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App              | **Expo (CNG / `expo prebuild`) + dev client**, TypeScript, Hermes                                                                                                | Native modules below do not run in Expo Go. Prebuild gives you config plugins for permissions.                                                                      |
| Speech runtime   | **Option A: `react-native-nitro-voice`** (chosen) or **Option B: `react-native-sherpa-onnx`** (see §4)                                                           | Both wrap sherpa-onnx. They differ on VAD and maturity.                                                                                                            |
| VAD              | Silero (`silero_vad.onnx`)                                                                                                                                       | Built into Option A. Option B lists VAD as not yet supported (see §3).                                                                                              |
| STT              | Whisper int8 via sherpa-onnx (see §6)                                                                                                                            | Multilingual; handles Indian accents better than most small models.                                                                                                 |
| TTS              | Kokoro-82M **v1.0** int8 (`kokoro-int8-multi-lang-v1_0`) or Piper `hi_IN` (see §8)                                                                               | Both libraries list Kokoro and VITS (Piper) support.                                                                                                                |
| Playback         | Option A (chosen): **native, inside `speak()`** (AudioTrack). Option B: built-in native PCM player                                                               | No JS audio library needed with Option A; see Corrections 1.                                                                                                        |
| LLM              | **NVIDIA API catalog** (`https://integrate.api.nvidia.com/v1`, OpenAI-compatible), key from `build.nvidia.com`. Primary + backup model on the same key (§7.2)    | Pick the model by the tool eval and measured time-to-first-token, not by name. Catalog entries get retired.                                                         |
| Streaming HTTP   | **`fetch` from `expo/fetch`** (implemented in `src/llm/client.ts`)                                                                                               | Incremental bodies; the same code runs in Node for the eval. `react-native-sse` is not used.                                                                        |
| Agent + memory   | Plain TypeScript (`src/agent/`), no framework                                                                                                                    | A 3-step loop and a ~80-line memory class are all this needs. LangGraph/LangChain add weight and bridge overhead without helping the grade.                          |
| Alarm            | `expo-intent-launcher` with `android.intent.action.SET_ALARM`                                                                                                    | See §7.8. `expo-alarm` exists but is an unofficial v0.1.x package.                                                                                                  |
| Reminder         | `expo-notifications` (scheduled notification) and/or `expo-calendar` event                                                                                       | Verify exact-time delivery on your phone.                                                                                                                           |
| Calendar read    | `expo-calendar`                                                                                                                                                  | `READ_CALENDAR` + `WRITE_CALENDAR`. SDK 57 ships a class-based API (`requestCalendarPermissions`, `getCalendars`, `listEvents`).                                    |
| Weather          | Open-Meteo (free, no key)                                                                                                                                        | Plain `fetch`.                                                                                                                                                      |
| Files / models   | `expo-file-system` (new `File` / `Directory` API)                                                                                                                | Per-file download with rename and size check; no archive extraction (Corrections 4).                                                                                |

> **Free-tier limits change.** The NVIDIA developer tier is rate-limited per account (requests per minute, sometimes credits). Check your limits on `build.nvidia.com` before the demo. Each agent turn costs 1–3 requests (more when a tool runs), plus one background summary call now and then (§7.6), so budget for that.

---

## 3. What the two RN speech libraries actually offer (researched Oct 2026)

|                    | **A. `react-native-nitro-voice`**                                                                                                          | **B. `react-native-sherpa-onnx`** (XDcobra)                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Maturity           | Very young (about 19 commits, 6 stars at time of writing)                                                                                  | Larger (1,000+ commits, ~39 stars); has a published app (VoiceLab) built on it                                                              |
| Architecture       | Nitro Modules, **New Architecture only**                                                                                                   | TurboModule, RN >= 0.70                                                                                                                    |
| Android floor      | API 29+                                                                                                                                    | API 24+                                                                                                                                    |
| **VAD**            | **Yes**: standalone `NitroVAD` and **VAD-gated Whisper STT** that captures the mic and returns one transcript per utterance                 | **Listed as not yet supported** (scheduled for a later release). Check the version you install.                                              |
| STT models         | whisper, transducer, paraformer, nemo_ctc, sense_voice                                                                                     | Many: Whisper, Moonshine v1/v2, Omnilingual, SenseVoice, Paraformer, transducer, Qwen3-ASR and more                                          |
| Whisper language   | `language` is set at engine creation (required for Whisper)                                                                                | Whisper supported; check the STT docs for language options                                                                                  |
| TTS models         | vits (Piper), kokoro, matcha                                                                                                               | VITS, Matcha, Kokoro, Kitten, Zipvoice, Pocket, Supertonic                                                                                  |
| TTS streaming      | `speak(text, { onAudioChunk(samples, sampleRate), onComplete })`; `onAudioChunk` fires **once per sentence** after full synthesis          | `createStreamingTTS()` → `generateSpeechStream()` with `onChunk` (samples as a `number[]`, plus `sampleRate`, `progress`, `isFinal`) and `cancel()` |
| Playback           | **Native `AudioTrack` inside `speak()`** (source-verified); no JS player needed                                                            | **Built-in native PCM player**: `startPcmPlayer`, `writePcmChunk`, `stopPcmPlayer`                                                          |
| Mic capture        | Built in (16 kHz mono)                                                                                                                     | Live PCM capture API, intended for streaming STT                                                                                            |
| Models             | Not bundled; you download them                                                                                                             | Bundled assets, file paths, or the in-app download manager                                                                                  |
| Expo               | Config plugin (adds permission, Maven repo, pod)                                                                                           | Config plugin for the download manager                                                                                                      |

**Reading of the table.** For this assignment, A matches the pipeline directly (VAD-gated Whisper → Kokoro/Piper, native playback). B is the safer, more featureful library, and its built-in PCM player gives true streaming TTS, but the missing VAD means you must supply your own endpointing for Whisper. That is why §4 is a gate, not a decision made on paper.

---

## 4. Day-1 decision gate (do this first, cap it at 2 hours)

Goal: find out which library gives you "speak → transcript → speak back" with the least custom work.

**Spike A (nitro-voice), 45 min:**

1. New Expo project, add the plugin, set `minSdkVersion` 29, `npx expo prebuild --clean`, build a dev client.
2. Download `sherpa-onnx-whisper-small` (int8) + `silero_vad.onnx` (the app's downloader does this on first launch).
3. `NitroSTT.create({ type: 'whisper', language: 'en' })` → `startVADGated(vadPath, { onTranscript })`. Say one English and one Hinglish sentence.
4. Create `NitroTTS` with a Kokoro model, call `speak()`, log time to first chunk.

**Spike B (react-native-sherpa-onnx), 45 min (only if A fails or is flaky):**

1. Same project, add the library, load the same Whisper and a Kokoro/Piper model.
2. Check `docs/vad.md` in the installed version. If VAD is still unsupported, test endpointing options: a simple energy threshold on the live PCM stream, or the streaming transducer's built-in endpoint detection for a "listening" indicator, then pass the captured segment to Whisper's offline decode.
3. Test `createStreamingTTS` + `startPcmPlayer` / `writePcmChunk`.

**LLM smoke test (15 min, from your laptop, can run in parallel with a build):** `curl` a streaming request with one tool to 2–3 candidate NVIDIA models (§7.2). Check three things: SSE tokens arrive incrementally, a `tool_calls` delta comes back for "set an alarm for 7 am", and time-to-first-token. Drop any model that fails one of them.

**Pick A if:** the dev client builds, VAD-gated transcripts appear reliably, TTS works, and nothing crashes on a 20-turn loop.
**Pick B if:** A crashes, will not build on your RN/Expo version, or you need Moonshine/Omnilingual for the benchmark.
**Hard stop:** if neither produces a working speak-and-hear loop by **Fri ~2 PM**, do not keep debugging. Either write a thin Expo native module in Kotlin around the sherpa-onnx Android API (the original Kotlin guide has the exact calls), or fall back to the Kotlin app from the earlier guide. Telling the grader "RN wrapper was not stable enough, here is the measured evidence" is better than an unfinished app.

Known risks to watch in both spikes: first-run model load time, memory use of Whisper-small plus Kokoro together on your phone, and whether the mic session conflicts with the audio output.

---

## 5. Project setup (Day 1, after the gate)

1. `npx create-expo-app` (TypeScript template). The project is built against Expo SDK 57 / RN 0.86.
2. Install: your chosen speech library (plus `react-native-nitro-modules` for Option A), `expo-file-system`, `expo-intent-launcher`, `expo-notifications`, `expo-calendar`, `expo-build-properties`, `expo-dev-client`.
3. `app.json` plugins and permissions:
   ```json
   {
     "expo": {
       "android": {
         "permissions": [
           "RECORD_AUDIO",
           "INTERNET",
           "READ_CALENDAR",
           "WRITE_CALENDAR",
           "com.android.alarm.permission.SET_ALARM",
           "POST_NOTIFICATIONS",
           "SCHEDULE_EXACT_ALARM"
         ]
       },
       "plugins": [
         [
           "react-native-nitro-voice",
           { "microphonePermission": "On-device speech recognition. Audio never leaves the phone." }
         ],
         ["expo-build-properties", { "android": { "minSdkVersion": 29 } }],
         "expo-calendar",
         "expo-notifications"
       ]
     }
   }
   ```
   (Swap the first plugin if you pick Option B.) The SET_ALARM permission must be in the merged manifest or the alarm intent is denied, which is why you prebuild instead of using Expo Go.
4. `npx expo prebuild --clean`, then `npx expo run:android` on a physical phone (mid/high-end; Whisper-small on a low-end phone will be slow). Do not test speech on the emulator. Building needs JDK 17 and the Android SDK/NDK.
5. **Models:** downloaded on first launch to `Paths.document/models/<pack>/`, with a progress UI, retry and size verification (about 540 MB in total). Document the download step in the README; the APK stays small.
6. Secrets: `.env` (gitignored) with `EXPO_PUBLIC_NVIDIA_API_KEY`, plus `.env.example`. Anything in `EXPO_PUBLIC_*` ends up readable inside the APK. That is acceptable for a lab assignment, but say so in the README and revoke the key after grading. After editing `.env`, restart Metro with `--clear`.

---

## 6. STT: how to get the best accuracy on EN + Hinglish

### Candidates (benchmark all, pick by data)

| #   | Model                                                                              | Notes                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A   | **Whisper-small multilingual, int8** (pre-converted in sherpa-onnx ASR releases)   | Safe baseline. Set `language` to `en` or `hi`.                                                                                                                                                                                                         |
| B   | **Hindi/Hinglish Whisper fine-tune exported to sherpa format**                     | Export with `scripts/whisper/export-onnx.py` from sherpa-onnx, then int8 quantize. Community packs show small fine-tunes already work this way. Hinglish fine-tunes exist on Hugging Face; large and medium ones are likely too heavy for real-time on a phone, but test the medium. |
| C   | **Moonshine (English only)**                                                       | Faster for short English utterances. Available in Option B's STT list. Optional latency optimization.                                                                                                                                                  |
| D   | **Omnilingual ASR 300M CTC int8**                                                  | Fast CTC, Hindi supported, but not trained for code-switching. A speed fallback. Option B lists the `omnilingual` type.                                                                                                                                |

### How to choose (Day 1 evening to Day 2)

1. Record **40 sentences** (20 English, 20 Hinglish; include the 4 from the email), quiet room and mild noise, as 16 kHz mono WAV.
2. Write reference transcripts. For Hinglish pick **one script** (Roman is easiest) and normalize: lowercase, strip punctuation, unify spellings (`kal`/`kl`, `baje`/`bje`).
3. **Benchmark screen in the app:** for each model and each WAV, decode, time it, and append `{model, file, hyp, decode_ms, audio_ms}` to a JSON file, shared out of the app. Compute WER and real-time factor with `jiwer` in `benchmarks/run_wer.py`. With Option A, WAV samples go in through `feedAudio` (Float32, any sample rate; the library resamples to 16 kHz).
4. Choose the model with the best WER whose decode time is under about 1.5 s for a 4 s utterance. Put the table in the README.
5. **Bonus, cheap:** feed the STT hypotheses (not the references) of the 40 sentences into the tool eval (§7.7). That measures whether the agent still does the right thing when the transcript is wrong, which is the number that actually matters to a user.

### Practical tips

- **Language handling:** with Whisper the language is fixed when the engine is created in Option A, so a `EN` / `Hinglish` toggle means **re-creating the engine** (a few seconds) or holding two engines in memory. Measure memory before choosing. Do the toggle first; "Auto" is a cut candidate.
- **Always tell the LLM the transcript is noisy** (see the prompt in §7.3). It fixes misspelled Hindi words (`bje` for `baje`), near-homophones, and Devanagari/Roman mixing.
- Whisper sometimes outputs Hindi in Devanagari. That is fine; the LLM handles both.
- Whisper invents short phrases ("Thank you.", "you") on near-silence; filter them (`src/pipeline/transcriptFilter.ts`).
- **Warm up** at app start: run one TTS synthesis (and, if you can, one decode on 1 s of silence), so first-use latency does not hit your demo.
- **Half-duplex rule:** stop the mic (or ignore VAD events) while TTS is playing. Otherwise the speaker output triggers the VAD and the agent talks to itself. Barge-in is an optional extra (§15).

---

## 7. The agent: LLM, tools, memory

The agent is one TypeScript loop: build the prompt from memory → stream the LLM → if it asked for tools, run them and feed the results back → repeat (max 3 steps) → commit the turn to memory. Spoken text from any step goes straight to the sentence chunker, so the user hears the answer while it is still being written.

### 7.1 Streaming client (NVIDIA, OpenAI-compatible)

Implemented in `src/llm/client.ts` (and tested against a local SSE server in `tests/client.test.ts`). The design points:

- `fetch` is injected: `expo/fetch` in the app, global `fetch` in Node (so the eval runs the same code).
- An incremental SSE parser handles events split across chunks; tool-call arguments arrive in fragments and are assembled by `index`, keeping the `id` (synthesized as `call_<i>` if the provider sends none) so results can be sent back.
- Reasoning text (`reasoning_content`, or `<think>…</think>` inside `content`, even split across chunks) is dropped and never reaches TTS.
- A first-byte timeout aborts a hung request; an external `AbortSignal` cancels it (barge-in).
- Open a warm connection at launch (a tiny request) so the first turn does not pay TLS setup.
- **Fallback:** on 429, a network error or timeout, retry the same step with the backup model, but **only if no text has been spoken yet in this step**; otherwise the user hears the start of the answer twice. Both models use the same key, client and schemas, so the fallback is just a different `ModelCfg`.

### 7.2 Choosing the model

Model IDs change; list the catalog with `curl -H "Authorization: Bearer $KEY" https://integrate.api.nvidia.com/v1/models` and test candidates with the eval (§7.7). A retired model answers HTTP 410. Reasoning models: send reasoning controls via `extraBody` and give `maxTokens` headroom, because reasoning tokens can use up a small cap and leave an empty reply.

```ts
// src/llm/models.ts
export const PRIMARY_MODEL = { id: 'deepseek-ai/deepseek-v4.1-flash', maxTokens: 200 };
export const BACKUP_MODEL = { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', maxTokens: 200 };
```

**Pick by data** (from the 2026-10-16 live run, `eval/results.md`): the fastest model within a few points of the best accuracy. The shared NVIDIA endpoints have multi-second time-to-first-token; that is the largest latency cost in the pipeline.

### 7.3 System prompt (the highest-leverage piece for pronunciation)

```text
You are a voice assistant on an Android phone. Your reply will be spoken aloud by a TTS engine.
- Reply in 1-2 short sentences. No markdown, emoji, lists or symbols.
- The user's text comes from speech recognition and may contain errors; infer the intent.
- If the user speaks English, reply in English.
- If the user speaks Hindi/Hinglish, reply in natural Hinglish, writing Hindi words in
  Devanagari and English words in Latin script.
  Example: "आपका अलार्म सुबह सात बजे के लिए set हो गया है।"
- Write numbers, times and dates as spoken words: "सुबह सात बजे", "five PM", never "7:00" or "5PM".
- Use tools for alarms, reminders, calendar and weather. Never invent schedule or weather data.
- If a required detail (time, date, city) is missing or truly ambiguous, ask ONE short question
  instead of guessing. "subah"/"morning" means AM; "shaam"/"evening" means PM.
- After a tool succeeds, confirm what was done in one sentence. If it failed, say so briefly.
- Use the conversation memory below to resolve follow-ups like "aur kal?" or "wahan ka?".
Current date/time: {{now_iso}} (Asia/Kolkata). Today is {{weekday}}.
{{memory_block}}
```

Inject the real current date/time on every request, otherwise "kal" and "tomorrow" cannot be resolved. `{{memory_block}}` comes from §7.6. Put any model-specific switch (e.g. a reasoning-off line) in `ModelCfg.systemSuffix`.

### 7.4 Tool schemas

Strict schemas with `required` fields make the model ask for missing details instead of making them up. The four tools (`set_alarm`, `set_reminder`, `get_schedule`, `get_weather`) are defined in `src/llm/tools.schema.ts` as plain data (no RN imports) so the eval script can import them. `set_alarm` has no `days` parameter on purpose: `AlarmClock.EXTRA_DAYS` needs an `ArrayList<Integer>`, which `expo-intent-launcher` extras probably cannot pass. Add it only if you write the small Kotlin module (§7.8).

### 7.5 The agent loop

Implemented in `src/agent/runTurn.ts`:

- up to `MAX_STEPS = 3`; the last step offers no tools, so it must answer in words;
- tool calls in one step run in parallel (`Promise.all`); each is validated and time-limited in `toolRunner.ts`, and every failure becomes a one-line JSON result the model can explain;
- if the model said nothing before calling a tool, a filler line is queued so the gap is not dead air;
- if the model produced no words at all, the agent says "Done." **only if a tool really succeeded**; otherwise it asks the user to repeat. (An earlier version said "Done." unconditionally, which falsely claimed an alarm was set; the live eval exposed it.)
- on abort (barge-in) no half-sentence is spoken and the turn is not committed to memory.

**Filler speech (as built: a normal queued sentence, see Corrections 7):** the line synthesizes while the tool runs, so it covers most of the tool plus second-LLM gap without needing cached audio.

### 7.6 Memory (bounded, three layers)

Goal: follow-ups and clarifications work, while the request size, and therefore latency, stays the same in turn 2 and turn 20.

| Layer                    | What it holds                                                                                                                                                                            | How it is updated                                                                                                                                                                                                     | Size cap    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **1. Working window**    | Last 4 turns as `user` / `assistant` text pairs. Only what the user said and what the agent **spoke**. Tool calls and raw results are **not** kept after the turn ends.                  | `commitTurn()` appends; the oldest turn is evicted when there are more than 4.                                                                                                                                        | 8 messages  |
| **2. Rolling summary**   | ≤ 60 words of older context ("User has a meeting with Rahul at 5 PM on 17 Oct; prefers Hinglish.")                                                                                       | **In the background, after playback ends**, evicted turns are folded into the summary by one small LLM call (`max_tokens` 100). Never on the latency path. If it fails, the evicted turn is simply dropped.         | ~80 tokens  |
| **3. Agent state**       | `{ lang, last_city, last_date, last_intent, actions: [...] }` where `actions` holds the last 5 things the agent did, e.g. `"alarm 07:00 'wake up'"`                                        | **Set by tool code, not by the LLM**, so it is always correct: `get_weather` sets `last_city`/`last_date`, `set_alarm` appends to `actions`, etc. `lang` comes from the EN/Hinglish toggle (it is the single source). | ~60 tokens  |

Why this is "smart" and not just "send the history":

- Tool results are the bulkiest messages and are only needed within their own turn. Dropping them after the turn and keeping their **facts** in layer 3 keeps the prompt small without losing anything the agent needs.
- Layer 3 is deterministic, so "aur kal?" after a weather question reliably becomes `get_weather(last_city, tomorrow)`, even when the window has been summarized.
- The summary is written while nobody is waiting.
- Total memory is capped at roughly 600 tokens, so time-to-first-token does not creep up over a long demo.

A 10-minute idle gap resets the session (language kept), and the UI has a "New chat" button. Implemented in `src/agent/memory.ts`.

### 7.7 Tool-calling eval (the agent's benchmark)

The WER table shows that STT works. This table shows that the agent works. It runs from the laptop, no phone needed.

1. `eval/tool_cases.json`: 27 cases / 33 turns, each a list of turns with the expected outcome (English, Hinglish, Devanagari, noisy transcripts, 3 clarification cases, 3 multi-turn follow-ups, chit-chat that must not call tools, and a parallel-call case). The clock is fixed (Fri 16 Oct 2026, 10:00 IST) so dates are deterministic. A value starting with `~` means "starts with", an array means "any of".
2. `eval/run_tool_eval.ts` (run with `npx tsx`): imports the real agent loop, `Memory`, `TOOLS` and the prompt, uses the same streaming client, fakes tool results with fixtures.
3. Report per model: **tool-choice accuracy**, **argument accuracy**, **clarification correctness**, **median TTFT**. This is also how §7.2 picks the model.

Free-tier cost: about 33 turns × ~2 calls × 3 models ≈ 200 requests. Spread the runs out and stay under the per-minute limit.

### 7.8 Tool implementations

| Tool                                | RN implementation                                                                                                                                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set_alarm(hour, minute, label?)`   | `IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', { extra: { 'android.intent.extra.alarm.HOUR': h, 'android.intent.extra.alarm.MINUTES': m, 'android.intent.extra.alarm.MESSAGE': label, 'android.intent.extra.alarm.SKIP_UI': true } })`                            |
| `set_reminder(datetime_iso, text)`  | `Notifications.scheduleNotificationAsync({ content, trigger: { type: SchedulableTriggerInputTypes.DATE, date, channelId } })` with a notification channel and a permission request                                                                                                      |
| `get_schedule(date)`                | `Calendar.requestCalendarPermissions()` → `Calendar.getCalendars(EntityTypes.EVENT)` → `Calendar.listEvents(calendars, start, end)`. Keep only events that **start** inside the IST day (Android can return events that began earlier), sort, return `[{title, start_hhmm}]`, max 6. |
| `get_weather(city, date)`           | `fetch` Open-Meteo geocoding → forecast; return `{city, date, max_c, min_c, rain_pct, summary}`                                                                                                                                                                                        |

Notes:

- The alarm intent is the same Android `AlarmClock` mechanism as in the Kotlin guide, so it opens the system Clock app's alarm. If `expo-intent-launcher` cannot pass an extra you need, write a 30-line Expo module in Kotlin; do not spend more than 30 minutes on this.
- Tool turns add a second LLM round trip. Keep tool results to one-line JSON and let the filler line cover the gap (§7.5).
- For the demo, seed the phone calendar with 2–3 events.

---

## 8. TTS: making Hinglish sound good (the differentiator)

### Model options in sherpa-onnx

| Model                                                                                                                                | Pros                                                       | Cons                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kokoro-82M v1.0 multi-lang int8** (Hindi voices: `hf_alpha`, `hf_beta`, `hm_omega`, `hm_psi`; English e.g. `af_heart`)             | Best naturalness on-device; one model for both languages   | Hindi voices are rated lower than English on the model card (`hf_alpha` is grade C); heavier on weak phones. Needs `voices.bin`, `tokens.txt` and an `espeak-ng-data/` folder. Hindi may be mispronounced because nitro-voice sets no espeak `lang` (Corrections 5). |
| **Piper VITS** (`hi_IN-pratham/priyamvada/rohan`, `en_US-*`)                                                                         | Very fast, tiny                                            | Hindi sounds more robotic; two separate models. Needs `tokens.txt` and espeak-ng data.                                                                                                                                                         |
| Others to evaluate if time allows                                                                                                    | Matcha, Supertonic, Kitten (listed by Option B)            | Check Hindi support before investing. IndicF5-style pipelines are too heavy for real-time on a phone.                                                                                                                                         |

### Do these in order

1. **Script normalization (biggest win).** An independent open-source comparison reported Kokoro scoring much better on mixed-script and Devanagari input than on pure Roman-script Hinglish (roughly 3.9 vs 2.5 on that author's small 30-sentence test). One small eval, but it matches intuition. So the prompt forces Devanagari for Hindi words, and a post-processor (`src/tts/normalize.ts`) is the safety net:
   - Expand digits and times (`5 PM` → `five PM`, `7:30` → `seven thirty`, Hindi `7:30` → `साढ़े सात बजे`), `°C` and `%`.
   - Strip markdown, emoji and symbols.
   - (Not implemented: transliterating stray Roman Hindi words to Devanagari with a dictionary.)
2. **A/B the two synthesis strategies by ear** (30 minutes, on the phone speaker):
   - **(a) Single voice:** send the whole mixed-script sentence to one Kokoro Hindi voice.
   - **(b) Dual voice:** split by script, Devanagari runs → Hindi voice, Latin runs → English voice (`splitByScript` exists and is tested; the synthesis path is not wired). nitro-voice fixes the speaker id at engine creation, so this needs two engines in memory.
   - Pick whichever sounds better on the 4 sample sentences and document it. Also compare against Piper `hi_IN` (`EXPO_PUBLIC_TTS_ENGINE=piper-hi`).
3. **Tune speed** (about 1.0–1.1) and chunk length. Kokoro does best on medium-length utterances and is weak on very short ones, so tiny sentences are merged (`SentenceChunker`).

### Sentence chunker

`src/tts/chunker.ts` flushes on `. ! ? । \n`, only when whitespace follows the terminator (so "3.5" is not split), merges sentences shorter than 12 characters into the next one, and for the _first_ chunk also flushes on a comma once it has ≥ 25 characters, so speech starts early. One chunker lives for the whole turn, so text from a tool step and the final step flows through the same queue.

### Playback

With nitro-voice, `speak()` plays the audio itself (Corrections 1). `src/pipeline/ttsQueue.ts` simply awaits `speak()` per sentence, strictly in order: sentence N+1 starts synthesizing as soon as N has been handed to the audio output, while N's tail is still playing. With **Option B** use the built-in player: `startPcmPlayer(sampleRate, 1)`, `writePcmChunk(chunk.samples)` inside `onChunk`, `stopPcmPlayer()` in `onEnd`; only one stream per engine at a time, so queue sentences and start the next in `onEnd`.

---

## 9. Latency engineering

### Target budget (voice-to-voice)

| Stage                                | Direct answer      | Tool turn                              |
| ------------------------------------ | ------------------ | -------------------------------------- |
| VAD endpoint (silence wait)          | 500 ms (fixed)     | 500 ms (fixed)                         |
| STT decode                           | 300–1,200 ms       | 300–1,200 ms                           |
| LLM step 1 → first sentence / tool   | 2–4 s (measured on the shared endpoint) | 2–4 s (tool call complete)             |
| Filler audio starts                  | —                  | after TTS synthesizes the short line   |
| Tool execution                       | —                  | 50–800 ms (weather slowest)            |
| LLM step 2 → first sentence          | —                  | 2–4 s                                  |
| TTS first sentence                   | 200–700 ms         | 200–700 ms                             |

Treat these as targets to verify, not guarantees. The measured LLM first-token time (about 2.5–3 s median across the tested models) already exceeds the original 250–600 ms assumption, so the 1.5–3 s end-to-end goal is at risk; report the real numbers. Report direct and tool turns separately; averaging them hides both.

### Tricks, in priority order

1. **Sentence-level pipelining.** Flush to TTS on `. ! ? । \n`; for the _first_ chunk also flush on a comma once it has ≥ 25 characters. Synthesize sentence N+1 while N plays (a strictly ordered async queue).
2. **Keep everything warm:** load STT + TTS at app start, run a dummy synthesis, and open an HTTPS connection to the NVIDIA endpoint at launch.
3. **Bounded prompt:** the memory design in §7.6 caps the request at roughly 600 tokens of history plus the tool schemas, so TTFT stays flat across turns.
4. **Short replies** (prompt + `max_tokens`), and reasoning turned off or set to `low` (§7.2).
5. **Pick the fastest accurate model** from the eval; a faster endpoint helps more than any local tuning.
6. **int8 models, CPU provider first.** (nitro-voice fixes Whisper at 2 threads and the VAD at 0.5 s; patch to change.) Option B can use NNAPI/XNNPACK/QNN; benchmark before trusting any accelerator.
7. **Protect the JS thread:** keep native callbacks tiny (forward and return), never log per chunk in release timing runs, and run the benchmark with a release build (`npx expo run:android --variant release`), since dev builds are noticeably slower.
8. Optional: Moonshine for English-mode STT (Option B).

### Instrument it (and show it in the demo)

The app reports per turn: `llm_ttft_ms`, `tool_ms`, `tts_first_chunk_ms`, `first_audio_ms` (transcript received → first synthesized audio), `total_ms`, the model used and the **agent trace** (`→ get_weather({"city":"Bangalore",…}) ✓ 420 ms`) in an on-screen overlay, with medians split into direct and tool turns, and exports them as CSV. This directly addresses the first grading criterion and makes the agent's steps visible.

---

## 10. Proving "fully on-device" STT/TTS

- A README table: model name, size, runtime (sherpa-onnx via the RN module), and the fact that the ASR/TTS code paths make **no network calls** (the only network code lives in `src/llm/` and `src/tools/weather.ts`).
- In the demo video, a short clip with **airplane mode on**: record a phrase and show the transcript appear, then play a canned TTS line. Then turn the network back on for the full agent flow.
- An "Offline test" screen: STT-only (transcribe, no LLM) and TTS-only buttons that work without internet, plus a live "internet reachable?" probe.
- With no network, the agent says a cached line ("Internet नहीं है, पर मैं सुन सकती हूँ।") instead of hanging.

Do not use Android's `SpeechRecognizer` or system TTS (including `expo-speech`) as your main path. If you use either as a last-resort fallback, say so explicitly in the README.

---

## 11. Repo layout

```
App.tsx                  tab shell (agent / offline / benchmark)
src/agent/               runTurn loop, Memory, ToolRunner, summarizer
src/llm/                 SSE client + fallback, prompts, tool schemas, model defaults
src/tts/                 sentence chunker, normalizer (EN/HI numbers & times), script splitter
src/pipeline/            VoiceAgent state machine, TtsQueue, metrics, transcript filter
src/speech/              nitro-voice adapters, model packs + downloader, generated manifest
src/tools/               alarm, reminder, calendar, weather
src/session/             runtime wiring, permissions
src/ui/                  screens
src/benchmark/           WAV parser, result types, on-device runner
eval/  benchmarks/       tool-calling eval; WER tooling
docs/                    PRD, ARCHITECTURE, DECISIONS, TASKS
tests/                   Vitest (Node)
scripts/gen_model_manifest.py
```

The `VoiceAgent` state machine has these states: `idle → listening → thinking ⇄ acting (tool) → speaking → listening`. The mic is off during a turn (half-duplex). The UI shows the current state.

Do **not** commit API keys: `.env` is gitignored, ship `.env.example`.

---

## 12. Re-sized plan (Fri 16 Oct → Sun 18 Oct EOD)

| When                        | Goal                                                                                               | Done when                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Fri 16 AM (after sleep)** | Project + dev client build; **§4 decision gate** + LLM smoke test                                  | Speak → transcript on screen, TTS audible on the phone, one NVIDIA model streams a tool call    |
| **Fri 16 midday**           | Streaming client + system prompt; wire STT → LLM → text                                            | Streaming reply on screen. **Hard stop at ~2 PM** if the speech libs still don't work (see §4)  |
| **Fri 16 PM**               | Sentence chunker, TTS playback, full loop with half-duplex mic                                     | Speak → hear a reply                                                                            |
| **Sat 17 AM**               | Tools + **agent loop** (§7.5) + **memory** (§7.6) + text normalizer + A/B TTS strategies           | The 4 example sentences work end to end; "alarm laga do → kitne baje? → saat baje" works        |
| **Sat 17 PM**               | STT benchmark + **tool eval** on 2–3 models, pick models, latency + trace overlay, release timing  | `benchmarks/results.md` and `eval/results.md` filled in                                         |
| **Sun 18 AM**               | Record demo, write README, push repo. **Stop coding by noon.**                                     |                                                                                                 |
| **Sun 18 PM**               | Buffer + submit                                                                                    | Email sent well before EOD                                                                      |

If you slip, cut in this order: Auto language detection → dual-voice TTS → Moonshine → rolling summary (keep the window + state layers) → parallel tool calls → backup model → barge-in. **Never cut** the agent loop, the latency overlay, the two benchmark tables (WER + tool eval), or the demo.

---

## 13. Demo video script (about 2.5 min, screen-record + external mic if possible)

1. 5 s: app overview, the latency + trace overlay, and the model list.
2. English: "What is the weather forecast for Bangalore tomorrow?" then the follow-up **"And the day after?"** (memory: no city repeated). Then "Can you set a reminder for my meeting at 5 PM?" Show the reminder actually created.
3. Hinglish: "Mujhe kal subah 7 baje ka alarm set karna hai." Show the alarm in the Clock app.
4. **Clarification:** "Alarm laga do" → agent: "कितने बजे का?" → "saat baje shaam" → alarm set. Point at the trace overlay.
5. Hinglish: "Aaj ka schedule kya hai, aur meri next meeting kab hai?" with the seeded calendar.
6. Airplane-mode clip (§10) proving offline STT/TTS.
7. Close on the WER table, the tool-eval table and the average end-to-end latency (direct vs tool turns).

Tips: use a **release build** for the recording, quiet room, phone screen recording with internal + mic audio, re-record rather than apologizing on camera. Check your NVIDIA rate limit before recording. Upload to a stable place (YouTube unlisted or Drive with open access) and test the link in a private window.

---

## 14. Risks and fallbacks

| Risk                                                       | Mitigation                                                                                                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RN speech wrapper will not build or crashes                | §4 gate; try the other library; else Kotlin native module; else the Kotlin guide. Decide by Fri ~2 PM.                                                                      |
| No VAD in the chosen library (Option B)                    | Use Option A, or add energy-threshold endpointing on the live PCM stream.                                                                                                   |
| Whisper too slow on your phone                             | Smaller model, Moonshine for English, or the Omnilingual CTC model; patch the 2-thread limit                                                                                |
| Dev build latency looks bad                                | Measure and demo on a **release** build                                                                                                                                     |
| JS thread jank during streaming                            | Tiny handlers, no logging in hot paths, batch UI updates                                                                                                                    |
| Agent hears itself                                         | Half-duplex: pause mic during playback                                                                                                                                      |
| Kokoro Hindi sounds off                                    | Switch to Piper `hi_IN` (`EXPO_PUBLIC_TTS_ENGINE=piper-hi`); improve normalization; try other voice ids                                                                      |
| ASR confuses Hinglish words                                | LLM infers intent; language toggle; Hindi/Hinglish fine-tune                                                                                                                |
| Whisper language fixed per engine                          | Re-create the engine on toggle, or keep two engines if memory allows                                                                                                        |
| NVIDIA endpoint slow to first token                        | Measured in the eval; pick the fastest model that passes; filler speech on tool turns. Escape hatch: any OpenAI-compatible provider is a base-URL + key swap.               |
| NVIDIA rate limit (429) / model retired (410)              | Backup model on the same key; spread eval runs out; re-list `/v1/models` before the demo                                                                                    |
| Reasoning model returns empty or slow replies              | Reasoning off / `reasoning_effort: "low"`, more `max_tokens`, ignore `reasoning_content` (§7.2)                                                                             |
| Model returns nothing and the agent claims success         | Fixed: "Done." only if a tool succeeded (§7.5)                                                                                                                              |
| Model loops on tools or hallucinates arguments             | `MAX_STEPS = 3`, no tools on the last step, schema validation in `runTool`, errors returned as JSON                                                                          |
| Memory confuses context across sessions                    | 10-minute idle reset + "New chat" button; state layer written by code, not the LLM                                                                                          |
| Alarm intent denied                                        | Ensure `com.android.alarm.permission.SET_ALARM` is in the merged manifest (prebuild), not Expo Go                                                                           |
| Reminder fires late on battery-optimized phones            | Use the Clock-app alarm intent for time-critical demos; test notification timing (Android 14+ denies exact alarms by default)                                              |
| Weak or no internet at demo time                           | Record on stable Wi-Fi/hotspot; keep Open-Meteo calls tiny; cached offline line                                                                                            |
| Project folder evicted by iCloud                           | Keep the repo outside Desktop/Documents (e.g. `~/Developer`); commit and push often                                                                                         |
| Running out of time                                        | Follow the cut order in §12                                                                                                                                                 |

---

## 15. Optional extras if you finish early

- Barge-in by voice: stop TTS and cancel the LLM stream (the `AbortSignal` path exists) when VAD detects the user speaking.
- Persist the memory state layer across restarts (AsyncStorage).
- A hotword or push-to-talk button instead of always-listening.
- A Whisper-small fine-tune on Hinglish data (Vaani, Kathbath). Probably too big for this deadline; mention as future work.

---

## 16. Sources consulted

- react-native-sherpa-onnx (feature table, model types, requirements, VAD status): https://github.com/XDcobra/react-native-sherpa-onnx
- Its streaming TTS docs (`createStreamingTTS`, native PCM player): https://github.com/XDcobra/react-native-sherpa-onnx/blob/main/docs/tts-streaming.md
- react-native-nitro-voice (VAD-gated Whisper, Kokoro/VITS/Matcha, Expo plugin, requirements): https://github.com/picked-frames/react-native-nitro-voice
- NVIDIA API catalog (models, keys, limits): https://build.nvidia.com and API reference https://docs.api.nvidia.com
- Android `AlarmClock` intents: https://developer.android.com/guide/components/intents-common.html
- `SET_ALARM` permission with `expo-intent-launcher` (forum thread): https://forums.expo.io/t/how-to-add-unsupported-permission/43232
- expo-alarm (unofficial): https://github.com/Alperengozum/expo-alarm
- expo-calendar docs: https://docs.expo.dev/versions/latest/sdk/calendar/
- sherpa-onnx docs and releases: https://k2-fsa.github.io/sherpa/onnx/ and https://github.com/k2-fsa/sherpa-onnx
- Kokoro v1.0 sherpa pack: https://huggingface.co/csukuangfj/kokoro-int8-multi-lang-v1_0 · Whisper small: https://huggingface.co/csukuangfj/sherpa-onnx-whisper-small · Piper Hindi: https://huggingface.co/csukuangfj/vits-piper-hi_IN-pratham-medium
- Whisper int8 Indic packs in sherpa format: https://huggingface.co/ippocode/indic-asr-onnx
- Hinglish Whisper fine-tunes: https://huggingface.co/shunyalabs/zero-stt-hinglish, https://huggingface.co/abhishekgautamm/whisper-tiny-hinglish
- Kokoro Hindi voices and caveats: https://github.com/StackOneHQ/stackvox, https://replicate.com/codingayam/kokoro-82m-complete
- Hinglish TTS comparison (script normalization effect): https://github.com/harrrshall/hinglish-tts

_Caveats._ (1) Both RN speech libraries are small projects whose READMEs can be ahead of or behind the released npm version; the nitro-voice behaviour described here was read from the 0.1.1 source, but nothing has run on a phone yet. (2) This document was reconstructed on 2026-10-16 after an iCloud eviction destroyed the previous working copy (see `docs/TASKS.md`); it carries all the substantive content and corrections but is not byte-identical to the earlier revision. (3) NVIDIA model IDs and free-tier limits change; the eval results are a snapshot from one day and one run per model. (4) Model sizes, speeds and quality grades come from model cards and community reports, not from our own benchmarks. Measure on your phone and let the numbers pick the final models.

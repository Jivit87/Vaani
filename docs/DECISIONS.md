# Decisions

Each entry: what, why, and what would change it.

**D1 — Expo prebuild + dev client, not Expo Go.** nitro-voice is a native module; SET_ALARM must be in the merged manifest.

**D2 — nitro-voice (Option A) as the speech runtime.** Its source shows: VAD-gated Whisper with built-in mic capture, Kokoro/VITS TTS, and _native playback_. Chosen because it matches the pipeline with the least glue. Risks (device-gated): very young library; hardcoded 2 threads and 0.5 s VAD silence; TTS is per-sentence not true streaming. `SttEngine`/`TtsEngine` interfaces isolate it; the fallback is `react-native-sherpa-onnx` behind the same interfaces, or a Kotlin module.

**D3 — No `react-native-audio-api`.** The guide assumed we must play PCM ourselves. nitro-voice's `speak()` writes to an `AudioTrack` itself; playing the chunk in JS too would double the audio. Removing the dependency also removes the mic/playback session-conflict risk.

**D4 — `expo/fetch` streaming instead of `react-native-sse`.** One transport implementation (`fetch` injected) runs in the app and in Node, so the eval exercises the production client and the SSE parser is unit-tested against a real local server. Removes a dependency.

**D5 — Per-file model download with rename, not archives.** sherpa-onnx ships `.tar.bz2`; no RN extractor handles it. Hugging Face repos expose individual files; `scripts/gen_model_manifest.py` records URL + size, and files are saved under the names nitro-voice expects (`encoder.onnx`, `model.onnx`, …). Size doubles as the resume/integrity check.

**D6 — Kokoro v1.0 int8 (`kokoro-int8-multi-lang-v1_0`), not `v1_1`.** `v1_1` is the Chinese/English model with no Hindi voices. v1.0 has `hf_alpha`=31, `hf_beta`=32, `hm_omega`=33, `hm_psi`=34, `af_heart`=3 (read from the model's own `id2speaker` metadata). Lexicon files are not downloaded because nitro-voice does not pass them to Kokoro.

**D7 — Hindi pronunciation is the top device risk.** nitro-voice does not set Kokoro's espeak `lang`, so Devanagari may be mispronounced. `EXPO_PUBLIC_TTS_ENGINE=piper-hi` switches to Piper `hi_IN-pratham-medium` (its espeak voice is in the model metadata). Decide by ear on the phone (about.md §8 A/B).

**D8 — Memory is code-first.** Window (4 turns) + 60-word summary + a state record that tool code writes. The LLM is never trusted to remember structured facts, and the prompt size is bounded, so TTFT does not drift.

**D9 — Integrity by size, not SHA-256.** Hugging Face's tree API gives sizes cheaply; hashes would need LFS metadata. A truncated download is the realistic failure and size catches it. Revisit if models are mirrored elsewhere.

**D10 — LLM model choice is empirical, and was measured.** Live eval 2026-10-16 (`eval/results.md`): `deepseek-ai/deepseek-v4.1-flash` primary (100 % tool/args/clarification, TTFT 3.2 s), `nvidia/nemotron-3.5-lightning-30b-a3b` backup (fastest, 85 % tool choice). The initial guess `meta/llama-3.3-70b-instruct` had been retired by NVIDIA. TTFT of ~2.5–3 s is the largest latency cost in the pipeline; a faster endpoint would help more than any local tuning. Re-run the eval before the demo: catalog entries change.

**D11 — Filler line is a queued sentence, not cached audio.** With native playback there is no hook to replay PCM. The line synthesizes while the tool runs, so it still hides most of the tool + second-LLM gap.

**D12 — Latency scope.** nitro-voice's VAD-gated STT exposes no end-of-speech timestamp, so the app measures _transcript received → first audio_. Add the benchmark's median decode time and the 0.5 s VAD wait for true voice-to-voice (README explains).

**D13 — IST handled by arithmetic.** UTC+5:30 fixed offset; avoids relying on Intl time-zone support in Hermes.

**D14 — Default LLM provider is Groq (free tier); NVIDIA is the alternative.** On 2026-10-16 the live eval showed `openai/gpt-oss-120b` on Groq matching the best NVIDIA model's accuracy (100 % tool choice, arguments and clarification) with a ~717 ms median first token versus ~3.2 s, and the NVIDIA chat endpoint later hung for every model for 12+ minutes. Provider is chosen by `EXPO_PUBLIC_LLM_PROVIDER` (`groq` | `nvidia`; if unset, NVIDIA when its key exists, else Groq). Backup model: `openai/gpt-oss-20b` (97 % / 89 % / 100 %). Only free-tier Groq models are used. The Groq free tier is rate-limited (~30 requests/min per model), which is fine for one user talking but is why the eval needs pacing. Keys live only in the gitignored `.env`.

**D15 — Mic reopens only after the speaker buffer drains; own-voice echo is filtered.** nitro-voice 0.1.1 resolves `speak()` after copying audio into a ~1 s `AudioTrack` buffer, so a turn that ends the moment synthesis ends leaves up to a second of speech still playing. On the Redmi the recogniser heard "Celsius." from the agent's own reply and answered it. `TtsQueue.playbackDone()` waits `min(lastAudioMs, 1000) + 350 ms`, and `isEcho()` drops short mic transcripts made only of words from the reply spoken in the last 8 s. Typed input is exempt from the echo guard and from mute.

**D16 — Voice-first UI built from core React Native.** Orb (stacked gradients and translucent rings, animated with the native driver), live captions from `onSpeaking`, one large mic/stop button, and developer tools behind a menu. Added only `react-native-safe-area-context`, `expo-linear-gradient` and `expo-keep-awake`; icons are drawn with Views, so there is no icon font or SVG dependency. The orb pulse while speaking is a random rhythm because the native player exposes no audio level.

**D17 — Review of the external "Performance & Quality Improvement Plan" (2026-10-16).** Implemented: compact prompt (-31 % tokens) and schema descriptions; LLM connection warm-up; geocoding and forecast caches (15 min) with one retry on 429/5xx; Whisper blocklist limited to genuine hallucinations plus repetition-loop detection; Hindi-word Roman-to-Devanagari dictionary (Hindi-origin words only, applied in Hinglish sessions or when the sentence already contains Devanagari); `EXPO_PUBLIC_TTS_VOICE` voice names; broader offline detection; 8 more noisy eval cases and a p90 TTFT warning; a per-segment STT decode-time log line (`adb logcat -s NitroSTT`).

Changed or rejected, with reasons:

- **Blocklist entries "yes", "no", "yeah", "right", "namaste", "shukriya", "a", "the", "I", "so"** are valid replies to a clarifying question ("Do you want 7 AM?" "yes"); only real hallucinations are blocked.
- **Pre-speaking the filler lines at launch** would be audible, because `speak()` plays through the speaker; the existing `speak('.')` warm-up stays.
- **Dynamic tool filtering** by keyword would miss "wake me up at five" and similar; Groq's first token is already ~0.7 s, so the gain does not justify the false negatives.
- **Lower `maxTokens` on the answer step** can truncate a reasoning model before it answers.
- **STT confidence filtering** is impossible: nitro-voice's `onTranscript` receives only the text.
- **`sttDecodeMs` in the turn metrics** has no honest source (no end-of-speech timestamp), so it is not reported; the native log line gives the decode time for offline analysis instead.
- **"The assignment specifies NVIDIA"** does not match the original brief, which also allowed Groq; Groq is the default (D14) and NVIDIA stays selectable.
- **Whisper threads 2 to 4** is not applied: it needs an A/B measurement with real speech on the phone (thermal throttling is possible), and the first logged numbers show decode takes about 2.0-2.5 s even for 0.6 s of audio (Whisper pads to a fixed window), so it is the largest on-device latency item. Experiment: speak 8 sentences at each setting and compare `decode_ms` from `adb logcat -s NitroSTT`.

**D18 — Vaani is a general assistant; tools are an extra.** The prompt now presents Vaani as a knowledgeable voice assistant (explain, advise, translate, write, small talk) with adaptive length (1-3 sentences by default, up to ~120 words when asked to explain or tell a story). Tools added beyond alarm/reminder/calendar/weather: `calculate` (exact arithmetic, safe recursive-descent parser, no `eval`), `search_wikipedia` (one request; grounds facts that may have changed since the model's training), `set_timer`. Memory window 4 to 6 turns; answer `maxTokens` 200/300 to 500/700. Eval: 21 general cases plus style scoring (plain speech, length, optional tools). On `gpt-oss-20b`: 96 % tool choice, 100 % style, 513 ms median first token; answers were read by hand and were good (grounded facts, exact maths, correct follow-ups, honest "I can't call people").

**D19 — Free-tier budget is a design constraint.** Groq free limits measured from response headers and 429 messages: `gpt-oss-120b` 8,000 tokens/minute, **200,000 tokens/day**, 1,000 requests/day. One Vaani request is ~460 tokens (prompt) to ~810 (with all seven tools) plus the answer, so roughly 150-190 requests per day on the primary. A day of evals exhausted it. Mitigations: a model that returns 429 is skipped until its cooldown (parsed from "try again in ..."), the backup `gpt-oss-20b` has its own budget, and when every model is limited the user hears a plain spoken message. Do not run large evals on the primary the same day as a demo.

**D20 — Default voice is Piper (fast); Kokoro is the optional "Natural" voice.** Measured on a Redmi Note 12 Pro 5G with the per-sentence log (`adb logcat -s NitroTTS`): Kokoro-82M int8 synthesizes at a real-time factor of 1.5 (4 threads: 1.75, so more threads did not help), which leaves about 40 % of a long reply as silence even with two sentences synthesizing ahead. Piper VITS medium: real-time factor 0.20-0.22 and 0-1 % silence, for both the English (`en_US-amy-medium`) and Hindi (`hi_IN-pratham-medium`) voices. The voice follows the session language and is switchable in the menu (Fast/Natural). Whether Piper _sounds_ acceptable is a listening judgement not yet made by the author of this note.

**D21 — The Hindi-only voice never receives Latin text.** Piper's Hindi voice cannot read Latin letters, and the LLM sometimes answers Hinglish in Roman script even when told not to (the smaller model mirrors the user's script). For that voice the text is converted in three steps: the Hindi-word dictionary (`hinglishDict.ts`), English loanwords respelled in Devanagari (`loanwords.ts`, includes AM/PM as letters), then a phonetic rule-based transliterator for anything left (`translit.ts`). The transliterator is an approximation (single vowels are read short, so "kahani" becomes कहनि) and exists to avoid letter-by-letter reading, not to be correct.

**D22 — nitro-voice patches** (`patches/`, applied by `patch-package`): Kokoro `lang`/lexicon (without it sherpa aborts the process), ordered overlapping `speak()` calls (ticketed playback, serialized synthesis), per-segment STT decode time and per-sentence TTS timing logs. TTS threads stay at 2, STT at 2: the only measured thread experiment (TTS 4 threads) was slower.

**Build gotcha:** changes to `.env` (for example `EXPO_PUBLIC_TTS_ENGINE`) are not Gradle inputs and Metro caches transformed files. To make a release build see a changed `.env`: delete `android/app/build/generated/assets/react` and the Metro caches in `$TMPDIR` (`metro-*`) before `assembleRelease`.

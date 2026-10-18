# Tasks and delivery status

Legend: ✅ done and verified here · 🟡 implemented, **not verifiable in this environment** (needs phone / Android SDK / NVIDIA key) · ⏳ not started · ➖ deferred

Last updated: 2026-10-16.

## Incident: iCloud eviction and rebuild (2026-10-16)

The project was first created under `~/Desktop`, which syncs to iCloud. With the disk at 98 %, macOS evicted most files to "dataless" placeholders whose contents could not be re-downloaded (reads returned 0 bytes; `brctl download`, daemon restart and Finder all failed; no Time Machine snapshots). Everything still readable was copied to `~/VaaniBackup`, and the whole project was rebuilt in `~/Developer/Vaani` from the session history. The rebuild passes typecheck, lint and all tests. **Not re-verified after the rebuild:** the Gradle APK build (it passed before the incident on equivalent code) and `docs/original-brief.md` content beyond what is restored below. If the original `~/Desktop/Vaani` files ever download, diff them against this tree rather than overwriting.

## Verified in this environment

Environment: macOS, Node 20, JDK 17 + Android SDK installed on 2026-10-16 (~3 GB at ~/Library/Android/sdk; export `ANDROID_HOME` and `JAVA_HOME=/opt/homebrew/opt/openjdk@17`), no phone. NVIDIA key in `.env`. Project lives in `~/Developer/Vaani` (see incident below). Results of the last full run:
`npm run check` → typecheck ✅ · eslint ✅ (0 problems) · prettier ✅ · vitest ✅ (13 files, 134 tests), re-run after the rebuild below.
`npx expo export --platform android` ✅ (728 modules → Hermes bytecode; env-var inlining proven with positive and negative controls).
`npx expo prebuild --platform android` ✅ (manifest has all permissions incl. `SET_ALARM`, `minSdkVersion=29`, jitpack repo, New Architecture on).
`npm ci` ✅.
`./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a` ✅ (JDK 17, SDK 36, NDK 27.1; 13m53s; 127 MB `app-debug.apk`, package `com.vaani.voiceagent`, all permissions present, sherpa-onnx + onnxruntime native libs packaged). Compiles nitro-voice Kotlin/C++ and resolves the jitpack AAR. Not installed or run on a phone. Release build not attempted. `benchmarks/run_wer.py` ✅ on synthetic data (hand-checked: 5.3 % / 28.6 %).

## Real-phone run (2026-10-16, Redmi Note 12 Pro 5G, HyperOS 2 / Android 14, arm64, 5.5 GB RAM; release APK)

Verified **on the phone**:

- Install, first-launch model download (542 MB over a hotspot), permissions, Whisper + Kokoro + VAD load, "listening" with the mic live.
- **Real microphone speech recognised on-device** (Whisper-small): "What is the temperature for Bangalore tomorrow?" (spoken "weather forecast"; a one-word difference) and "Who is this?", answered by the agent. Ambient speech in the room is also transcribed and answered, so an always-listening mic needs a quiet room or the mute button.
- Tools end to end with the live Groq `gpt-oss-120b`: weather (Open-Meteo), alarm (also seen in the system Clock on the emulator), reminder (emulator), **calendar read** (the agent read a real event from the phone's calendar).
- English mode replies in English; Hinglish mode in Devanagari + Latin (explicit prompt rule from the toggle).
- Latency from the overlay, first tool turn on a phone hotspot: first audio **7.4 s** (LLM first token 1.45 s, weather tool 4.4 s, first TTS chunk 4.2 s). A direct, tool-free turn was faster but not yet recorded as a clean series. These are single observations, not medians.
- New voice UI: orb states (listening / thinking / speaking / muted), live captions, stop button, mute that still allows typing, menu with language, transcript and developer tools.

Bugs found on the device and fixed (all with tests): the agent **heard its own voice** (nitro-voice `speak()` resolves when audio is copied into a ~1 s player buffer, not when played; mic now reopens after the buffer drains, and short transcripts made only of the agent's own words are dropped as echo); Whisper annotations such as `(static)` and `[BLANK_AUDIO]` and stray vowel marks were being answered; the transcript cleanup dropped valid short Hindi words like "हाँ"; mute blocked typed input; the echo guard blocked typed input; system bars overlapped the old UI.

**Still not verified:** Hindi speech recognition accuracy and Hindi/Hinglish voice quality (needs a person speaking and listening); the 40-sentence WER table; a clean latency series (n >= 10 per type); reminder delivery on the phone; offline (airplane-mode) screen; Piper fallback voice; the demo video. Known weakness: first audio of 4-7 s on tool turns, dominated by Kokoro's first chunk on this CPU (hardcoded 2 threads in nitro-voice) and network.

## General assistant and speech speed (2026-10-17)

- **General assistant:** prompt rewritten, `calculate` / `search_wikipedia` / `set_timer` added, memory 6 turns, answers up to ~120 words. Eval on `gpt-oss-20b` (general cases): 96 % / 100 % style; answers read by hand. **Not yet run on the primary `gpt-oss-120b`**: its free daily token budget was used up by earlier evals (D19).
- **On-device speech speed (measured, Redmi Note 12 Pro 5G):** Kokoro real-time factor 1.5 (about 40 % silence in a long reply); Piper 0.2 (about 1 %). Piper is now the default voice; Kokoro is a menu option ("Natural"). Voice quality of both is **unjudged**: nobody has listened to them side by side yet.
- **Needs a listener:** open the menu, switch Voice between Fast and Natural, and in both English and Hinglish ask for a short story. Judge pronunciation (especially Hindi words and English words inside Hindi).
- **Known weakness:** the Hindi-only voice relies on dictionaries and a rule-based transliterator for English words and Roman Hinglish (D21); expect some odd pronunciations until it is tuned by ear.

## Milestones

| #   | Item                                                                                    | Status                                  | Notes                                                        |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| 1   | Repo foundation: Expo SDK 57 app, TS strict, ESLint, Prettier, Vitest, CI               | ✅                                      |                                                              |
| 2   | Agent core: types, prompt, tool schemas, validated ToolRunner                           | ✅                                      | `tests/toolRunner.test.ts`                                   |
| 3   | Streaming LLM client (SSE, think-filter, tool-call assembly, timeout, fallback)         | ✅                                      | tested against a real local HTTP server; live NVIDIA call 🟡 |
| 4   | Agent loop (≤3 steps, parallel tools, filler, abort)                                    | ✅                                      |                                                              |
| 5   | Memory (window + summary + state, idle reset)                                           | ✅                                      |                                                              |
| 6   | TTS text pipeline: chunker, normalizer (EN/HI numbers, times, symbols), script splitter | ✅                                      |                                                              |
| 7   | Tools: alarm (intent), reminder (notifications), calendar, weather (Open-Meteo)         | ✅ weather · 🟡 alarm/reminder/calendar | compile against real SDK types; behaviour needs a phone      |
| 8   | Model manifest + downloader (resume by size, retry, concurrency, progress)              | ✅                                      | real Hugging Face file lists and sizes                       |
| 9   | Speech adapters (nitro-voice STT/TTS)                                                   | 🟡                                      | written against the package source; never executed           |
| 10  | VoiceAgent state machine, half-duplex, error/offline lines, metrics + CSV               | ✅ logic · 🟡 mic behaviour             |                                                              |
| 11  | UI: setup, agent + latency/trace overlay, offline test, benchmark                       | 🟡                                      | type-checks and bundles; not rendered                        |
| 12  | STT benchmark: in-app runner, WAV parser, `run_wer.py`                                  | ✅ parser/script · 🟡 runner            |                                                              |
| 13  | Tool-calling eval (27 cases, scorer, CLI)                                               | ✅                                      | live run 2026-10-16: see `eval/results.md`                   |
| 14  | Docs (README, PRD, ARCHITECTURE, DECISIONS, AGENTS)                                     | ✅                                      |                                                              |

## Still to do

- Voices are Amy (English) and Pratham (Hindi) with a toggle that follows the language you speak (D23). Listen to both and judge them, especially English words inside Hindi sentences.

Done since this list was first written: phone setup, build and install, on-device speech, the weather/calendar/alarm/reminder tools, and the voice and UI work (see the sections above).

1. **Listen** to the Fast (Piper) and Natural (Kokoro) voices in English and Hinglish and note which sounds better (D20, D21).
2. **Record 40 sentences** into `benchmarks/audio/`, fill `benchmarks/test_sentences.tsv`, run the in-app benchmark and `python3 benchmarks/run_wer.py`, and paste the table into `benchmarks/results.md`.
3. **Latency**: run at least 10 direct and 10 tool turns on a release build and export the CSV from the menu.
4. **Reminder delivery** on the phone and the offline (airplane mode) screen.
5. **Demo video**, including an airplane-mode clip for the on-device speech.

## Device-gated improvements (do only if measurement says so)

- nitro-voice hardcodes Whisper `numThreads = 2` and VAD `minSilenceDuration = 0.5 s` inside the VAD-gated path. If decode is slow or endpointing feels laggy, patch with `patch-package` (`HybridSTT.kt`) and re-measure.
- `SCHEDULE_EXACT_ALARM` is denied by default on Android 14+; reminders may fire inexactly. Use the Clock alarm for time-critical demos, or direct the user to the exact-alarm setting.
- Whisper-small may hallucinate on silence; `transcriptFilter.ts` has a starter list — extend it from real logs.

## Deferred (documented cut order, docs/original-brief.md §12)

➖ auto language detection · ➖ dual-voice TTS (`splitByScript` exists and is tested; synthesis path not wired) · ➖ Moonshine/Omnilingual STT variants · ➖ barge-in by voice (manual Stop exists) · ➖ romanised-Hindi → Devanagari dictionary (normalizer handles digits/times/symbols only) · ➖ persisted memory · ➖ patched `npm audit` items (all in build tooling; fix needs `--force` downgrade of Expo).

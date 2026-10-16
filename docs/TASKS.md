# Tasks and delivery status

Legend: ✅ done and verified here · 🟡 implemented, **not verifiable in this environment** (needs phone / Android SDK / NVIDIA key) · ⏳ not started · ➖ deferred

Last updated: 2026-10-16.

## Incident: iCloud eviction and rebuild (2026-10-16)

The project was first created under `~/Desktop`, which syncs to iCloud. With the disk at 98 %, macOS evicted most files to "dataless" placeholders whose contents could not be re-downloaded (reads returned 0 bytes; `brctl download`, daemon restart and Finder all failed; no Time Machine snapshots). Everything still readable was copied to `~/VaaniBackup`, and the whole project was rebuilt in `~/Developer/Vaani` from the session history. The rebuild passes typecheck, lint and all tests. **Not re-verified after the rebuild:** the Gradle APK build (it passed before the incident on equivalent code) and `about.md` content beyond what is restored below. If the original `~/Desktop/Vaani` files ever download, diff them against this tree rather than overwriting.

## Verified in this environment

Environment: macOS, Node 20, JDK 17 + Android SDK installed on 2026-10-16 (~3 GB at ~/Library/Android/sdk; export `ANDROID_HOME` and `JAVA_HOME=/opt/homebrew/opt/openjdk@17`), no phone. NVIDIA key in `.env`. Project lives in `~/Developer/Vaani` (see incident below). Results of the last full run:
`npm run check` → typecheck ✅ · eslint ✅ (0 problems) · prettier ✅ · vitest ✅ (13 files, 134 tests), re-run after the rebuild below.
`npx expo export --platform android` ✅ (728 modules → Hermes bytecode; env-var inlining proven with positive and negative controls).
`npx expo prebuild --platform android` ✅ (manifest has all permissions incl. `SET_ALARM`, `minSdkVersion=29`, jitpack repo, New Architecture on).
`npm ci` ✅.
`./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a` ✅ (JDK 17, SDK 36, NDK 27.1; 13m53s; 127 MB `app-debug.apk`, package `com.vaani.voiceagent`, all permissions present, sherpa-onnx + onnxruntime native libs packaged). Compiles nitro-voice Kotlin/C++ and resolves the jitpack AAR. Not installed or run on a phone. Release build not attempted. `benchmarks/run_wer.py` ✅ on synthetic data (hand-checked: 5.3 % / 28.6 %).

## Emulator run (2026-10-16, Android 14 arm64 AVD `vaani`, no phone available)

Run with `npx expo run:android --device vaani` and Metro. Found and fixed two bugs unit tests could not catch:

1. **Model download died at 536/537 MB**: an espeak data file is named `!v/Mr serious`; the manifest URL was not percent-encoded. Fixed in `scripts/gen_model_manifest.py`; `tests/download.test.ts` now checks every URL.
2. **App process killed when Kokoro loaded**: nitro-voice 0.1.1 builds the Kokoro config with no `lexicon`/`lang`, and sherpa-onnx aborts for multi-lingual Kokoro v1.0. Fixed with `patches/react-native-nitro-voice+0.1.1.patch` (applied by `postinstall: patch-package`): `lang = "hi"` and `lexicon-us-en.txt` (added to the Kokoro pack). **Whether Hindi/English then sound correct is still unverified** (needs listening on a device).

Verified on the emulator (Android 14 arm64, typed input; microphone speech and audio quality NOT assessed):

- Install, model download with size check, permissions flow, Whisper + Kokoro + VAD load, "listening" state.
- **Full agent turns through Groq `openai/gpt-oss-120b`:** weather ("What is the weather in Pune tomorrow") called `get_weather(Pune, 2026-10-17)`, live Open-Meteo succeeded, reply spoken in Devanagari Hindi (Hinglish mode). Alarm ("Set an alarm for 7 30 AM tomorrow") called `set_alarm(7, 30)` and the **system Clock app showed a real "Voice assistant alarm 7:30 AM Tomorrow"**. Reminder ("Remind me to call mom tomorrow at 9 AM") called `set_reminder(2026-10-17T09:00+05:30)` and succeeded; the agent confirmed "कल सुबह नौ बजे".
- Bugs the emulator exposed and that are fixed: download URL encoding; Kokoro abort (nitro-voice patch); the agent confirmed the alarm as "seven o'clock" when it was 7:30 (prompt rule + `alarm_12h` field); the first reminder timed out behind a permission dialog (permissions now requested at launch; device tool timeouts raised to 5-8 s); tool errors now visible in the trace.
- A failing tool was reported honestly ("I didn't get that") and never as success.

**Not verified:** `get_schedule` (calendar read) timed out once on the starved emulator and was not re-run (cause unknown: slow machine vs real hang); the scheduled reminder firing; real microphone speech and Whisper accuracy (the emulator mic produced noise transcripts such as "ने न", which the transcript filter does not catch); Kokoro Hindi/English audio quality; any latency number (the emulator on this 8 GB Mac took 20+ s for TTS and is not representative); Piper fallback; offline-mode screen; benchmark screen.
The emulator became unusable when the Mac ran out of memory (about 80 MB free, swap 90 % full); testing stopped there.

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
| 14  | Docs (README, PRD, ARCHITECTURE, DECISIONS, AGENTS, CLAUDE)                             | ✅                                      |                                                              |

## Needs a human with the right hardware (in this order)

1. `cp .env.example .env`, add the NVIDIA key. Run the LLM smoke test and `npm run eval:tools -- --models <2–3 ids>`; commit the winning model IDs and paste the table into `eval/results.md`. _(about.md §4, §7.2)_
2. (Toolchain already installed on this Mac.) Plug in a phone with USB debugging; `npm run prebuild && npm run android` on a physical phone (API 29+, ≥ 6 GB RAM).
3. **Day-1 gate:** speak → transcript on screen; TTS audible; 20-turn loop without a crash. If nitro-voice fails, follow DECISIONS D2.
4. **Hindi TTS A/B** (D7): Kokoro `hf_alpha` vs `hf_beta` vs `EXPO_PUBLIC_TTS_ENGINE=piper-hi`. Record the choice.
5. Verify on device: alarm appears in Clock; reminder fires; calendar read (seed 2–3 events, include one crossing midnight); mic permission flow; half-duplex (agent must not hear itself).
6. Record 40 sentences → `benchmarks/audio/`, fill `benchmarks/test_sentences.tsv`, run the in-app benchmark, `python3 benchmarks/run_wer.py`, paste into `benchmarks/results.md`.
7. Release build (`npm run android:release`) for latency numbers and the demo; fill `docs/` latency table from the CSV export.
8. Airplane-mode clip via the Offline tab; demo video per about.md §13.

## Device-gated improvements (do only if measurement says so)

- nitro-voice hardcodes Whisper `numThreads = 2` and VAD `minSilenceDuration = 0.5 s` inside the VAD-gated path. If decode is slow or endpointing feels laggy, patch with `patch-package` (`HybridSTT.kt`) and re-measure.
- `SCHEDULE_EXACT_ALARM` is denied by default on Android 14+; reminders may fire inexactly. Use the Clock alarm for time-critical demos, or direct the user to the exact-alarm setting.
- Whisper-small may hallucinate on silence; `transcriptFilter.ts` has a starter list — extend it from real logs.

## Deferred (documented cut order, about.md §12)

➖ auto language detection · ➖ dual-voice TTS (`splitByScript` exists and is tested; synthesis path not wired) · ➖ Moonshine/Omnilingual STT variants · ➖ barge-in by voice (manual Stop exists) · ➖ romanised-Hindi → Devanagari dictionary (normalizer handles digits/times/symbols only) · ➖ persisted memory · ➖ patched `npm audit` items (all in build tooling; fix needs `--force` downgrade of Expo).

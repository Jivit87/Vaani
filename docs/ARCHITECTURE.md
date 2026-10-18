# Architecture

```
mic ─▶ nitro-voice STT (Silero VAD + Whisper int8, native) ─▶ transcript
                                                              │
                          VoiceAgent (state machine, half-duplex)
                                                              ▼
   Memory (window + summary + state) ─▶ runTurn (≤3 steps) ─▶ LLM client (SSE) ──▶ NVIDIA API
                                              │  tool calls          │ tokens
                                              ▼                      ▼
                                       ToolRunner (validate)   SentenceChunker
                                              │                      │
                                     alarm / reminder /              ▼
                                     calendar / weather      TtsQueue ─▶ nitro-voice TTS (Piper, or Kokoro; native, plays audio)
```

## Layers and boundaries

| Layer           | Path                                                                                               | Depends on          | Notes                                                            |
| --------------- | -------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------- |
| Pure core       | `src/agent`, `src/llm`, `src/tts`, `src/pipeline`, `src/util`, `src/benchmark/{wav,results}.ts`    | nothing RN-specific | Runs under Node; this is what the unit tests and the eval import |
| Device adapters | `src/tools/{alarm,reminder,calendar}.ts`, `src/speech/{nitro,fsOps}.ts`, `src/benchmark/runner.ts` | Expo / nitro-voice  | Thin; no logic beyond mapping to the platform API                |
| Wiring          | `src/session/*`, `src/config.ts`                                                                   | all of the above    | Builds one `Runtime` per app session                             |
| UI              | `src/ui/*`, `App.tsx`                                                                              | wiring              | No business logic                                                |

Anything that must be testable takes its I/O as an argument: `fetch` (LLM client, weather), `FsOps`
(downloader), `ToolBackends` (tool runner), `SttEngine`/`TtsEngine` (pipeline), a clock (agent, memory).

## Turn lifecycle (`runTurn`)

1. `Memory.buildMessages` → system prompt (IST date/time, state, summary) + window + user text.
2. Stream the LLM. Text goes to the `SentenceChunker`; finished sentences go to the `TtsQueue`.
3. If the model returned tool calls: play the filler line if it said nothing yet, run tools in parallel
   through `ToolRunner` (validation, per-tool timeout, errors as JSON), append results, loop (max 3; the
   last step offers no tools).
4. If the model produced no words: say "Done." only if a tool really succeeded, otherwise ask the user to repeat.
5. `commitTurn` stores only the user text and the spoken reply. Tool payloads are dropped; their facts
   live in `state`, which tool code writes (`last_city`, `last_date`, `actions`).
6. After playback, `summarizeIfIdle` folds evicted turns into the rolling summary (best-effort).

## Failure behaviour

| Failure                                                            | Behaviour                                                                        |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 429 / timeout / network error before any text                      | retry once on the backup model                                                   |
| error after text was spoken                                        | no retry (avoids repeating speech); spoken error line                            |
| no network                                                         | spoken offline line (EN/HI), mic resumes                                         |
| malformed tool JSON / invalid args / tool exception / tool timeout | `{"error": …}` fed back to the model                                             |
| model returns nothing and no tool succeeded                        | "Sorry, I didn't get that" — never a false "Done."                               |
| one TTS sentence fails                                             | skipped; queue continues                                                         |
| user interrupt                                                     | LLM stream aborted, queue cancelled, no half-sentence spoken, turn not committed |

## Security notes

- `EXPO_PUBLIC_NVIDIA_API_KEY` is compiled into the bundle. Acceptable for this assignment; revoke after grading. A production app would proxy the LLM.
- Tool arguments from the LLM are untrusted: validated for type, range, date validity, future-only reminders, forecast window; city names are URL-encoded.
- Downloads are HTTPS and size-verified against the generated manifest (not a cryptographic hash; see DECISIONS D9).
- Permissions are requested at use (mic, calendar, notifications). No other data leaves the device.

## Development environment note

Do not keep the working tree inside an iCloud-synced folder (Desktop/Documents). On 2026-10-16 iCloud evicted most
of the project to "dataless" placeholders that could not be re-downloaded; the project now lives in `~/Developer/Vaani`.

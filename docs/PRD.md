# PRD — Vaani Hinglish Voice Agent

Normalised from `docs/original-brief.md`. IDs are referenced by `docs/TASKS.md` and the tests.

## Goal

An Android app (React Native / Expo) where the user talks in English or Hinglish and an agent answers
out loud. **Speech-to-text and text-to-speech run on the phone**; only the LLM (and weather lookups)
use the network. Graded on end-to-end latency, transcription accuracy (EN + Hinglish) and
pronunciation quality (especially Hinglish).

## Functional requirements

| ID  | Requirement                   | Acceptance criteria                                                                                         | Verified by                                                                   |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| F1  | On-device STT                 | Mic → VAD-gated Whisper (sherpa-onnx) → one transcript per utterance; no network calls in the STT path      | Device (§Blocked); code review of `src/speech/`                               |
| F2  | On-device TTS                 | Kokoro (or Piper) via sherpa-onnx speaks every reply; no system TTS                                         | Device                                                                        |
| F3  | Cloud LLM with streaming      | NVIDIA API (OpenAI-compatible SSE); tokens spoken as they arrive                                            | `tests/client.test.ts` (local SSE server); live eval run 2026-10-16           |
| F4  | English + Hinglish            | EN/Hinglish toggle re-creates the Whisper engine; replies in the user's language, Hindi words in Devanagari | `tests/runTurn.test.ts`, prompt in `src/llm/prompts.ts`; quality: device      |
| F5  | Agent tool loop               | Model may call tools, receive results, then answer; ≤ 3 steps; parallel calls; errors returned as JSON      | `tests/runTurn.test.ts`                                                       |
| F6  | Tools                         | `set_alarm`, `set_reminder`, `get_schedule`, `get_weather` with validated arguments                         | `tests/toolRunner.test.ts`, `tests/weather.test.ts`; real device APIs: device |
| F7  | Clarifying questions          | Missing time/date/city → one short question, no tool call                                                   | Prompt + schemas; live eval `clarify_*` cases                                 |
| F8  | Memory                        | Last 4 turns + rolling summary + code-written state; follow-ups ("aur kal?") resolve; bounded size          | `tests/memory.test.ts`, `tests/runTurn.test.ts`                               |
| F9  | Sentence-level TTS pipelining | First sentence (or early comma clause) is spoken while the LLM keeps writing                                | `tests/chunker.test.ts`, `tests/pipeline.test.ts`                             |
| F10 | Half-duplex                   | Mic paused while speaking; agent never answers its own voice                                                | `tests/pipeline.test.ts`                                                      |
| F11 | Latency overlay + CSV         | Per turn: first audio, LLM TTFT, tool ms, TTS first chunk, total; medians split direct vs tool turns        | `tests/pipeline.test.ts`; UI: device                                          |
| F12 | Offline proof                 | Offline test screen: STT-only and TTS-only buttons, live "internet reachable" probe                         | Device                                                                        |
| F13 | STT benchmark                 | In-app runner exports JSON; `benchmarks/run_wer.py` computes WER/CER/RTF                                    | `tests/wav.test.ts`; script run on synthetic data; real numbers: device       |
| F14 | Tool-calling eval             | 27 cases / 33 turns scored for tool choice, arguments, clarification, TTFT                                  | `tests/evalScore.test.ts`; live run in `eval/results.md`                      |
| F15 | Model download                | First launch downloads models with progress, retry, size verification                                       | `tests/download.test.ts`                                                      |
| F16 | Secrets hygiene               | Key from `.env`, never committed; `.env.example` shipped                                                    | `.gitignore`; README                                                          |

## Non-functional requirements

- **Latency target** (to be measured, not assumed): first audio ≈ 1.5–3 s for direct answers; tool turns show a spoken filler first. The measured LLM first-token time on the shared NVIDIA endpoint is already ~2.5–3 s, so the target is at risk.
- **Privacy**: audio never leaves the phone. The LLM sees only transcribed text.
- **Robustness**: network loss, 429s, malformed tool arguments, TTS failure of one sentence and permission denial must not crash a turn. The agent must never claim an action succeeded when it did not.
- **Quality gates**: `npm run check` (typecheck, lint, format, tests) green; Android bundle and prebuild succeed in CI.

## Out of scope

Barge-in by voice, hotword, persisted memory across restarts, iOS, auto language detection, dual-voice TTS.
(See TASKS.md "Deferred".)

## Blocked on things this environment lacks

No phone here, so F1, F2, F4 (quality), F11 (UI), F12 and the on-device parts of F6/F13 are **built but unverified on a device**. The README lists the exact steps.

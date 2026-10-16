# Tool-calling eval results

Live run on 2026-10-16 against the NVIDIA API: 27 cases / 33 turns per model, through the real agent loop
(`runTurn` + `Memory` + tool validation), fixed clock Fri 16 Oct 2026 10:00 IST, tool backends faked with fixtures.
`maxTokens` 400, first-token timeout 20 s, one run per model (no repeats, so treat small gaps as noise).

| Model                                 | Turns | Tool choice | Arguments | Clarification | Median TTFT (ms) | Median turn (ms) |
| ------------------------------------- | ----- | ----------- | --------- | ------------- | ---------------- | ---------------- |
| nvidia/nemotron-3.5-lightning-30b-a3b | 33    | 85%         | 81%       | 67%           | 2477             | 5660             |
| z-ai/glm-5.3-flash                    | 33    | 91%         | 93%       | 100%          | 11912            | 21774            |
| deepseek-ai/deepseek-v4.1-flash       | 33    | 100%        | 100%      | 100%          | 3203             | 5699             |

### Failures

- [nvidia/nemotron-3.5-lightning-30b-a3b] en_reminder_pm: "Can you set a reminder for my meeting at 5 PM?" → tools=[] args=[] said="Which date?"
- [nvidia/nemotron-3.5-lightning-30b-a3b] hi_alarm_shaam: "shaam ko 6 baje alarm laga do" → tools=[] args=[] said="Done."
- [nvidia/nemotron-3.5-lightning-30b-a3b] hi_reminder_parso: "mujhe parso subah 10 baje doctor ke appointment ka reminder dena" → tools=[] args=[] said="Done."
- [nvidia/nemotron-3.5-lightning-30b-a3b] noisy_alarm: "kal subah saat bje ka alrm lagana" → tools=[] args=[] said="Done."
- [nvidia/nemotron-3.5-lightning-30b-a3b] clarify_alarm: "alarm laga do" → tools=[] args=[] said="अलार्म का समय बताएं।"
- [nvidia/nemotron-3.5-lightning-30b-a3b] followup_reminder: "make that 4 PM instead" → tools=[] args=[] said="Done."
- [z-ai/glm-5.3-flash] en_alarm_am: "Set an alarm for 6:30 AM tomorrow" → tools=[] args=[] said="ERROR LLM first-token timeout"
- [z-ai/glm-5.3-flash] en_reminder_tomorrow: "Remind me to call mom tomorrow at 9 AM" → tools=[] args=[] said="ERROR LLM first-token timeout"
- [z-ai/glm-5.3-flash] parallel_schedule_weather: "aaj ka schedule aur Bangalore ka weather bata do" → tools=[] args=[] said="ERROR LLM first-token timeout"

## Reading it

- **`deepseek-ai/deepseek-v4.1-flash` is the primary:** 100 % on tool choice, arguments and clarification, median TTFT 3.2 s.
- **`nvidia/nemotron-3.5-lightning-30b-a3b` is the backup:** fastest first token (2.5 s) but 85 % tool choice. Its misses were empty replies and one Hindi clarification phrased without a question mark (the scorer wants `?`).
- **`z-ai/glm-5.3-flash`** was accurate when it answered but slow (median TTFT 11.9 s, three 20 s timeouts).
- Every "Done." in the failure list is the agent's own empty-reply fallback, which at that time wrongly claimed success when no tool had run. Fixed in `runTurn` (tests added); those rows measure a model returning nothing.
- Also tried in a 2-case smoke test and not pursued: `mistral-large-2-instruct` (HTTP 404 for this account), `gemma-4-31b-it` and `gpt-oss-20b` (first-token timeouts). `meta/llama-3.3-70b-instruct` is retired (HTTP 410).
- **Latency caveat:** TTFT here is the shared NVIDIA endpoint measured from a laptop that was memory-starved; expect different numbers from a phone on Wi-Fi. Median turn time includes tool steps and a second LLM call.

## Groq free tier, same 27 cases / 33 turns (run 2026-10-16, one run per model)

Run with `--base-url https://api.groq.com/openai/v1 --key-env GROQ_API_KEY --extra-body '{"reasoning_effort":"low"}' --delay-ms 6000`. The delay keeps tool turns (2 calls each) under Groq's ~30 requests/min free limit; an unpaced first attempt failed with rate limits, which is why pacing exists.

| Model               | Turns | Tool choice | Arguments | Clarification | Median TTFT (ms) | Median turn (ms) |
| ------------------- | ----- | ----------- | --------- | ------------- | ---------------- | ---------------- |
| openai/gpt-oss-120b | 33    | 100%        | 100%      | 100%          | 717              | 1652             |
| openai/gpt-oss-20b  | 33    | 97%         | 89%       | 100%          | 770              | 1551             |

gpt-oss-20b failures (3): asked "when?" for "a meeting at 5 PM" instead of assuming today; read "parso" as the 14th (the past) and was then rejected by the tool validator; heard "saat" as six. The validator caught the bad date, which is what it is for.

Compared with NVIDIA's best (deepseek-v4.1-flash: 100% / 100% / 100%, median TTFT 3203 ms), gpt-oss-120b on Groq gives the same accuracy with a ~4.5x faster first token. Caveats: one run each; `qwen/qwen3.8-27b` was available but not evaluated. The NVIDIA chat endpoint also hung for all models for 12+ minutes later the same day, so a second provider is a real availability benefit.

Re-run of gpt-oss-120b after the "repeat the time exactly, including minutes" prompt rule and the `alarm_12h` tool field: 33 turns, tool choice 97 %, arguments 96 %, clarification 100 %, median TTFT 713 ms. The one miss (`followup_reminder`) is `ERROR fetch failed`, a transient network error on a single request, not a model answer, so it is not evidence of a prompt regression, but it also means this run is **not** a clean 100 %.

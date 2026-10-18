# AGENTS.md — instructions for coding agents

Project: Vaani on-device Hinglish voice agent. Read `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` first; `docs/original-brief.md` is the original design brief (corrections discovered during implementation live in `docs/DECISIONS.md`).

## Commands

- Verify everything: `npm run check` (typecheck, eslint, prettier, vitest). Also `npx expo export --platform android` after touching imports or `app.json`.
- Format: `npm run format`. Tests: `npm test`.

## Rules

- Keep `src/agent`, `src/llm`, `src/tts`, `src/pipeline` free of React Native imports; pass I/O (fetch, fs, clock, engines) in. That is what makes them testable.
- Env vars must be read as literal `process.env.EXPO_PUBLIC_NAME` (Expo only inlines static accesses). After changing `.env`, clear Metro cache.
- Never commit `.env`, keys, recordings (`benchmarks/audio/`) or `eval/out/`.
- The LLM output is untrusted: validate tool arguments in `src/agent/toolRunner.ts`; never put reasoning text or markdown into TTS; never tell the user an action succeeded unless a tool really did.
- Do not claim device behaviour works unless it ran on a phone. Mark status honestly in `docs/TASKS.md`; do not invent benchmark or eval numbers.
- Model IDs and library APIs drift: check the installed package source / `build.nvidia.com` before changing them.
- A new tool needs: schema in `src/llm/tools.schema.ts`, validation + state update in `toolRunner.ts`, device adapter in `src/tools/`, tests, and an eval case.
- Keep the working tree outside iCloud-synced folders (see ARCHITECTURE).
- Write comments and commit messages plainly, in lowercase short sentences, no `feat(scope):` prefixes.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // `dir` keeps test discovery out of android/ (multi-GB Gradle output after a native build).
  test: { dir: 'tests', include: ['**/*.test.ts'], environment: 'node' },
});

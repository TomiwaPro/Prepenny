import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The property tests try hundreds of made-up plans each, and on GitHub's
    // shared machines one can take longer than Vitest's usual 5 seconds. This
    // limit only stops a test that hangs: the engine's speed has its own test
    // (step 1g, ARCHITECTURE.md 2.8).
    testTimeout: 30_000,
  },
});

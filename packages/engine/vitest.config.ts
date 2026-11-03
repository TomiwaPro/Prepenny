import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The property tests try hundreds of made-up plans each, and on GitHub's
    // shared machines one can take longer than Vitest's usual 5 seconds. This
    // limit only stops a test that hangs: the engine's speed has its own test.
    testTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'engine',
          include: ['test/**/*.test.ts'],
          exclude: ['test/speed/**'],
          sequence: { groupOrder: 0 },
        },
      },
      {
        // The speed test (test 54, ARCHITECTURE.md 2.8) runs on its own once
        // every other test has finished, so nothing else competes with it for
        // the machine. It loads the engine with Node's own import, as the
        // app's build will, not through Vitest's module runner, which slows
        // down every call from one engine file to another (D134).
        extends: true,
        test: {
          name: 'speed',
          include: ['test/speed/**/*.test.ts'],
          sequence: { groupOrder: 1 },
          experimental: { viteModuleRunner: false },
        },
      },
    ],
  },
});

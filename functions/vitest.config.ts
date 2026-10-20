import { defineConfig } from 'vitest/config';

// Runs against the Firestore emulator (see the "test" script); files share one emulator, so serially.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['test/setup.ts'],
  },
});

import { defineConfig } from 'vitest/config';

// Real Firestore (a throwaway database named by LOADTEST_DATABASE). Razorpay is faked, nothing touches `default`.
export default defineConfig({ test: { include: ['test/rush.test.ts'], environment: 'node', fileParallelism: false, testTimeout: 900_000, hookTimeout: 900_000, setupFiles: ['test/setup.load.ts'] } });

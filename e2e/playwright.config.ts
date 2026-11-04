import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './journeys',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1, // run sequentially to avoid state collisions in emulators
  forbidOnly: !!process.env.CI,
  retries: 0,
  outputDir: './artifacts',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
      testMatch: /.*\.spec\.ts/,
    },
  ],
});

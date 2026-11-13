import { defineConfig } from '@playwright/test';

const PORT = 4173;

// These checks drive the real built app in Chromium. Run `npm run build` first, then `npm run e2e`.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  workers: 1,
  forbidOnly: !!process.env.CI,
  // A slow shared computer can trip one check once in a while, so a second go is allowed there.
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/soundboard/`,
    permissions: ['microphone'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      // A pretend microphone, so the recorder can be tested without a real one.
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/soundboard/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

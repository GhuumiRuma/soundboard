import { defineConfig } from '@playwright/test';

const PORT = 4173;

// These checks drive the real built app in Chromium. Run `npm run build` first, then `npm run e2e`.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/soundboard/`,
    permissions: ['microphone'],
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

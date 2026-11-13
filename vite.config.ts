import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Which commit this build is made from (GitHub Actions sets GITHUB_SHA). Shown in Settings.
const BUILD_ID = (process.env.GITHUB_SHA ?? '').slice(0, 12) || 'dev';

export default defineConfig(({ mode }) => {
  // The Android and desktop apps are built with `npm run build:native` (or NATIVE_BUILD=1). They serve the
  // build from the root and have no service worker. GitHub Pages serves the web app from /soundboard/.
  const native = mode === 'native' || !!process.env.NATIVE_BUILD;
  const base = native ? '/' : '/soundboard/';

  return {
    base,
    // The plugin is off for the Android and desktop builds, so the web app's update helper has to come from somewhere else.
    resolve: native
      ? { alias: { 'virtual:pwa-register': fileURLToPath(new URL('./src/pwa/registerStub.ts', import.meta.url)) } }
      : {},
    define: {
      __BUILD_ID__: JSON.stringify(BUILD_ID),
      __APP_VERSION__: JSON.stringify(pkg.version),
      __NATIVE_BUILD__: JSON.stringify(native),
    },
    plugins: [
      react(),
      VitePWA({
        disable: native,
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: base,
          name: 'Soundboard',
          short_name: 'Soundboard',
          description: 'Big colourful buttons for your sounds. Plays on your phone, tablet or computer. No account, no cloud.',
          lang: 'en',
          theme_color: '#111018',
          background_color: '#111018',
          display: 'standalone',
          start_url: base,
          scope: base,
          categories: ['music', 'entertainment', 'utilities'],
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,woff2}'],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    build: {
      target: 'es2022',
    },
  };
});

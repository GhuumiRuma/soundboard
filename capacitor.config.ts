import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.ghuumiruma.soundboard',
  appName: 'Soundboard',
  webDir: 'dist',
  backgroundColor: '#111018',
  server: {
    // Boards and sounds live in the WebView's IndexedDB, which is keyed by this origin (https://localhost).
    // These are Capacitor's defaults, pinned so an upgrade can never move the app to another origin
    // and strand everyone's saved sounds.
    androidScheme: 'https',
    hostname: 'localhost',
  },
  android: {
    // Lets you inspect the app from desktop Chrome (chrome://inspect) when it misbehaves.
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    // The app opens dark and its page asks for the full screen (viewport-fit=cover). Saying so up front
    // keeps the bars readable and the layout from jumping while the page loads; the app restyles the bars
    // itself (src/platform/capacitor.ts) once it knows which look, light or dark, is on.
    SystemBars: {
      style: 'DARK',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;

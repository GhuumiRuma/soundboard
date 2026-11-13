import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.ghuumiruma.soundboard',
  appName: 'Soundboard',
  webDir: 'dist',
  // See-through, so that until the page has drawn itself you see the window colour, which follows the phone
  // between light (#FAF8FF) and dark (#111018) in android/app/src/main/res/values and values-night.
  backgroundColor: '#00000000',
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
    // Its page asks for the full screen (viewport-fit=cover). Saying so up front keeps the layout from
    // jumping while the page loads; the app picks the icon colour for the bars itself
    // (src/platform/capacitor.ts) once it knows which look, light or dark, is on.
    SystemBars: {
      style: 'DARK',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;

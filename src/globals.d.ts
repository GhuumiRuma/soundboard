/// <reference types="vite/client" />

/** The first 12 letters of the commit this build was made from, or "dev". Set in vite.config.ts. */
declare const __BUILD_ID__: string;
/** The version from package.json. Set in vite.config.ts. */
declare const __APP_VERSION__: string;
/** True in the Android and desktop apps (`npm run build:native`): no service worker, served from the root. */
declare const __NATIVE_BUILD__: boolean;

interface Navigator {
  /** Safari on iPhone and iPad sets this when the app was opened from the Home Screen. */
  standalone?: boolean;
  /** Lets sound play even when the iPhone's silent switch is on (Safari 17+). */
  audioSession?: { type: 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record' };
}

interface Window {
  /** Very old Safari only has the prefixed name. */
  webkitAudioContext?: typeof AudioContext;
}

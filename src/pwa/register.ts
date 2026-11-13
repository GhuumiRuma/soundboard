import { getBoardStore } from '../state';
import { uiStore } from '../state/ui';
import { createReloader } from './reload';
import { pwa, type InstallOffer } from './state';
import { watchForUpdates } from './updates';
// In the Android and desktop apps this name points at registerStub.ts instead (see vite.config.ts).
import { registerSW } from 'virtual:pwa-register';

/** The browser's "this app can be installed" event. TypeScript doesn't know it yet. */
interface BeforeInstallPromptEvent extends Event, InstallOffer {}

/**
 * Gets the web app ready to work without internet, to be installed, and to be updated. The Android and desktop
 * apps have their own ways of doing all three, so nothing happens there.
 */
export function initPwa(): void {
  if (__NATIVE_BUILD__) return;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's own pop-up away. Soundboard's Install button asks the question when she taps it.
    event.preventDefault();
    pwa.offerInstall(event as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => pwa.wasInstalled());

  const reload = createReloader({
    isBusy: () => uiStore.getState().recorder !== null,
    watchBusy: (listener) => uiStore.subscribe(listener),
    save: () => getBoardStore().flush(),
    reload: () => window.location.reload(),
  });

  const takeOver = registerSW({
    onNeedRefresh: pwa.updateIsReady,
    // Runs when the new version takes over, in every open Soundboard window, not only the one she tapped in.
    onNeedReload: reload,
    onRegisteredSW: (_url, registration) => {
      if (registration) watchForUpdates(registration);
    },
    onRegisterError: (error) => console.warn("Soundboard couldn't get ready to work without internet.", error),
  });
  pwa.setUpdater(takeOver);
}

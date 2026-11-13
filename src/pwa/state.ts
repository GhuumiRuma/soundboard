import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/** The browser's one-tap "install this app" offer. Chrome, Edge and most Android browsers make one; Safari doesn't. */
export interface InstallOffer {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

interface PwaState {
  /** A newer version has been downloaded and is waiting for her go-ahead. */
  updateReady: boolean;
  /** She chose "Later", so the bar stays away for the rest of this visit. */
  updateLater: boolean;
  installOffer: InstallOffer | null;
  /** She installed Soundboard during this visit. */
  installed: boolean;
  /** She said "Got it" or "No thanks" to the install note. */
  hintDismissed: boolean;
}

export const HINT_KEY = 'soundboard-install-hint';

export type HintStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): HintStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readHintDismissed(storage: HintStorage | null): boolean {
  try {
    return storage?.getItem(HINT_KEY) === 'dismissed';
  } catch {
    return false;
  }
}

function saveHintDismissed(storage: HintStorage | null): void {
  try {
    storage?.setItem(HINT_KEY, 'dismissed');
  } catch {
    // Storage can be blocked or full. She will see the note again next time.
  }
}

/** What the install note and the update bar know. Nothing here is a sound or a board, so nothing needs backing up. */
export function createPwa(storage: HintStorage | null) {
  const store = createStore<PwaState>(() => ({
    updateReady: false,
    updateLater: false,
    installOffer: null,
    installed: false,
    hintDismissed: readHintDismissed(storage),
  }));
  let updater: ((reload?: boolean) => Promise<void>) | null = null;

  return {
    store,

    /** Hands over the function that makes the waiting version take over. */
    setUpdater(fn: (reload?: boolean) => Promise<void>) {
      updater = fn;
    },
    updateIsReady() {
      store.setState({ updateReady: true, updateLater: false });
    },
    updateLater() {
      store.setState({ updateLater: true });
    },
    /** Makes the waiting version take over. The page reloads by itself when it does. */
    async applyUpdate(): Promise<void> {
      await updater?.(true);
    },

    offerInstall(offer: InstallOffer) {
      store.setState({ installOffer: offer });
    },
    wasInstalled() {
      store.setState({ installed: true, installOffer: null });
    },
    dismissHint() {
      saveHintDismissed(storage);
      store.setState({ hintDismissed: true });
    },

    /** Shows the browser's install question. Call this straight from her tap, the browser only allows it then. */
    async promptInstall(): Promise<InstallOutcome> {
      const offer = store.getState().installOffer;
      if (!offer) return 'unavailable';
      // An offer works once. If she says no, the browser may send a new one later.
      store.setState({ installOffer: null });
      try {
        await offer.prompt();
        return (await offer.userChoice).outcome;
      } catch {
        return 'dismissed';
      }
    },
  };
}

export const pwa = createPwa(browserStorage());

export function usePwa<T>(selector: (state: PwaState) => T): T {
  return useStore(pwa.store, selector);
}

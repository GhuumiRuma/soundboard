import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/** What the recorder is making: a brand new sound, or a new file for a sound she already has. */
export type RecorderTarget = { kind: 'new' } | { kind: 'replace'; soundId: string };

interface UiState {
  settingsOpen: boolean;
  recorder: RecorderTarget | null;
}

/** Which pop-ups are open. Nothing here is saved. */
export const uiStore = createStore<UiState>(() => ({ settingsOpen: false, recorder: null }));

export const ui = {
  openSettings: () => uiStore.setState({ settingsOpen: true }),
  closeSettings: () => uiStore.setState({ settingsOpen: false }),
  openRecorder: (target: RecorderTarget) => uiStore.setState({ recorder: target }),
  closeRecorder: () => uiStore.setState({ recorder: null }),
};

export function useUi<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector);
}

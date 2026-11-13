import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/components.css';
import './styles/soundboard.css';
import { App } from './App';
import { installAudioUnlock } from './audio';
import { initPlatform } from './platform';
import { getBoardStore } from './state';
import { initTheme } from './state/theme';
import { openStorage } from './storage';

async function start() {
  await initPlatform();
  initTheme();
  await openStorage();
  const store = getBoardStore();
  installAudioUnlock();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  // Save as soon as the page is hidden or closed, so nothing she just did is lost.
  const save = () => void store.flush();
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });

  await store.load();
}

void start();

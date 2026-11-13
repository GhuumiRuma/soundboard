import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import { App } from './App';
import { initPlatform } from './platform';
import { initTheme } from './state/theme';

async function start() {
  await initPlatform();
  initTheme();
  createRoot(document.getElementById('root')!).render(<App />);
}

void start();

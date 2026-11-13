import { BOARD_PANEL_ID } from './components/BoardTabs';
import { PhoneBar } from './components/PhoneBar';
import { SettingsDialog } from './components/SettingsDialog';
import { Toasts } from './components/Toasts';
import { useIsPhone } from './hooks/useMediaQuery';
import { useUndoShortcut } from './hooks/useUndoShortcut';
import { SoundboardPage } from './pages/SoundboardPage';
import { useBoard } from './state';

export function App() {
  const loaded = useBoard((s) => s.loaded);
  const isPhone = useIsPhone();
  useUndoShortcut();

  if (!loaded) {
    return (
      <div className="app-loading" role="status">
        Opening your sounds…
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href={`#${BOARD_PANEL_ID}`}>
        Skip to your sounds
      </a>
      <main className="app-main" id="main">
        <SoundboardPage isPhone={isPhone} />
      </main>
      {isPhone && <PhoneBar />}
      <Toasts />
      <SettingsDialog />
    </div>
  );
}

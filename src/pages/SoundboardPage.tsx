import { BoardCard } from '../components/BoardCard';
import { BackupReminder } from '../components/Backup';
import { BoardTabs, BOARD_PANEL_ID, boardTabId } from '../components/BoardTabs';
import { Dialog } from '../components/Dialog';
import { EmptyBoard } from '../components/EmptyBoard';
import { PageHeader } from '../components/PageHeader';
import { SoundKeyNotice } from '../components/SoundKeys';
import { EditorCard, SoundEditor } from '../components/SoundEditor';
import { SoundTile } from '../components/SoundTile';
import { TopControls } from '../components/TopControls';
import { usePageDrop } from '../hooks/usePageDrop';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { formatKey } from '../keys/keyString';
import { getPlatform } from '../platform';
import { storageMessages } from '../storage';
import { currentBoard, editingSound, getBoardStore, useBoard } from '../state';
import { browseForSounds, closeEditor, stopAllSounds } from '../state/actions';
import { ui, useUi } from '../state/ui';

interface SoundboardPageProps {
  isPhone: boolean;
}

/** The main screen: the boards, the big sound buttons, and the edit card. */
export function SoundboardPage({ isPhone }: SoundboardPageProps) {
  const os = getPlatform().os;
  const board = useBoard(currentBoard);
  const boards = useBoard((s) => s.data.boards);
  const editing = useBoard(editingSound);
  const adding = useBoard((s) => s.adding);
  const persistent = useBoard((s) => s.persistent);
  const stopAllKey = useBoard((s) => s.data.stopAllKey);
  const modalOpen = useUi((s) => s.settingsOpen || s.recorder !== null);
  const touch = useMediaQuery('(pointer: coarse)') || isPhone;

  const dragOver = usePageDrop(!modalOpen, (files) => void getBoardStore().addSounds(files));

  return (
    <div className="soundboard-page tools-page">
      <PageHeader title="Soundboard" description="Make big buttons for your sounds and play them with a tap or a key.">
        {!isPhone && (
          <>
            <button type="button" className="btn btn-outline" onClick={stopAllSounds}>
              Stop all sounds
            </button>
            <span className="shortcut-label">Shortcut:</span>
            <kbd className="ss-kbd">{formatKey(stopAllKey, os)}</kbd>
          </>
        )}
        <button type="button" className="btn btn-outline" onClick={ui.openSettings}>
          <span aria-hidden="true">⚙️</span> Settings
        </button>
      </PageHeader>

      <div className="ss-notices">
        {!persistent && (
          <div className="ss-warning">
            <span aria-hidden="true">⚠️</span>
            <div className="ss-message-body">{storageMessages.unavailable}</div>
          </div>
        )}
        <SoundKeyNotice />
        <BackupReminder />
      </div>

      {!isPhone && <TopControls />}
      <BoardTabs />

      <div id={BOARD_PANEL_ID} role="tabpanel" tabIndex={-1} aria-labelledby={boardTabId(board.id)} className="board-panel">
        <BoardCard
          board={board}
          boardCount={boards.length}
          showDropZone={!isPhone}
          dragOver={dragOver}
          adding={adding}
          onBrowse={() => void browseForSounds()}
        />

        {board.sounds.length === 0 ? (
          <EmptyBoard isPhone={isPhone} onBrowse={() => void browseForSounds()} />
        ) : (
          <>
            <p className="sound-hint">
              {touch
                ? 'Tap a button to play it. Press and hold a button, or use ✏️ Edit, to change its name, colour, volume or shortcut.'
                : 'Click a button to play it. Use ✏️ Edit (or right-click) to change its name, colour, volume or shortcut.'}
            </p>
            <div className="sound-grid" role="group" aria-label="Sound buttons">
              {board.sounds.map((sound) => (
                <SoundTile key={sound.id} sound={sound} editing={sound.id === editing?.id} os={os} />
              ))}
            </div>
          </>
        )}

        {!isPhone && editing && <EditorCard sound={editing} boards={boards} currentBoardId={board.id} />}
      </div>

      {isPhone && (
        <Dialog open={editing !== null} title={`Edit ${editing?.name || 'sound'}`} sheet onClose={() => editing && closeEditor(editing.id)}>
          {editing && <SoundEditor key={editing.id} sound={editing} boards={boards} currentBoardId={board.id} focusName={false} />}
        </Dialog>
      )}
    </div>
  );
}

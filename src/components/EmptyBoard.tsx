import { ui } from '../state/ui';

interface EmptyBoardProps {
  /** Phones can't drop files, so the words change. */
  isPhone: boolean;
  onBrowse: () => void;
}

/** What an empty board says. Same words as StreamStudio, plus buttons to get started. */
export function EmptyBoard({ isPhone, onBrowse }: EmptyBoardProps) {
  return (
    <div className="ss-empty">
      <div className="ss-empty-icon" aria-hidden="true">
        🔊
      </div>
      <h2 className="ss-empty-title">Add your first sound</h2>
      <p className="ss-empty-text">
        {isPhone ? 'Add an MP3, WAV or OGG to create a sound button.' : 'Drop an MP3, WAV or OGG to create a sound button.'}
      </p>
      <div className="ss-empty-actions">
        <button type="button" className="btn btn-accent" onClick={onBrowse}>
          Add a sound
        </button>
        <button type="button" className="btn btn-outline" onClick={() => ui.openRecorder({ kind: 'new' })}>
          Record a sound
        </button>
      </div>
    </div>
  );
}

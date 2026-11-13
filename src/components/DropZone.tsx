interface DropZoneProps {
  /** True while a file is being dragged over the page. */
  dragOver: boolean;
  /** True while sounds are being added. */
  adding: boolean;
  onBrowse: () => void;
}

/** The dashed box at the top of a board: drop sound files on it, or press Add sounds. Same wording as StreamStudio. */
export function DropZone({ dragOver, adding, onBrowse }: DropZoneProps) {
  return (
    <div className={`ss-dropzone is-compact ss-dropzone-fit${dragOver ? ' drag-over' : ''}`}>
      <div className="ss-dropzone-icon" aria-hidden="true">
        🔊
      </div>
      <div className="ss-dropzone-text">
        <strong>Drop mp3, wav or ogg sounds</strong>
        <span className="ss-dropzone-hint">{adding ? 'Adding your sounds…' : '20 MB max'}</span>
      </div>
      <div className="ss-dropzone-actions">
        <button type="button" className="btn btn-outline" onClick={onBrowse}>
          Add sounds
        </button>
      </div>
    </div>
  );
}

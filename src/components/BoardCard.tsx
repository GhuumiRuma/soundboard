import { getBoardStore } from '../state';
import type { Soundboard } from '../model/types';
import { DropZone } from './DropZone';
import { NameField } from './NameField';

interface BoardCardProps {
  board: Soundboard;
  boardCount: number;
  /** Phones don't get the drop zone: there is nothing to drag onto, and the bottom bar has Add. */
  showDropZone: boolean;
  dragOver: boolean;
  adding: boolean;
  onBrowse: () => void;
}

/** The name of the open board, Delete board, and (on bigger screens) the drop zone. */
export function BoardCard({ board, boardCount, showDropZone, dragOver, adding, onBrowse }: BoardCardProps) {
  const store = getBoardStore();
  const onlyBoard = boardCount <= 1;
  return (
    <div className="ss-card board-card">
      <div className="ss-row">
        <label className="inline-field">
          <span className="inline-field-text">Board name</span>
          <NameField
            key={board.id}
            id="board-name"
            value={board.name}
            placeholder="Board name"
            onChange={(text) => store.renameBoard(board.id, text)}
          />
        </label>
        <button
          type="button"
          className="btn btn-outline"
          disabled={onlyBoard}
          title={onlyBoard ? 'You always keep at least one board.' : undefined}
          onClick={() => store.deleteBoard(board.id)}
        >
          Delete board
        </button>
        {showDropZone && <DropZone dragOver={dragOver} adding={adding} onBrowse={onBrowse} />}
      </div>
    </div>
  );
}

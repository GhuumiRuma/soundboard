import { useRef, type KeyboardEvent } from 'react';
import { PHONE_QUERY } from '../hooks/useMediaQuery';
import { getBoardStore, useBoard } from '../state';

export const boardTabId = (boardId: string) => `board-tab-${boardId}`;
export const BOARD_PANEL_ID = 'board-panel';

/** Adds a board, then (on a computer) puts the cursor in the Board name box so she can name it straight away. */
function addBoardAndName(): void {
  getBoardStore().addBoard();
  if (window.matchMedia(PHONE_QUERY).matches) return;
  requestAnimationFrame(() => {
    const input = document.getElementById('board-name');
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  });
}

/** The row of boards, shown as tabs on a computer and as round chips you can scroll on a phone. */
export function BoardTabs() {
  const boards = useBoard((s) => s.data.boards);
  const boardId = useBoard((s) => s.boardId);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const from = boards.findIndex((b) => b.id === boardId);
    let to = from;
    switch (e.key) {
      case 'ArrowRight':
        to = (from + 1) % boards.length;
        break;
      case 'ArrowLeft':
        to = (from - 1 + boards.length) % boards.length;
        break;
      case 'Home':
        to = 0;
        break;
      case 'End':
        to = boards.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    getBoardStore().selectBoard(boards[to].id);
    tabs.current[to]?.focus();
  };

  return (
    <section className="ss-card board-tabs" aria-label="Soundboards">
      <div className="ss-row">
        <h2 className="ss-card-title">Boards</h2>
        <button type="button" className="btn btn-accent" onClick={addBoardAndName}>
          + New board
        </button>
      </div>
      <div className="ss-tabs">
        <div className="ss-tablist" role="tablist" aria-label="Boards" onKeyDown={onKeyDown}>
          {boards.map((board, i) => {
            const selected = board.id === boardId;
            return (
              <button
                key={board.id}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={boardTabId(board.id)}
                className="ss-tab"
                aria-selected={selected}
                aria-controls={BOARD_PANEL_ID}
                tabIndex={selected ? 0 : -1}
                onClick={() => getBoardStore().selectBoard(board.id)}
              >
                {board.name}
              </button>
            );
          })}
        </div>
        <button type="button" className="btn ss-tab ss-tab-add" onClick={addBoardAndName}>
          + New board
        </button>
      </div>
    </section>
  );
}

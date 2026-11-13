import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useRadioKeys } from '../hooks/useRadioKeys';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { EMOJIS, MAX_NAME_LENGTH, PALETTE } from '../model/rules';
import type { SoundItem, Soundboard } from '../model/types';
import { getBoardStore } from '../state';
import { browseForReplacement, closeEditor, deleteSoundFromEditor, playSound } from '../state/actions';
import { NameField } from './NameField';
import { VolumeSlider } from './VolumeSlider';

/** The words a screen reader says for each colour in the palette (the order matches PALETTE). */
const COLOUR_NAMES = ['Violet', 'Pink', 'Blue', 'Green', 'Orange', 'Red', 'Teal', 'Purple'];

interface SoundEditorProps {
  sound: SoundItem;
  boards: readonly Soundboard[];
  currentBoardId: string;
  /** Put the cursor in the Name box straight away. Not on a phone: that would open the keyboard over the sheet. */
  focusName: boolean;
}

/** Everything you can change about one sound. It is the same on a computer (a card) and on a phone (a bottom sheet). */
export function SoundEditor({ sound, boards, currentBoardId, focusName }: SoundEditorProps) {
  const store = getBoardStore();
  const nameId = useId();
  const emojiLabelId = useId();
  const colourLabelId = useId();
  const volumeId = useId();
  const moveId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState('');

  useEffect(() => {
    if (focusName) nameRef.current?.focus({ preventScroll: true });
  }, [focusName]);

  const emojiIndex = EMOJIS.indexOf(sound.emoji);
  const emojiKeys = useRadioKeys(EMOJIS.length, emojiIndex, (i) => store.changeSound(sound.id, { emoji: EMOJIS[i] }));
  const colourIndex = PALETTE.indexOf(sound.color);
  const colourKeys = useRadioKeys(PALETTE.length, colourIndex, (i) => store.changeSound(sound.id, { color: PALETTE[i] }));

  const otherBoards = boards.filter((b) => b.id !== currentBoardId);
  const chosenBoard = otherBoards.some((b) => b.id === target) ? target : '';

  return (
    <div className="editor-form">
      <div className="editor-grid">
        <div className="editor-form">
          <div className="ss-field">
            <label className="ss-field-label" htmlFor={nameId}>
              Name
            </label>
            <NameField
              id={nameId}
              inputRef={nameRef}
              value={sound.name}
              maxLength={MAX_NAME_LENGTH}
              onChange={(text) => store.changeSound(sound.id, { name: text })}
            />
          </div>

          <div className="ss-field">
            <span className="ss-field-label" id={emojiLabelId}>
              Emoji
            </span>
            <div className="emoji-grid" role="radiogroup" aria-labelledby={emojiLabelId} {...emojiKeys.groupProps}>
              {EMOJIS.map((emoji, i) => (
                <button
                  key={emoji}
                  type="button"
                  role="radio"
                  aria-checked={i === emojiIndex}
                  className="emoji-option"
                  onClick={() => store.changeSound(sound.id, { emoji })}
                  {...emojiKeys.itemProps(i)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="editor-form">
          <div className="ss-field">
            <span className="ss-field-label" id={colourLabelId}>
              Colour
            </span>
            <div className="swatches">
              <div className="swatch-radios" role="radiogroup" aria-labelledby={colourLabelId} {...colourKeys.groupProps}>
                {PALETTE.map((color, i) => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={i === colourIndex}
                    aria-label={COLOUR_NAMES[i]}
                    className="swatch"
                    style={{ '--swatch': color } as CSSProperties}
                    onClick={() => store.changeSound(sound.id, { color })}
                    {...colourKeys.itemProps(i)}
                  />
                ))}
              </div>
              <input
                type="color"
                className="ss-color"
                aria-label="Pick your own colour"
                value={sound.color.toLowerCase()}
                onChange={(e) => store.changeSound(sound.id, { color: e.currentTarget.value })}
              />
              <span className="ss-field-hint">Or pick your own</span>
            </div>
          </div>

          <div className="ss-field">
            <label className="ss-field-label" htmlFor={volumeId}>
              Volume
            </label>
            <VolumeSlider id={volumeId} value={sound.volume} onChange={(v) => store.changeSound(sound.id, { volume: v })} />
          </div>
        </div>
      </div>

      <div className="editor-actions">
        <button type="button" className="btn" onClick={() => playSound(sound.id, { haptic: true })}>
          <span aria-hidden="true">▶</span> Play
        </button>
        <button type="button" className="btn btn-outline" onClick={() => void browseForReplacement(sound.id)}>
          Replace file
        </button>
        <button type="button" className="btn btn-outline btn-danger-text" onClick={() => deleteSoundFromEditor(sound.id)}>
          Delete
        </button>
      </div>
      {sound.originalFileName && <p className="ss-field-hint sound-file">Current file: {sound.originalFileName}</p>}

      {otherBoards.length > 0 && (
        <div className="ss-field">
          <label className="ss-field-label" htmlFor={moveId}>
            Move to board
          </label>
          <div className="ss-row move-row">
            <select id={moveId} className="ss-input" value={chosenBoard} onChange={(e) => setTarget(e.currentTarget.value)}>
              <option value="">Choose…</option>
              {otherBoards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-outline" disabled={!chosenBoard} onClick={() => store.moveSound(sound.id, chosenBoard)}>
              Move
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface EditorCardProps extends Omit<SoundEditorProps, 'focusName'> {}

/** The edit card that sits below the sound buttons on a tablet or computer. */
export function EditorCard({ sound, boards, currentBoardId }: EditorCardProps) {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
  }, [sound.id, reducedMotion]);

  return (
    <section
      ref={ref}
      id="sound-editor"
      className="ss-card editor-card"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) closeEditor(sound.id);
      }}
    >
      <div className="ss-row">
        <h2 className="ss-card-title" id={titleId}>
          Edit {sound.name || 'sound'}
        </h2>
        <span className="ss-spacer" />
        <button type="button" className="btn btn-outline" onClick={() => closeEditor(sound.id)}>
          Close
        </button>
      </div>
      <SoundEditor key={sound.id} sound={sound} boards={boards} currentBoardId={currentBoardId} focusName />
    </section>
  );
}

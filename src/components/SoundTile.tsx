import { memo, useId, useMemo, type CSSProperties } from 'react';
import { useLongPress } from '../hooks/useLongPress';
import type { DeviceOs } from '../lib/device';
import { formatKey, NOT_SET } from '../keys/keyString';
import { shades } from '../model/shades';
import type { SoundItem } from '../model/types';
import { getBoardStore } from '../state';
import { playSound, useSoundLoading, useSoundPlaying } from '../state/actions';
import { useFlashing } from '../state/flash';

interface SoundTileProps {
  sound: SoundItem;
  editing: boolean;
  os: DeviceOs;
}

/**
 * One big coloured sound button, plus its small Edit pill. Tap to play (taps overlap, so you can play it again
 * before it ends). Right-click, or press and hold with a finger, opens the edit card too.
 */
export const SoundTile = memo(function SoundTile({ sound, editing, os }: SoundTileProps) {
  const keyId = useId();
  const playing = useSoundPlaying(sound.id);
  const loading = useSoundLoading(sound.id);
  const flashing = useFlashing(sound.id);
  const edit = () => getBoardStore().editSound(sound.id);
  const { handlers, wasLongPress } = useLongPress(edit);
  const colours = useMemo(() => shades(sound.color), [sound.color]);

  const style = {
    '--tile-top': colours.top,
    '--tile-bottom': colours.bottom,
    '--tile-border': colours.border,
  } as CSSProperties;

  return (
    <div className="sound-tile-wrap">
      <button
        type="button"
        className={`sound-tile${flashing ? ' playing' : ''}`}
        style={style}
        data-playing={playing}
        aria-busy={loading || undefined}
        aria-label={`Play ${sound.name}`}
        aria-describedby={sound.hotkey ? keyId : undefined}
        onClick={() => {
          if (wasLongPress()) return;
          playSound(sound.id, { haptic: true });
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          edit();
        }}
        {...handlers}
      >
        <span className="sound-emoji" aria-hidden="true">
          {sound.emoji}
        </span>
        <strong className="sound-name">{sound.name}</strong>
        <span className="ss-kbd" id={keyId}>
          {sound.hotkey ? formatKey(sound.hotkey, os) : NOT_SET}
        </span>
        {playing && (
          <span className="sound-bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </button>
      <button
        type="button"
        className={`sound-edit${editing ? ' is-editing' : ''}`}
        data-edit-for={sound.id}
        aria-label={`Edit ${sound.name}`}
        title="Change name, colour, volume or shortcut"
        onClick={edit}
      >
        <span aria-hidden="true">✏️</span> Edit
      </button>
    </div>
  );
});

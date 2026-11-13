import { useId } from 'react';
import { soundKeyProblem, STOP_ALL, STOP_ALL_NAME } from '../keys/clashes';
import { keyNote, soundKeyNotice, soundKeysStatusLine } from '../keys/messages';
import { keyPlace, useSoundKeyStatus } from '../keys/soundKeys';
import type { SoundItem } from '../model/types';
import { getBoardStore, useBoard } from '../state';
import { HotkeyRecorder } from './HotkeyRecorder';

/** The "Sound keys" on/off switch, with a line under it saying whether the keys are on and where they work. */
export function SoundKeysSwitch() {
  const statusId = useId();
  const place = keyPlace();
  const enabled = useBoard((s) => s.settings.soundKeysEnabled);
  const status = useBoard((s) => soundKeysStatusLine({ enabled: s.settings.soundKeysEnabled, global: place.global, data: s.data }));
  return (
    <div className="keys-switch">
      <label className="ss-switch">
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          aria-describedby={statusId}
          onChange={(e) => getBoardStore().updateSettings({ soundKeysEnabled: e.currentTarget.checked })}
        />
        <strong>Sound keys</strong>
      </label>
      <span className="ss-muted" id={statusId}>
        {status}
      </span>
    </div>
  );
}

/** Where she picks the key that stops every sound. */
export function StopAllKeyField({ inline }: { inline?: boolean }) {
  const place = keyPlace();
  const data = useBoard((s) => s.data);
  return (
    <HotkeyRecorder
      label="Stop all sounds shortcut"
      value={data.stopAllKey}
      os={place.os}
      inline={inline}
      clearLabel={`Clear the ${STOP_ALL_NAME} shortcut`}
      check={(key) => soundKeyProblem(getBoardStore().state.getState().data, key, STOP_ALL, place)}
      note={keyNote(data, STOP_ALL, data.stopAllKey, place)}
      onChange={(key) => getBoardStore().setStopAllKey(key)}
    />
  );
}

/** Where she picks the key for one sound. */
export function SoundShortcutField({ sound }: { sound: SoundItem }) {
  const place = keyPlace();
  const data = useBoard((s) => s.data);
  const owner = { kind: 'sound' as const, id: sound.id };
  return (
    <HotkeyRecorder
      label="Sound shortcut"
      value={sound.hotkey}
      os={place.os}
      clearLabel={`Clear the shortcut for ${sound.name || 'this sound'}`}
      check={(key) => soundKeyProblem(getBoardStore().state.getState().data, key, owner, place)}
      note={keyNote(data, owner, sound.hotkey, place)}
      onChange={(key) => getBoardStore().changeSound(sound.id, { hotkey: key })}
    />
  );
}

/** A warning on the page when a sound key can't be used, most likely because another program already has it. */
export function SoundKeyNotice() {
  const status = useSoundKeyStatus();
  const data = useBoard((s) => s.data);
  const notice = soundKeyNotice(status, data, keyPlace());
  if (!notice) return null;
  return (
    <div className="ss-warning" role="status">
      <span aria-hidden="true">⚠️</span>
      <div className="ss-message-body">
        <strong>{notice.title}</strong> {notice.text}
      </div>
    </div>
  );
}

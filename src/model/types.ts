/** One sound button. Mirrors StreamStudio's SoundItem. */
export interface SoundItem {
  id: string;
  /** Shown on the button. At most 48 characters. */
  name: string;
  /** One or two emoji. */
  emoji: string;
  /** #RRGGBB, always capital letters. */
  color: string;
  /** Which stored audio file this sound plays. See src/storage. */
  mediaId: string;
  /** The name of the file she added, kept for her own reference. */
  originalFileName: string | null;
  /** 0 to 1. It is multiplied by the master volume when the sound plays. */
  volume: number;
  /** Her sound key for it, like "Ctrl+Alt+1", or null. */
  hotkey: string | null;
}

/** One of her boards (a row of tabs at the top). Mirrors StreamStudio's Soundboard. */
export interface Soundboard {
  id: string;
  name: string;
  sounds: SoundItem[];
}

/** Everything she makes: her boards and the settings that go with them. This is what a backup keeps. */
export interface BoardsData {
  boards: Soundboard[];
  /** 0 to 1. */
  masterVolume: number;
  /** The key that stops every sound, like "Ctrl+Alt+0", or null. */
  stopAllKey: string | null;
}

import { detectOs, isTouchDevice } from '../lib/device';
import { webHaptic } from '../lib/haptics';
import { isTypingTarget } from '../lib/typing';
import { normalizeKeyString, captureKey } from '../keys/keyString';
import type { FileToSave, Platform, SaveOutcome, SoundKeyBinding, SoundKeyHost } from './types';

/** Sound keys in a browser: they work while the Soundboard window is in front and she isn't typing in a box. */
class WindowSoundKeys implements SoundKeyHost {
  readonly global = false;
  private bindings = new Map<string, () => void>();
  private listening = false;

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat || e.isComposing || isTypingTarget(e.target)) return;
    const pressed = captureKey(e);
    if (pressed.kind !== 'key') return;
    const run = this.bindings.get(pressed.key);
    if (!run) return;
    e.preventDefault();
    run();
  };

  async setKeys(bindings: readonly SoundKeyBinding[]): Promise<{ unavailable: string[] }> {
    this.bindings = new Map();
    for (const b of bindings) {
      const key = normalizeKeyString(b.key);
      if (key && !this.bindings.has(key)) this.bindings.set(key, b.run);
    }
    const wanted = this.bindings.size > 0;
    if (wanted && !this.listening) {
      window.addEventListener('keydown', this.onKeyDown);
      this.listening = true;
    } else if (!wanted && this.listening) {
      window.removeEventListener('keydown', this.onKeyDown);
      this.listening = false;
    }
    return { unavailable: [] };
  }
}

function downloadBlob(file: FileToSave) {
  const url = URL.createObjectURL(file.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before the link is thrown away.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function saveFile(file: FileToSave): Promise<SaveOutcome> {
  try {
    if (isTouchDevice() && typeof navigator.share === 'function' && typeof File !== 'undefined') {
      const shareable = new File([file.data], file.fileName, { type: file.mimeType });
      if (navigator.canShare?.({ files: [shareable] })) {
        try {
          await navigator.share({ files: [shareable], title: file.title ?? file.fileName });
          return { status: 'shared' };
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return { status: 'cancelled' };
          // The share sheet isn't available right now, so fall back to a normal download.
        }
      }
    }
    downloadBlob(file);
    return { status: 'saved', where: 'your Downloads folder' };
  } catch {
    return { status: 'failed', message: "I couldn't save that file. Please try again." };
  }
}

export const webPlatform: Platform = {
  kind: 'web',
  os: detectOs(),
  isNativeApp: false,
  saveFile,
  soundKeys: new WindowSoundKeys(),
  haptic: (strength) => webHaptic(strength),
};

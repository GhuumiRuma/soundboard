/** The file types a sound can be. Browsers use this to filter the file picker. */
const SOUND_TYPES = '.mp3,.wav,.ogg,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/x-m4a,audio/m4a';

/** The file types a clip can be cut from: any sound, or any video (its sound is used). */
const CLIP_TYPES = `${SOUND_TYPES},audio/*,video/*,.mp4,.m4v,.mov,.webm`;

/** The file types a backup can be. Some phones call a zip file by other names. */
export const BACKUP_TYPES = '.zip,application/zip,application/x-zip-compressed';

// Kept until she has chosen, because Safari can throw away a file picker that nothing refers to any more.
let open: HTMLInputElement | null = null;

/**
 * Opens the "pick a file" box. Call it straight from a tap or click, with nothing awaited first, or the browser
 * won't open it. Resolves with her files, or none if she backs out.
 */
export function pickFiles(options: { accept: string; multiple: boolean }): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.accept;
    input.multiple = options.multiple;

    const finish = (files: File[]) => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      if (open === input) open = null;
      resolve(files);
    };
    const onChange = () => finish(Array.from(input.files ?? []));
    const onCancel = () => finish([]);

    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    open = input;
    input.click();
  });
}

/** Opens the "pick a sound" box. */
export function pickSoundFiles(options: { multiple: boolean }): Promise<File[]> {
  return pickFiles({ accept: SOUND_TYPES, multiple: options.multiple });
}

/** Opens the "pick a sound or video" box for Clip a sound. Resolves with the file, or null if she backs out. */
export async function pickClipFile(): Promise<File | null> {
  const [file] = await pickFiles({ accept: CLIP_TYPES, multiple: false });
  return file ?? null;
}

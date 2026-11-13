/** The file types a sound can be. Browsers use this to filter the file picker. */
const SOUND_TYPES = '.mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/x-wav,audio/ogg';

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

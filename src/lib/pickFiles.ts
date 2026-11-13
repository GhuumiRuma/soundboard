/** The file types a sound can be. Browsers use this to filter the file picker. */
const SOUND_TYPES = '.mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/x-wav,audio/ogg';

// Kept until she has chosen, because Safari can throw away a file picker that nothing refers to any more.
let open: HTMLInputElement | null = null;

/** Opens the "pick a file" box. Call it straight from a tap or click. Resolves with her files, or none if she backs out. */
export function pickSoundFiles(options: { multiple: boolean }): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = SOUND_TYPES;
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

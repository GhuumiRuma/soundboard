/**
 * Checks a file she adds before it becomes a sound. Ported from StreamStudio's MediaLibrary (the 20 MB limit,
 * telling the kind of file by what is inside it rather than by its name, and its friendly messages).
 */

/** The biggest sound file she can add. */
export const MAX_SOUND_BYTES = 20 * 1024 * 1024;

export type AudioExt = 'mp3' | 'wav' | 'ogg';

export const importMessages = {
  tooBig: 'That sound is too big (the limit is 20 MB).',
  empty: 'That file is empty. Pick a sound file with content.',
  unsupported: "That file type isn't supported. Sounds can be MP3, WAV or OGG.",
  picture: "That's a picture — soundboard buttons need a sound file (MP3, WAV or OGG).",
  video: "That's a video — soundboard buttons need a sound file (MP3, WAV or OGG).",
  unreadable: "Couldn't open that file. Try picking it again.",
} as const;

export type Sniffed = { kind: 'audio'; ext: AudioExt; mime: string } | { kind: 'picture' } | { kind: 'video' };

const AUDIO_MIME: Record<AudioExt, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' };

export const mimeForExt = (ext: AudioExt): string => AUDIO_MIME[ext];

function ascii(data: Uint8Array, offset: number, text: string): boolean {
  if (data.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) if (data[offset + i] !== text.charCodeAt(i)) return false;
  return true;
}

function startsWith(data: Uint8Array, bytes: readonly number[]): boolean {
  return data.length >= bytes.length && bytes.every((b, i) => data[i] === b);
}

function isMp3FrameSync(data: Uint8Array): boolean {
  if (data.length < 3 || data[0] !== 0xff || (data[1] & 0xe0) !== 0xe0) return false;
  return (data[1] & 0x06) !== 0 && (data[1] & 0x18) !== 0x08 && (data[2] & 0xf0) !== 0xf0 && (data[2] & 0x0c) !== 0x0c;
}

function containsAscii(data: Uint8Array, text: string): boolean {
  const wanted = text.toLowerCase();
  const end = Math.min(data.length, 64 * 1024) - wanted.length;
  for (let i = 0; i <= end; i++) {
    let match = true;
    for (let j = 0; j < wanted.length; j++) {
      if ((data[i + j] | 0x20) !== wanted.charCodeAt(j)) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

/** What a file really is, from its first bytes. Null when it isn't anything this app knows. */
export function sniffMedia(data: Uint8Array): Sniffed | null {
  if (ascii(data, 0, 'ID3') || isMp3FrameSync(data)) return { kind: 'audio', ext: 'mp3', mime: AUDIO_MIME.mp3 };
  if (ascii(data, 0, 'RIFF') && ascii(data, 8, 'WAVE')) return { kind: 'audio', ext: 'wav', mime: AUDIO_MIME.wav };
  if (ascii(data, 0, 'OggS')) return { kind: 'audio', ext: 'ogg', mime: AUDIO_MIME.ogg };
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'picture' };
  if (ascii(data, 0, 'GIF87a') || ascii(data, 0, 'GIF89a')) return { kind: 'picture' };
  if (startsWith(data, [0xff, 0xd8, 0xff])) return { kind: 'picture' };
  if (ascii(data, 0, 'RIFF') && ascii(data, 8, 'WEBP')) return { kind: 'picture' };
  if (startsWith(data, [0x1a, 0x45, 0xdf, 0xa3]) && containsAscii(data, 'webm')) return { kind: 'video' };
  return null;
}

export interface SoundFileOk {
  ok: true;
  bytes: ArrayBuffer;
  ext: AudioExt;
  mime: string;
}

export interface SoundFileProblem {
  ok: false;
  message: string;
}

const problem = (message: string): SoundFileProblem => ({ ok: false, message });

/** The same checks as readSoundFile, for a file that has already been read. */
export function checkSoundBytes(bytes: ArrayBuffer): SoundFileOk | SoundFileProblem {
  if (bytes.byteLength > MAX_SOUND_BYTES) return problem(importMessages.tooBig);
  if (bytes.byteLength === 0) return problem(importMessages.empty);
  const sniffed = sniffMedia(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 64 * 1024)));
  if (!sniffed) return problem(importMessages.unsupported);
  if (sniffed.kind === 'picture') return problem(importMessages.picture);
  if (sniffed.kind === 'video') return problem(importMessages.video);
  return { ok: true, bytes, ext: sniffed.ext, mime: sniffed.mime };
}

/** Reads a file she picked or dropped and says whether it can be a sound. */
export async function readSoundFile(file: Blob): Promise<SoundFileOk | SoundFileProblem> {
  if (file.size > MAX_SOUND_BYTES) return problem(importMessages.tooBig);
  if (file.size === 0) return problem(importMessages.empty);
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return problem(importMessages.unreadable);
  }
  return checkSoundBytes(bytes);
}

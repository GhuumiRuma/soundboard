/**
 * Checks a file she adds before it becomes a sound. Ported from StreamStudio's MediaLibrary (the 20 MB limit,
 * telling the kind of file by what is inside it rather than by its name, and its friendly messages).
 */

/** The biggest sound file she can add. */
export const MAX_SOUND_BYTES = 20 * 1024 * 1024;

export type AudioExt = 'mp3' | 'wav' | 'ogg' | 'm4a';

export const importMessages = {
  tooBig: 'That sound is too big (the limit is 20 MB).',
  empty: 'That file is empty. Pick a sound file with content.',
  unsupported: "That file type isn't supported. Sounds can be MP3, WAV, OGG or M4A.",
  picture: "That's a picture — soundboard buttons need a sound file (MP3, WAV, OGG or M4A).",
  video:
    "That's a video — soundboard buttons need a sound file (MP3, WAV, OGG or M4A). To use the sound from a video, use Clip a sound.",
  unreadable: "Couldn't open that file. Try picking it again.",
} as const;

export type Sniffed = { kind: 'audio'; ext: AudioExt; mime: string } | { kind: 'picture' } | { kind: 'video' };

const AUDIO_MIME: Record<AudioExt, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4' };

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

/** One box of an MP4 file (M4A, MP4, MOV): a four-letter name, then what is inside it. */
interface Mp4Box {
  type: string;
  /** Where what is inside the box starts, and where the box ends. */
  body: number;
  end: number;
}

/** The boxes that sit side by side between `from` and `to`. It stops at anything that isn't a box. */
function mp4Boxes(data: Uint8Array, from: number, to: number): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let at = from;
  while (at + 8 <= to && boxes.length < 256) {
    let size = view.getUint32(at);
    let header = 8;
    if (size === 1) {
      if (at + 16 > to) break;
      size = view.getUint32(at + 8) * 2 ** 32 + view.getUint32(at + 12);
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < header) break;
    boxes.push({ type: String.fromCharCode(...data.subarray(at + 4, at + 8)), body: at + header, end: Math.min(at + size, to) });
    at += size;
  }
  return boxes;
}

/** Whether an MP4 file has a track that plays sound, and whether it has a track that shows a picture. */
function mp4Tracks(data: Uint8Array): { sound: boolean; video: boolean } {
  const found = { sound: false, video: false };
  const moov = mp4Boxes(data, 0, data.length).find((box) => box.type === 'moov');
  if (!moov) return found;
  for (const trak of mp4Boxes(data, moov.body, moov.end)) {
    if (trak.type !== 'trak') continue;
    const mdia = mp4Boxes(data, trak.body, trak.end).find((box) => box.type === 'mdia');
    const hdlr = mdia && mp4Boxes(data, mdia.body, mdia.end).find((box) => box.type === 'hdlr');
    // After the version and flags (4 bytes) and a reserved number (4 bytes) comes the kind of track.
    if (!hdlr || hdlr.body + 12 > hdlr.end) continue;
    const kind = String.fromCharCode(...data.subarray(hdlr.body + 8, hdlr.body + 12));
    if (kind === 'soun') found.sound = true;
    else if (kind === 'vide') found.video = true;
  }
  return found;
}

// Files made as music or voice recordings. Other MP4 files are videos unless they hold nothing but sound.
const MP4_AUDIO_BRANDS = new Set(['M4A ', 'M4B ', 'M4P ']);
// Photos from iPhones (HEIC) and newer cameras (AVIF) use the same kind of file.
const MP4_PICTURE_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1', 'avif', 'avis']);

function sniffMp4(data: Uint8Array): Sniffed | null {
  if (!ascii(data, 4, 'ftyp') || data.length < 12) return null;
  const brand = String.fromCharCode(...data.subarray(8, 12));
  if (MP4_PICTURE_BRANDS.has(brand)) return { kind: 'picture' };
  const tracks = MP4_AUDIO_BRANDS.has(brand) ? { sound: true, video: false } : mp4Tracks(data);
  return tracks.sound && !tracks.video ? { kind: 'audio', ext: 'm4a', mime: AUDIO_MIME.m4a } : { kind: 'video' };
}

/** What a file really is, from what is inside it. Null when it isn't anything this app knows. */
export function sniffMedia(data: Uint8Array): Sniffed | null {
  if (ascii(data, 0, 'ID3') || isMp3FrameSync(data)) return { kind: 'audio', ext: 'mp3', mime: AUDIO_MIME.mp3 };
  if (ascii(data, 0, 'RIFF') && ascii(data, 8, 'WAVE')) return { kind: 'audio', ext: 'wav', mime: AUDIO_MIME.wav };
  if (ascii(data, 0, 'OggS')) return { kind: 'audio', ext: 'ogg', mime: AUDIO_MIME.ogg };
  const mp4 = sniffMp4(data);
  if (mp4) return mp4;
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
  const sniffed = sniffMedia(new Uint8Array(bytes));
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

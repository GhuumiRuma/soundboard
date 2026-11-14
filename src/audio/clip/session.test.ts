import { describe, expect, it, vi } from 'vitest';
import { bytesOf, fakeMp4Bytes, makeWav } from '../../test/audio';
import { FakePreview } from '../../test/preview';
import { RATE, join, silence, tone } from '../../test/samples';
import { deferred } from '../../test/webaudio';
import { NOTICES } from '../recorder/messages';
import { WAVEFORM_BARS, buildWaveform } from '../recorder/rules';
import type { RecordedFile, SaveResult } from '../recorder/session';
import type { DecodedSound } from './decode';
import { CLIP_NOTICES, CLIP_PROBLEMS, longFileNotice } from './messages';
import { MAX_SOURCE_BYTES, MAX_SOURCE_MS, maxSourceFrames, zoomWindow } from './rules';
import { ClipSession } from './session';

/** Long files are made at a low sample rate so the tests stay small. */
const LOW = 8000;

/** One quiet second, one second of sound, two quiet seconds: the part kept runs from 0.92 s to 2.2 s. */
const SPOKEN = join(silence(1), tone(1, 0.5), silence(2));

/** Twenty seconds with two seconds of sound in them: the part kept runs from 4.92 s to 7.2 s. */
const MIDDLE = join(silence(5), tone(2, 0.5), silence(13));

/** Five minutes of sound, longer than a clip can be. */
const FIVE_MINUTES = tone(300, 0.5, LOW);

/** Which way a file opens: its sound (which is what the tests mostly look at), how fast, what the rest does. */
interface RigOptions {
  rate?: number;
  decode?: (bytes: ArrayBuffer) => Promise<DecodedSound>;
  probe?: (file: Blob) => Promise<number | null>;
  save?: (file: RecordedFile) => Promise<SaveResult>;
}

const makeRig = (sound: Float32Array = SPOKEN, options: RigOptions = {}) => {
  const rate = options.rate ?? RATE;
  const preview = new FakePreview();
  const saved: RecordedFile[] = [];
  const probe = vi.fn(async (file: Blob): Promise<number | null> => (options.probe ? options.probe(file) : null));
  const decode = vi.fn(async (bytes: ArrayBuffer): Promise<DecodedSound> => (options.decode ? options.decode(bytes) : { samples: sound, rate }));
  const save = vi.fn(async (file: RecordedFile): Promise<SaveResult> => {
    saved.push(file);
    return options.save ? options.save(file) : { ok: true };
  });
  const createPreview = vi.fn(() => preview);
  const session = new ClipSession({ probe, decode, createPreview, save });
  return { session, probe, decode, save, createPreview, preview, saved };
};
type Rig = ReturnType<typeof makeRig>;

const state = (rig: Rig) => rig.session.getState();

/** A file that is a sound as far as looking inside it goes. What the decoder gives back is up to the test. */
const aFile = (name = 'funny_moment.wav'): File => new File([makeWav(0.1)], name);

/** Opens `sound` as a file, and waits until it is open. */
const opened = async (sound: Float32Array = SPOKEN, options: RigOptions = {}): Promise<Rig> => {
  const rig = makeRig(sound, options);
  await rig.session.load(aFile(), 'funny_moment.wav');
  return rig;
};

/** A rig whose files finish opening only when the test says so. */
const slowRig = () => {
  const gates: ReturnType<typeof deferred<DecodedSound>>[] = [];
  const rig = makeRig(SPOKEN, {
    decode: () => {
      const gate = deferred<DecodedSound>();
      gates.push(gate);
      return gate.promise;
    },
  });
  /** Waits until `count` files have got as far as being decoded. */
  const decoding = (count: number) => vi.waitFor(() => expect(gates).toHaveLength(count));
  return { ...rig, gates, decoding };
};

/** A file that says it is `size` bytes without being that big. */
const claiming = (size: number): Blob => Object.defineProperty(new Blob(['x']), 'size', { value: size });

const wavInfo = (bytes: ArrayBuffer) => {
  const view = new DataView(bytes);
  const text = (at: number) => String.fromCharCode(...new Uint8Array(bytes, at, 4));
  return {
    riff: text(0),
    wave: text(8),
    channels: view.getUint16(22, true),
    rate: view.getUint32(24, true),
    dataBytes: view.getUint32(40, true),
  };
};

describe('opening a file', () => {
  it('starts at the first screen with nothing open', () => {
    expect(state(makeRig())).toMatchObject({ phase: 'choose', problem: null, source: null, previewing: false, notice: null });
  });

  it('says it is opening the file while it reads it', async () => {
    const gate = deferred<DecodedSound>();
    const rig = makeRig(SPOKEN, { decode: () => gate.promise });
    const opening = rig.session.load(aFile(), 'funny_moment.wav');
    expect(state(rig)).toMatchObject({ phase: 'loading', fileName: 'funny_moment.wav', problem: null });
    gate.resolve({ samples: SPOKEN, rate: RATE });
    await opening;
    expect(state(rig).phase).toBe('review');
  });

  it('shows the file with the quiet at each end already cut', async () => {
    const file = aFile();
    const rig = makeRig();
    await rig.session.load(file, 'funny_moment.wav');
    expect(state(rig)).toMatchObject({
      phase: 'review',
      fileName: 'funny_moment.wav',
      name: 'Funny moment',
      lengthMs: 4000,
      viewStartMs: 0,
      viewEndMs: 4000,
      zoomed: false,
      canZoom: false,
      startMs: 920,
      endMs: 2200,
      keptMs: 1280,
      previewing: false,
      problem: null,
      notice: NOTICES.trimmed,
    });
    expect(state(rig).source).toBe(file);
    expect(state(rig).bars).toHaveLength(WAVEFORM_BARS);
  });

  it('starts with all of a file that has nothing to cut, and says nothing', async () => {
    const rig = await opened(tone(3, 0.5));
    expect(state(rig)).toMatchObject({ startMs: 0, endMs: 3000, notice: null });
  });

  it('starts a long file with a short part from where the sound begins, and says how to pick the rest', async () => {
    const rig = await opened(join(silence(5, LOW), tone(95, 0.5, LOW)), { rate: LOW });
    expect(state(rig)).toMatchObject({
      lengthMs: 100_000,
      startMs: 4920,
      endMs: 14_920,
      keptMs: 10_000,
      canZoom: true,
      notice: longFileNotice(100_000),
    });
  });

  it('names the clip after its file, or "My clip" when the file has no name to go by', async () => {
    const rig = makeRig();
    await rig.session.load(aFile(), 'boss_fight-final.mp4');
    expect(state(rig).name).toBe('Boss fight final');
    await rig.session.load(aFile(), '.mp4');
    expect(state(rig).name).toBe('My clip');
  });

  it('tries a file it does not recognise, and a video, since the browser may know more than it does', async () => {
    const odd = new File([bytesOf(1, 2, 3, 4, 5, 6, 7, 8)], 'odd.bin');
    const video = new File([fakeMp4Bytes('isom', ['vide', 'soun'])], 'game.mp4');
    const rig = makeRig();
    await rig.session.load(odd, 'odd.bin');
    expect(state(rig).phase).toBe('review');
    await rig.session.load(video, 'game.mp4');
    expect(state(rig).phase).toBe('review');
    expect(rig.decode).toHaveBeenCalledTimes(2);
    expect(rig.decode.mock.calls[1][0].byteLength).toBe(video.size);
  });

  it('opens a file of exactly the biggest size, and one that is exactly the longest', async () => {
    const rig = makeRig(SPOKEN, { probe: async () => MAX_SOURCE_MS });
    await rig.session.load(claiming(MAX_SOURCE_BYTES), 'big.mp4');
    expect(state(rig).phase).toBe('review');
  });

  it('opens a file even when its length cannot be found out', async () => {
    for (const probe of [async () => null, async (): Promise<number | null> => Promise.reject(new Error('no video here'))]) {
      const rig = makeRig(SPOKEN, { probe });
      await rig.session.load(aFile(), 'a.mp4');
      expect(state(rig).phase).toBe('review');
    }
  });
});

describe('a file that cannot be opened', () => {
  it('is told when it is empty', async () => {
    const rig = makeRig();
    await rig.session.load(new File([], 'empty.mp4'), 'empty.mp4');
    expect(state(rig)).toMatchObject({ phase: 'choose', problem: CLIP_PROBLEMS.empty, source: null });
    expect(rig.decode).not.toHaveBeenCalled();
  });

  it('is told when it is too big, without it being read', async () => {
    const rig = makeRig();
    await rig.session.load(claiming(MAX_SOURCE_BYTES + 1), 'huge.mp4');
    expect(state(rig)).toMatchObject({ phase: 'choose', problem: CLIP_PROBLEMS.tooBig });
    expect(rig.probe).not.toHaveBeenCalled();
    expect(rig.decode).not.toHaveBeenCalled();
  });

  it('is told when it is a picture', async () => {
    const rig = makeRig();
    const png = new File([bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0)], 'photo.png');
    await rig.session.load(png, 'photo.png');
    expect(state(rig)).toMatchObject({ phase: 'choose', problem: CLIP_PROBLEMS.picture });
    expect(rig.decode).not.toHaveBeenCalled();
  });

  it('is told when the video is too long, before all of it is read', async () => {
    const rig = makeRig(SPOKEN, { probe: async () => MAX_SOURCE_MS + 1 });
    await rig.session.load(aFile(), 'stream.mp4');
    expect(state(rig)).toMatchObject({ phase: 'choose', problem: CLIP_PROBLEMS.tooLong });
    expect(rig.decode).not.toHaveBeenCalled();
  });

  it('is told when its sound turns out to be too long', async () => {
    const rig = makeRig(new Float32Array(maxSourceFrames(LOW) + 1), { rate: LOW });
    await rig.session.load(aFile(), 'stream.mp4');
    expect(state(rig)).toMatchObject({ phase: 'choose', problem: CLIP_PROBLEMS.tooLong });
  });

  it('is told when the sound cannot be got out of it', async () => {
    const broken = makeRig(SPOKEN, { decode: () => Promise.reject(new Error('EncodingError')) });
    await broken.session.load(aFile(), 'odd.mkv');
    expect(state(broken)).toMatchObject({ phase: 'choose', problem: CLIP_PROBLEMS.unreadable });

    const nothing = makeRig(new Float32Array(0));
    await nothing.session.load(aFile(), 'odd.mkv');
    expect(state(nothing)).toMatchObject({ phase: 'choose', problem: CLIP_PROBLEMS.unreadable });
  });

  it('is told when it is too short, or has no sound in it', async () => {
    const short = makeRig(tone(0.05, 0.5));
    await short.session.load(aFile(), 'blip.wav');
    expect(state(short)).toMatchObject({ phase: 'choose', problem: CLIP_PROBLEMS.tooShort });

    const quiet = makeRig(silence(3));
    await quiet.session.load(aFile(), 'quiet.wav');
    expect(state(quiet)).toMatchObject({ phase: 'choose', problem: CLIP_PROBLEMS.silent });
  });

  it('is told when the file cannot be read, whether at the start or the rest of it', async () => {
    const atTheStart = makeRig();
    const first = aFile();
    vi.spyOn(first, 'slice').mockReturnValue({ arrayBuffer: () => Promise.reject(new Error('gone')) } as unknown as Blob);
    await atTheStart.session.load(first, 'a.wav');
    expect(state(atTheStart)).toMatchObject({ phase: 'choose', problem: CLIP_PROBLEMS.readFailed });

    const later = makeRig();
    const second = aFile();
    vi.spyOn(second, 'arrayBuffer').mockRejectedValue(new Error('gone'));
    await later.session.load(second, 'a.wav');
    expect(state(later)).toMatchObject({ phase: 'choose', problem: CLIP_PROBLEMS.readFailed });
    expect(later.decode).not.toHaveBeenCalled();
  });

  it('can be followed by another file, and then the problem is gone', async () => {
    const rig = makeRig();
    await rig.session.load(new File([], 'empty.mp4'), 'empty.mp4');
    expect(state(rig).problem).toBe(CLIP_PROBLEMS.empty);
    await rig.session.load(aFile(), 'funny_moment.wav');
    expect(state(rig)).toMatchObject({ phase: 'review', problem: null });
  });
});

describe('choosing another file from the review', () => {
  it('opens the new file in place of the old one, starting afresh', async () => {
    let opens = 0;
    const rig = makeRig(SPOKEN, { decode: async () => ({ samples: opens++ === 0 ? MIDDLE : SPOKEN, rate: RATE }) });
    await rig.session.load(aFile('one.wav'), 'one.wav');
    rig.session.zoomToSelection();
    rig.session.setName('Mine');
    rig.session.togglePreview();

    await rig.session.load(aFile('two_file.wav'), 'two_file.wav');
    expect(state(rig)).toMatchObject({
      phase: 'review',
      fileName: 'two_file.wav',
      name: 'Two file',
      lengthMs: 4000,
      zoomed: false,
      startMs: 920,
      previewing: false,
    });
    expect(rig.preview.stops).toBe(1);
  });

  it('goes to the first screen, told why, when the new file is no good', async () => {
    const rig = await opened(MIDDLE);
    await rig.session.load(new File([], 'empty.mp4'), 'empty.mp4');
    expect(state(rig)).toMatchObject({ phase: 'choose', problem: CLIP_PROBLEMS.empty, source: null, fileName: '' });
  });
});

describe('changing her mind while a file opens', () => {
  it('goes back to the first screen on Cancel, and ignores the file when it arrives', async () => {
    const { session, gates, decoding } = slowRig();
    const opening = session.load(aFile(), 'a.wav');
    await decoding(1);
    session.cancel();
    expect(session.getState()).toMatchObject({ phase: 'choose', problem: null, fileName: '' });
    gates[0].resolve({ samples: SPOKEN, rate: RATE });
    await opening;
    expect(session.getState().phase).toBe('choose');
  });

  it('ignores a second file while one is opening', async () => {
    const { session, gates, decoding, decode } = slowRig();
    const opening = session.load(aFile('one.wav'), 'one.wav');
    await session.load(aFile('two.wav'), 'two.wav');
    await decoding(1);
    gates[0].resolve({ samples: SPOKEN, rate: RATE });
    await opening;
    expect(session.getState()).toMatchObject({ phase: 'review', fileName: 'one.wav' });
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('keeps the next file when one that was cancelled arrives after it', async () => {
    const { session, gates, decoding } = slowRig();
    const first = session.load(aFile('one.wav'), 'one.wav');
    await decoding(1);
    session.cancel();
    const second = session.load(aFile('two.wav'), 'two.wav');
    await decoding(2);
    gates[1].resolve({ samples: MIDDLE, rate: RATE });
    await second;
    gates[0].resolve({ samples: SPOKEN, rate: RATE });
    await first;
    expect(session.getState()).toMatchObject({ phase: 'review', fileName: 'two.wav', lengthMs: 20_000 });
  });

  it('only cancels while a file is opening', async () => {
    const rig = await opened();
    const before = state(rig);
    rig.session.cancel();
    expect(state(rig)).toBe(before);
  });

  it('says nothing more once the clipper is closed', async () => {
    const { session, gates, decoding } = slowRig();
    const opening = session.load(aFile(), 'a.wav');
    await decoding(1);
    const heard = vi.fn();
    session.subscribe(heard);
    session.dispose();
    gates[0].resolve({ samples: SPOKEN, rate: RATE });
    await opening;
    expect(heard).not.toHaveBeenCalled();
    expect(session.getState().phase).toBe('loading');
  });
});

describe('before a file is open', () => {
  it('ignores everything that needs one', () => {
    const rig = makeRig();
    const before = state(rig);
    rig.session.setStart(1000);
    rig.session.setEnd(2000);
    rig.session.startHere(1000);
    rig.session.endHere(2000);
    rig.session.setName('Nothing');
    rig.session.zoomToSelection();
    rig.session.showWholeFile();
    rig.session.togglePreview();
    expect(rig.session.stopPreview()).toBe(false);
    expect(state(rig)).toBe(before);
    expect(rig.session.renderFile()).toBeNull();
    expect(rig.preview.played).toHaveLength(0);
  });

  it('does not save anything', async () => {
    const rig = makeRig();
    await rig.session.save();
    expect(rig.save).not.toHaveBeenCalled();
    expect(state(rig).phase).toBe('choose');
  });
});

describe('moving Start and End', () => {
  it('moves Start, and the part kept changes with it', async () => {
    const rig = await opened(MIDDLE);
    expect(state(rig)).toMatchObject({ startMs: 4920, endMs: 7200, notice: NOTICES.trimmed });
    rig.session.setStart(4000);
    expect(state(rig)).toMatchObject({ startMs: 4000, endMs: 7200, keptMs: 3200, notice: null });
  });

  it('moves End, and the part kept changes with it', async () => {
    const rig = await opened(MIDDLE);
    rig.session.setEnd(9000);
    expect(state(rig)).toMatchObject({ startMs: 4920, endMs: 9000, keptMs: 4080, notice: null });
  });

  it("can't take Start past End, or End closer to Start than the shortest sound that can be saved", async () => {
    const rig = await opened(MIDDLE);
    rig.session.setStart(9000);
    expect(state(rig)).toMatchObject({ startMs: 7100, endMs: 7200, keptMs: 100 });
    rig.session.setStart(0);
    rig.session.setEnd(0);
    expect(state(rig)).toMatchObject({ startMs: 0, endMs: 100 });
  });

  it("can't take either one off the ends of the file, but End can go right to the end", async () => {
    const rig = await opened(MIDDLE);
    rig.session.setStart(-500);
    expect(state(rig).startMs).toBe(0);
    rig.session.setEnd(99_999);
    expect(state(rig).endMs).toBe(20_000);
  });

  it('keeps a clip to three minutes, and says why', async () => {
    const rig = await opened(FIVE_MINUTES, { rate: LOW });
    expect(state(rig)).toMatchObject({ startMs: 0, endMs: 10_000 });
    rig.session.setEnd(250_000);
    expect(state(rig)).toMatchObject({ startMs: 0, endMs: 180_000, notice: CLIP_NOTICES.longest });
    rig.session.setEnd(100_000);
    expect(state(rig)).toMatchObject({ endMs: 100_000, notice: null });
  });

  it('keeps Start within three minutes of End too', async () => {
    const rig = await opened(FIVE_MINUTES, { rate: LOW });
    rig.session.setEnd(100_000);
    rig.session.setStart(60_000);
    rig.session.setEnd(250_000);
    expect(state(rig)).toMatchObject({ startMs: 60_000, endMs: 240_000, notice: CLIP_NOTICES.longest });
    rig.session.setStart(0);
    expect(state(rig)).toMatchObject({ startMs: 60_000, endMs: 240_000, notice: CLIP_NOTICES.longest });
    rig.session.setStart(70_000);
    expect(state(rig)).toMatchObject({ startMs: 70_000, endMs: 240_000, notice: null });
  });

  it('stops the preview, since what it plays no longer matches', async () => {
    const rig = await opened(MIDDLE);
    rig.session.togglePreview();
    expect(state(rig).previewing).toBe(true);
    rig.session.setStart(4000);
    expect(state(rig).previewing).toBe(false);
    expect(rig.preview.stops).toBe(1);
  });
});

describe('Start here and End here', () => {
  it('Start here puts Start where the player is', async () => {
    const rig = await opened(MIDDLE);
    rig.session.startHere(4500);
    expect(state(rig)).toMatchObject({ startMs: 4500, endMs: 7200, notice: null });
  });

  it('End here puts End where the player is', async () => {
    const rig = await opened(MIDDLE);
    rig.session.endHere(9000);
    expect(state(rig)).toMatchObject({ startMs: 4920, endMs: 9000, notice: null });
  });

  it('Start here past End takes End along ten seconds on, so Start can be pressed first', async () => {
    const rig = await opened(MIDDLE);
    rig.session.startHere(9000);
    expect(state(rig)).toMatchObject({ startMs: 9000, endMs: 19_000, keptMs: 10_000 });
  });

  it('Start here near the end of the file keeps the shortest sound that can be saved', async () => {
    const rig = await opened(MIDDLE);
    rig.session.startHere(20_000);
    expect(state(rig)).toMatchObject({ startMs: 19_900, endMs: 20_000 });
    rig.session.startHere(19_950);
    expect(state(rig)).toMatchObject({ startMs: 19_900, endMs: 20_000 });
  });

  it('End here before Start takes Start along ten seconds back, so End can be pressed first', async () => {
    const rig = await opened(MIDDLE);
    rig.session.startHere(15_000);
    expect(state(rig)).toMatchObject({ startMs: 15_000, endMs: 20_000 });
    rig.session.endHere(12_000);
    expect(state(rig)).toMatchObject({ startMs: 2000, endMs: 12_000 });
  });

  it('End here near the beginning of the file leaves the shortest sound that can be saved', async () => {
    const rig = await opened(MIDDLE);
    rig.session.endHere(4950);
    expect(state(rig)).toMatchObject({ startMs: 0, endMs: 4950 });
    rig.session.endHere(10);
    expect(state(rig)).toMatchObject({ startMs: 0, endMs: 100 });
  });

  it('End here at the very end of the file keeps to the end', async () => {
    const rig = await opened(MIDDLE);
    rig.session.endHere(20_000);
    expect(state(rig).endMs).toBe(20_000);
  });

  it('pick a part in the middle of a long file, one press after the other', async () => {
    const rig = await opened(FIVE_MINUTES, { rate: LOW });
    rig.session.startHere(200_000);
    expect(state(rig)).toMatchObject({ startMs: 200_000, endMs: 210_000 });
    rig.session.endHere(203_500);
    expect(state(rig)).toMatchObject({ startMs: 200_000, endMs: 203_500, keptMs: 3500, notice: null });
  });

  it('End here more than three minutes after Start stops at three minutes, and says why', async () => {
    const rig = await opened(FIVE_MINUTES, { rate: LOW });
    rig.session.endHere(250_000);
    expect(state(rig)).toMatchObject({ startMs: 0, endMs: 180_000, notice: CLIP_NOTICES.longest });
  });
});

describe('zooming in', () => {
  it("isn't offered for a short file, or when the clip is nearly all of the file", async () => {
    const short = await opened(SPOKEN);
    const before = state(short);
    expect(before.canZoom).toBe(false);
    short.session.zoomToSelection();
    expect(state(short)).toBe(before);

    const whole = await opened(tone(8, 0.5));
    expect(state(whole)).toMatchObject({ startMs: 0, endMs: 8000, canZoom: false });
  });

  it('shows just the part around the clip, with room on each side to move the handles', async () => {
    const rig = await opened(MIDDLE);
    const whole = state(rig).bars;
    expect(state(rig)).toMatchObject({ zoomed: false, canZoom: true });

    rig.session.zoomToSelection();
    expect(state(rig)).toMatchObject({ zoomed: true, canZoom: true, viewStartMs: 3780, viewEndMs: 8340, startMs: 4920, endMs: 7200 });

    const window = zoomWindow(4920 * 48, 7200 * 48, MIDDLE.length, RATE);
    expect(state(rig).bars).toEqual(buildWaveform(MIDDLE.subarray(window.from, window.to)));
    expect(state(rig).bars).not.toEqual(whole);
  });

  it('shows the whole file again', async () => {
    const rig = await opened(MIDDLE);
    const whole = state(rig).bars;
    rig.session.zoomToSelection();
    rig.session.showWholeFile();
    expect(state(rig)).toMatchObject({ zoomed: false, canZoom: true, viewStartMs: 0, viewEndMs: 20_000 });
    expect(state(rig).bars).toEqual(whole);
  });

  it('stays zoomed in while a handle moves inside what is shown', async () => {
    const rig = await opened(MIDDLE);
    rig.session.zoomToSelection();
    rig.session.setStart(4000);
    rig.session.setEnd(8000);
    expect(state(rig)).toMatchObject({ zoomed: true, viewStartMs: 3780, viewEndMs: 8340, startMs: 4000, endMs: 8000 });
  });

  it('shows the whole file again when a handle is moved out of what is shown, so it always holds the clip', async () => {
    const start = await opened(MIDDLE);
    start.session.zoomToSelection();
    start.session.setStart(1000);
    expect(state(start)).toMatchObject({ zoomed: false, canZoom: true, viewStartMs: 0, viewEndMs: 20_000, startMs: 1000 });

    const end = await opened(MIDDLE);
    end.session.zoomToSelection();
    end.session.endHere(15_000);
    expect(state(end)).toMatchObject({ zoomed: false, viewStartMs: 0, viewEndMs: 20_000, endMs: 15_000 });
    expect(state(end).bars).toEqual(buildWaveform(MIDDLE));
  });
});

describe('listening to the clip', () => {
  it('plays the part that is kept', async () => {
    const rig = await opened(MIDDLE);
    rig.session.togglePreview();
    expect(state(rig).previewing).toBe(true);
    expect(rig.preview.played).toHaveLength(1);
    expect(rig.preview.played[0].rate).toBe(RATE);
    expect(rig.preview.played[0].samples).toHaveLength(2280 * 48);
  });

  it('plays it turned down if it is too loud, the way it will be saved', async () => {
    const rig = await opened(tone(2, 1));
    rig.session.togglePreview();
    const loudest = rig.preview.played[0].samples.reduce((most, sample) => Math.max(most, Math.abs(sample)), 0);
    expect(loudest).toBeLessThanOrEqual(0.98 + 1e-4);
    expect(loudest).toBeGreaterThan(0.9);
  });

  it('shows when it has played to the end', async () => {
    const rig = await opened(MIDDLE);
    rig.session.togglePreview();
    rig.preview.finish();
    expect(state(rig).previewing).toBe(false);
  });

  it('stops when pressed again, and plays from the start the next time', async () => {
    const rig = await opened(MIDDLE);
    rig.session.togglePreview();
    rig.session.togglePreview();
    expect(state(rig).previewing).toBe(false);
    expect(rig.preview.stops).toBe(1);
    rig.session.togglePreview();
    expect(state(rig).previewing).toBe(true);
    expect(rig.preview.played).toHaveLength(2);
    expect(rig.createPreview).toHaveBeenCalledTimes(1);
  });

  it("isn't stopped by an earlier play that says it has ended late", async () => {
    const rig = await opened(MIDDLE);
    rig.session.togglePreview();
    rig.session.togglePreview();
    rig.session.togglePreview();
    rig.preview.ends[0]();
    expect(state(rig).previewing).toBe(true);
  });

  it("says so when the browser won't play it", async () => {
    const rig = await opened(MIDDLE);
    rig.preview.canPlay = false;
    rig.session.togglePreview();
    expect(state(rig)).toMatchObject({ previewing: false, notice: CLIP_NOTICES.previewFailed });
  });

  it('can be stopped from outside, which says whether it was playing', async () => {
    const rig = await opened(MIDDLE);
    expect(rig.session.stopPreview()).toBe(false);
    rig.session.togglePreview();
    expect(rig.session.stopPreview()).toBe(true);
    expect(state(rig).previewing).toBe(false);
    expect(rig.session.stopPreview()).toBe(false);
  });
});

describe('saving', () => {
  it('saves the part that is kept as a WAV sound named after the file', async () => {
    const rig = await opened(MIDDLE);
    await rig.session.save();
    expect(rig.saved).toHaveLength(1);
    const [file] = rig.saved;
    expect(file.fileName).toBe('Funny moment.wav');
    expect(file.name).toBe('Funny moment');
    expect(wavInfo(file.bytes)).toEqual({ riff: 'RIFF', wave: 'WAVE', channels: 1, rate: RATE, dataBytes: 2280 * 48 * 2 });
    expect(state(rig).phase).toBe('done');
  });

  it('saves just the part she picked, with the name she gave it', async () => {
    const rig = await opened(MIDDLE);
    rig.session.setStart(5000);
    rig.session.setEnd(6000);
    rig.session.setName('Boss fight');
    await rig.session.save();
    expect(rig.saved[0]).toMatchObject({ fileName: 'Boss fight.wav', name: 'Boss fight' });
    expect(wavInfo(rig.saved[0].bytes).dataBytes).toBe(1000 * 48 * 2);
  });

  it('calls it "My clip" when she took the name away', async () => {
    const rig = await opened(MIDDLE);
    rig.session.setName('   ');
    await rig.session.save();
    expect(rig.saved[0]).toMatchObject({ fileName: 'My clip.wav', name: 'My clip' });
  });

  it('gives the same file to keep a copy of', async () => {
    const rig = await opened(MIDDLE);
    rig.session.setName('Boss fight');
    const copy = rig.session.renderFile();
    expect(copy).toMatchObject({ fileName: 'Boss fight.wav', name: 'Boss fight' });
    await rig.session.save();
    expect(new Uint8Array(copy?.bytes ?? new ArrayBuffer(0))).toEqual(new Uint8Array(rig.saved[0].bytes));
  });

  it('goes back to the review with nothing lost, and the reason, when it could not be saved', async () => {
    const rig = makeRig(MIDDLE, { save: async () => ({ ok: false, message: 'That sound is too big (the limit is 20 MB).' }) });
    await rig.session.load(aFile(), 'funny_moment.wav');
    rig.session.setStart(4000);
    rig.session.setName('Mine');
    await rig.session.save();
    expect(state(rig)).toMatchObject({
      phase: 'review',
      startMs: 4000,
      name: 'Mine',
      notice: { kind: 'problem', text: 'That sound is too big (the limit is 20 MB).' },
    });
  });

  it('says plainly that it did not work when no reason is given, or something went wrong', async () => {
    const quiet = makeRig(MIDDLE, { save: async () => ({ ok: false }) });
    await quiet.session.load(aFile(), 'a.wav');
    await quiet.session.save();
    expect(state(quiet)).toMatchObject({ phase: 'review', notice: CLIP_NOTICES.saveFailed });

    const thrown = makeRig(MIDDLE, { save: () => Promise.reject(new Error('disk full')) });
    await thrown.session.load(aFile(), 'a.wav');
    await thrown.session.save();
    expect(state(thrown)).toMatchObject({ phase: 'review', notice: CLIP_NOTICES.saveFailed });
  });

  it('can be tried again after it failed', async () => {
    let tries = 0;
    const rig = makeRig(MIDDLE, { save: async () => ({ ok: ++tries > 1 }) });
    await rig.session.load(aFile(), 'a.wav');
    await rig.session.save();
    expect(state(rig).phase).toBe('review');
    await rig.session.save();
    expect(state(rig)).toMatchObject({ phase: 'done', notice: null });
  });

  it("can't be closed while it is being saved, and ignores another press", async () => {
    const gate = deferred<SaveResult>();
    const rig = makeRig(MIDDLE, { save: () => gate.promise });
    await rig.session.load(aFile(), 'a.wav');
    expect(rig.session.requestClose()).toBe(true);
    rig.session.togglePreview();

    const saving = rig.session.save();
    const again = rig.session.save();
    expect(state(rig)).toMatchObject({ phase: 'saving', previewing: false });
    expect(rig.session.requestClose()).toBe(false);
    expect(rig.session.renderFile()).toBeNull();

    gate.resolve({ ok: true });
    await Promise.all([saving, again]);
    expect(rig.save).toHaveBeenCalledOnce();
    expect(rig.session.requestClose()).toBe(true);
  });
});

describe('closing the clipper', () => {
  it('stops the preview and tells the screen nothing more', async () => {
    const rig = await opened(MIDDLE);
    const heard = vi.fn();
    rig.session.subscribe(heard);
    rig.session.togglePreview();
    heard.mockClear();

    rig.session.dispose();
    expect(rig.preview.stops).toBe(1);
    rig.session.setStart(4000);
    rig.session.setName('Late');
    expect(heard).not.toHaveBeenCalled();
    expect(() => rig.session.dispose()).not.toThrow();
  });

  it('ignores a save that finishes afterwards', async () => {
    const gate = deferred<SaveResult>();
    const rig = makeRig(MIDDLE, { save: () => gate.promise });
    await rig.session.load(aFile(), 'a.wav');
    const saving = rig.session.save();
    rig.session.dispose();
    gate.resolve({ ok: true });
    await saving;
    expect(state(rig).phase).toBe('saving');
  });

  it('keeps nothing of the file, and cannot save or play it any more', async () => {
    const rig = await opened(MIDDLE);
    rig.session.dispose();
    expect(rig.session.renderFile()).toBeNull();
    await rig.session.save();
    rig.session.togglePreview();
    expect(rig.save).not.toHaveBeenCalled();
    expect(rig.preview.played).toHaveLength(0);
  });
});

describe('following along', () => {
  it('tells everyone listening about each change, until they leave', async () => {
    const rig = makeRig();
    const heard = vi.fn();
    const leave = rig.session.subscribe(heard);
    await rig.session.load(aFile(), 'a.wav');
    expect(heard).toHaveBeenCalled();
    heard.mockClear();
    leave();
    rig.session.setName('Quiet');
    expect(heard).not.toHaveBeenCalled();
  });

  it('gives the same state until something changes, and a new one after', async () => {
    const rig = await opened(MIDDLE);
    const before = state(rig);
    expect(state(rig)).toBe(before);
    rig.session.setName('Another');
    expect(state(rig)).not.toBe(before);
    expect(before.name).toBe('Funny moment');
  });
});

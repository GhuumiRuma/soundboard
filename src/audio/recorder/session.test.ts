import { describe, expect, it, vi } from 'vitest';
import { RATE, join, silence, tone } from '../../test/samples';
import { MIC_PROBLEM_TEXT, MicProblem, NOTICES } from './messages';
import type { MicInput } from './mic';
import type { Preview } from './preview';
import { MAX_RECORDING_MS, WAVEFORM_BARS } from './rules';
import { RecorderSession, type RecordedFile, type SaveResult } from './session';
import { wavSize } from './wav';

const BLOCK = 2048;

/** A microphone that hears what the test tells it to, in blocks like a real one. */
class FakeMic implements MicInput {
  label = 'Test microphone';
  sampleRate = RATE;
  onBlock: ((block: Float32Array) => void) | null = null;
  onLost: (() => void) | null = null;
  closed = false;
  flushes = 0;
  /** Sound that is still on its way until the recorder asks for it. */
  late: Float32Array | null = null;

  hear(samples: Float32Array): void {
    for (let at = 0; at < samples.length; at += BLOCK) this.onBlock?.(samples.slice(at, at + BLOCK));
  }

  unplug(): void {
    this.onLost?.();
  }

  async flush(): Promise<void> {
    this.flushes += 1;
    const late = this.late;
    this.late = null;
    if (late) this.hear(late);
  }

  close(): void {
    this.closed = true;
    this.onBlock = null;
    this.onLost = null;
  }
}

class FakePreview implements Preview {
  played: { samples: Float32Array; rate: number }[] = [];
  stops = 0;
  canPlay = true;
  private ended: (() => void) | null = null;

  play(samples: Float32Array, rate: number, onEnded: () => void): boolean {
    if (!this.canPlay) return false;
    this.played.push({ samples, rate });
    this.ended = onEnded;
    return true;
  }

  stop(): void {
    this.stops += 1;
    this.finish();
  }

  /** It played to the end by itself. */
  finish(): void {
    const ended = this.ended;
    this.ended = null;
    ended?.();
  }
}

interface RigOptions {
  /** Each time the microphone is opened, the first of these is used up. `null` means it opens fine. */
  opens?: unknown[];
  save?: (file: RecordedFile) => Promise<SaveResult>;
}

const makeRig = (options: RigOptions = {}) => {
  const outcomes = [...(options.opens ?? [])];
  const mics: FakeMic[] = [];
  const preview = new FakePreview();
  const saved: RecordedFile[] = [];
  const openMic = vi.fn(async (): Promise<MicInput> => {
    const outcome = outcomes.shift();
    if (outcome !== undefined && outcome !== null) throw outcome;
    const mic = new FakeMic();
    mics.push(mic);
    return mic;
  });
  const save = vi.fn(async (file: RecordedFile): Promise<SaveResult> => {
    saved.push(file);
    return options.save ? options.save(file) : { ok: true };
  });
  const session = new RecorderSession({ openMic, createPreview: () => preview, save });
  return { session, openMic, preview, saved, save, mic: () => mics[mics.length - 1] };
};
type Rig = ReturnType<typeof makeRig>;

const state = (rig: Rig) => rig.session.getState();

/** Opens the microphone, records `sound` and stops. */
const recorded = async (sound: Float32Array, options?: RigOptions): Promise<Rig> => {
  const rig = makeRig(options);
  await rig.session.open();
  rig.session.record();
  rig.mic().hear(sound);
  await rig.session.stop();
  return rig;
};

/** One quiet second, one second of sound, two quiet seconds: the sound is kept from 0.92 s to 2.2 s. */
const SPOKEN = join(silence(1), tone(1, 0.5), silence(2));

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

describe('opening the microphone', () => {
  it('starts out opening, then shows the microphone once it is open', async () => {
    const rig = makeRig();
    expect(state(rig).mic).toEqual({ status: 'opening' });
    await rig.session.open();
    expect(state(rig).mic).toEqual({ status: 'open', label: 'Test microphone' });
    expect(state(rig).phase).toBe('ready');
  });

  it('says why when the microphone is blocked, and lets her try again', async () => {
    const rig = makeRig({ opens: [new MicProblem('denied')] });
    await rig.session.open();
    expect(state(rig).mic).toEqual({ status: 'problem', text: MIC_PROBLEM_TEXT.denied, canRetry: true });

    await rig.session.retry();
    expect(state(rig).mic.status).toBe('open');
    expect(rig.openMic).toHaveBeenCalledTimes(2);
  });

  it("doesn't offer Try again on a browser that can't record at all", async () => {
    const rig = makeRig({ opens: [new MicProblem('unsupported')] });
    await rig.session.open();
    expect(state(rig).mic).toEqual({ status: 'problem', text: MIC_PROBLEM_TEXT.unsupported, canRetry: false });

    await rig.session.retry();
    expect(rig.openMic).toHaveBeenCalledTimes(1);
  });

  it('turns any other failure into a friendly message', async () => {
    const rig = makeRig({ opens: [new Error('something odd')] });
    await rig.session.open();
    expect(state(rig).mic).toEqual({ status: 'problem', text: MIC_PROBLEM_TEXT.unknown, canRetry: true });
  });

  it('only opens the microphone once when asked twice', async () => {
    const rig = makeRig();
    await Promise.all([rig.session.open(), rig.session.open()]);
    await rig.session.open();
    expect(rig.openMic).toHaveBeenCalledTimes(1);
  });

  it('lets go of a microphone that opens after the recorder was closed', async () => {
    const mic = new FakeMic();
    let open!: (mic: MicInput) => void;
    const session = new RecorderSession({
      openMic: () => new Promise<MicInput>((resolve) => (open = resolve)),
      createPreview: () => new FakePreview(),
      save: async () => ({ ok: true }),
    });
    const opening = session.open();
    session.dispose();
    open(mic);
    await opening;
    expect(mic.closed).toBe(true);
  });

  it("shows that the microphone is gone if it is unplugged before she starts", async () => {
    const rig = makeRig();
    await rig.session.open();
    const mic = rig.mic();
    mic.unplug();
    expect(mic.closed).toBe(true);
    expect(state(rig).mic).toEqual({ status: 'problem', text: MIC_PROBLEM_TEXT.missing, canRetry: true });

    await rig.session.retry();
    expect(state(rig).mic.status).toBe('open');
  });
});

describe('recording', () => {
  it('keeps what the microphone hears after Record, and only shows what came before on the level meter', async () => {
    const rig = makeRig();
    await rig.session.open();
    rig.mic().hear(tone(1, 0.5));
    rig.session.tick(0.05);
    expect(state(rig).level).toBeGreaterThan(80);
    expect(state(rig).elapsedMs).toBe(0);

    rig.session.record();
    expect(state(rig).phase).toBe('recording');
    rig.mic().hear(tone(2, 0.5));
    rig.session.tick(0.05);
    expect(state(rig).elapsedMs).toBe(2000);

    await rig.session.stop();
    expect(state(rig).phase).toBe('review');
    expect(state(rig).lengthMs).toBe(2000);
  });

  it('lets the level meter fall back after a loud moment', async () => {
    const rig = makeRig();
    await rig.session.open();
    rig.mic().hear(tone(0.1, 0.5));
    rig.session.tick(0.05);
    const loud = state(rig).level;
    rig.session.tick(0.5);
    const falling = state(rig).level;
    rig.session.tick(10);
    // The meter shows the peak before it falls, so the quiet shows on the tick after.
    rig.session.tick(0.05);
    expect(loud).toBeGreaterThan(falling);
    expect(falling).toBeGreaterThan(0);
    expect(state(rig).level).toBe(0);
  });

  it("only tells the screen when the level or the clock changed", async () => {
    const rig = makeRig();
    await rig.session.open();
    const heard = vi.fn();
    rig.session.subscribe(heard);
    rig.session.tick(0.05);
    rig.session.tick(0.05);
    expect(heard).not.toHaveBeenCalled();

    rig.mic().hear(tone(0.1, 0.5));
    rig.session.tick(0.05);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("doesn't start until the microphone is ready", async () => {
    const rig = makeRig({ opens: [new MicProblem('denied')] });
    await rig.session.open();
    rig.session.record();
    expect(state(rig).phase).toBe('ready');
  });

  it('keeps the very end of what was said, which may still be on its way', async () => {
    const rig = makeRig();
    await rig.session.open();
    rig.session.record();
    rig.mic().hear(tone(1, 0.5));
    rig.mic().late = tone(0.5, 0.5);
    await rig.session.stop();
    expect(rig.mic().flushes).toBe(1);
    expect(state(rig).lengthMs).toBe(1500);
  });

  it('lets go of the microphone once recording has stopped', async () => {
    const rig = await recorded(tone(2, 0.5));
    expect(rig.mic().closed).toBe(true);
  });

  it('stops by itself after one minute, with a hint', async () => {
    const rig = makeRig();
    await rig.session.open();
    rig.session.record();
    rig.mic().hear(tone(61, 0.5));
    expect(state(rig).phase).toBe('review');
    expect(state(rig).lengthMs).toBe(MAX_RECORDING_MS);
    expect(state(rig).notice).toBe(NOTICES.stoppedAtLimit);
    expect(rig.mic().closed).toBe(true);
    expect(rig.mic().flushes).toBe(0);
  });

  it('keeps what was recorded when the microphone is unplugged', async () => {
    const rig = makeRig();
    await rig.session.open();
    rig.session.record();
    rig.mic().hear(tone(2, 0.5));
    rig.mic().unplug();
    await Promise.resolve();
    expect(state(rig).phase).toBe('review');
    expect(state(rig).lengthMs).toBe(2000);
    expect(state(rig).notice).toBe(NOTICES.deviceLost);
    expect(state(rig).canSave).toBe(true);
    expect(rig.mic().closed).toBe(true);
  });

  it('ignores Stop when nothing is recording', async () => {
    const rig = makeRig();
    await rig.session.open();
    await rig.session.stop();
    expect(state(rig).phase).toBe('ready');
  });
});

describe('the review', () => {
  it('cuts the quiet at the start and end, and says so', async () => {
    const rig = await recorded(SPOKEN);
    const s = state(rig);
    expect(s.lengthMs).toBe(4000);
    expect(s.startMs).toBe(920);
    expect(s.endMs).toBe(2200);
    expect(s.keptMs).toBe(1280);
    expect(s.trimmed).toBe(true);
    expect(s.notice).toBe(NOTICES.trimmed);
    expect(s.canSave).toBe(true);
    expect(s.name).toBe('My recording');
  });

  it("keeps everything when there's no quiet to cut", async () => {
    const rig = await recorded(tone(2, 0.5));
    const s = state(rig);
    expect(s.startMs).toBe(0);
    expect(s.endMs).toBe(2000);
    expect(s.trimmed).toBe(false);
    expect(s.notice).toBeNull();
  });

  it('draws the waveform in 240 bars, loud parts tall and quiet parts short', async () => {
    const rig = await recorded(SPOKEN);
    const { bars } = state(rig);
    expect(bars).toHaveLength(WAVEFORM_BARS);
    expect(bars[WAVEFORM_BARS / 2 - 1]).toBeGreaterThan(0.9);
    expect(bars[0]).toBe(0);
    expect(bars[WAVEFORM_BARS - 1]).toBe(0);
  });

  it("says when nothing was heard, and won't save it", async () => {
    const rig = await recorded(silence(2));
    const s = state(rig);
    expect(s.silent).toBe(true);
    expect(s.canSave).toBe(false);
    expect(s.notice).toBe(NOTICES.silent);

    await rig.session.save();
    expect(rig.save).not.toHaveBeenCalled();
    expect(state(rig).phase).toBe('review');
  });

  it('counts a recording that is only hiss as silent', async () => {
    const rig = await recorded(tone(2, 0.002));
    expect(state(rig).silent).toBe(true);
    expect(state(rig).notice).toBe(NOTICES.silent);
  });

  it("says when it's too short to save", async () => {
    const rig = await recorded(tone(0.05, 0.5));
    expect(state(rig).notice).toBe(NOTICES.tooShort);
    expect(state(rig).canSave).toBe(false);
  });

  it('moves the Start handle, and stops saying it cut the quiet', async () => {
    const rig = await recorded(SPOKEN);
    rig.session.setStart(500);
    expect(state(rig).startMs).toBe(500);
    expect(state(rig).keptMs).toBe(1700);
    expect(state(rig).notice).toBeNull();
    expect(state(rig).trimmed).toBe(true);
  });

  it('moves the End handle, and keeps everything to the very end when it is pulled all the way out', async () => {
    const rig = await recorded(SPOKEN);
    rig.session.setEnd(3000);
    expect(state(rig).endMs).toBe(3000);
    rig.session.setEnd(99999);
    expect(state(rig).endMs).toBe(4000);
    rig.session.setStart(0);
    expect(state(rig).trimmed).toBe(false);
  });

  it("doesn't let the handles cross, or come closer than the shortest clip that can be saved", async () => {
    const rig = await recorded(SPOKEN);
    rig.session.setStart(99999);
    expect(state(rig).endMs - state(rig).startMs).toBeGreaterThanOrEqual(100);
    expect(state(rig).canSave).toBe(true);

    rig.session.setEnd(0);
    expect(state(rig).endMs - state(rig).startMs).toBeGreaterThanOrEqual(100);
    expect(state(rig).startMs).toBeLessThanOrEqual(state(rig).endMs);
    expect(state(rig).canSave).toBe(true);
  });

  it('keeps the other messages when a handle moves', async () => {
    const rig = makeRig();
    await rig.session.open();
    rig.session.record();
    rig.mic().hear(tone(2, 0.5));
    rig.mic().unplug();
    await Promise.resolve();
    rig.session.setStart(500);
    expect(state(rig).notice).toBe(NOTICES.deviceLost);
  });

  it("ignores the handles and the name when there's no review", async () => {
    const rig = makeRig();
    await rig.session.open();
    rig.session.setStart(500);
    rig.session.setEnd(500);
    rig.session.setName('Nope');
    expect(state(rig).startMs).toBe(0);
    expect(state(rig).name).toBe('My recording');
  });

  it('remembers the name she types', async () => {
    const rig = await recorded(SPOKEN);
    rig.session.setName('Air horn');
    expect(state(rig).name).toBe('Air horn');
  });
});

describe('playing it back', () => {
  it('plays the part that is kept, at the rate it was recorded, and shows when it ends', async () => {
    const rig = await recorded(SPOKEN);
    rig.session.togglePreview();
    expect(state(rig).previewing).toBe(true);
    expect(rig.preview.played).toHaveLength(1);
    expect(rig.preview.played[0].rate).toBe(RATE);
    expect(rig.preview.played[0].samples).toHaveLength(Math.round(1.28 * RATE));

    rig.preview.finish();
    expect(state(rig).previewing).toBe(false);
  });

  it('stops when she presses Play again', async () => {
    const rig = await recorded(SPOKEN);
    rig.session.togglePreview();
    rig.session.togglePreview();
    expect(state(rig).previewing).toBe(false);
    expect(rig.preview.stops).toBe(1);
    expect(rig.preview.played).toHaveLength(1);
  });

  it('stops when a handle moves, because it no longer matches', async () => {
    const rig = await recorded(SPOKEN);
    rig.session.togglePreview();
    rig.session.setStart(0);
    expect(state(rig).previewing).toBe(false);
    expect(rig.preview.stops).toBe(1);
  });

  it('says so when it cannot play', async () => {
    const rig = await recorded(SPOKEN);
    rig.preview.canPlay = false;
    rig.session.togglePreview();
    expect(state(rig).previewing).toBe(false);
    expect(state(rig).notice).toBe(NOTICES.previewFailed);
  });

  it('has nothing to play when nothing was heard', async () => {
    const rig = await recorded(silence(2));
    rig.session.togglePreview();
    expect(rig.preview.played).toHaveLength(0);
  });

  it('stops when the recorder closes', async () => {
    const rig = await recorded(SPOKEN);
    rig.session.togglePreview();
    rig.session.dispose();
    expect(rig.preview.stops).toBe(1);
  });
});

describe('closing and starting over', () => {
  it('closes at once when nothing is recorded yet', async () => {
    const rig = makeRig();
    await rig.session.open();
    expect(rig.session.requestClose()).toBe(true);
  });

  it('closes at once while a recording is under a second', async () => {
    const rig = makeRig();
    await rig.session.open();
    rig.session.record();
    rig.mic().hear(tone(0.5, 0.5));
    expect(rig.session.requestClose()).toBe(true);
  });

  it('asks first when a recording of a second or more would be lost, and lets her keep recording', async () => {
    const rig = makeRig();
    await rig.session.open();
    rig.session.record();
    rig.mic().hear(tone(1.2, 0.5));
    expect(rig.session.requestClose()).toBe(false);
    expect(state(rig).confirm).toBe('close');
    expect(state(rig).phase).toBe('recording');

    rig.session.keepIt();
    expect(state(rig).confirm).toBeNull();

    expect(rig.session.requestClose()).toBe(false);
    expect(rig.session.throwAway()).toBe(true);
  });

  it("doesn't ask again while the question is already showing", async () => {
    const rig = await recorded(tone(2, 0.5));
    expect(rig.session.requestClose()).toBe(false);
    expect(rig.session.requestClose()).toBe(false);
    expect(state(rig).confirm).toBe('close');
  });

  it('asks first in the review too, but not for a recording of nothing, or under a second', async () => {
    const long = await recorded(tone(2, 0.5));
    expect(long.session.requestClose()).toBe(false);
    expect(state(long).confirm).toBe('close');

    const short = await recorded(tone(0.5, 0.5));
    expect(short.session.requestClose()).toBe(true);

    const nothing = await recorded(silence(3));
    expect(nothing.session.requestClose()).toBe(true);
  });

  it("doesn't let the controls work while she is being asked", async () => {
    const rig = await recorded(SPOKEN);
    rig.session.requestClose();
    rig.session.setStart(0);
    rig.session.togglePreview();
    rig.session.recordAgain();
    await rig.session.save();
    expect(state(rig).startMs).toBe(920);
    expect(rig.preview.played).toHaveLength(0);
    expect(rig.save).not.toHaveBeenCalled();
    expect(state(rig).confirm).toBe('close');
  });

  it('asks before recording again over a recording worth keeping, then opens the microphone again', async () => {
    const rig = await recorded(SPOKEN);
    rig.session.recordAgain();
    expect(state(rig).confirm).toBe('recordAgain');
    expect(state(rig).phase).toBe('review');

    expect(rig.session.throwAway()).toBe(false);
    await vi.waitFor(() => expect(state(rig).mic.status).toBe('open'));
    expect(state(rig).phase).toBe('ready');
    expect(state(rig).confirm).toBeNull();
    expect(state(rig).notice).toBeNull();
    expect(state(rig).lengthMs).toBe(0);
    expect(rig.openMic).toHaveBeenCalledTimes(2);

    rig.session.record();
    rig.mic().hear(tone(1, 0.5));
    await rig.session.stop();
    expect(state(rig).lengthMs).toBe(1000);
  });

  it('records again at once when there is nothing worth keeping', async () => {
    const rig = await recorded(tone(0.5, 0.5));
    rig.session.recordAgain();
    await vi.waitFor(() => expect(state(rig).mic.status).toBe('open'));
    expect(state(rig).phase).toBe('ready');
    expect(state(rig).confirm).toBeNull();
  });

  it('keeps the recording when she says "Keep it"', async () => {
    const rig = await recorded(SPOKEN);
    rig.session.recordAgain();
    rig.session.keepIt();
    expect(state(rig).confirm).toBeNull();
    expect(state(rig).phase).toBe('review');
    expect(state(rig).keptMs).toBe(1280);
  });

  it("can't be closed while the sound is being saved", async () => {
    let finish!: (result: SaveResult) => void;
    const rig = await recorded(SPOKEN, { save: () => new Promise<SaveResult>((resolve) => (finish = resolve)) });
    const saving = rig.session.save();
    expect(state(rig).phase).toBe('saving');
    expect(rig.session.requestClose()).toBe(false);
    expect(state(rig).confirm).toBeNull();

    finish({ ok: true });
    await saving;
    expect(state(rig).phase).toBe('done');
    expect(rig.session.requestClose()).toBe(true);
  });
});

describe('saving', () => {
  it('saves the part that is kept as a WAV file, with the name she typed', async () => {
    const rig = await recorded(SPOKEN);
    rig.session.setName('Air horn');
    await rig.session.save();

    expect(rig.saved).toHaveLength(1);
    const file = rig.saved[0];
    expect(file.name).toBe('Air horn');
    expect(file.fileName).toBe('Air horn.wav');
    const info = wavInfo(file.bytes);
    expect(info.riff).toBe('RIFF');
    expect(info.wave).toBe('WAVE');
    expect(info.channels).toBe(1);
    expect(info.rate).toBe(RATE);
    expect(info.dataBytes).toBe(Math.round(1.28 * RATE) * 2);
    expect(file.bytes.byteLength).toBe(wavSize(Math.round(1.28 * RATE)));
    expect(state(rig).phase).toBe('done');
  });

  it('calls it "My recording" when she leaves the name empty', async () => {
    const rig = await recorded(SPOKEN);
    rig.session.setName('   ');
    await rig.session.save();
    expect(rig.saved[0].name).toBe('My recording');
    expect(rig.saved[0].fileName).toBe('My recording.wav');
  });

  it('shortens a long name, like every other sound name', async () => {
    const rig = await recorded(SPOKEN);
    rig.session.setName('x'.repeat(80));
    await rig.session.save();
    expect(rig.saved[0].name).toHaveLength(48);
    expect(rig.saved[0].name.endsWith('…')).toBe(true);
    expect(rig.saved[0].fileName).toBe(`${'x'.repeat(60)}.wav`);
  });

  it('goes back to the review when saving fails, so nothing is lost', async () => {
    let answers: SaveResult[] = [{ ok: false, message: 'That sound is too big (the limit is 20 MB).' }, { ok: true }];
    const rig = await recorded(SPOKEN, { save: async () => answers.shift() ?? { ok: true } });
    rig.session.setName('Air horn');
    await rig.session.save();
    expect(state(rig).phase).toBe('review');
    expect(state(rig).notice).toEqual({ kind: 'problem', text: 'That sound is too big (the limit is 20 MB).' });
    expect(state(rig).name).toBe('Air horn');
    expect(state(rig).keptMs).toBe(1280);

    await rig.session.save();
    expect(state(rig).phase).toBe('done');
    answers = [];
  });

  it('uses a friendly message when the save gives no reason, or breaks', async () => {
    const quiet = await recorded(SPOKEN, { save: async () => ({ ok: false }) });
    await quiet.session.save();
    expect(state(quiet).notice).toEqual(NOTICES.saveFailed);

    const broken = await recorded(SPOKEN, {
      save: async () => {
        throw new Error('disk full');
      },
    });
    await broken.session.save();
    expect(state(broken).phase).toBe('review');
    expect(state(broken).notice).toEqual(NOTICES.saveFailed);
  });

  it("doesn't save twice when Save is pressed twice", async () => {
    const rig = await recorded(SPOKEN);
    await Promise.all([rig.session.save(), rig.session.save()]);
    expect(rig.save).toHaveBeenCalledTimes(1);
  });

  it('gives the same file for "save a copy", and nothing when there is nothing worth saving', async () => {
    const rig = await recorded(SPOKEN);
    rig.session.setName('Air horn');
    const file = rig.session.renderFile();
    expect(file?.fileName).toBe('Air horn.wav');
    expect(file?.bytes.byteLength).toBe(wavSize(Math.round(1.28 * RATE)));
    expect(rig.save).not.toHaveBeenCalled();

    const nothing = await recorded(silence(2));
    expect(nothing.session.renderFile()).toBeNull();
    const notYet = makeRig();
    await notYet.session.open();
    expect(notYet.session.renderFile()).toBeNull();
  });
});

describe('closing the recorder', () => {
  it('lets go of the microphone', async () => {
    const rig = makeRig();
    await rig.session.open();
    const mic = rig.mic();
    rig.session.dispose();
    expect(mic.closed).toBe(true);
  });

  it('lets go of the microphone in the middle of a recording', async () => {
    const rig = makeRig();
    await rig.session.open();
    rig.session.record();
    rig.mic().hear(tone(1, 0.5));
    rig.session.dispose();
    expect(rig.mic().closed).toBe(true);
  });

  it('tells the screen nothing more afterwards', async () => {
    const rig = makeRig();
    await rig.session.open();
    rig.session.record();
    const heard = vi.fn();
    rig.session.subscribe(heard);
    rig.session.dispose();
    rig.session.tick(1);
    await rig.session.stop();
    rig.session.record();
    expect(heard).not.toHaveBeenCalled();
  });

  it('is fine to close twice', async () => {
    const rig = makeRig();
    await rig.session.open();
    rig.session.dispose();
    expect(() => rig.session.dispose()).not.toThrow();
  });
});

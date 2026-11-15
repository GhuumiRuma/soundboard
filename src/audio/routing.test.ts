import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeContext, FakeNode, deferred } from '../test/webaudio';

const dependencies = vi.hoisted(() => ({
  engine: { setLocalPlayback: vi.fn(), attachOutput: vi.fn() },
  context: vi.fn(),
}));
vi.mock('./index', () => ({ getEngine: () => dependencies.engine }));
vi.mock('./recorder/context', () => ({ getRecordingContext: dependencies.context }));
vi.mock('../platform', () => ({ getPlatform: () => ({ os: 'windows' }) }));

import { audioRouting, requestRoutingDevices, requestRoutingOutput } from './routing';

const device = (id: string, kind: MediaDeviceKind, label: string, groupId: string): MediaDeviceInfo => ({
  deviceId: id, kind, label, groupId, toJSON: () => ({}),
});
const cable = device('cable', 'audiooutput', 'CABLE Input', 'virtual');
const webcam = device('webcam', 'audioinput', 'Webcam microphone', 'camera');
const normal = device('default', 'audiooutput', 'Headphones', 'headphones');
const options = { outputId: 'cable', micId: 'webcam', listenLocally: false, micVolume: 0.7 };

function stream() {
  const track = { readyState: 'live', onended: null as (() => void) | null, stop: vi.fn() };
  track.stop.mockImplementation(() => { track.readyState = 'ended'; });
  return { track, media: { getTracks: () => [track], getAudioTracks: () => [track] } };
}

let media: EventTarget & { enumerateDevices: ReturnType<typeof vi.fn>; getUserMedia: ReturnType<typeof vi.fn> };
let ctx: FakeContext & EventTarget & { createMediaStreamDestination: ReturnType<typeof vi.fn>; createMediaStreamSource: ReturnType<typeof vi.fn> };
let audio: ReturnType<typeof makeAudio>;
let input: ReturnType<typeof stream>;
let output: ReturnType<typeof stream>;
let source: FakeNode;
let detach: ReturnType<typeof vi.fn>;

function makeAudio() {
  return {
    sinkId: '', hidden: false, paused: true, error: null,
    srcObject: null,
    onerror: null as (() => void) | null,
    onpause: null as (() => void) | null,
    setSinkId: vi.fn(async function (this: { sinkId: string }, id: string) { this.sinkId = id; }),
    play: vi.fn(async function (this: { paused: boolean }) { this.paused = false; }),
    pause: vi.fn(),
    remove: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  input = stream();
  output = stream();
  audio = makeAudio();
  source = new FakeNode();
  detach = vi.fn();
  media = Object.assign(new EventTarget(), {
    enumerateDevices: vi.fn(async () => [normal, cable, webcam]),
    getUserMedia: vi.fn(async () => input.media),
  });
  const events = new EventTarget();
  ctx = Object.assign(new FakeContext(), {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    createMediaStreamDestination: vi.fn(() => Object.assign(new FakeNode(), { stream: output.media })),
    createMediaStreamSource: vi.fn(() => source),
  });
  dependencies.context.mockReturnValue(ctx);
  dependencies.engine.attachOutput.mockReturnValue(detach);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { isSecureContext: true }));
  vi.stubGlobal('navigator', { mediaDevices: media });
  vi.stubGlobal('document', { createElement: () => audio, body: { append: vi.fn() } });
  audioRouting.stop();
});

afterEach(() => {
  audioRouting.stop();
  vi.unstubAllGlobals();
});

describe('microphone output', () => {
  it('selects the sink in the original call and mixes only the exact selected microphone', async () => {
    const started = audioRouting.start(options);
    expect(audio.setSinkId).toHaveBeenCalledWith('cable');
    await started;
    expect(audioRouting.getState().status).toBe('sending');
    expect(media.getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: 'webcam' }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    expect(source.connections).toEqual([ctx.gains[0]]);
    expect(ctx.gains[0].gain.value).toBe(0.7);
    expect(ctx.gains[0].connections).toEqual([ctx.createMediaStreamDestination.mock.results[0].value]);
    expect(dependencies.engine.setLocalPlayback).toHaveBeenLastCalledWith(false);
    audioRouting.stop();
    expect(detach).toHaveBeenCalledTimes(1);
    expect(input.track.stop).toHaveBeenCalled();
    expect(output.track.stop).toHaveBeenCalled();
    expect(source.connections).toEqual([]);
    expect(dependencies.engine.setLocalPlayback).toHaveBeenLastCalledWith(true);
    expect(audio.srcObject).toBeNull();
  });

  it('does not open a microphone when sending only buttons', async () => {
    await audioRouting.start({ ...options, micId: undefined });
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(audioRouting.getState().micLabel).toBe('');
    expect(audioRouting.getState().status).toBe('sending');
  });

  it('fails before connecting audio when output permission is denied', async () => {
    audio.setSinkId.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    await audioRouting.start(options);
    expect(audioRouting.getState().status).toBe('off');
    expect(audioRouting.getState().problem).toContain('permissions');
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(dependencies.engine.attachOutput).not.toHaveBeenCalled();
  });

  it('cleans a microphone arriving after cancellation without attaching the feed', async () => {
    const pending = deferred<typeof input.media>();
    media.getUserMedia.mockReturnValue(pending.promise);
    const starting = audioRouting.start(options);
    await vi.waitFor(() => expect(media.getUserMedia).toHaveBeenCalled());
    audioRouting.stop();
    pending.resolve(input.media);
    await starting;
    expect(input.track.stop).toHaveBeenCalled();
    expect(audioRouting.getState().status).toBe('off');
    expect(dependencies.engine.attachOutput).not.toHaveBeenCalled();
  });

  it('stops and releases the microphone when the output disconnects or the input ends', async () => {
    await audioRouting.start(options);
    media.enumerateDevices.mockResolvedValue([normal, webcam]);
    media.dispatchEvent(new Event('devicechange'));
    await vi.waitFor(() => expect(audioRouting.getState().status).toBe('off'));
    expect(input.track.stop).toHaveBeenCalled();
  });

  it('stops the output when the selected microphone ends', async () => {
    await audioRouting.start(options);
    input.track.onended?.();
    expect(audioRouting.getState().status).toBe('off');
    expect(audioRouting.getState().problem).toContain('microphone disconnected');
  });

  it('refuses feedback inputs and guards local listening at start and after toggling', async () => {
    media.enumerateDevices.mockResolvedValue([normal, cable, device('loop', 'audioinput', 'CABLE Output', 'virtual')]);
    await audioRouting.start({ ...options, micId: 'loop' });
    expect(audioRouting.getState().problem).toContain('physical microphone');
    expect(media.getUserMedia).not.toHaveBeenCalled();
    media.enumerateDevices.mockResolvedValue([device('default', 'audiooutput', 'CABLE Input', 'virtual'), cable, webcam]);
    await audioRouting.start({ ...options, listenLocally: true });
    expect(audioRouting.getState().status).toBe('off');
    await audioRouting.start(options);
    expect(audioRouting.getState().status).toBe('sending');
    await audioRouting.setLocalPlayback(true);
    expect(audioRouting.getState().listenLocally).toBe(false);
    expect(dependencies.engine.setLocalPlayback).toHaveBeenLastCalledWith(false);
    expect(audioRouting.getState().problem).toContain('normal Windows output');
  });

  it('turns off monitoring when Windows changes its default to the cable', async () => {
    await audioRouting.start({ ...options, listenLocally: true });
    media.enumerateDevices.mockResolvedValue([device('default', 'audiooutput', 'CABLE Input', 'virtual'), cable, webcam]);
    media.dispatchEvent(new Event('devicechange'));
    await vi.waitFor(() => expect(audioRouting.getState().listenLocally).toBe(false));
    expect(audioRouting.getState().status).toBe('sending');
    expect(dependencies.engine.setLocalPlayback).toHaveBeenLastCalledWith(false);
  });

  it('rechecks normal output after a delayed microphone grant before connecting the feed', async () => {
    const pending = deferred<typeof input.media>();
    media.getUserMedia.mockReturnValue(pending.promise);
    const starting = audioRouting.start({ ...options, listenLocally: true });
    await vi.waitFor(() => expect(media.getUserMedia).toHaveBeenCalled());
    media.enumerateDevices.mockResolvedValue([device('default', 'audiooutput', 'CABLE Input', 'virtual'), cable, webcam]);
    pending.resolve(input.media);
    await starting;
    expect(audioRouting.getState().status).toBe('off');
    expect(dependencies.engine.attachOutput).not.toHaveBeenCalled();
    expect(input.track.stop).toHaveBeenCalled();
  });

  it('opens the explicit picker immediately and accepts its returned device ID', async () => {
    const choose = vi.fn(async () => cable);
    Object.assign(media, { selectAudioOutput: choose });
    const requested = requestRoutingOutput();
    expect(choose).toHaveBeenCalledTimes(1);
    expect((await requested).output.deviceId).toBe('cable');
    choose.mockRejectedValue(new DOMException('Cancelled', 'NotAllowedError'));
    await expect(requestRoutingOutput()).rejects.toThrow('cancelled or blocked');
  });

  it('always releases the temporary permission microphone, including failed enumeration', async () => {
    media.enumerateDevices.mockRejectedValue(new Error('Unavailable'));
    await expect(requestRoutingDevices()).rejects.toThrow();
    expect(input.track.stop).toHaveBeenCalledTimes(1);
  });
});

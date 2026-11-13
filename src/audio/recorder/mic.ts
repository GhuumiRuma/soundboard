import { setAudioSession } from '../session';
import { getRecordingContext } from './context';
import { MicProblem, micProblemKind } from './messages';

/** A microphone that is open. It hears nothing until `onBlock` is set. */
export interface MicInput {
  /** What the device calls the microphone ("Microphone (Realtek Audio)"), or nothing when it doesn't say. */
  readonly label: string;
  /** How many samples a second it records. */
  readonly sampleRate: number;
  /** Called with each block of sound as it comes in (about 40 ms of it). */
  onBlock: ((block: Float32Array) => void) | null;
  /** Called when the microphone goes away: it was unplugged, or another app took it. */
  onLost: (() => void) | null;
  /** Waits until everything heard so far has arrived through `onBlock`. */
  flush(): Promise<void>;
  /** Lets go of the microphone, so the browser's "recording" light goes out. */
  close(): void;
}

export type OpenMic = () => Promise<MicInput>;

// The file is in public/ (not bundled) because an audio worklet has to load from its own address.
const WORKLET_FILE = 'capture-worklet.js';
const WORKLET_NAME = 'capture-processor';
const FLUSH_WAIT_MS = 250;
const SCRIPT_BLOCK = 2048;

const loading = new WeakMap<object, Promise<void>>();

const loadWorklet = (context: AudioContext): Promise<void> => {
  let pending = loading.get(context);
  if (!pending) {
    pending = context.audioWorklet.addModule(`${import.meta.env.BASE_URL}${WORKLET_FILE}`);
    loading.set(context, pending);
    // A failed load can be tried again next time.
    pending.catch(() => loading.delete(context));
  }
  return pending;
};

const stopTracks = (stream: MediaStream): void => {
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Already stopped.
    }
  }
};

const attempt = (job: () => void): void => {
  try {
    job();
  } catch {
    // Already let go of.
  }
};

/**
 * Opens the microphone and starts listening. Raw sound is wanted, so the browser's echo, noise and level clean-ups
 * are all off, like StreamStudio's recorder. Throws a MicProblem whose message is safe to show as it is.
 */
export const openMic: OpenMic = async () => {
  const media = navigator.mediaDevices as MediaDevices | undefined;
  if (!media || typeof media.getUserMedia !== 'function') {
    throw new MicProblem(window.isSecureContext === false ? 'insecure' : 'unsupported');
  }
  const context = getRecordingContext();
  if (!context) throw new MicProblem('unsupported');

  // On an iPhone, sound is muted by the silent switch unless the phone is told it can both play and record.
  setAudioSession('play-and-record');
  let stream: MediaStream;
  try {
    stream = await media.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } },
    });
  } catch (error) {
    setAudioSession('playback');
    throw new MicProblem(micProblemKind(error));
  }

  try {
    return await listen(context, stream);
  } catch (error) {
    stopTracks(stream);
    setAudioSession('playback');
    throw new MicProblem(micProblemKind(error));
  }
};

const listen = async (context: AudioContext, stream: MediaStream): Promise<MicInput> => {
  const track = stream.getAudioTracks()[0];
  if (!track) throw new MicProblem('missing');

  // Not awaited: on an iPhone this only finishes once the tap is over, and listening can start before that.
  if (context.state !== 'running') Promise.resolve(context.resume()).catch(() => undefined);

  const source = context.createMediaStreamSource(stream);
  const mute = context.createGain();
  mute.gain.value = 0;
  mute.connect(context.destination);

  const input: MicInput = {
    label: track.label,
    sampleRate: context.sampleRate,
    onBlock: null,
    onLost: null,
    flush: () => Promise.resolve(),
    close: () => undefined,
  };

  let worklet: AudioWorkletNode | null = null;
  let script: ScriptProcessorNode | null = null;
  let finishFlush: (() => void) | null = null;
  let closed = false;

  if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    try {
      await loadWorklet(context);
      worklet = new AudioWorkletNode(context, WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
        outputChannelCount: [1],
      });
    } catch {
      // This browser can't load it. The older way below does the same job.
      worklet = null;
    }
  }

  if (worklet) {
    const node = worklet;
    node.port.onmessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (data instanceof Float32Array) input.onBlock?.(data);
      else if (typeof data === 'object' && data !== null && 'flushed' in data) finishFlush?.();
    };
    source.connect(node);
    node.connect(mute);
    input.flush = () =>
      new Promise<void>((resolve) => {
        if (closed) return resolve();
        const done = () => {
          clearTimeout(timer);
          if (finishFlush === done) finishFlush = null;
          resolve();
        };
        const timer = setTimeout(done, FLUSH_WAIT_MS);
        finishFlush = done;
        node.port.postMessage({ type: 'flush' });
      });
  } else {
    const processor = context.createScriptProcessor(SCRIPT_BLOCK, 1, 1);
    script = processor;
    // The browser reuses the buffer it hands over, so each block is copied.
    processor.onaudioprocess = (event) => input.onBlock?.(event.inputBuffer.getChannelData(0).slice());
    source.connect(processor);
    processor.connect(mute);
  }

  track.onended = () => input.onLost?.();

  input.close = () => {
    if (closed) return;
    closed = true;
    input.onBlock = null;
    input.onLost = null;
    track.onended = null;
    attempt(() => source.disconnect());
    attempt(() => worklet?.disconnect());
    attempt(() => worklet?.port.close());
    attempt(() => {
      if (script) script.onaudioprocess = null;
      script?.disconnect();
    });
    attempt(() => mute.disconnect());
    stopTracks(stream);
    setAudioSession('playback');
    finishFlush?.();
  };

  return input;
};

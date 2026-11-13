import type { AudioBufferLike, AudioContextLike, AudioParamLike, GainNodeLike, SourceNodeLike } from '../audio/engine';

interface ParamEvent {
  type: 'cancel' | 'set' | 'ramp' | 'target';
  value?: number;
  time: number;
  timeConstant?: number;
}

/** A volume knob that writes down everything done to it. */
export class FakeParam implements AudioParamLike {
  value: number;
  readonly events: ParamEvent[] = [];

  constructor(value = 1) {
    this.value = value;
  }

  /** Where the volume is heading: the last value it was told to go to. */
  get latest(): number {
    for (let i = this.events.length - 1; i >= 0; i -= 1) {
      const value = this.events[i].value;
      if (value !== undefined) return value;
    }
    return this.value;
  }

  cancelScheduledValues(time: number): void {
    this.events.push({ type: 'cancel', time });
  }

  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push({ type: 'set', value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.events.push({ type: 'ramp', value, time });
  }

  setTargetAtTime(value: number, time: number, timeConstant: number): void {
    this.events.push({ type: 'target', value, time, timeConstant });
  }
}

export class FakeNode {
  connections: unknown[] = [];
  disconnectCount = 0;

  connect(destination: unknown): unknown {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.connections = [];
    this.disconnectCount += 1;
  }
}

export class FakeGain extends FakeNode implements GainNodeLike {
  readonly gain = new FakeParam(1);
}

export class FakeBuffer implements AudioBufferLike {
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate = 44100;

  constructor(length = 44100, numberOfChannels = 1) {
    this.length = length;
    this.numberOfChannels = numberOfChannels;
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }
}

export class FakeSource extends FakeNode implements SourceNodeLike {
  buffer: AudioBufferLike | null = null;
  onended: (() => void) | null = null;
  readonly started: Array<number | undefined> = [];
  readonly stopped: Array<number | undefined> = [];

  start(when?: number): void {
    this.started.push(when);
  }

  stop(when?: number): void {
    this.stopped.push(when);
  }

  /** The sound reaches its end, like the browser does after a stop or at the end of the file. */
  end(): void {
    this.onended?.();
  }
}

/** Stands in for the browser's AudioContext. Tests decide how decoding turns out and when sounds end. */
export class FakeContext implements AudioContextLike {
  state: string;
  currentTime = 0;
  readonly destination = { name: 'speakers' };
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
  readonly decoded: ArrayBuffer[] = [];
  resumeCalls = 0;
  /** When false, resume() does not make the sound run, like a phone that hasn't let sound start yet. */
  resumeWorks = true;
  /** How the next decodes turn out. */
  decode: (data: ArrayBuffer) => Promise<AudioBufferLike> = async () => new FakeBuffer();

  constructor(state = 'running') {
    this.state = state;
  }

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike> {
    this.decoded.push(data);
    // The real thing takes the bytes away from whoever passed them.
    structuredClone(data, { transfer: [data] });
    return this.decode(data);
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    if (this.resumeWorks) this.state = 'running';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }

  /** The master volume is the first gain made (the engine makes it before any voice). */
  get master(): FakeGain {
    return this.gains[0];
  }

  /** One gain for each sound that was started, in order (the master volume is left out). */
  get voiceGains(): FakeGain[] {
    return this.gains.slice(1);
  }
}

/** A promise that is settled from outside, to hold a decode or a file read until the test says go. */
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

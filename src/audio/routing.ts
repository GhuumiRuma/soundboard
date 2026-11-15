import { getPlatform } from '../platform';
import { getEngine } from './index';
import { getRecordingContext } from './recorder/context';
import { gainFor } from './volume';

type SinkAudio = HTMLAudioElement & { setSinkId(id: string): Promise<void>; readonly sinkId: string };
type OutputChooser = MediaDevices & { selectAudioOutput(): Promise<MediaDeviceInfo> };

function hasOutputChooser(devices: MediaDevices): devices is OutputChooser {
  return 'selectAudioOutput' in devices && typeof devices.selectAudioOutput === 'function';
}

export function canChooseRoutingOutput(): boolean {
  return !!navigator.mediaDevices && hasOutputChooser(navigator.mediaDevices);
}

class RoutingProblem extends Error {}

function hasSinkSelection(audio: HTMLAudioElement): audio is SinkAudio {
  return 'setSinkId' in audio && typeof audio.setSinkId === 'function';
}

export function canRouteAudio(): boolean {
  return getPlatform().os === 'windows' && window.isSecureContext &&
    !!navigator.mediaDevices?.enumerateDevices && hasSinkSelection(document.createElement('audio'));
}

export interface RoutingState {
  status: 'off' | 'starting' | 'sending';
  outputLabel: string;
  micLabel: string;
  micVolume: number;
  listenLocally: boolean;
  problem: string;
}

export interface RoutingOptions {
  outputId: string;
  micId?: string;
  listenLocally: boolean;
  micVolume: number;
}

function errorMessage(error: unknown): string {
  if (error instanceof RoutingProblem) return error.message;
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return "I couldn't use that sound device. Use Choose and allow output if available, or Allow and refresh devices in Chrome or Edge. Check microphone and speaker-selection permissions, then try again. Nothing has been redirected.";
  }
  if (name === 'InvalidStateError') {
    return "The browser needs a fresh button click to use that output. Click Choose and allow output if shown, then click Start sending directly.";
  }

  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return "That sound device isn't available. Connect it, refresh the device list and choose it again.";
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return "I couldn't open that sound device. Close other apps using it, check the virtual cable is installed and try again.";
  }
  return "I couldn't start sending audio. Check your virtual cable and device permissions, or try current Chrome or Edge on Windows.";
}

function isNormalOutput(output: MediaDeviceInfo, devices: readonly MediaDeviceInfo[]): boolean {
  const normal = devices.find((device) => device.kind === 'audiooutput' && device.deviceId === 'default');
  return !!output.groupId && output.groupId === normal?.groupId;
}

export function namedDevices(devices: readonly MediaDeviceInfo[], kind: 'audiooutput' | 'audioinput'): MediaDeviceInfo[] {
  return devices.filter((device) => device.kind === kind && device.label && device.deviceId &&
    device.deviceId !== 'default' && device.deviceId !== 'communications');
}

/** Called directly from a click, before any await, to obtain explicit output permission when supported. */
export async function requestRoutingOutput(): Promise<{ output: MediaDeviceInfo; devices: MediaDeviceInfo[] }> {
  const media = navigator.mediaDevices;
  if (!hasOutputChooser(media)) throw new RoutingProblem('This browser has no output chooser. Use Allow and refresh devices in Chrome or Edge instead.');
  try {
    const output = await media.selectAudioOutput();
    if (output.kind !== 'audiooutput' || !output.deviceId || output.deviceId === 'default' || output.deviceId === 'communications') {
      throw new RoutingProblem('Choose a named virtual cable, such as CABLE Input, not the default output. Nothing has been redirected.');
    }
    const devices = await media.enumerateDevices();
    return { output, devices };
  } catch (error) {
    if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
      throw new RoutingProblem('Output selection was cancelled or blocked. Click Choose and allow output again; if blocked, allow speaker selection in your browser. Nothing has been redirected.');
    }
    throw new RoutingProblem(errorMessage(error));
  }
}

/**
 * Chromium permits non-default sinks with microphone permission; this is not a universal browser guarantee.
 * Explicit permission request, only from the device-list button. Never keeps the microphone open.
 */
export async function requestRoutingDevices(): Promise<MediaDeviceInfo[]> {
  let permission: MediaStream | undefined;
  try {
    permission = await navigator.mediaDevices.getUserMedia({ audio: true });
    return await navigator.mediaDevices.enumerateDevices();
  } catch (error) {
    throw new Error(errorMessage(error));
  } finally {
    permission?.getTracks().forEach((track) => track.stop());
  }
}

class AudioRouting {
  private current: RoutingState = {
    status: 'off', outputLabel: '', micLabel: '', micVolume: 0.8, listenLocally: true, problem: '',
  };
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private listeningChange = 0;
  private release: (() => void) | null = null;
  private micGain: GainNode | null = null;
  private output: MediaDeviceInfo | null = null;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  readonly getState = (): RoutingState => this.current;

  private publish(change: Partial<RoutingState>): void {
    this.current = { ...this.current, ...change };
    for (const listener of this.listeners) listener();
  }

  stop(problem = ''): void {
    this.generation += 1;
    this.listeningChange += 1;
    this.release?.();
    this.release = null;
    this.micGain = null;
    this.output = null;
    getEngine().setLocalPlayback(true);
    this.publish({ status: 'off', outputLabel: '', micLabel: '', problem });
  }

  setMicVolume(volume: number): void {
    const value = gainFor(volume);
    if (this.micGain) this.micGain.gain.value = value;
    this.publish({ micVolume: value });
  }

  async setLocalPlayback(enabled: boolean): Promise<void> {
    const change = ++this.listeningChange;
    if (this.current.status !== 'sending' || !enabled) {
      if (this.current.status === 'sending') getEngine().setLocalPlayback(false);
      this.publish({ listenLocally: enabled });
      return;
    }
    const generation = this.generation;
    const output = this.output;
    if (!output) {
      this.stop("I couldn't check the selected output. Sending stopped. Choose your output and start again.");
      return;
    }
    let devices: MediaDeviceInfo[];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {
      if (generation === this.generation && change === this.listeningChange) {
        this.publish({ problem: "I couldn't check your normal output. Local listening was not enabled. Refresh your sound devices and try again." });
      }
      return;
    }
    if (generation !== this.generation || change !== this.listeningChange) return;
    try {
      if (isNormalOutput(output, devices)) {
        getEngine().setLocalPlayback(false);
        this.publish({ listenLocally: false, problem: 'Local listening stayed off: the cable is your normal Windows output. Choose headphones as your normal output, or leave local listening off, to avoid sending sounds twice.' });
        return;
      }
      getEngine().setLocalPlayback(true);
      this.publish({ listenLocally: true, problem: '' });
    } catch {
      this.stop("I couldn't change local listening. Sending stopped. Check your sound devices and start again.");
    }
  }

  async start(options: RoutingOptions): Promise<void> {
    if (this.current.status !== 'off') return;
    const generation = ++this.generation;
    this.publish({ status: 'starting', problem: '' });
    const engine = getEngine();
    let mic: MediaStream | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    let micGain: GainNode | undefined;
    let destination: MediaStreamAudioDestinationNode | undefined;
    let audio: SinkAudio | undefined;
    let detach: (() => void) | undefined;
    let removeListeners: (() => void) | undefined;
    let committed = false;
    const cancelled = () => generation !== this.generation;
    const cleanup = () => {
      removeListeners?.();
      detach?.();
      source?.disconnect();
      micGain?.disconnect();
      mic?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
      if (audio) {
        audio.onerror = null;
        audio.onpause = null;
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      }
      destination?.stream.getTracks().forEach((track) => track.stop());
      destination?.disconnect();
    };
    this.release = cleanup;

    try {
      if (!canRouteAudio()) throw new Error('Unsupported audio routing');
      if (!options.outputId || options.outputId === 'default' || options.outputId === 'communications') {
        throw new RoutingProblem('Choose a named virtual cable output before starting. Nothing has been redirected.');
      }
      // Both calls run in the Start click, before any await can exhaust transient activation.
      const context = getRecordingContext();
      if (!context) throw new Error('Unsupported audio context');
      const element = document.createElement('audio');
      if (!hasSinkSelection(element)) throw new Error('Unsupported output selection');
      audio = element;
      await Promise.all([context.resume(), audio.setSinkId(options.outputId)]);
      if (cancelled()) return;
      if (audio.sinkId !== options.outputId) throw new Error('Output selection was not applied');
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (cancelled()) return;
      const output = namedDevices(devices, 'audiooutput').find((device) => device.deviceId === options.outputId);
      if (!output) throw new DOMException('Output missing', 'NotFoundError');
      if (options.listenLocally && isNormalOutput(output, devices)) {
        throw new RoutingProblem('Choose headphones as your normal Windows output, or turn off local listening, to avoid sending sounds twice.');
      }
      const input = options.micId
        ? namedDevices(devices, 'audioinput').find((device) => device.deviceId === options.micId)
        : undefined;
      if (options.micId && !input) throw new DOMException('Microphone missing', 'NotFoundError');
      // A cable's receiving side must never be fed back into its sending side.
      if (input && ((input.groupId && input.groupId === output.groupId) ||
        /cable|voicemeeter|virtual|blackhole/i.test(input.label))) {
        throw new RoutingProblem('Choose your physical microphone, not a virtual cable, to avoid feedback.');
      }
      destination = context.createMediaStreamDestination();
      audio.srcObject = destination.stream;
      audio.hidden = true;
      document.body.append(audio);
      await audio.play();
      if (cancelled()) return;
      if (input) {
        mic = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: input.deviceId },
            echoCancellation: false, noiseSuppression: false, autoGainControl: false,
          },
        });
        if (cancelled()) return;
        const track = mic.getAudioTracks()[0];
        if (!track || track.readyState !== 'live') throw new DOMException('Microphone missing', 'NotFoundError');
        source = context.createMediaStreamSource(mic);
        micGain = context.createGain();
        micGain.gain.value = gainFor(options.micVolume);
        source.connect(micGain);
        micGain.connect(destination);
        track.onended = () => this.stop("Your microphone disconnected. Sending stopped. Reconnect it and start again.");
      }
      if (audio.paused || audio.error || context.state !== 'running') throw new Error('Output paused during setup');
      const readyDevices = await navigator.mediaDevices.enumerateDevices();
      if (cancelled()) return;
      const readyOutput = namedDevices(readyDevices, 'audiooutput').find((device) => device.deviceId === options.outputId);
      if (!readyOutput) throw new DOMException('Output disconnected during setup', 'NotFoundError');
      if (options.listenLocally && isNormalOutput(readyOutput, readyDevices)) {
        throw new RoutingProblem('Choose headphones as your normal Windows output, or turn off local listening, to avoid sending sounds twice.');
      }
      detach = engine.attachOutput(destination);
      engine.setLocalPlayback(options.listenLocally);
      const lost = () => this.stop("The output stopped. Check your devices and start sending again.");
      const contextChanged = () => {
        if (context.state !== 'running') lost();
      };
      const deviceChanged = () => {
        this.listeningChange += 1;
        void navigator.mediaDevices.enumerateDevices().then((next) => {
          if (cancelled()) return;
          if (!next.some((device) => device.deviceId === output.deviceId) ||
            (input && !next.some((device) => device.deviceId === input.deviceId))) {
            lost();
            return;
          }
          if (this.current.listenLocally && isNormalOutput(readyOutput, next)) {
            engine.setLocalPlayback(false);
            this.publish({ listenLocally: false, problem: 'Windows made the cable your normal output. Local listening was switched off to avoid sending sounds twice. Choose headphones as your normal Windows output.' });
          }
        }).catch(() => {
          if (!cancelled()) this.stop("I couldn't check your sound devices. Sending stopped. Refresh the device list and start again.");
        });
      };
      audio.onerror = lost;
      audio.onpause = lost;
      context.addEventListener('statechange', contextChanged);
      navigator.mediaDevices.addEventListener('devicechange', deviceChanged);
      window.addEventListener('pagehide', lost);
      removeListeners = () => {
        context.removeEventListener('statechange', contextChanged);
        navigator.mediaDevices.removeEventListener('devicechange', deviceChanged);
        window.removeEventListener('pagehide', lost);
      };
      this.micGain = micGain ?? null;
      this.output = readyOutput;
      committed = true;
      this.publish({
        status: 'sending', outputLabel: output.label, micLabel: input?.label ?? '',
        listenLocally: options.listenLocally, micVolume: gainFor(options.micVolume),
      });
    } catch (error) {
      if (!cancelled()) {
        this.stop(errorMessage(error));
      }
    } finally {
      if (!committed) cleanup();
    }
  }
}

/** Routing is deliberately not saved or auto-started: every visit requires an explicit Start. */
export const audioRouting = new AudioRouting();

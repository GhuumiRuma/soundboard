import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { audioRouting, canChooseRoutingOutput, canRouteAudio, namedDevices, requestRoutingDevices, requestRoutingOutput } from '../audio/routing';
import { getPlatform } from '../platform';
import { useUi } from '../state/ui';
import { NoticeBox } from './NoticeBox';
import { VolumeSlider } from './VolumeSlider';

const useRouting = () => useSyncExternalStore(audioRouting.subscribe, audioRouting.getState);

export function AudioRoutingSection() {
  const headingId = useId();
  const micVolumeId = useId();
  const state = useRouting();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputId, setOutputId] = useState('');
  const [micId, setMicId] = useState('');
  const [includeVoice, setIncludeVoice] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [problem, setProblem] = useState('');
  const [listenLocally, setListenLocally] = useState(state.listenLocally);
  const supported = canRouteAudio();
  const chooser = supported && canChooseRoutingOutput();
  const os = getPlatform().os;
  const busy = state.status !== 'off';
  const outputs = namedDevices(devices, 'audiooutput');
  const inputs = namedDevices(devices, 'audioinput');

  useEffect(() => {
    if (!supported) return;
    let mounted = true;
    void navigator.mediaDevices.enumerateDevices().then((next) => {
      if (mounted) setDevices(next);
    }).catch(() => {
      if (mounted) setProblem("I couldn't list your sound devices. Use Allow and refresh devices to try again.");
    });
    return () => { mounted = false; };
  }, [supported]);

  const refresh = async () => {
    setRefreshing(true);
    setProblem('');
    try {
      const next = await requestRoutingDevices();
      setDevices(next);
      if (!next.some((device) => device.deviceId === outputId)) setOutputId('');
      if (!next.some((device) => device.deviceId === micId)) setMicId('');
      if (!namedDevices(next, 'audiooutput').length) {
        setProblem("No named output devices are available. Use Choose and allow output if shown, or check your virtual cable installation and device permissions, then refresh again.");
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "I couldn't list your devices. Allow access and try again.");
    } finally {
      setRefreshing(false);
    }
  };

  const chooseOutput = async () => {
    setRefreshing(true);
    setProblem('');
    try {
      // requestRoutingOutput invokes the native chooser before its first await.
      const { output, devices: next } = await requestRoutingOutput();
      setDevices(next);
      setOutputId(output.deviceId);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "I couldn't choose an output. Click Choose and allow output to try again.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="ss-dialog-section audio-routing-section" aria-labelledby={headingId}>
      <h3 id={headingId}>Send sounds as your microphone</h3>
      <p>
        Other apps need a virtual audio cable to hear these sounds as a microphone.
        Soundboard does not create a microphone or install a driver.
      </p>
      {os === 'windows' ? (
        <>
          <ol className="audio-routing-steps">
            <li>
              Install <a href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer">VB-CABLE from its official website</a>.
              Extract the download, run its setup as administrator and restart Windows. This is a separate, optional driver.
            </li>
            <li>In a supported Windows app or browser, choose <strong>CABLE Input</strong> as the output. The names are backwards-looking: sounds go into CABLE Input.</li>
            <li>In Discord, your game or your streaming app, choose <strong>CABLE Output</strong> as its microphone, then start sending in Soundboard.</li>
          </ol>
          <p className="ss-muted ss-field-hint">
            Keep headphones as your normal Windows output. Do not set the cable as your system default:
            that could send every app's sound into the call. Use sounds you have permission to use.
          </p>
        </>
      ) : (
        <p className="ss-muted">
          {os === 'mac'
            ? 'The built-in sending controls are Windows-only. On Mac, routing needs a separately installed virtual device such as VB-CABLE and an external audio mixer. This has not been checked on a Mac; the desktop app cannot select an output here.'
            : os === 'android' || os === 'ios'
              ? "Android, iPhone and iPad do not let this app replace another app's microphone. Play normally here, or use a Windows computer with a virtual cable for calls and streams."
              : 'The built-in sending controls are Windows-only. A browser cannot create a system microphone; other platforms need a compatible virtual audio device and external routing tools.'}
        </p>
      )}
      {os === 'windows' && !supported && (
        <NoticeBox notice={{ kind: 'hint', text: "This app or browser cannot select an output device here. Try current Chrome or Edge on Windows with the HTTPS Soundboard link. The Windows app also needs a current WebView2 runtime. Nothing has been redirected." }} />
      )}
      {supported && (
        <>
          <div className="audio-routing-actions">
            {chooser && (
              <button type="button" className="btn btn-outline" disabled={busy || refreshing} onClick={() => void chooseOutput()}>
                Choose and allow output
              </button>
            )}
            <button type="button" className="btn btn-outline" disabled={busy || refreshing} onClick={() => void refresh()}>
              {refreshing ? 'Getting devices...' : 'Allow and refresh devices'}
            </button>
          </div>
          <p className="ss-muted ss-field-hint">
            {chooser
              ? 'Choose and allow output opens the browser permission picker: choose CABLE Input there. Allow and refresh devices briefly opens your microphone to list real microphones for voice mixing, then releases it.'
              : 'This Chromium permission path briefly opens your default microphone to allow named output devices, then releases it. Browsers do not all grant output access this way; if access is refused, nothing is redirected.'}
            {' '}Your voice is only sent if you choose it below and start sending.
          </p>
          {!busy && (
            <div className="audio-routing-fields">
              {chooser ? (
                <p>Virtual cable output: <strong>{devices.find((device) => device.deviceId === outputId)?.label || 'Not chosen; use Choose and allow output'}</strong></p>
              ) : (
                <label className="ss-field">
                  <span>Virtual cable output</span>
                  <select className="ss-input" value={outputId} disabled={refreshing} onChange={(event) => setOutputId(event.currentTarget.value)}>
                    <option value="">Choose CABLE Input or your virtual mixer</option>
                    {outputs.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
                  </select>
                </label>
              )}
              <p className="ss-muted ss-field-hint">Choose a virtual device, not speakers or headphones. Ordinary speakers cannot become a microphone.</p>
              <label className="ss-switch">
                <input type="checkbox" checked={includeVoice} onChange={(event) => setIncludeVoice(event.currentTarget.checked)} />
                <span>Include my real voice</span>
              </label>
              {includeVoice && (
                <label className="ss-field">
                  <span>Your real microphone</span>
                  <select className="ss-input" value={micId} disabled={refreshing} onChange={(event) => setMicId(event.currentTarget.value)}>
                    <option value="">Choose your physical microphone</option>
                    {inputs.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
                  </select>
                  <span className="ss-field-hint">Do not choose CABLE Output or another virtual device: it can cause feedback.</span>
                </label>
              )}
            </div>
          )}
          {((includeVoice && !busy) || state.micLabel) && (
            <div className="ss-field">
              <label htmlFor={micVolumeId}>Your voice volume</label>
              <VolumeSlider id={micVolumeId} value={state.micVolume} onChange={(value) => audioRouting.setMicVolume(value)} />
            </div>
          )}
          <label className="ss-switch">
            <input
              type="checkbox"
              checked={busy ? state.listenLocally : listenLocally}
              disabled={state.status === 'starting'}
              onChange={(event) => {
                setListenLocally(event.currentTarget.checked);
                void audioRouting.setLocalPlayback(event.currentTarget.checked);
              }}
            />
            <span>Also hear sounds on my normal output</span>
          </label>
          <p className="ss-muted ss-field-hint">
            Use headphones to keep sounds out of your real microphone. Your voice is not played back to you.
            Master volume and Stop all sounds control the sound buttons, not your live voice.
          </p>
          <div className="audio-routing-actions">
            {busy ? (
              <button type="button" className="btn btn-stop" onClick={() => audioRouting.stop()}>
                {state.status === 'starting' ? 'Cancel sending' : 'Stop sending'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-accent"
                disabled={refreshing || !outputId || (includeVoice && !micId)}
                onClick={() => {
                  setProblem('');
                  void audioRouting.start({
                    outputId, micId: includeVoice ? micId : undefined,
                    listenLocally, micVolume: state.micVolume,
                  });
                }}
              >
                Start sending
              </button>
            )}
          </div>
          {state.status === 'sending' && <p role="status">Sending to {state.outputLabel}{state.micLabel ? `, with your voice from ${state.micLabel}` : ', without your live voice'}.</p>}
          {(problem || state.problem) && <NoticeBox notice={{ kind: 'problem', text: problem || state.problem }} />}
          <p className="ss-muted ss-field-hint">
            Sending stays on when you close Settings. Stop sending releases your microphone and restores normal playback.
            It never starts automatically when you reopen Soundboard. Recorder and clip previews are not sent.
            Your chosen call or streaming app can broadcast or record this audio.
            Routing has not been tried with a real virtual cable yet.
          </p>
        </>
      )}
    </section>
  );
}

/** Visible outside Settings so a live microphone is never hidden behind a closed dialog. */
export function AudioRoutingNotice() {
  const state = useRouting();
  const settingsOpen = useUi((ui) => ui.settingsOpen);
  if (settingsOpen || (state.status === 'off' && !state.problem)) return null;
  return (
    <div className={`audio-routing-notice ${state.problem ? 'ss-problem' : 'ss-note'}`}>
      <div className="ss-message-body" role={state.problem ? 'alert' : 'status'}>
        {state.status !== 'off' && (state.status === 'starting'
          ? 'Starting microphone output...'
          : `Sending sound buttons to ${state.outputLabel}${state.micLabel ? ` and your live voice from ${state.micLabel}` : ' (no live voice)'}.`)}
        {state.problem && <p>{state.problem}</p>}
      </div>
      <button type="button" className="btn btn-outline" onClick={() => audioRouting.stop()}>
        {state.status === 'off' ? 'Dismiss' : state.status === 'starting' ? 'Cancel sending' : 'Stop sending'}
      </button>
    </div>
  );
}

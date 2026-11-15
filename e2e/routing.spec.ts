import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { addSound, DESKTOP, openApp, openSettings, PHONE } from './helpers';

interface RoutingLog {
  selected: string[];
  inputIds: string[];
  chooserActivation: boolean[];
  streams: MediaStream[];
  defaultGroup: string;
  connected: boolean;
  denySink: boolean;
  denyChooser: boolean;
  delayMic: boolean;
  finishMic: (() => void) | null;
}

async function scriptedRouting(page: Page, chooser = true) {
  await page.addInitScript((hasChooser) => {
    const log: RoutingLog = {
      selected: [], inputIds: [], chooserActivation: [], streams: [],
      defaultGroup: 'headphones', connected: true, denySink: false,
      denyChooser: false, delayMic: false, finishMic: null,
    };
    (window as unknown as { routingLog: RoutingLog }).routingLog = log;
    const device = (deviceId: string, kind: MediaDeviceKind, label: string, groupId: string) =>
      ({ deviceId, kind, label, groupId, toJSON: () => ({}) }) as MediaDeviceInfo;
    const output = device('cable', 'audiooutput', 'CABLE Input', 'cable');
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
      value: async () => [
        device('default', 'audiooutput', 'Normal output', log.defaultGroup),
        ...(log.connected ? [output] : []),
        device('webcam', 'audioinput', 'Webcam microphone', 'camera'),
        device('loop', 'audioinput', 'CABLE Output', 'cable'),
      ],
    });
    Object.defineProperty(navigator.mediaDevices, 'selectAudioOutput', {
      value: hasChooser ? async () => {
        log.chooserActivation.push(navigator.userActivation.isActive);
        if (log.denyChooser) throw new DOMException('Denied', 'NotAllowedError');
        return output;
      } : undefined,
    });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async (constraints: MediaStreamConstraints) => {
        const audio = constraints.audio;
        const id = typeof audio === 'object' && typeof audio.deviceId === 'object' ? audio.deviceId.exact : 'permission';
        log.inputIds.push(String(id));
        if (log.delayMic) await new Promise<void>((resolve) => { log.finishMic = resolve; });
        const context = new AudioContext();
        const tone = context.createOscillator();
        const destination = context.createMediaStreamDestination();
        tone.connect(destination);
        tone.start();
        await context.resume();
        log.streams.push(destination.stream);
        return destination.stream;
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
      value: async function (this: HTMLMediaElement, id: string) {
        log.selected.push(id);
        if (log.denySink) throw new DOMException('Denied', 'NotAllowedError');
        Object.defineProperty(this, 'sinkId', { value: id, configurable: true });
      },
    });
  }, chooser);
}

const inspect = (page: Page) => page.evaluate(() => {
  const log = (window as unknown as { routingLog: RoutingLog }).routingLog;
  return {
    selected: log.selected,
    inputIds: log.inputIds,
    chooserActivation: log.chooserActivation,
    stopped: log.streams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')),
  };
});

test.use({ viewport: DESKTOP, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' });

test('explicit output permission, exact voice input, visible sending and cleanup in the built app', async ({ page }) => {
  const errors: string[] = [];
  await scriptedRouting(page);
  await openApp(page, errors);
  await addSound(page, 'tone.wav');
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Choose and allow output' }).click();
  expect((await inspect(page)).chooserActivation).toEqual([true]);
  await settings.getByRole('button', { name: 'Allow and refresh devices' }).click();
  expect((await inspect(page)).stopped).toBe(true);
  await settings.getByLabel('Include my real voice').check();
  await settings.getByLabel('Your real microphone').selectOption('webcam');
  await settings.getByLabel('Also hear sounds').uncheck();
  await settings.getByRole('button', { name: 'Start sending', exact: true }).click();
  await expect(settings.getByRole('button', { name: 'Stop sending', exact: true })).toBeVisible();
  expect((await inspect(page)).inputIds).toEqual(['permission', 'webcam']);
  expect((await inspect(page)).selected).toEqual(['cable']);
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Sending sound buttons to CABLE Input')).toBeVisible();
  await page.getByRole('button', { name: /Play Tone/ }).click();
  await page.getByRole('button', { name: 'Stop all sounds', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop sending', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop sending', exact: true }).click();
  expect((await inspect(page)).stopped).toBe(true);
  expect(errors).toEqual([]);
});

test('denied picker and sink never start sending', async ({ page }) => {
  await scriptedRouting(page);
  await openApp(page);
  const settings = await openSettings(page);
  await page.evaluate(() => { (window as unknown as { routingLog: RoutingLog }).routingLog.denyChooser = true; });
  await settings.getByRole('button', { name: 'Choose and allow output' }).click();
  await expect(settings.getByRole('alert')).toContainText('cancelled or blocked');
  await expect(settings.getByRole('button', { name: 'Start sending', exact: true })).toBeDisabled();
  await page.evaluate(() => {
    const log = (window as unknown as { routingLog: RoutingLog }).routingLog;
    log.denyChooser = false;
    log.denySink = true;
  });
  await settings.getByRole('button', { name: 'Choose and allow output' }).click();
  await settings.getByRole('button', { name: 'Start sending', exact: true }).click();
  await expect(settings.getByRole('alert')).toContainText('permissions');
  await expect(settings.getByRole('button', { name: 'Stop sending', exact: true })).toHaveCount(0);
  expect((await inspect(page)).inputIds).toEqual([]);
});

test('local-listening guard cannot be bypassed after start and unplug stops sending', async ({ page }) => {
  await scriptedRouting(page, false);
  await openApp(page);
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Allow and refresh devices' }).click();
  await settings.getByLabel('Virtual cable output').selectOption('cable');
  await settings.getByLabel('Also hear sounds').uncheck();
  await settings.getByRole('button', { name: 'Start sending', exact: true }).click();
  await expect(settings.getByRole('button', { name: 'Stop sending', exact: true })).toBeVisible();
  await page.evaluate(() => { (window as unknown as { routingLog: RoutingLog }).routingLog.defaultGroup = 'cable'; });
  await settings.getByLabel('Also hear sounds').click();
  await expect(settings.getByLabel('Also hear sounds')).not.toBeChecked();
  await expect(settings.getByRole('alert')).toContainText('normal Windows output');
  await page.evaluate(() => {
    (window as unknown as { routingLog: RoutingLog }).routingLog.connected = false;
    navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
  });
  await expect(settings.getByRole('button', { name: 'Start sending', exact: true })).toBeVisible();
  await expect(settings.getByRole('alert')).toContainText('output stopped');
});

test('cancelling while a microphone opens cleans the late stream', async ({ page }) => {
  await scriptedRouting(page);
  await openApp(page);
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Choose and allow output' }).click();
  await settings.getByLabel('Include my real voice').check();
  await settings.getByLabel('Your real microphone').selectOption('webcam');
  await page.evaluate(() => { (window as unknown as { routingLog: RoutingLog }).routingLog.delayMic = true; });
  await settings.getByRole('button', { name: 'Start sending', exact: true }).click();
  await expect.poll(async () => (await inspect(page)).inputIds).toContain('webcam');
  await settings.getByRole('button', { name: 'Cancel sending', exact: true }).click();
  await page.evaluate(() => { (window as unknown as { routingLog: RoutingLog }).routingLog.finishMic?.(); });
  await expect.poll(async () => (await inspect(page)).stopped).toBe(true);
  await expect(settings.getByRole('button', { name: 'Start sending', exact: true })).toBeVisible();
});

test('phone settings show platform limits without working-looking routing controls', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 14)' });
  });

  await openApp(page);
  const settings = await openSettings(page);
  await expect(settings.getByText("Android, iPhone and iPad do not let this app replace")).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Start sending', exact: true })).toHaveCount(0);
});

test('routing settings remain accessible at desktop and phone widths', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await scriptedRouting(page);
  await openApp(page);
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Choose and allow output' }).click();
  await settings.getByLabel('Include my real voice').check();
  await settings.getByLabel('Your real microphone').selectOption('webcam');
  for (const viewport of [DESKTOP, PHONE]) {
    await page.setViewportSize(viewport);
    const scan = await new AxeBuilder({ page }).include('.audio-routing-section').analyze();
    expect(scan.violations).toEqual([]);
    expect(await settings.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
});

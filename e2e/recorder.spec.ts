import { expect, test, type Page } from '@playwright/test';
import { addSound, DESKTOP, openApp, PHONE } from './helpers';

type Scripted = { __tone(on: boolean): void; __streams: MediaStream[] };

/**
 * A microphone the test controls. It hears nothing until the test turns the tone on, so what is quiet and what is
 * loud in a recording is known. It also remembers the streams it gave out, to check they are let go of afterwards.
 */
async function useScriptedMicrophone(page: Page) {
  await page.addInitScript(() => {
    const scripted = window as unknown as Scripted;
    let gain: GainNode | null = null;
    scripted.__streams = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const tone = context.createOscillator();
      tone.frequency.value = 440;
      const level = context.createGain();
      level.gain.value = 0;
      gain = level;
      const destination = context.createMediaStreamDestination();
      tone.connect(level);
      level.connect(destination);
      tone.start();
      await context.resume();
      scripted.__streams.push(destination.stream);
      return destination.stream;
    };
    scripted.__tone = (on) => {
      if (gain) gain.gain.value = on ? 0.5 : 0;
    };
  });
}

const tone = (page: Page, on: boolean) => page.evaluate((value) => (window as unknown as Scripted).__tone(value), on);

type CaptureLog = { loaded: string[]; failed: string[]; scriptProcessors: number };

/**
 * Notes which way the recorder listens to the microphone: the AudioWorklet file (and whether it loaded) or the older
 * ScriptProcessor. A worklet that fails to load quietly falls back to the older way, so only this shows which one ran.
 */
async function watchCapture(page: Page, failToLoad = false) {
  await page.addInitScript((failLoad) => {
    const log = { loaded: [] as string[], failed: [] as string[], scriptProcessors: 0 };
    (window as unknown as { __capture: typeof log }).__capture = log;
    const worklet = window.AudioWorklet?.prototype;
    if (worklet) {
      const addModule = worklet.addModule;
      worklet.addModule = function (this: AudioWorklet, url: string | URL, options?: WorkletOptions) {
        const address = new URL(String(url), location.href).pathname;
        const loading = failLoad ? Promise.reject(new DOMException('The file could not be loaded.', 'AbortError')) : addModule.call(this, url, options);
        return loading.then(
          (result) => {
            log.loaded.push(address);
            return result;
          },
          (error: unknown) => {
            log.failed.push(address);
            throw error;
          },
        );
      };
    }
    const base = window.BaseAudioContext?.prototype;
    if (base) {
      const create = base.createScriptProcessor;
      base.createScriptProcessor = function (this: BaseAudioContext, ...args: Parameters<typeof create>) {
        log.scriptProcessors += 1;
        return create.apply(this, args);
      };
    }
  }, failToLoad);
}

const captureLog = (page: Page) => page.evaluate(() => (window as unknown as { __capture: CaptureLog }).__capture);

/** True once every microphone stream the page opened has been let go of (the browser's "recording" light is off). */
const microphoneReleased = (page: Page) =>
  page.evaluate(() => (window as unknown as Scripted).__streams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')));

const recorderBox = (page: Page) => page.getByRole('dialog', { name: 'Record a sound' });

/** Presses the Record button on the board: in the bottom bar on a phone, at the top of the board on a bigger screen. */
async function openRecorder(page: Page) {
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(recorderBox(page)).toBeVisible();
}

async function startRecording(page: Page) {
  const box = recorderBox(page);
  const record = box.getByRole('button', { name: 'Record', exact: true });
  await expect(record).toBeEnabled();
  await record.click();
  await expect(box.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  return box;
}

async function stopRecording(page: Page) {
  const box = recorderBox(page);
  await box.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(box.getByRole('button', { name: 'Record again' })).toBeVisible();
  return box;
}

/** Records a second and a half of tone, then stops. */
async function recordSomething(page: Page) {
  await startRecording(page);
  await tone(page, true);
  await page.waitForTimeout(1500);
  return stopRecording(page);
}

/** The numbers in "Keeping 1.3 of 2.6 seconds". */
async function keeping(page: Page): Promise<{ kept: number; total: number }> {
  const text = await recorderBox(page).getByText(/^Keeping /).innerText();
  const [kept, total] = (text.match(/[\d.]+/g) ?? []).map(Number);
  return { kept, total };
}

const TRIMMED_NOTE = 'I cut the quiet at the start and end. Drag Start and End to change that.';

test.describe('recording a sound, on a computer', () => {
  test.use({ viewport: DESKTOP });

  test('records with the microphone and adds the recording as a sound button', async ({ page }) => {
    const errors: string[] = [];
    await watchCapture(page);
    await openApp(page, errors);

    await openRecorder(page);
    const box = recorderBox(page);
    const record = box.getByRole('button', { name: 'Record', exact: true });
    await expect(box.getByRole('meter', { name: 'Microphone level' })).toBeVisible();
    await expect(record).toBeEnabled();
    // The cursor is already on Record, so the keyboard works from the first moment.
    await expect(record).toBeFocused();

    await record.click();
    await expect(box.getByRole('timer')).toContainText(/\d:\d\d of 1:00/);
    await page.waitForTimeout(2500);
    await stopRecording(page);

    await expect(box.getByRole('img', { name: /loud parts tall/ })).toBeVisible();
    await expect(box.getByLabel('Start', { exact: true })).toBeVisible();
    await expect(box.getByLabel('End', { exact: true })).toBeVisible();
    await expect(box.getByLabel('Name', { exact: true })).toHaveValue('My recording');
    const save = box.getByRole('button', { name: 'Save sound' });
    await expect(save).toBeEnabled();
    expect((await keeping(page)).kept).toBeGreaterThan(0.1);

    await save.click();
    await expect(box).toBeHidden();
    const tile = page.getByRole('button', { name: 'Play My recording' });
    await expect(tile).toBeVisible();
    await expect(page.getByText('Added “My recording” to My sounds.')).toBeVisible();

    await tile.click();
    await expect(tile).toHaveAttribute('data-playing', 'true');
    await expect(tile).toHaveAttribute('data-playing', 'false', { timeout: 8_000 });

    // The recorder used the AudioWorklet, loaded from the right place, and did not need the older way.
    const capture = await captureLog(page);
    expect(capture.loaded).toEqual(['/soundboard/capture-worklet.js']);
    expect(capture.failed).toEqual([]);
    expect(capture.scriptProcessors).toBe(0);
    expect(errors).toEqual([]);
  });

  test('cuts the quiet at the start and end, and the keyboard can change that', async ({ page }) => {
    const errors: string[] = [];
    await useScriptedMicrophone(page);
    await openApp(page, errors);
    await openRecorder(page);
    const box = await startRecording(page);

    // 0.8 s of quiet, 1 s of tone, 0.8 s of quiet.
    await page.waitForTimeout(800);
    await tone(page, true);
    const meter = box.getByRole('meter', { name: 'Microphone level' });
    await expect.poll(async () => Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(20);
    await page.waitForTimeout(800);
    await tone(page, false);
    await page.waitForTimeout(800);
    await stopRecording(page);

    await expect(box.getByText(TRIMMED_NOTE)).toBeVisible();
    const { kept, total } = await keeping(page);
    expect(kept).toBeGreaterThan(0.9);
    expect(kept).toBeLessThan(2);
    expect(total - kept).toBeGreaterThan(0.6);

    // Start sits just before the tone. An arrow key moves it a little; the note about cutting goes away.
    const start = box.getByLabel('Start', { exact: true });
    const before = Number(await start.inputValue());
    expect(before).toBeGreaterThan(500);
    await start.focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => Number(await start.inputValue())).toBeCloseTo(before - 50, 0);
    await expect(box.getByText(TRIMMED_NOTE)).toHaveCount(0);

    // A few more presses add up to more of the sound being kept (the "Keeping" line rounds to a tenth of a second).
    for (let press = 0; press < 3; press++) await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => Number(await start.inputValue())).toBeCloseTo(before - 200, 0);
    expect((await keeping(page)).kept).toBeGreaterThan(kept);

    await page.keyboard.press('Home');
    await expect.poll(async () => Number(await start.inputValue())).toBe(0);

    // Playing it back runs for as long as what is kept, then stops by itself.
    await box.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(box.getByRole('button', { name: 'Stop playing' })).toBeVisible();
    await expect(box.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 10_000 });

    // Enter in the Name box saves it.
    const name = box.getByLabel('Name', { exact: true });
    await name.fill('Laugh');
    await name.press('Enter');
    await expect(box).toBeHidden();
    const tile = page.getByRole('button', { name: 'Play Laugh' });
    await expect(tile).toBeVisible();
    await tile.click();
    await expect(tile).toHaveAttribute('data-playing', 'true');
    await expect(tile).toHaveAttribute('data-playing', 'false', { timeout: 8_000 });

    // The microphone is let go of once the box is closed.
    await expect.poll(() => microphoneReleased(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('says so when nothing was heard, and Record again starts over', async ({ page }) => {
    await useScriptedMicrophone(page);
    await openApp(page);
    await openRecorder(page);
    await startRecording(page);
    await page.waitForTimeout(1500);
    const box = await stopRecording(page);

    await expect(box.getByRole('alert')).toContainText("I didn't hear anything");
    await expect(box.getByRole('button', { name: 'Save sound' })).toHaveCount(0);
    await box.getByRole('button', { name: 'Record again' }).click();
    await expect(box.getByRole('button', { name: 'Record', exact: true })).toBeEnabled();
  });

  test('asks before throwing a recording away, and Escape means keep it', async ({ page }) => {
    await useScriptedMicrophone(page);
    await openApp(page);
    await openRecorder(page);
    const box = await recordSomething(page);

    const question = box.getByText('Throw this recording away?');
    await box.getByRole('button', { name: 'Discard' }).click();
    await expect(question).toBeVisible();
    await expect(box.getByRole('button', { name: 'Keep it' })).toBeFocused();

    // Escape answers "keep it" and the cursor goes back to where it was. Pressing it again asks again, every time.
    for (let round = 0; round < 2; round++) {
      await page.keyboard.press('Escape');
      await expect(question).toHaveCount(0);
      await expect(box).toBeVisible();
      await expect(box.getByRole('button', { name: 'Discard' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(question).toBeVisible();
      await expect(box.getByRole('button', { name: 'Keep it' })).toBeFocused();
    }

    await box.getByRole('button', { name: 'Throw away' }).click();
    await expect(box).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Add your first sound' })).toBeVisible();
    await expect.poll(() => microphoneReleased(page)).toBe(true);
  });

  test('asks while a recording is still going, and Keep recording carries on', async ({ page }) => {
    await useScriptedMicrophone(page);
    await openApp(page);
    await openRecorder(page);
    const box = await startRecording(page);
    await tone(page, true);
    await page.waitForTimeout(1500);

    await page.keyboard.press('Escape');
    await expect(box.getByText('Throw this recording away?')).toBeVisible();
    await box.getByRole('button', { name: 'Keep recording' }).click();
    await expect(box.getByText('Throw this recording away?')).toHaveCount(0);
    await expect(box.getByRole('button', { name: 'Stop', exact: true })).toBeFocused();

    // It never stopped.
    await expect(box.getByRole('timer')).toContainText(/0:0[2-9] of 1:00/);
    await stopRecording(page);
    await expect(box.getByRole('button', { name: 'Save sound' })).toBeEnabled();
  });

  test('closes a quick fumble without asking, and lets go of the microphone', async ({ page }) => {
    await useScriptedMicrophone(page);
    await openApp(page);
    await openRecorder(page);
    const box = await startRecording(page);
    await box.getByRole('button', { name: 'Close' }).click();
    await expect(box).toBeHidden();
    await expect.poll(() => microphoneReleased(page)).toBe(true);
  });

  for (const [errorName, words] of [
    ['NotAllowedError', /is blocking the microphone/],
    ['NotFoundError', /couldn't find a microphone/],
  ] as const) {
    test(`explains a microphone problem (${errorName}), and Try again works`, async ({ page }) => {
      await page.addInitScript((name) => {
        const media = navigator.mediaDevices;
        const real = media.getUserMedia.bind(media);
        let first = true;
        media.getUserMedia = async (constraints) => {
          if (first) {
            first = false;
            throw new DOMException('Not now', name);
          }
          return real(constraints);
        };
      }, errorName);
      await openApp(page);
      await openRecorder(page);
      const box = recorderBox(page);

      await expect(box.getByRole('alert')).toContainText(words);
      await expect(box.getByRole('button', { name: 'Record', exact: true })).toBeDisabled();
      await box.getByRole('button', { name: 'Try again' }).click();
      await expect(box.getByRole('alert')).toHaveCount(0);
      await expect(box.getByRole('button', { name: 'Record', exact: true })).toBeEnabled();
    });
  }

  test('still records on a browser without AudioWorklet', async ({ page }) => {
    await watchCapture(page);
    await page.addInitScript(() => {
      (window as unknown as { AudioWorkletNode?: unknown }).AudioWorkletNode = undefined;
    });
    await useScriptedMicrophone(page);
    await openApp(page);
    await openRecorder(page);
    const box = await recordSomething(page);

    await expect(box.getByRole('button', { name: 'Save sound' })).toBeEnabled();
    expect((await keeping(page)).kept).toBeGreaterThan(0.5);
    const capture = await captureLog(page);
    expect(capture.loaded).toEqual([]);
    expect(capture.scriptProcessors).toBeGreaterThan(0);
    await box.getByRole('button', { name: 'Save sound' }).click();
    await expect(page.getByRole('button', { name: 'Play My recording' })).toBeVisible();
  });

  test('falls back to the older way when the worklet file cannot be loaded', async ({ page }) => {
    await watchCapture(page, true);
    await useScriptedMicrophone(page);
    await openApp(page);
    await openRecorder(page);
    const box = await recordSomething(page);

    await expect(box.getByRole('button', { name: 'Save sound' })).toBeEnabled();
    const capture = await captureLog(page);
    expect(capture.failed).toEqual(['/soundboard/capture-worklet.js']);
    expect(capture.scriptProcessors).toBeGreaterThan(0);
  });

  test('replaces the file on a sound with a recording, and Undo brings the old one back', async ({ page }) => {
    const errors: string[] = [];
    await useScriptedMicrophone(page);
    await openApp(page, errors);
    // A short beep, so a longer recording is easy to tell apart.
    await addSound(page, 'honk.wav', 0.4);
    await page.getByRole('button', { name: 'Edit honk' }).click();
    await page.locator('#sound-editor').getByRole('button', { name: 'Replace by recording' }).click();

    // It says what will be replaced before anything is recorded, and again when it is time to save.
    const box = recorderBox(page);
    const replacing = 'This will replace the sound on “Honk”. Its name, colour, volume and key stay the same.';
    await expect(box).toContainText(replacing);
    await recordSomething(page);
    await expect(box).toContainText(replacing);
    await expect(box.getByLabel('Name', { exact: true })).toHaveCount(0);
    await box.getByRole('button', { name: 'Save sound' }).click();
    await expect(box).toBeHidden();

    await expect(page.getByText('Replaced the file for “Honk”')).toBeVisible();
    const tile = page.getByRole('button', { name: 'Play Honk' });
    await tile.click();
    await expect(tile).toHaveAttribute('data-playing', 'true');
    // The recording is longer than the beep it replaced.
    await page.waitForTimeout(900);
    await expect(tile).toHaveAttribute('data-playing', 'true');
    await page.getByRole('button', { name: 'Stop all sounds', exact: true }).first().click();

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await tile.click();
    await expect(tile).toHaveAttribute('data-playing', 'true');
    await page.waitForTimeout(900);
    await expect(tile).toHaveAttribute('data-playing', 'false');
    expect(errors).toEqual([]);
  });
});

test.describe('recording a sound, on a phone', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('opens as a sheet from the bottom bar, with big buttons that fit the screen', async ({ page }) => {
    const errors: string[] = [];
    await useScriptedMicrophone(page);
    await openApp(page, errors);
    await openRecorder(page);
    const box = recorderBox(page);
    const record = box.getByRole('button', { name: 'Record', exact: true });
    await expect(record).toBeEnabled();

    const size = await record.boundingBox();
    expect(size?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await record.tap();
    await tone(page, true);
    await page.waitForTimeout(1500);
    await stopRecording(page);
    const save = box.getByRole('button', { name: 'Save sound' });
    await expect(save).toBeEnabled();
    const saveBox = await save.boundingBox();
    expect(saveBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(saveBox?.width ?? 0).toBeGreaterThan(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await save.tap();
    await expect(box).toBeHidden();
    await expect(page.getByRole('button', { name: 'Play My recording' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('records over the edit sheet, and the Undo bar is still in reach afterwards', async ({ page }) => {
    await useScriptedMicrophone(page);
    await openApp(page);
    await addSound(page, 'honk.wav', 0.4);
    await page.getByRole('button', { name: 'Edit honk' }).tap();
    const sheet = page.getByRole('dialog', { name: /Edit Honk/i });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Replace by recording' }).tap();

    const box = recorderBox(page);
    await expect(box).toBeVisible();
    await recordSomething(page);
    await box.getByRole('button', { name: 'Save sound' }).tap();
    await expect(box).toBeHidden();

    // The edit sheet is still open underneath, and the message about what happened is shown on top of it.
    await expect(sheet).toBeVisible();
    const undo = sheet.getByRole('button', { name: 'Undo', exact: true });
    await expect(sheet.getByText('Replaced the file for “Honk”')).toBeVisible();
    await undo.tap();
    await expect(undo).toHaveCount(0);
  });
});

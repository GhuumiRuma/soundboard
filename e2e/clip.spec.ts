import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { DESKTOP, isClear, makeWav, openApp, PHONE, smallTouchTargets, tabStops } from './helpers';

const PLAYER = 'Your file. Play it to find the part you want.';

const clipBox = (page: Page) => page.getByRole('dialog', { name: 'Clip a sound' });

/** Presses Clip on the board: in the bottom bar on a phone, next to Add and Record on a bigger screen. */
async function openClipper(page: Page, how: 'click' | 'tap' = 'click') {
  const button = page.getByRole('button', { name: 'Clip', exact: true });
  await (how === 'tap' ? button.tap() : button.click());
  const box = clipBox(page);
  await expect(box).toBeVisible();
  return box;
}

interface Upload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

const wav = (name: string, buffer: Buffer): Upload => ({ name, mimeType: 'audio/wav', buffer });

/** Presses the button that opens the file window (Choose a file, or Choose another file) and hands over a file. */
async function giveFile(page: Page, file: Upload, button = 'Choose a file') {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), clipBox(page).getByRole('button', { name: button, exact: true }).click()]);
  await chooser.setFiles(file);
}

/** Moves the file's own player to a place and waits until it has got there, like dragging the player's bar would. */
async function seekTo(player: Locator, seconds: number) {
  await player.evaluate(
    (video: HTMLVideoElement, to: number) =>
      new Promise<void>((resolve) => {
        video.addEventListener('seeked', () => resolve(), { once: true });
        video.currentTime = to;
      }),
    seconds,
  );
}

const sliderAt = async (slider: Locator) => Number(await slider.inputValue());

/** A second of nothing, a second of tone, then another second of nothing. */
function paddedWav(): Buffer {
  const rate = 8000;
  const quiet = Buffer.alloc(rate * 2);
  const data = Buffer.concat([quiet, makeWav(1, 440, rate).subarray(44), quiet]);
  const header = Buffer.from(makeWav(0.01, 440, rate).subarray(0, 44));
  header.writeUInt32LE(36 + data.length, 4);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** A sound file with nothing in it but silence. */
function silentWav(): Buffer {
  const file = makeWav(1.5);
  file.fill(0, 44);
  return file;
}

/** A tiny picture, to try a file that is not a video or a sound. */
const PICTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * A few seconds of moving colour and a tone, made by the browser itself, so no real video is needed. It needs a page
 * that has been clicked on (a browser only plays sound after that). Null when this browser can't make a video.
 */
async function makeVideo(page: Page, seconds = 3): Promise<Buffer | null> {
  const base64 = await page.evaluate(async (length) => {
    const type = ['video/webm;codecs=vp8,opus', 'video/webm'].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!type) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const paint = canvas.getContext('2d')!;

    const audio = new AudioContext();
    await Promise.race([audio.resume(), new Promise((resolve) => setTimeout(resolve, 2000))]);
    const tone = audio.createOscillator();
    tone.frequency.value = 330;
    const level = audio.createGain();
    level.gain.value = 0.5;
    const destination = audio.createMediaStreamDestination();
    tone.connect(level);
    level.connect(destination);
    tone.start();

    const stream = new MediaStream([...canvas.captureStream(15).getVideoTracks(), ...destination.stream.getAudioTracks()]);
    const recorder = new MediaRecorder(stream, { mimeType: type });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start(200);

    const began = performance.now();
    await new Promise<void>((resolve) => {
      const draw = () => {
        const passed = (performance.now() - began) / 1000;
        paint.fillStyle = `hsl(${(passed * 90) % 360} 70% 45%)`;
        paint.fillRect(0, 0, 160, 90);
        if (passed < length) requestAnimationFrame(draw);
        else resolve();
      };
      draw();
    });
    recorder.stop();
    await stopped;
    tone.stop();
    stream.getTracks().forEach((track) => track.stop());
    await audio.close();

    const bytes = new Uint8Array(await new Blob(chunks, { type }).arrayBuffer());
    let text = '';
    for (let at = 0; at < bytes.length; at += 8192) text += String.fromCharCode(...bytes.subarray(at, at + 8192));
    return btoa(text);
  }, seconds);
  return base64 ? Buffer.from(base64, 'base64') : null;
}

/** Looks at the screen the way a screen reader and a colour checker would. Anything found fails the test, in words. */
async function noProblems(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(
    violations.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`),
    `Problems found on ${where}`,
  ).toEqual([]);
}

test.describe('clipping a sound, on a computer', () => {
  test.use({ viewport: DESKTOP });

  test('turns a sound file into a button that plays', async ({ page }) => {
    const errors: string[] = [];
    await openApp(page, errors);
    const box = await openClipper(page);
    await expect(box.getByRole('button', { name: 'Choose a file' })).toBeFocused();
    await expect(box).toContainText('Only clip things you made or have permission to use.');
    await expect(box).toContainText('Or drop a file here.');

    await giveFile(page, wav('funny_moment.wav', makeWav(2, 440)));
    await expect(box.getByLabel(PLAYER)).toBeVisible();
    await expect(box.getByLabel('Name', { exact: true })).toHaveValue('Funny moment');
    await expect(box).toContainText(/Keeping [\d.]+ seconds of 0:02/);
    // A short file is kept whole, so there is nothing to zoom in on, and the cursor is where she plays next.
    await expect(box.getByRole('button', { name: 'Zoom in on the clip' })).toHaveCount(0);
    const play = box.getByRole('button', { name: 'Play', exact: true });
    await expect(play).toBeFocused();

    // What is played is the part that is kept.
    await play.click();
    await expect(box.getByRole('button', { name: 'Stop playing' })).toBeVisible();
    await expect(play).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent('download'), box.getByRole('button', { name: 'Also save a copy as a file' }).click()]);
    expect(download.suggestedFilename()).toBe('Funny moment.wav');
    await expect(box).toContainText('Saved your clip to your Downloads folder.');

    await box.getByRole('button', { name: 'Save sound' }).click();
    await expect(box).toBeHidden();
    await expect(page.getByText('Added “Funny moment” to My sounds.')).toBeVisible();

    const tile = page.getByRole('button', { name: 'Play Funny moment' });
    await tile.click();
    await expect(tile).toHaveAttribute('data-playing', 'true');
    await expect(tile).toHaveAttribute('data-playing', 'false');
    expect(errors).toEqual([]);
  });

  test('cuts the quiet at the start and end, and says so', async ({ page }) => {
    const errors: string[] = [];
    await openApp(page, errors);
    const box = await openClipper(page);
    await giveFile(page, wav('hello there.wav', paddedWav()));

    await expect(box).toContainText('I cut the quiet at the start and end. Drag Start and End to change that.');
    await expect(box).toContainText(/Keeping 1\.[23] seconds of 0:03/);
    const start = box.getByLabel('Start', { exact: true });
    const end = box.getByLabel('End', { exact: true });
    expect(await sliderAt(start)).toBeGreaterThan(850);
    expect(await sliderAt(start)).toBeLessThan(990);
    expect(await sliderAt(end)).toBeGreaterThan(2150);
    expect(await sliderAt(end)).toBeLessThan(2250);

    // The note was about what was done for her. Once she moves a handle it is out of date.
    await start.press('ArrowLeft');
    await expect(box).not.toContainText('I cut the quiet');
    expect(errors).toEqual([]);
  });

  test('picks the part of a long file by playing it, and zooms in to place the ends exactly', async ({ page }) => {
    const errors: string[] = [];
    await openApp(page, errors);
    const box = await openClipper(page);
    await giveFile(page, wav('stream highlights.wav', makeWav(90, 330, 8000)));

    await expect(box.getByLabel('Name', { exact: true })).toHaveValue('Stream highlights');
    await expect(box).toContainText(
      'This file is 1:30 long. Play the file above, then press Start here and End here where the part you want begins and ends.',
    );
    await expect(box).toContainText('Keeping 10.0 seconds of 1:30');

    const player = box.getByLabel(PLAYER);
    const start = box.getByLabel('Start', { exact: true });
    const end = box.getByLabel('End', { exact: true });
    const startHere = box.getByRole('button', { name: 'Start here' });
    const endHere = box.getByRole('button', { name: 'End here' });
    await expect(startHere).toBeEnabled();

    // Start moves to where the player is, and End comes along so the clip is not backwards.
    await seekTo(player, 30);
    await startHere.click();
    await expect(box.getByText(/^Start is now at (29\.9|30\.\d) seconds\.$/)).toHaveCount(1);
    expect(Math.abs((await sliderAt(start)) - 30_000)).toBeLessThan(150);
    expect(Math.abs((await sliderAt(end)) - 40_000)).toBeLessThan(150);

    await seekTo(player, 55);
    await endHere.click();
    await expect(box.getByText(/^End is now at (54\.9|55\.\d) seconds\.$/)).toHaveCount(1);
    expect(Math.abs((await sliderAt(end)) - 55_000)).toBeLessThan(150);
    await expect(box).toContainText(/Keeping 2[45]\.\d seconds of 1:30/);

    // Zoomed in, the sliders only cover the part around the clip, so each step of an arrow key is small.
    await box.getByRole('button', { name: 'Zoom in on the clip' }).click();
    await expect(box.getByRole('button', { name: 'Show the whole file' })).toBeVisible();
    expect(Number(await start.getAttribute('min'))).toBeGreaterThan(10_000);
    expect(Number(await start.getAttribute('max'))).toBeLessThan(80_000);

    const before = await sliderAt(start);
    await start.press('ArrowRight');
    const step = (await sliderAt(start)) - before;
    expect(step).toBeGreaterThan(40);
    expect(step).toBeLessThan(200);
    await start.press('PageUp');
    expect((await sliderAt(start)) - before - step).toBeGreaterThan(400);

    await box.getByRole('button', { name: 'Show the whole file' }).click();
    await expect(box.getByRole('button', { name: 'Zoom in on the clip' })).toBeVisible();
    expect(Number(await start.getAttribute('min'))).toBe(0);
    expect(Number(await start.getAttribute('max'))).toBeGreaterThan(89_000);

    await box.getByRole('button', { name: 'Save sound' }).click();
    await expect(box).toBeHidden();
    const tile = page.getByRole('button', { name: 'Play Stream highlights' });
    await tile.click();
    await expect(tile).toHaveAttribute('data-playing', 'true');
    await page.getByRole('button', { name: 'Stop all sounds', exact: true }).first().click();
    await expect(tile).toHaveAttribute('data-playing', 'false');
    expect(errors).toEqual([]);
  });

  test('clips the sound of a video', async ({ page }) => {
    const errors: string[] = [];
    await openApp(page, errors);
    const box = await openClipper(page);
    const video = await makeVideo(page);
    test.skip(!video, 'This browser cannot make a small video to try.');

    await giveFile(page, { name: 'funny_video.webm', mimeType: 'video/webm', buffer: video! });
    const player = box.getByLabel(PLAYER);
    await expect(player).toBeVisible();
    await expect(box.getByLabel('Name', { exact: true })).toHaveValue('Funny video');
    // A video has a picture, so the player is the big one, not the slim bar a sound gets.
    await expect(player).not.toHaveClass(/is-sound/);
    expect(await player.evaluate((element: HTMLVideoElement) => element.videoWidth)).toBeGreaterThan(0);
    await expect(box.getByRole('button', { name: 'Start here' })).toBeEnabled();
    await expect(box).toContainText(/Keeping [\d.]+ seconds of 0:0[2-4]/);

    // A video's picture can't tell her where its sound is, so Start and End also move with the keyboard.
    const start = box.getByLabel('Start', { exact: true });
    const end = box.getByLabel('End', { exact: true });
    const startBefore = await sliderAt(start);
    const endBefore = await sliderAt(end);
    await start.press('PageUp');
    await end.press('PageDown');
    expect(await sliderAt(start)).toBeGreaterThan(startBefore + 400);
    expect(await sliderAt(end)).toBeLessThan(endBefore - 400);

    await box.getByRole('button', { name: 'Save sound' }).click();
    await expect(box).toBeHidden();
    const tile = page.getByRole('button', { name: 'Play Funny video' });
    await tile.click();
    await expect(tile).toHaveAttribute('data-playing', 'true');
    await expect(tile).toHaveAttribute('data-playing', 'false');
    expect(errors).toEqual([]);
  });

  test('says what is wrong with a file it cannot open, and lets her choose another', async ({ page }) => {
    const errors: string[] = [];
    await openApp(page, errors);
    const box = await openClipper(page);
    const choose = box.getByRole('button', { name: 'Choose a file' });

    const problems: Array<[Upload, string]> = [
      [
        { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Remember to say thanks to everyone who joined the stream today.') },
        "I couldn't get the sound out of that file. Try a shorter video, or an MP3, WAV or M4A.",
      ],
      [{ name: 'cat.png', mimeType: 'image/png', buffer: PICTURE }, "That's a picture — Clip a sound needs a video or a sound file."],
      [wav('quiet.wav', silentWav()), "I didn't hear any sound in that file. Try another one."],
      [wav('nothing.wav', Buffer.alloc(0)), 'That file is empty. Pick a video or sound file with content.'],
      [wav('marathon.wav', makeWav(601, 220, 8000)), "That's longer than 10 minutes, which is the longest I can open. Try a shorter file."],
    ];
    for (const [file, message] of problems) {
      await giveFile(page, file);
      await expect(box.getByRole('alert'), file.name).toContainText(message);
      // She is back where she can choose again, with the cursor on the button.
      await expect(choose, file.name).toBeFocused();
    }

    await giveFile(page, wav('fine.wav', makeWav(1)));
    await expect(box.getByLabel('Name', { exact: true })).toHaveValue('Fine');
    await expect(box.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('shows that a file is being opened, and Cancel brings her back without it', async ({ page }) => {
    const errors: string[] = [];
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Holds back the opening of a file until the test says so, as a big video would.
    await page.addInitScript(() => {
      const original = BaseAudioContext.prototype.decodeAudioData;
      let open: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        open = resolve;
      });
      (window as unknown as { __openDecoder: () => void }).__openDecoder = () => open();
      BaseAudioContext.prototype.decodeAudioData = function (this: BaseAudioContext, ...args: unknown[]) {
        const run = () => (original as (...inner: unknown[]) => Promise<AudioBuffer>).apply(this, args);
        return this instanceof OfflineAudioContext ? gate.then(run) : run();
      } as typeof original;
    });
    await openApp(page, errors);
    const box = await openClipper(page);
    await noProblems(page, 'the Clip a sound box before a file is chosen');
    await giveFile(page, wav('big_stream.wav', makeWav(2)));

    await expect(box.getByRole('status')).toHaveText('Opening “big_stream.wav”…');
    const cancel = box.getByRole('button', { name: 'Cancel' });
    await expect(cancel).toBeFocused();
    // Nothing slides about for someone who asked for less movement.
    await expect(box.locator('.clip-progress-bar')).toHaveCSS('animation-name', 'none');
    await noProblems(page, 'a file being opened');

    await cancel.click();
    await expect(box.getByRole('button', { name: 'Choose a file' })).toBeFocused();
    // The file finishes opening after she cancelled. It must not bring the screen back.
    await page.evaluate(() => (window as unknown as { __openDecoder: () => void }).__openDecoder());
    await page.waitForTimeout(500);
    await expect(box.getByRole('button', { name: 'Choose a file' })).toBeVisible();
    await expect(box.getByLabel('Name', { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('closing with a clip open saves nothing, and Choose another file swaps the file', async ({ page }) => {
    const errors: string[] = [];
    await openApp(page, errors);
    const box = await openClipper(page);
    const name = box.getByLabel('Name', { exact: true });

    await giveFile(page, wav('first_clip.wav', makeWav(1.5, 330)));
    await expect(name).toHaveValue('First clip');
    await giveFile(page, wav('second_clip.wav', makeWav(1.5, 550)), 'Choose another file');
    await expect(name).toHaveValue('Second clip');

    await page.keyboard.press('Escape');
    await expect(box).toBeHidden();
    await expect(page.getByRole('button', { name: /^Play (First|Second) clip/ })).toHaveCount(0);

    // Next time it starts from the beginning, with nothing left over from the file she closed.
    await openClipper(page);
    await expect(box.getByRole('button', { name: 'Choose a file' })).toBeFocused();
    await expect(name).toHaveCount(0);
    await box.getByRole('button', { name: 'Close' }).click();
    await expect(box).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('can be used with only the keyboard', async ({ page }) => {
    const errors: string[] = [];
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openApp(page, errors);
    await page.getByRole('button', { name: 'Clip', exact: true }).focus();
    await page.keyboard.press('Enter');
    const box = clipBox(page);
    await expect(box.getByRole('button', { name: 'Choose a file' })).toBeFocused();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')]);
    await chooser.setFiles(wav('stream highlights.wav', makeWav(90, 330, 8000)));
    await expect(box.getByRole('button', { name: 'Play', exact: true })).toBeFocused();

    // The file's own player has controls of its own inside it, and the browser draws those rings itself.
    const stops = (await tabStops(page, 40)).filter((stop) => !stop.label.startsWith('video'));
    expect(stops.length).toBeGreaterThan(8);
    for (const stop of stops) {
      expect(stop.leaked, `${stop.label} is outside the box`).toBe(false);
      expect(stop.clear, `${stop.label} is hidden under something`).toBe(true);
      expect(stop.ring, `${stop.label} has a ring that can be seen`).toBeGreaterThanOrEqual(3);
    }

    // The arrow keys move a handle in steps that suit a file this long, and Page Up in bigger ones.
    const start = box.getByLabel('Start', { exact: true });
    await start.focus();
    await page.keyboard.press('PageUp');
    expect(Math.abs((await sliderAt(start)) - 1500)).toBeLessThan(5);
    await page.keyboard.press('ArrowRight');
    expect(Math.abs((await sliderAt(start)) - 1650)).toBeLessThan(5);

    // Enter in the name saves the clip.
    const name = box.getByLabel('Name', { exact: true });
    await name.fill('Big moment');
    await page.keyboard.press('Enter');
    await expect(box).toBeHidden();
    await expect(page.getByRole('button', { name: 'Play Big moment' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('opens from the empty board as well', async ({ page }) => {
    const errors: string[] = [];
    await openApp(page, errors);
    await page.getByRole('button', { name: 'Clip a sound' }).click();
    await expect(clipBox(page)).toBeVisible();
    await expect(clipBox(page).getByRole('button', { name: 'Choose a file' })).toBeFocused();
    expect(errors).toEqual([]);
  });
});

test.describe('clipping a sound, on a phone', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('opens as a sheet from the bottom bar, and everything fits and can be tapped', async ({ page }) => {
    const errors: string[] = [];
    await openApp(page, errors);
    const box = await openClipper(page, 'tap');
    const choose = box.getByRole('button', { name: 'Choose a file' });
    await expect(choose).toBeFocused();
    // A phone has no mouse to drop a file with, so it isn't mentioned.
    await expect(box).not.toContainText('drop a file');
    expect(await smallTouchTargets(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await giveFile(page, wav('stream highlights.wav', makeWav(90, 330, 8000)));
    await expect(box.getByLabel('Name', { exact: true })).toHaveValue('Stream highlights');
    expect(await smallTouchTargets(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const player = await box.getByLabel(PLAYER).boundingBox();
    expect(player?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((player?.x ?? 0) + (player?.width ?? 0)).toBeLessThanOrEqual(PHONE.width);

    // The sheet scrolls, and Save is a big button she can reach.
    const save = box.getByRole('button', { name: 'Save sound' });
    await save.scrollIntoViewIfNeeded();
    expect(await isClear(save)).toBe(true);
    const size = await save.boundingBox();
    expect(size?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(size?.width ?? 0).toBeGreaterThan(300);
    await save.tap();
    await expect(box).toBeHidden();
    await expect(page.getByRole('button', { name: 'Play Stream highlights' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('the bottom bar on a small phone', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  /** Everything that is wrong with the four buttons: words cut off, off the edge, too small to tap, or on top of each other. */
  async function barProblems(page: Page, screenWidth: number): Promise<string[]> {
    const buttons = await page.locator('.phone-bar-actions .btn').evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return {
          name: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          cutOff: element.scrollWidth > element.clientWidth + 1,
        };
      }),
    );
    const problems: string[] = [];
    for (const button of buttons) {
      if (button.cutOff) problems.push(`${button.name} has its words cut off`);
      if (button.left < 0 || button.right > screenWidth) problems.push(`${button.name} is off the side of the screen`);
      if (button.bottom - button.top < 44) problems.push(`${button.name} is too short to tap`);
    }
    buttons.forEach((a, at) =>
      buttons.slice(at + 1).forEach((b) => {
        const overlaps = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        if (overlaps) problems.push(`${a.name} is on top of ${b.name}`);
      }),
    );
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))) problems.push('the page can be pushed sideways');
    return problems;
  }

  for (const width of [390, 360, 320]) {
    test(`fits all four buttons in one row on a screen ${width} pixels wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await openApp(page);
      await expect(page.locator('.phone-bar-actions .btn')).toHaveCount(4);
      expect(await barProblems(page, width)).toEqual([]);

      const tops = await page.locator('.phone-bar-actions .btn').evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
      expect(new Set(tops).size, 'the buttons are not all in one row').toBe(1);
    });
  }

  test('still fits when her phone shows bigger text, by moving the last button down a row', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 700 });
    await openApp(page);
    await page.addStyleTag({ content: '.phone-bar .btn { font-size: 21px !important; }' });
    await expect(page.locator('.phone-bar-actions .btn')).toHaveCount(4);
    expect(await barProblems(page, 360)).toEqual([]);
    const tops = await page.locator('.phone-bar-actions .btn').evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
    expect(new Set(tops).size, 'the buttons did not need a second row, so this is not testing the move').toBeGreaterThan(1);
    const buttons = page.locator('.phone-bar-actions .btn');
    for (let at = 0; at < 4; at += 1) expect(await isClear(buttons.nth(at)), `button ${at + 1} is hidden under something`).toBe(true);
  });
});

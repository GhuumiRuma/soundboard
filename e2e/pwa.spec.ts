import { expect, type Page } from '@playwright/test';
import { addSound, DESKTOP, openApp, PHONE } from './helpers';
import {
  ANDROID_CHROME,
  IPHONE_SAFARI,
  WINDOWS_CHROME,
  ignoreRealInstallOffers,
  installNote,
  lookForNewVersion,
  newVersionNote,
  offerToInstall,
  openWithOfflineCopy,
  type Marked,
} from './install';
import { test } from './site';

const heading = (page: Page) => page.getByRole('heading', { name: 'Soundboard', level: 1 });

/** A mark that is only still there while the page has not been reloaded. */
const markPage = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as Marked).__stillHere = true;
  });
const isMarked = (page: Page) => page.evaluate(() => (window as unknown as Marked).__stillHere === true);
const hasWaitingVersion = (page: Page) =>
  page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);

/** Lets a little time pass so the page has saved what she just added. */
const letItSave = (page: Page) => page.waitForTimeout(700);

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('working without internet, and updating', () => {
  test.use({ viewport: DESKTOP });

  test('opens and plays with no internet once it has been opened before', async ({ page, context }) => {
    const errors: string[] = [];
    await openWithOfflineCopy(page, errors);
    await addSound(page, 'honk.wav');
    await expect(page.getByRole('button', { name: 'Play honk' })).toBeVisible();
    await letItSave(page);

    await context.setOffline(true);
    await page.reload();
    const tile = page.getByRole('button', { name: 'Play honk' });
    await expect(tile).toBeVisible();
    await tile.click();
    await expect(tile).toHaveAttribute('data-playing', 'true');
    await expect(tile).toHaveAttribute('data-playing', 'false');

    // The recorder's sound-catching file is kept too, so recording works offline.
    expect(await page.evaluate(async () => (await fetch(new URL('capture-worklet.js', document.baseURI))).ok)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('says when a new version is ready, and only updates when she says so', async ({ page, site }) => {
    const errors: string[] = [];
    await openWithOfflineCopy(page, errors);
    await addSound(page, 'honk.wav');
    await expect(page.getByRole('button', { name: 'Play honk' })).toBeVisible();
    await letItSave(page);
    await markPage(page);

    await lookForNewVersion(page, site);
    const note = newVersionNote(page);
    await expect(note).toBeVisible();
    await expect(note).toContainText('Your boards and sounds will still be here.');

    // Nothing happens to the page by itself.
    await page.waitForTimeout(800);
    expect(await isMarked(page)).toBe(true);
    expect(await hasWaitingVersion(page)).toBe(true);

    const reloaded = page.waitForEvent('load');
    await note.getByRole('button', { name: 'Update now' }).click();
    await reloaded;

    await expect(heading(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play honk' })).toBeVisible();
    await expect(newVersionNote(page)).toHaveCount(0);
    expect(await isMarked(page)).toBe(false);
    expect(await hasWaitingVersion(page)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('"Later" puts the message away and leaves the page alone', async ({ page, site }) => {
    const errors: string[] = [];
    await openWithOfflineCopy(page, errors);
    await markPage(page);

    await lookForNewVersion(page, site);
    const note = newVersionNote(page);
    await expect(note).toBeVisible();
    await note.getByRole('button', { name: 'Later' }).click();

    await expect(newVersionNote(page)).toHaveCount(0);
    expect(await isMarked(page)).toBe(true);
    // The new version keeps waiting. It takes over the next time Soundboard is opened fresh.
    expect(await hasWaitingVersion(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('waits until a recording is finished before the new version takes over', async ({ page, context, site }) => {
    const errors: string[] = [];
    await openWithOfflineCopy(page, errors);
    const other = await context.newPage();
    await other.goto('./');
    await expect(heading(other)).toBeVisible();
    await expect.poll(() => other.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await markPage(page);

    await lookForNewVersion(page, site);
    await expect(newVersionNote(page)).toBeVisible();
    await expect(newVersionNote(other)).toBeVisible();

    // She is in the middle of recording in this window...
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    const recorder = page.getByRole('dialog', { name: 'Record a sound' });
    await expect(recorder).toBeVisible();

    // ...and presses Update now in the other one.
    const otherReloaded = other.waitForEvent('load');
    await newVersionNote(other).getByRole('button', { name: 'Update now' }).click();
    await otherReloaded;

    await page.waitForTimeout(1000);
    expect(await isMarked(page)).toBe(true);
    await expect(recorder).toBeVisible();

    // Once the recorder is closed, this window catches up.
    const reloaded = page.waitForEvent('load');
    await recorder.getByRole('button', { name: 'Close' }).click();
    await reloaded;
    await expect(heading(page)).toBeVisible();
    expect(await isMarked(page)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('says so when an update cannot take over, instead of leaving her waiting', async ({ page, site }) => {
    await openApp(page);
    // This window was open before the offline copy existed, so a new version cannot take it over.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await lookForNewVersion(page, site);
    await newVersionNote(page).getByRole('button', { name: 'Update now' }).click();
    await expect(page.getByText("I couldn't update just now.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Close Soundboard, then open it again to get the new version.')).toBeVisible();
  });
});

test.describe('installing, on a computer', () => {
  test.use({ viewport: DESKTOP, userAgent: WINDOWS_CHROME });

  test.beforeEach(async ({ page }) => {
    await ignoreRealInstallOffers(page);
  });

  test('offers an Install button when the browser allows it, and asks the browser once', async ({ page }) => {
    const errors: string[] = [];
    await openApp(page, errors);
    await expect(installNote(page)).toHaveCount(0);

    expect(await offerToInstall(page)).toBe(true);
    const note = installNote(page);
    await expect(note).toContainText('Install Soundboard to open it like an app, even without internet.');
    await note.getByRole('button', { name: 'Install', exact: true }).click();
    await expect(installNote(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as Marked).__installQuestions)).toBe(1);

    // The browser says it is done.
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    const settings = await openSettings(page);
    await expect(settings.getByText('Soundboard is installed on this device.')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('"No thanks" is remembered, and Settings still has the button', async ({ page }) => {
    const errors: string[] = [];
    await openApp(page, errors);
    await offerToInstall(page);
    await installNote(page).getByRole('button', { name: 'No thanks' }).click();
    await expect(installNote(page)).toHaveCount(0);

    await page.reload();
    await expect(heading(page)).toBeVisible();
    await offerToInstall(page);
    await expect(installNote(page)).toHaveCount(0);

    const settings = await openSettings(page);
    await expect(settings.getByRole('heading', { name: 'Install on this device' })).toBeVisible();
    await settings.getByRole('button', { name: 'Install Soundboard' }).click();
    // The count starts again after a reload, so one question is the right answer.
    await expect.poll(() => page.evaluate(() => (window as unknown as Marked).__installQuestions)).toBe(1);
    expect(errors).toEqual([]);
  });

  test('points to the Windows and Mac app, and says how to install without the button', async ({ page }) => {
    await openApp(page);
    const settings = await openSettings(page);
    await expect(settings.getByText('In Chrome or Edge, click the install icon')).toBeVisible();
    const link = settings.getByRole('link', { name: 'Get the Windows or Mac app' });
    await expect(link).toHaveAttribute('href', 'https://github.com/GhuumiRuma/soundboard/releases/tag/desktop-latest');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });
});

test.describe('installing, on an iPhone in Safari', () => {
  test.use({ viewport: PHONE, userAgent: IPHONE_SAFARI, hasTouch: true, isMobile: true });

  test('suggests the Home Screen until she says "Got it", and Settings keeps the steps', async ({ page }) => {
    const errors: string[] = [];
    await openApp(page, errors);
    const note = installNote(page);
    await expect(note).toContainText('Add Soundboard to your Home Screen to use it like an app.');
    await expect(note).not.toContainText("Your sounds won't move over by themselves.");

    // With sounds already in Safari, the note says they need a backup to move over.
    await addSound(page, 'honk.wav');
    await expect(page.getByRole('button', { name: 'Play honk' })).toBeVisible();
    await expect(note).toContainText("Your sounds won't move over by themselves.");

    await note.getByRole('button', { name: 'Got it' }).tap();
    await expect(installNote(page)).toHaveCount(0);
    await letItSave(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play honk' })).toBeVisible();
    await expect(installNote(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Settings' }).tap();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings.getByRole('heading', { name: 'Install on this device' })).toBeVisible();
    await expect(settings).toContainText('Tap the Share button');
    await expect(settings).toContainText('Add to Home Screen');
    await expect(settings.getByRole('link', { name: 'Get the Windows or Mac app' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('says nothing about installing once it is opened from the Home Screen', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }));
    await openApp(page);
    await expect(installNote(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Settings' }).tap();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings.getByText('Soundboard is installed on this device.')).toBeVisible();
    await expect(settings).not.toContainText('Tap the Share button');
  });
});

test.describe('installing, on an Android phone', () => {
  test.use({ viewport: PHONE, userAgent: ANDROID_CHROME, hasTouch: true, isMobile: true });

  test('shows the menu steps in Settings, and the Install button once the browser allows it', async ({ page }) => {
    const errors: string[] = [];
    await ignoreRealInstallOffers(page);
    await openApp(page, errors);
    await expect(installNote(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Settings' }).tap();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toContainText('Install app or Add to Home screen');
    await expect(settings.getByRole('link', { name: 'Get the Windows or Mac app' })).toHaveCount(0);
    await settings.getByRole('button', { name: 'Close' }).tap();
    await expect(settings).toBeHidden();

    await offerToInstall(page);
    await expect(installNote(page)).toContainText('Install Soundboard to open it like an app');
    expect(errors).toEqual([]);
  });
});

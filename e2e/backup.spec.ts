import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { addSound, DESKTOP, hiddenWhileTabbing, isClear, openApp, PHONE } from './helpers';

const BACKUP_NAME = /^Soundboard backup \d{4}-\d{2}-\d{2}\.zip$/;
const DAY = 24 * 60 * 60 * 1000;

/** Opens Settings and waits for it. */
async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Presses "Save a backup" in Settings and keeps the file the browser downloads at `to`. */
async function saveBackup(page: Page, to: string): Promise<void> {
  const dialog = await openSettings(page);
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Save a backup' }).click()]);
  expect(download.suggestedFilename()).toMatch(BACKUP_NAME);
  await download.saveAs(to);
}

/**
 * Somebody else's device: a clean browser with two boards ("Funny" with Honk, "Memes" with Boing),
 * which saves a backup file at `to`. The sounds are long, so a test can see them playing.
 */
async function backupFromAnotherDevice(browser: Browser, baseURL: string | undefined, to: string): Promise<void> {
  const context = await browser.newContext({ baseURL, viewport: DESKTOP });
  try {
    const page = await context.newPage();
    await openApp(page);
    await addSound(page, 'honk.wav', 4, 440);
    await page.getByLabel('Board name').fill('Funny');
    await page.getByRole('button', { name: '+ New board' }).first().click();
    await page.getByLabel('Board name').fill('Memes');
    await addSound(page, 'boing.wav', 4, 660);
    await expect(page.getByRole('button', { name: 'Play boing' })).toBeVisible();
    await saveBackup(page, to);
  } finally {
    await context.close();
  }
}

/** Presses "Restore from a backup" and picks `file`. */
async function pickBackup(page: Page, file: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    dialog.getByRole('button', { name: 'Restore from a backup' }).click(),
  ]);
  await chooser.setFiles(file);
}

const tabNames = (page: Page) => page.getByRole('tab').allInnerTexts();

/** The question she is asked about a backup she picked: "“backup.zip” has 2 boards and 2 sounds." */
const questionIn = (scope: Locator) => scope.getByRole('group', { name: /has \d+ boards? and \d+ sounds?/ });

test.describe('backup and restore, on a computer', () => {
  test.use({ viewport: DESKTOP });

  test('saves everything into one file and says when', async ({ page }, testInfo) => {
    const errors: string[] = [];
    await openApp(page, errors);
    await addSound(page, 'honk.wav');
    await addSound(page, 'boing.wav');

    const dialog = await openSettings(page);
    await expect(dialog.getByRole('heading', { name: 'Backup and restore' })).toBeVisible();
    await expect(dialog.getByText("You haven't saved a backup yet.")).toBeVisible();

    const file = testInfo.outputPath('backup.zip');
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Save a backup' }).click()]);
    expect(download.suggestedFilename()).toMatch(BACKUP_NAME);
    await download.saveAs(file);

    await expect(dialog.getByText('Saved your backup to your Downloads folder.')).toBeVisible();
    await expect(dialog.getByText('Your last backup was today.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save a backup' })).toBeEnabled();

    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const inside = bytes.toString('latin1');
    expect(inside).toContain('boards.json');
    expect(inside).toContain('README.txt');
    expect(inside.match(/sounds\//g)?.length).toBeGreaterThanOrEqual(2);

    expect(errors).toEqual([]);
  });

  test('has nothing to save until she has a sound, and says so', async ({ page }) => {
    await openApp(page);
    const dialog = await openSettings(page);
    const save = dialog.getByRole('button', { name: 'Save a backup' });
    await expect(save).toBeDisabled();
    await expect(dialog.getByText("You don't have any sounds to back up yet.")).toBeVisible();
    await expect(save).toHaveAccessibleDescription("You don't have any sounds to back up yet.");
  });

  test('puts a backup straight onto a device with no sounds, and it plays', async ({ page, browser, baseURL }, testInfo) => {
    const errors: string[] = [];
    const file = testInfo.outputPath('backup.zip');
    await backupFromAnotherDevice(browser, baseURL, file);

    await openApp(page, errors);
    await openSettings(page);
    await pickBackup(page, file);

    // No question: there was nothing here to lose.
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
    await expect(page.locator('.ss-undo')).toContainText('Restored your backup: 2 boards and 2 sounds');
    expect(await tabNames(page)).toEqual(['Funny', 'Memes']);
    await expect(page.getByRole('tab', { name: 'Funny' })).toHaveAttribute('aria-selected', 'true');

    const honk = page.getByRole('button', { name: 'Play honk' });
    await honk.click();
    await expect(honk).toHaveAttribute('data-playing', 'true');
    await page.getByRole('button', { name: 'Stop all sounds', exact: true }).click();
    await expect(honk).toHaveAttribute('data-playing', 'false');

    await page.getByRole('tab', { name: 'Memes' }).click();
    await expect(page.getByRole('button', { name: 'Play boing' })).toBeVisible();

    // It is still there, and still plays, after the page is opened again.
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Funny' })).toBeVisible();
    await page.getByRole('tab', { name: 'Memes' }).click();
    const boing = page.getByRole('button', { name: 'Play boing' });
    await boing.click();
    await expect(boing).toHaveAttribute('data-playing', 'true');
    await page.getByRole('button', { name: 'Stop all sounds', exact: true }).click();

    expect(errors).toEqual([]);
  });

  test('asks first when she already has sounds, and Add keeps hers (with the keyboard alone)', async ({ page, browser, baseURL }, testInfo) => {
    const errors: string[] = [];
    const file = testInfo.outputPath('backup.zip');
    await backupFromAnotherDevice(browser, baseURL, file);

    await openApp(page, errors);
    await addSound(page, 'quack.wav');
    const dialog = await openSettings(page);
    await pickBackup(page, file);

    const question = questionIn(dialog);
    await expect(question).toBeVisible();
    await expect(question).toHaveAccessibleName('“backup.zip” has 2 boards and 2 sounds.');
    await expect(question).toContainText('You already have sounds on this device. What should I do with these ones?');
    await expect(question).toContainText('You can undo that for a few seconds afterwards.');
    const add = question.getByRole('button', { name: 'Add them to what I have' });
    await expect(add).toBeFocused();
    // Nothing has changed yet.
    await expect(page.getByRole('button', { name: 'Play quack' })).toBeAttached();
    expect(await tabNames(page)).toEqual(['My sounds']);

    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page.locator('.ss-undo')).toContainText('Added 2 boards and 2 sounds from your backup');
    expect(await tabNames(page)).toEqual(['My sounds', 'Funny', 'Memes']);
    await expect(page.getByRole('tab', { name: 'Funny' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Play honk' })).toBeVisible();
    await page.getByRole('tab', { name: 'My sounds' }).click();
    await expect(page.getByRole('button', { name: 'Play quack' })).toBeVisible();

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await tabNames(page)).toEqual(['My sounds']);
    await expect(page.getByRole('button', { name: 'Play quack' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play honk' })).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('Replace everything swaps her sounds for the backup, and Undo gives them back', async ({ page, browser, baseURL }, testInfo) => {
    const file = testInfo.outputPath('backup.zip');
    await backupFromAnotherDevice(browser, baseURL, file);

    await openApp(page);
    await addSound(page, 'quack.wav');
    const dialog = await openSettings(page);
    await pickBackup(page, file);
    await dialog.getByRole('button', { name: 'Replace everything' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.locator('.ss-undo')).toContainText('Restored your backup: 2 boards and 2 sounds');
    expect(await tabNames(page)).toEqual(['Funny', 'Memes']);
    await expect(page.getByRole('button', { name: 'Play quack' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await tabNames(page)).toEqual(['My sounds']);
    const quack = page.getByRole('button', { name: 'Play quack' });
    await expect(quack).toBeVisible();
    await quack.click();
    await expect(quack).toHaveAttribute('data-playing', 'true');
    await page.getByRole('button', { name: 'Stop all sounds', exact: true }).click();
  });

  test('Cancel changes nothing and puts her back on the Restore button', async ({ page, browser, baseURL }, testInfo) => {
    const file = testInfo.outputPath('backup.zip');
    await backupFromAnotherDevice(browser, baseURL, file);

    await openApp(page);
    await addSound(page, 'quack.wav');
    const dialog = await openSettings(page);
    await pickBackup(page, file);
    const question = questionIn(dialog);
    await question.getByRole('button', { name: 'Cancel' }).click();

    await expect(question).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Restore from a backup' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await tabNames(page)).toEqual(['My sounds']);
    await expect(page.locator('.ss-undo')).toHaveCount(0);
  });

  test('forgets a backup she was asked about when Settings is closed', async ({ page, browser, baseURL }, testInfo) => {
    const file = testInfo.outputPath('backup.zip');
    await backupFromAnotherDevice(browser, baseURL, file);

    await openApp(page);
    await addSound(page, 'quack.wav');
    const dialog = await openSettings(page);
    await pickBackup(page, file);
    await expect(questionIn(dialog)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await openSettings(page);
    await expect(questionIn(dialog)).toHaveCount(0);
    expect(await tabNames(page)).toEqual(['My sounds']);
  });

  test('says plainly when the file is not a backup, and changes nothing', async ({ page }, testInfo) => {
    const errors: string[] = [];
    const notes = testInfo.outputPath('notes.zip');
    writeFileSync(notes, 'just some words, not a zip file at all');

    await openApp(page, errors);
    await addSound(page, 'quack.wav');
    const dialog = await openSettings(page);
    await pickBackup(page, notes);

    await expect(dialog.getByText("That doesn't look like a Soundboard backup.")).toBeVisible();
    await expect(questionIn(dialog)).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Restore from a backup' })).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await tabNames(page)).toEqual(['My sounds']);
    await expect(page.getByRole('button', { name: 'Play quack' })).toBeVisible();

    // Pop-up messages are for people, not for the console.
    expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });
});

test.describe('the backup reminder', () => {
  test.use({ viewport: DESKTOP });

  test('waits a few days, can be put off, and goes away once she has saved a backup', async ({ page }, testInfo) => {
    const start = new Date(2026, 5, 1, 12, 0, 0).getTime();
    const reminder = page.getByRole('group', { name: /Keep your sounds safe/ });
    const at = async (when: number) => {
      await page.clock.setFixedTime(new Date(when));
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Soundboard', level: 1 })).toBeVisible();
    };

    await page.clock.setFixedTime(new Date(start));
    await openApp(page);
    await expect(reminder).toHaveCount(0);
    await addSound(page, 'honk.wav');
    await expect(page.getByRole('button', { name: 'Play honk' })).toBeVisible();
    await expect(reminder).toHaveCount(0);

    // Two days in, it is still too soon to nag.
    await page.waitForTimeout(700);
    await at(start + 2 * DAY);
    await expect(page.getByRole('button', { name: 'Play honk' })).toBeVisible();
    await expect(reminder).toHaveCount(0);

    // After three days, it says so once.
    await at(start + 4 * DAY);
    await expect(reminder).toBeVisible();
    await expect(reminder).toContainText('Clearing your browser data or uninstalling the app deletes them.');

    // Not now puts it off for a week.
    await reminder.getByRole('button', { name: 'Not now' }).click();
    await expect(reminder).toHaveCount(0);
    await page.waitForTimeout(700);
    await at(start + 9 * DAY);
    await expect(page.getByRole('button', { name: 'Play honk' })).toBeVisible();
    await expect(reminder).toHaveCount(0);
    await at(start + 12 * DAY);
    await expect(reminder).toBeVisible();

    // Saving a backup from the reminder makes it go away, and it stays away for a good while.
    const [download] = await Promise.all([page.waitForEvent('download'), reminder.getByRole('button', { name: 'Save a backup' }).click()]);
    await download.saveAs(testInfo.outputPath('backup.zip'));
    await expect(reminder).toHaveCount(0);
    await page.waitForTimeout(700);
    await at(start + 20 * DAY);
    await expect(page.getByRole('button', { name: 'Play honk' })).toBeVisible();
    await expect(reminder).toHaveCount(0);
    await at(start + 12 * DAY + 15 * DAY);
    await expect(reminder).toBeVisible();
  });
});

test.describe('backup and restore, on a phone', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('works in the Settings sheet with taps', async ({ page, browser, baseURL }, testInfo) => {
    const errors: string[] = [];
    const file = testInfo.outputPath('backup.zip');
    await backupFromAnotherDevice(browser, baseURL, file);

    await openApp(page, errors);
    await addSound(page, 'quack.wav');
    await page.getByRole('button', { name: 'Settings' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Backup and restore' })).toBeVisible();

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      sheet.getByRole('button', { name: 'Restore from a backup' }).tap(),
    ]);
    await chooser.setFiles(file);

    const question = questionIn(sheet);
    await expect(question).toBeVisible();
    await expect(question.getByRole('button', { name: 'Add them to what I have' })).toBeInViewport();
    await expect(question.getByRole('button', { name: 'Replace everything' })).toBeInViewport();

    await question.getByRole('button', { name: 'Add them to what I have' }).tap();
    await expect(sheet).toBeHidden();
    await expect(page.locator('.ss-undo')).toContainText('Added 2 boards and 2 sounds from your backup');
    await expect(page.getByRole('tab', { name: 'Funny' })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('keeps every button clear of a message that is still showing', async ({ page, browser, baseURL }, testInfo) => {
    const file = testInfo.outputPath('backup.zip');
    await backupFromAnotherDevice(browser, baseURL, file);
    const notes = testInfo.outputPath('notes.zip');
    writeFileSync(notes, 'just some words, not a zip file at all');

    await openApp(page);
    await addSound(page, 'quack.wav');
    await page.getByRole('button', { name: 'Settings' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    await expect(sheet).toBeVisible();

    // A message she has not closed yet is still floating when the question comes up.
    const [wrong] = await Promise.all([
      page.waitForEvent('filechooser'),
      sheet.getByRole('button', { name: 'Restore from a backup' }).tap(),
    ]);
    await wrong.setFiles(notes);
    await expect(page.locator('.ss-problem')).toBeVisible();
    const restore = sheet.getByRole('button', { name: 'Restore from a backup' });
    await restore.scrollIntoViewIfNeeded();
    expect(await isClear(restore), 'Restore from a backup, with the message showing').toBe(true);
    const [right] = await Promise.all([page.waitForEvent('filechooser'), restore.tap()]);
    await right.setFiles(file);

    const question = questionIn(sheet);
    await expect(question).toBeVisible();
    await expect(page.locator('.ss-problem')).toBeVisible();
    for (const name of ['Add them to what I have', 'Replace everything', 'Cancel']) {
      expect(await isClear(question.getByRole('button', { name })), name).toBe(true);
    }
    expect(await hiddenWhileTabbing(page)).toEqual([]);
  });
});

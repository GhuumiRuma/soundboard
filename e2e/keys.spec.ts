import { expect, test, type Page } from '@playwright/test';
import { addSound, DESKTOP, openApp, PHONE } from './helpers';

/** A click right after a key was picked is ignored on purpose (it would be the same key press), so the test waits like a person would. */
const settle = (page: Page) => page.waitForTimeout(350);

/** The "Sound shortcut" box in the open edit card (or sheet). */
function soundBox(page: Page) {
  return page.getByRole('button', { name: /^Sound shortcut/ });
}

/** Opens the editor for a sound, clicks its shortcut box and presses the keys. Returns the box. */
async function giveKey(page: Page, soundName: string, keys: string) {
  await page.getByRole('button', { name: `Edit ${soundName}` }).click();
  const box = soundBox(page);
  await box.click();
  await page.keyboard.press(keys);
  return box;
}

test.describe('sound keys, on a computer', () => {
  test.use({ viewport: DESKTOP });

  test('picks a key for a sound, plays it with that key, and sets a Stop all key', async ({ page }) => {
    const errors: string[] = [];
    await openApp(page, errors);
    await addSound(page, 'beep.wav', 6);
    const tile = page.getByRole('button', { name: 'Play beep' });

    await page.getByRole('button', { name: 'Edit beep' }).click();
    const card = page.locator('#sound-editor');
    const box = soundBox(page);
    await expect(box).toHaveText('Not set');
    await expect(card.getByText(/makes a good sound key/)).toBeVisible();

    await box.click();
    await expect(box).toHaveText('Press the keys…');
    await expect(card.getByText('Press Escape to cancel, or Backspace to clear.')).toBeVisible();
    await page.keyboard.press('Control+Alt+Digit1');
    await expect(box).toHaveText('Ctrl + Alt + 1');
    await expect(tile).toContainText('Ctrl + Alt + 1');

    // The key works straight away, even with the box still in focus.
    await page.keyboard.press('Control+Alt+Digit1');
    await expect(tile).toHaveAttribute('data-playing', 'true');

    const stopBox = page.getByRole('button', { name: /^Stop all sounds shortcut/ });
    await expect(stopBox).toHaveText('Not set');
    await stopBox.click();
    await page.keyboard.press('Control+Alt+Digit0');
    await expect(stopBox).toHaveText('Ctrl + Alt + 0');
    await expect(page.locator('kbd.ss-kbd')).toHaveText('Ctrl + Alt + 0');

    await page.keyboard.press('Control+Alt+Digit0');
    await expect(tile).toHaveAttribute('data-playing', 'false');

    // The key is still there after the page is opened again.
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play beep' })).toContainText('Ctrl + Alt + 1');
    await page.keyboard.press('Control+Alt+Digit1');
    await expect(page.getByRole('button', { name: 'Play beep' })).toHaveAttribute('data-playing', 'true');

    expect(errors).toEqual([]);
  });

  test('stays quiet while she is typing in a box', async ({ page }) => {
    await openApp(page);
    await addSound(page, 'typed.wav', 4);
    await giveKey(page, 'typed', 'Control+Alt+Digit2');
    const tile = page.getByRole('button', { name: 'Play typed' });
    await expect(tile).toContainText('Ctrl + Alt + 2');

    await page.locator('#sound-editor').getByLabel('Name', { exact: true }).focus();
    await page.keyboard.press('Control+Alt+Digit2');
    await page.waitForTimeout(400);
    await expect(tile).toHaveAttribute('data-playing', 'false');
  });

  test('cancels with Escape, clears with Backspace, and takes no keys it should not', async ({ page }) => {
    await openApp(page);
    await addSound(page, 'tone.wav', 2);
    await page.getByRole('button', { name: 'Edit tone' }).click();
    const card = page.locator('#sound-editor');
    const box = soundBox(page);
    const status = card.locator('.hotkey-status[aria-live]');

    // Escape only cancels. It does not close the edit card.
    await box.click();
    await page.keyboard.press('Escape');
    await expect(box).toHaveText('Not set');
    await expect(card).toBeVisible();
    await settle(page);

    // Undo's key is kept for Undo.
    await box.click();
    await page.keyboard.press('Control+KeyZ');
    await expect(status).toContainText("is for Undo, so a sound can't use it");
    await expect(box).toHaveClass(/recording/);

    // A key that makes no sense as a sound key says so and keeps listening.
    await page.keyboard.press('Enter');
    await expect(status).toContainText("That key can't be used as a sound key");
    await expect(box).toHaveClass(/recording/);

    // Ctrl+Space is a fine key, and letting go of Space must not start a new recording.
    await page.keyboard.press('Control+Space');
    await expect(box).toHaveText('Ctrl + Space');
    await expect(box).not.toHaveClass(/recording/);
    await settle(page);
    await expect(box).not.toHaveClass(/recording/);

    // Backspace clears it.
    await box.click();
    await page.keyboard.press('Backspace');
    await expect(box).toHaveText('Not set');
    await expect(page.getByRole('button', { name: 'Play tone' })).toContainText('Not set');
    await settle(page);

    // A key without Ctrl or Alt is allowed, with a warning.
    await box.click();
    await page.keyboard.press('KeyQ');
    await expect(box).toHaveText('Q');
    await expect(card.locator('.hotkey-status.warn')).toBeVisible();
    await page.getByRole('button', { name: 'Clear the shortcut for Tone' }).click();
    await expect(box).toHaveText('Not set');

    // Escape with nothing being picked closes the edit card.
    await box.focus();
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
  });

  test('says when another sound already uses a key', async ({ page }) => {
    await openApp(page);
    await addSound(page, 'one.wav', 2);
    await addSound(page, 'two.wav', 2);
    await giveKey(page, 'one', 'Control+Alt+Digit1');

    await page.getByRole('button', { name: 'Edit two' }).click();
    const box = soundBox(page);
    await box.click();
    await page.keyboard.press('Control+Alt+Digit1');
    await expect(page.locator('#sound-editor .hotkey-status[aria-live]')).toHaveText('Already used by One.');
    await expect(box).toHaveClass(/recording/);

    // A different key works.
    await page.keyboard.press('Control+Alt+Digit2');
    await expect(box).toHaveText('Ctrl + Alt + 2');
  });

  test('turns every sound key off with the Sound keys switch', async ({ page }) => {
    await openApp(page);
    await addSound(page, 'quiet.wav', 4);
    await giveKey(page, 'quiet', 'Control+Alt+Digit3');
    const tile = page.getByRole('button', { name: 'Play quiet' });

    const sound = page.getByRole('switch', { name: 'Sound keys' });
    await expect(sound).toBeChecked();
    await expect(page.getByText(/work while this window is in front/)).toBeVisible();

    await sound.uncheck();
    await expect(page.getByText('Sound keys are off.')).toBeVisible();
    await page.keyboard.press('Control+Alt+Digit3');
    await page.waitForTimeout(400);
    await expect(tile).toHaveAttribute('data-playing', 'false');

    await sound.check();
    await page.keyboard.press('Control+Alt+Digit3');
    await expect(tile).toHaveAttribute('data-playing', 'true');
  });

  test('has the same sound keys switch and Stop all key in Settings', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog.getByRole('heading', { name: 'Sound keys' })).toBeVisible();
    await expect(dialog.getByRole('switch', { name: 'Sound keys' })).toBeChecked();
    await expect(dialog.getByRole('button', { name: /^Stop all sounds shortcut/ })).toHaveText('Not set');
  });
});

test.describe('sound keys, on a phone', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('Escape while picking a key does not close the edit sheet', async ({ page }) => {
    await openApp(page);
    await addSound(page, 'tap.wav', 2);
    await page.getByRole('button', { name: 'Edit tap' }).tap();
    const sheet = page.getByRole('dialog', { name: /Edit tap/i });
    await expect(sheet).toBeVisible();

    const box = soundBox(page);
    await box.tap();
    await expect(box).toHaveClass(/recording/);
    await page.keyboard.press('Escape');
    await expect(box).not.toHaveClass(/recording/);
    await expect(sheet).toBeVisible();

    // With nothing being picked, Escape closes the sheet as usual.
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });
});

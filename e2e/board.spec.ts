import { expect, test } from '@playwright/test';
import { addSound, DESKTOP, openApp, PHONE } from './helpers';

test.describe('the board, on a computer', () => {
  test.use({ viewport: DESKTOP });

  test('starts empty, adds a sound, plays it and stops it', async ({ page }) => {
    const errors: string[] = [];
    await openApp(page, errors);

    await expect(page.getByRole('heading', { name: 'Add your first sound' })).toBeVisible();

    await addSound(page, 'beep.wav', 0.5);
    const tile = page.getByRole('button', { name: 'Play beep' });
    await expect(tile).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add your first sound' })).toHaveCount(0);
    await expect(tile).toContainText('Not set');

    // It plays, shows it is playing, then settles when the sound ends.
    await tile.click();
    await expect(tile).toHaveAttribute('data-playing', 'true');
    await expect(tile).toHaveAttribute('data-playing', 'false', { timeout: 6_000 });

    // A long sound can be stopped with Stop all sounds.
    await addSound(page, 'long.wav', 8, 330);
    const long = page.getByRole('button', { name: 'Play long' });
    await long.click();
    await expect(long).toHaveAttribute('data-playing', 'true');
    await page.getByRole('button', { name: 'Stop all sounds', exact: true }).click();
    await expect(long).toHaveAttribute('data-playing', 'false');

    expect(errors).toEqual([]);
  });

  test('keeps the sounds after the page is opened again', async ({ page }) => {
    await openApp(page);
    await addSound(page, 'kept.wav');
    await expect(page.getByRole('button', { name: 'Play kept' })).toBeVisible();
    // Give the page a moment to save, then open it again.
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play kept' })).toBeVisible();
  });

  test('edits a sound: name, emoji, colour, volume, and takes it back with Undo', async ({ page }) => {
    await openApp(page);
    await addSound(page, 'honk.wav');
    await page.getByRole('button', { name: 'Edit honk' }).click();

    const card = page.locator('#sound-editor');
    await expect(card).toBeVisible();
    await expect(page.getByRole('region', { name: /Edit honk/i })).toBeVisible();

    const name = card.getByLabel('Name', { exact: true });
    await name.fill('Big honk');
    await expect(page.getByRole('button', { name: 'Play Big honk' })).toBeVisible();

    await card.getByRole('radio', { name: '🎺' }).click();
    await expect(page.getByRole('button', { name: 'Play Big honk' })).toContainText('🎺');

    await card.getByRole('radio', { name: 'Pink' }).click();
    await expect(card.getByRole('radio', { name: 'Pink' })).toHaveAttribute('aria-checked', 'true');

    const volume = card.getByLabel('Volume');
    await expect(volume).toHaveValue('80');
    await volume.fill('35');
    await expect(card).toContainText('35%');

    await card.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('button', { name: 'Play Big honk' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('button', { name: 'Play Big honk' })).toBeVisible();
  });

  test('makes boards, moves a sound between them and keeps at least one', async ({ page }) => {
    await openApp(page);
    await addSound(page, 'one.wav');

    const delBoard = page.getByRole('button', { name: 'Delete board' });
    await expect(delBoard).toBeDisabled();

    await page.getByRole('button', { name: '+ New board' }).first().click();
    const boardName = page.getByLabel('Board name');
    await expect(boardName).toBeFocused();
    await boardName.fill('Memes');
    await expect(page.getByRole('tab', { name: 'Memes' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Add your first sound' })).toBeVisible();

    await page.getByRole('tab', { name: 'My sounds' }).click();
    await page.getByRole('button', { name: 'Edit one' }).click();
    const card = page.locator('#sound-editor');
    await card.getByLabel('Move to board').selectOption({ label: 'Memes' });
    await card.getByRole('button', { name: 'Move' }).click();
    await expect(page.getByRole('button', { name: 'Play one' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Memes' }).click();
    await expect(page.getByRole('button', { name: 'Play one' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete board' }).click();
    await expect(page.getByRole('tab', { name: 'Memes' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('tab', { name: 'Memes' })).toBeVisible();
  });

  test('works with the keyboard alone', async ({ page }) => {
    await openApp(page);
    await addSound(page, 'key.wav', 4);
    const tile = page.getByRole('button', { name: 'Play key' });
    await tile.focus();
    await page.keyboard.press('Enter');
    await expect(tile).toHaveAttribute('data-playing', 'true');
    await page.getByRole('button', { name: 'Stop all sounds', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(tile).toHaveAttribute('data-playing', 'false');

    await page.getByRole('button', { name: 'Edit key' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: /Edit key/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit key' })).toBeFocused();
  });

  test('accepts a file dropped on the page and says why a wrong file is refused', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(50)], 'notes.txt', { type: 'text/plain' }));
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await expect(page.getByText(/notes\.txt: That file type isn't supported/)).toBeVisible();
  });
});

test.describe('the board, on a phone', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('has the bottom bar and opens the editor as a sheet', async ({ page }) => {
    const errors: string[] = [];
    await openApp(page, errors);
    await expect(page.getByRole('button', { name: 'Stop all sounds', exact: true })).toBeVisible();
    await addSound(page, 'tap.wav', 3);

    const tile = page.getByRole('button', { name: 'Play tap' });
    await tile.tap();
    await expect(tile).toHaveAttribute('data-playing', 'true');
    await page.getByRole('button', { name: 'Stop all sounds', exact: true }).tap();
    await expect(tile).toHaveAttribute('data-playing', 'false');

    await page.getByRole('button', { name: 'Edit tap' }).tap();
    const sheet = page.getByRole('dialog', { name: /Edit tap/i });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Close' }).tap();
    await expect(sheet).toBeHidden();

    expect(errors).toEqual([]);
  });
});

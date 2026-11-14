import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { addSound, addSounds, dropNotASound, openApp, openSettings, PHONE, SIZES, SOUND_FILES, smallTouchTargets } from './helpers';
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
} from './install';
import { test } from './site';

const SCHEMES = ['dark', 'light'] as const;

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/**
 * Looks at the screen the way a screen reader and a checker for colours, names and sizes would, and fails with a
 * plain list of what it found. Nothing is skipped: a small problem counts as much as a big one. On a touch screen it
 * also checks that every button is big enough for a finger. The test carries on after a finding, so one run lists
 * everything that needs fixing.
 */
async function scan(page: Page, where: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const found = violations.map((violation) => {
    const places = violation.nodes
      .slice(0, 5)
      .map((node) => `    ${node.target.join(' ')}  ->  ${node.html.replace(/\s+/g, ' ').slice(0, 140)}\n      ${(node.failureSummary ?? '').replace(/\s+/g, ' ')}`);
    return `${violation.impact} - ${violation.id}: ${violation.help}\n${places.join('\n')}`;
  });
  expect.soft(found, `Problems found on ${where}`).toEqual([]);

  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
    expect.soft(await smallTouchTargets(page), `Buttons too small for a finger on ${where}`).toEqual([]);
  }
}

for (const size of SIZES) {
  for (const scheme of SCHEMES) {
    test.describe(`on a ${size.name}, ${scheme} theme`, () => {
      test.use({ ...size.use, colorScheme: scheme, reducedMotion: 'reduce' });

      test('every screen passes the accessibility checks', async ({ page }, testInfo) => {
        test.setTimeout(120_000);
        const errors: string[] = [];
        await openApp(page, errors);
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
        await scan(page, 'an empty board');

        await addSounds(page, SOUND_FILES);
        await expect(page.getByRole('button', { name: 'Play tada' })).toBeVisible();
        await scan(page, 'a board full of sounds');

        await addSound(page, 'long.wav', 6, 330);
        const long = page.getByRole('button', { name: 'Play long' });
        await long.click();
        await expect(long).toHaveAttribute('data-playing', 'true');
        await scan(page, 'a sound that is playing');
        await page.getByRole('button', { name: 'Stop all sounds', exact: true }).click();
        await expect(long).toHaveAttribute('data-playing', 'false');

        // A card under the buttons on a tablet or computer, a sheet from the bottom on a phone.
        await page.getByRole('button', { name: 'Edit honk' }).click();
        const editor = page.getByRole(size.phone ? 'dialog' : 'region', { name: /Edit honk/i });
        await expect(editor).toBeVisible();
        await scan(page, 'the edit card');
        await page.keyboard.press('Escape');
        await expect(editor).toBeHidden();

        // With a second board there is a row of tabs to choose from, and the edit card can move a sound across.
        await page.getByRole('button', { name: '+ New board' }).click();
        await expect(page.getByRole('tab', { name: 'New board' })).toHaveAttribute('aria-selected', 'true');
        await scan(page, 'two boards, the new one still empty');
        await page.getByRole('tab', { name: 'My sounds' }).click();
        await page.getByRole('button', { name: 'Edit honk' }).click();
        await expect(editor.getByLabel('Move to board')).toBeVisible();
        await scan(page, 'the edit card with a second board to move to');
        await page.keyboard.press('Escape');
        await expect(editor).toBeHidden();

        const settings = await openSettings(page);
        await scan(page, 'Settings');
        const [download] = await Promise.all([page.waitForEvent('download'), settings.getByRole('button', { name: 'Save a backup' }).click()]);
        const backup = testInfo.outputPath('backup.zip');
        await download.saveAs(backup);
        await expect(settings.getByText('Your last backup was today.')).toBeVisible();
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), settings.getByRole('button', { name: 'Restore from a backup' }).click()]);
        await chooser.setFiles(backup);
        const question = settings.getByRole('group', { name: /has \d+ boards? and \d+ sounds?/ });
        await expect(question).toBeVisible();
        await scan(page, 'the question about a backup');
        await question.getByRole('button', { name: 'Cancel' }).click();
        await settings.getByRole('button', { name: 'Close' }).click();
        await expect(settings).toBeHidden();

        await page.getByRole('button', { name: 'Record', exact: true }).click();
        const recorder = page.getByRole('dialog', { name: 'Record a sound' });
        await expect(recorder).toBeVisible();
        const record = recorder.getByRole('button', { name: 'Record', exact: true });
        await expect(record).toBeEnabled();
        await scan(page, 'the recorder');
        await record.click();
        await expect(recorder.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
        await scan(page, 'the recorder while it is recording');
        await page.waitForTimeout(2500);
        await recorder.getByRole('button', { name: 'Stop', exact: true }).click();
        await expect(recorder.getByRole('button', { name: 'Record again' })).toBeVisible();
        await scan(page, 'a recording that is ready to cut');
        await recorder.getByRole('button', { name: 'Save sound' }).click();
        await expect(recorder).toBeHidden();
        await expect(page.getByText('Added “My recording” to My sounds.')).toBeVisible();
        await scan(page, 'the Undo bar');

        await dropNotASound(page);
        await expect(page.getByText(/notes\.txt: That file type isn't supported/)).toBeVisible();
        await scan(page, 'a message about a problem');

        expect(errors).toEqual([]);
      });

      test.describe('the notes at the top', () => {
        test.use({ userAgent: size.phone ? ANDROID_CHROME : WINDOWS_CHROME });

        test('the new-version and install notes pass the accessibility checks', async ({ page, site }) => {
          const errors: string[] = [];
          await ignoreRealInstallOffers(page);
          await openWithOfflineCopy(page, errors);
          await lookForNewVersion(page, site);
          await expect(newVersionNote(page)).toBeVisible();
          await offerToInstall(page);
          await expect(installNote(page)).toBeVisible();
          await scan(page, 'the new-version and install notes');
          expect(errors).toEqual([]);
        });
      });
    });
  }
}

for (const scheme of SCHEMES) {
  test.describe(`on an iPhone, ${scheme} theme`, () => {
    test.use({ viewport: PHONE, hasTouch: true, isMobile: true, userAgent: IPHONE_SAFARI, colorScheme: scheme, reducedMotion: 'reduce' });

    test('the Home Screen suggestion passes the accessibility checks', async ({ page }) => {
      const errors: string[] = [];
      await openApp(page, errors);
      await expect(installNote(page)).toContainText('Add Soundboard to your Home Screen');
      await scan(page, 'the Home Screen suggestion');

      const settings = await openSettings(page);
      await expect(settings).toContainText('Add to Home Screen');
      await scan(page, 'Settings on an iPhone');
      expect(errors).toEqual([]);
    });
  });
}

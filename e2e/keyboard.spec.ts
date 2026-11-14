import { expect, type Page } from '@playwright/test';
import { addSound, addSounds, DESKTOP, dropNotASound, openApp, openSettings, PHONE, SIZES, SOUND_FILES, tabStops, type TabStop } from './helpers';
import {
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
/** Sounds are named after their file, with a capital letter: honk.wav becomes "Honk". */
const NAMES = SOUND_FILES.map((file) => file.replace('.wav', '')).map((name) => name[0].toUpperCase() + name.slice(1));
const DAY = 24 * 60 * 60 * 1000;
/** A tablet lays the page out like a computer, so the checks that depend on the layout only need a phone and a computer. */
const PHONE_AND_COMPUTER = SIZES.filter((size) => size.name !== 'tablet');

/** The sounds from SOUND_FILES, saved, and the page opened again so the keyboard cursor starts at the very top. */
async function fullBoardFromTheTop(page: Page): Promise<void> {
  await openApp(page);
  await addSounds(page, SOUND_FILES);
  await expect(page.getByRole('button', { name: 'Play tada' })).toBeVisible();
  // Saving takes a moment; opening the page again straight away would lose the last sounds.
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play tada' })).toBeVisible();
}

/**
 * Presses Shift+Tab and says whether the keyboard cursor stayed inside the open pop-up. At the very first control the
 * browser keeps one press for itself, so a press that leaves the cursor nowhere is not counted.
 */
async function backwardsStaysInside(page: Page): Promise<boolean> {
  for (let press = 0; press < 3; press++) {
    await page.keyboard.press('Shift+Tab');
    if ((await page.locator(':focus').count()) === 0) continue;
    return page.evaluate(() => !!document.querySelector('dialog[open]')?.contains(document.activeElement));
  }
  return false;
}

/** True when the keyboard cursor is on a real control, not lost at the top of the page. */
const cursorIsOnAControl = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    return !!active && active !== document.body && active !== document.documentElement;
  });

/** After a message goes away, the keyboard cursor must land on something she can see, not vanish. */
async function expectCursorKept(page: Page, what: string): Promise<void> {
  await expect.poll(() => cursorIsOnAControl(page), { message: `${what}: the keyboard cursor was lost` }).toBe(true);
  await expect(page.locator(':focus').first()).toBeVisible();
}

/** The Tab stops that fail one of the checks, in words, so a failure says exactly which control and why. */
function problemsWith(stops: TabStop[]): string[] {
  return stops.flatMap((stop) => {
    const found: string[] = [];
    if (!stop.clear) found.push(`${stop.label} is hidden under something else`);
    if (stop.ring === 0) found.push(`${stop.label} shows no ring`);
    else if (stop.ring < 3) found.push(`${stop.label} has a ring that is too faint (${stop.ring.toFixed(1)} to 1, it needs 3)`);
    if (stop.leaked) found.push(`${stop.label} is outside the pop-up that should keep the cursor in`);
    return found;
  });
}

for (const size of SIZES) {
  test.describe(`using only the keyboard, on a ${size.name}`, () => {
    test.use({ ...size.use, reducedMotion: 'reduce' });

    test('the first Tab offers to skip to the sounds', async ({ page }) => {
      await fullBoardFromTheTop(page);

      await page.keyboard.press('Tab');
      const skip = page.getByRole('link', { name: 'Skip to your sounds' });
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport({ ratio: 1 });

      await page.keyboard.press('Enter');
      await expect(page.locator('#board-panel')).toBeFocused();
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.getElementById('board-panel')?.contains(document.activeElement))).toBe(true);
    });

    for (const scheme of SCHEMES) {
      test.describe(`${scheme} theme`, () => {
        test.use({ colorScheme: scheme });

        test('Tab reaches every sound and every Edit button, and shows where it is', async ({ page }) => {
          await fullBoardFromTheTop(page);

          const stops = await tabStops(page, 120);
          const labels = stops.map((stop) => stop.label);
          expect(stops.length, 'a whole page of Tab stops').toBeGreaterThan(20);
          expect(labels[0], 'the first stop').toBe('a "Skip to your sounds"');
          for (const name of NAMES) {
            const at = labels.indexOf(`button "Play ${name}, Not set"`);
            expect(at, `a Tab stop for ${name}`).toBeGreaterThanOrEqual(0);
            expect(labels[at + 1], `Edit comes right after ${name}`).toBe(`button "Edit ${name}"`);
          }
          expect(problemsWith(stops)).toEqual([]);
        });
      });
    }

    test('a pop-up keeps the keyboard inside it, and Escape gives it back', async ({ page }) => {
      test.setTimeout(60_000);
      await openApp(page);
      await addSound(page, 'honk.wav');
      await expect(page.getByRole('button', { name: 'Play honk' })).toBeVisible();

      const inside = (name: string | RegExp) => page.getByRole('dialog', { name });
      // Each pop-up is waiting for something in it to show up, so the walk below sees all of it.
      const popups = [
        { name: 'Settings', opener: page.getByRole('button', { name: 'Settings' }), dialog: inside('Settings'), ready: inside('Settings').getByRole('heading', { name: 'Sound keys' }) },
        {
          name: 'Record a sound',
          opener: page.getByRole('button', { name: 'Record', exact: true }),
          dialog: inside('Record a sound'),
          // The Record button is on screen but switched off until the microphone has woken up.
          ready: inside('Record a sound').getByRole('button', { name: 'Record' }),
        },
        // On a tablet or computer the edit card sits on the page, so only a phone has a pop-up for it.
        ...(size.phone
          ? [
              {
                name: 'the edit sheet',
                opener: page.getByRole('button', { name: 'Edit honk' }),
                dialog: inside(/Edit honk/i),
                ready: inside(/Edit honk/i).getByRole('button', { name: 'Delete', exact: true }),
              },
            ]
          : []),
      ];

      for (const popup of popups) {
        await popup.opener.focus();
        await page.keyboard.press('Enter');
        await expect(popup.dialog).toBeVisible();
        await expect(popup.ready).toBeVisible();
        await expect(popup.ready).toBeEnabled();

        const stops = await tabStops(page, 60);
        expect(stops.length, `${popup.name}: Tab stops`).toBeGreaterThan(1);
        expect(problemsWith(stops), popup.name).toEqual([]);

        // Backwards from the start goes round the other way, still inside.
        expect(await backwardsStaysInside(page), `${popup.name}: Shift+Tab`).toBe(true);

        await page.keyboard.press('Escape');
        await expect(popup.dialog, `${popup.name}: Escape`).toBeHidden();
        await expect(popup.opener, `${popup.name}: the cursor goes back where it was`).toBeFocused();
      }
    });
  });
}

for (const size of PHONE_AND_COMPUTER) {
  test.describe(`a message that goes away, on a ${size.name}`, () => {
    test.use({ ...size.use, reducedMotion: 'reduce' });

    test('closing a problem message keeps the keyboard cursor', async ({ page }) => {
      await openApp(page);
      await addSound(page, 'honk.wav');
      await expect(page.getByRole('button', { name: 'Play honk' })).toBeVisible();

      await dropNotASound(page);
      const problem = page.locator('.ss-problem');
      await expect(problem).toBeVisible();
      const close = problem.getByRole('button', { name: 'Dismiss message' });
      await close.focus();
      await page.keyboard.press('Enter');
      await expect(problem).toHaveCount(0);
      await expectCursorKept(page, 'Dismiss message');
    });

    test('dismissing or using the Undo bar keeps the keyboard cursor', async ({ page }) => {
      await openApp(page);
      await addSounds(page, ['honk.wav', 'boing.wav']);
      await expect(page.getByRole('button', { name: 'Play boing' })).toBeVisible();

      const editor = page.getByRole(size.phone ? 'dialog' : 'region', { name: /Edit honk/i });
      const bar = page.locator('.ss-undo');
      const deleteHonk = async () => {
        await page.getByRole('button', { name: 'Edit honk' }).focus();
        await page.keyboard.press('Enter');
        await expect(editor).toBeVisible();
        await editor.getByRole('button', { name: 'Delete', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(bar).toBeVisible();
        await expect(page.getByRole('button', { name: 'Play honk' })).toHaveCount(0);
      };

      await deleteHonk();
      await page.getByRole('button', { name: 'Dismiss', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(bar).toHaveCount(0);
      await expectCursorKept(page, 'Dismiss on the Undo bar');
      await expect(page.getByRole('button', { name: 'Play honk' })).toHaveCount(0);

      // Her other choice on that bar, Undo, hands the cursor on too.
      await addSound(page, 'honk.wav');
      await deleteHonk();
      await bar.getByRole('button', { name: 'Undo', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Play honk' })).toBeVisible();
      await expect(bar).toHaveCount(0);
      await expectCursorKept(page, 'Undo');
    });

    test('putting off the backup reminder keeps the keyboard cursor', async ({ page }) => {
      const start = new Date(2026, 5, 1, 12, 0, 0).getTime();
      const reminder = page.getByRole('group', { name: /Keep your sounds safe/ });

      await page.clock.setFixedTime(new Date(start));
      await openApp(page);
      await addSound(page, 'honk.wav');
      await expect(page.getByRole('button', { name: 'Play honk' })).toBeVisible();
      await page.waitForTimeout(700);
      await page.clock.setFixedTime(new Date(start + 4 * DAY));
      await page.reload();
      await expect(reminder).toBeVisible();

      await reminder.getByRole('button', { name: 'Not now' }).focus();
      await page.keyboard.press('Enter');
      await expect(reminder).toHaveCount(0);
      await expectCursorKept(page, 'Not now');
    });
  });
}

test.describe('the notes at the top, on a computer', () => {
  test.use({ viewport: DESKTOP, userAgent: WINDOWS_CHROME, reducedMotion: 'reduce' });

  test('"Later" on the new-version note keeps the keyboard cursor', async ({ page, site }) => {
    await openWithOfflineCopy(page);
    await lookForNewVersion(page, site);
    await expect(newVersionNote(page)).toBeVisible();

    await newVersionNote(page).getByRole('button', { name: 'Later' }).focus();
    await page.keyboard.press('Enter');
    await expect(newVersionNote(page)).toHaveCount(0);
    await expectCursorKept(page, 'Later');
  });

  test('"No thanks" on the install note keeps the keyboard cursor', async ({ page }) => {
    await ignoreRealInstallOffers(page);
    await openApp(page);
    await offerToInstall(page);
    await expect(installNote(page)).toBeVisible();

    await installNote(page).getByRole('button', { name: 'No thanks' }).focus();
    await page.keyboard.press('Enter');
    await expect(installNote(page)).toHaveCount(0);
    await expectCursorKept(page, 'No thanks');
  });
});

test.describe('the Home Screen suggestion, on an iPhone', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true, userAgent: IPHONE_SAFARI, reducedMotion: 'reduce' });

  test('"Got it" keeps the keyboard cursor', async ({ page }) => {
    await openApp(page);
    await expect(installNote(page)).toBeVisible();

    await installNote(page).getByRole('button', { name: 'Got it' }).focus();
    await page.keyboard.press('Enter');
    await expect(installNote(page)).toHaveCount(0);
    await expectCursorKept(page, 'Got it');
  });
});

/**
 * Everything on screen, and in the open pop-up, that is set to slide, fade, bounce or scroll smoothly for longer
 * than a blink. Someone who asked her phone or computer for less movement should get none of it.
 */
const moving = (page: Page) =>
  page.evaluate(() => {
    const blink = 0.01;
    // Computed times are always in seconds, like "0.14s".
    const longest = (list: string) => Math.max(0, ...list.split(',').map((time) => parseFloat(time) || 0));
    const found: string[] = [];
    for (const el of document.querySelectorAll('*')) {
      const parts = el instanceof HTMLDialogElement ? [null, '::before', '::after', '::backdrop'] : [null, '::before', '::after'];
      for (const part of parts) {
        const style = getComputedStyle(el, part);
        if (part && part !== '::backdrop' && style.content === 'none') continue;
        const slides = style.transitionProperty !== 'none' && longest(style.transitionDuration) > blink;
        const animates = style.animationName !== 'none' && longest(style.animationDuration) > blink;
        if (slides || animates || style.scrollBehavior === 'smooth') {
          const kind = [slides && `slides for ${style.transitionDuration}`, animates && `animates "${style.animationName}"`, style.scrollBehavior === 'smooth' && 'scrolls smoothly']
            .filter(Boolean)
            .join(' and ');
          found.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}${part ?? ''} ${kind}`);
        }
      }
    }
    return found;
  });

for (const size of PHONE_AND_COMPUTER) {
  test.describe(`reduced motion, on a ${size.name}`, () => {
    test.use({ ...size.use, reducedMotion: 'reduce' });

    test('nothing slides, fades or bounces for someone who asked for less movement', async ({ page }) => {
      test.setTimeout(90_000);
      await openApp(page);
      await addSound(page, 'honk.wav');
      await addSound(page, 'long.wav', 6, 330);
      const long = page.getByRole('button', { name: 'Play long' });
      await expect(long).toBeVisible();

      await long.click();
      await expect(long).toHaveAttribute('data-playing', 'true');
      expect.soft(await moving(page), 'a sound that is playing').toEqual([]);
      await expect(long.locator('.sound-bars i').first()).toHaveCSS('animation-name', 'none');
      await page.getByRole('button', { name: 'Stop all sounds', exact: true }).click();

      await page.getByRole('button', { name: 'Edit honk' }).click();
      await expect(page.getByRole(size.phone ? 'dialog' : 'region', { name: /Edit honk/i })).toBeVisible();
      expect.soft(await moving(page), 'the edit card').toEqual([]);
      await page.keyboard.press('Escape');

      await openSettings(page);
      expect.soft(await moving(page), 'Settings').toEqual([]);
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Record', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Record a sound' })).toBeVisible();
      expect.soft(await moving(page), 'the recorder').toEqual([]);
    });
  });
}

test.describe('normal motion, on a computer', () => {
  test.use({ viewport: DESKTOP, reducedMotion: 'no-preference' });

  test('the checks above can tell the difference', async ({ page }) => {
    await openApp(page);
    await addSound(page, 'long.wav', 6, 330);
    const long = page.getByRole('button', { name: 'Play long' });
    await long.click();
    await expect(long).toHaveAttribute('data-playing', 'true');

    expect(await moving(page)).toEqual(expect.arrayContaining([expect.stringContaining('sound-tile')]));
    await expect(long).toHaveCSS('transition-duration', /^0\.14s/);
    await expect(long.locator('.sound-bars i').first()).not.toHaveCSS('animation-name', 'none');
  });
});

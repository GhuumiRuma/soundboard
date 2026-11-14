import { expect, type Page } from '@playwright/test';
import { openApp } from './helpers';
import type { Site } from './site';

/** What each kind of device calls itself, so a test can be an iPhone, an Android phone or a Windows computer. */
export const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
export const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
export const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export type Marked = Window & { __stillHere?: boolean; __installQuestions?: number };

const heading = (page: Page) => page.getByRole('heading', { name: 'Soundboard', level: 1 });

export const newVersionNote = (page: Page) => page.getByRole('status').filter({ hasText: 'A new version of Soundboard is ready.' });
export const installNote = (page: Page) => page.getByRole('group', { name: 'Install Soundboard' });

/** Opens Soundboard, waits for its offline copy to be ready, then opens it again so that copy is in charge of the page. */
export async function openWithOfflineCopy(page: Page, errors: string[] = []) {
  await openApp(page, errors);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect(heading(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

/** Hands out a newer version, then asks the browser to look for it, which it also does by itself every hour. */
export async function lookForNewVersion(page: Page, site: Site) {
  site.publishNewVersion();
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });
}

/**
 * Pretends the browser has just said "this can be installed". Calls to the browser's own install question are
 * counted in window.__installQuestions. Returns true when Soundboard kept the browser's own pop-up away.
 */
export function offerToInstall(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const marked = window as unknown as Marked;
    marked.__installQuestions ??= 0;
    const offer = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    offer.prompt = async () => {
      marked.__installQuestions = (marked.__installQuestions ?? 0) + 1;
    };
    offer.userChoice = Promise.resolve({ outcome: 'accepted' });
    return !window.dispatchEvent(offer);
  });
}

/** Keeps the real "can be installed" event of the test browser out of the way, so only the pretend ones count. */
export async function ignoreRealInstallOffers(page: Page) {
  await page.addInitScript(() => {
    window.addEventListener(
      'beforeinstallprompt',
      (event) => {
        if (event.isTrusted) event.stopImmediatePropagation();
      },
      true,
    );
  });
}

import { expect, type Page } from '@playwright/test';

export const PHONE = { width: 390, height: 844 };
export const TABLET = { width: 820, height: 1180 };
export const DESKTOP = { width: 1280, height: 800 };

/** A short beep made from nothing, so no real recording is ever needed. 16-bit mono WAV. */
export function makeWav(seconds = 0.6, hz = 440, rate = 22050): Buffer {
  const samples = Math.round(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const fade = Math.min(1, i / 200, (samples - i) / 200);
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 0.5 * 32767 * fade), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Opens the app fresh, with no sounds saved yet, and collects anything printed as an error. */
export async function openApp(page: Page, errors: string[] = []): Promise<void> {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Soundboard', level: 1 })).toBeVisible();
}

/** The button that opens the "pick a file" box: the bottom bar on a phone, the drop zone on a bigger screen. */
export function addButton(page: Page) {
  const width = page.viewportSize()?.width ?? DESKTOP.width;
  return width < 720 ? page.getByRole('button', { name: /Add$/ }) : page.getByRole('button', { name: 'Add sounds', exact: true });
}

/** Adds a generated sound the way she would: press Add, choose a file. */
export async function addSound(page: Page, fileName: string, seconds = 0.6, hz = 440): Promise<void> {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), addButton(page).click()]);
  await chooser.setFiles({ name: fileName, mimeType: 'audio/wav', buffer: makeWav(seconds, hz) });
}

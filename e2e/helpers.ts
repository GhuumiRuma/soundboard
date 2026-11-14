import { expect, type Locator, type Page } from '@playwright/test';

export const PHONE = { width: 390, height: 844 };
export const TABLET = { width: 820, height: 1180 };
export const DESKTOP = { width: 1280, height: 800 };

/** The three screens Soundboard is checked on: a phone, an iPad and a computer. A phone and an iPad have a touch screen. */
export const SIZES = [
  { name: 'phone', phone: true, use: { viewport: PHONE, hasTouch: true, isMobile: true } },
  { name: 'tablet', phone: false, use: { viewport: TABLET, hasTouch: true, isMobile: true } },
  { name: 'computer', phone: false, use: { viewport: DESKTOP } },
] as const;

/** Eight short sounds, so every colour in the palette is on the board and a phone has to scroll. */
export const SOUND_FILES = ['honk', 'boing', 'quack', 'ding', 'buzz', 'pop', 'whoosh', 'tada'].map((name) => `${name}.wav`);

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

/** Adds several short sounds at once, the way she would by choosing more than one file. */
export async function addSounds(page: Page, fileNames: string[]): Promise<void> {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), addButton(page).click()]);
  await chooser.setFiles(fileNames.map((name, i) => ({ name, mimeType: 'audio/wav', buffer: makeWav(0.4, 330 + i * 55) })));
}

/** Opens Settings and waits for it. */
export async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Drops a text file onto the page, which is not a sound, so a message about the problem appears. */
export async function dropNotASound(page: Page): Promise<void> {
  await page.evaluate(() => {
    const files = new DataTransfer();
    files.items.add(new File([new Uint8Array(50)], 'notes.txt', { type: 'text/plain' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: files, bubbles: true, cancelable: true }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: files, bubbles: true, cancelable: true }));
  });
}

/** True when nothing is drawn over the middle of the element, so a tap or a click would reach it. */
export function isClear(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    if (top === el || el.contains(top)) return true;
    // A switch or radio is often drawn by its label, which is what a tap really reaches.
    const label = el.closest('label');
    return !!top && !!label && label.contains(top);
  });
}

/**
 * Presses Tab through whatever is open, up to `limit` times, and returns a description of every focused
 * control that was hidden under something else (a pop-up message, say). An empty list is a pass.
 */
export async function hiddenWhileTabbing(page: Page, limit = 40): Promise<string[]> {
  const stops = await tabStops(page, limit);
  return stops.filter((stop) => !stop.clear).map((stop) => stop.label);
}

/**
 * Lists every control on screen (or in the open pop-up) that a finger could easily miss: smaller than `minimum`
 * pixels across or down. What counts is the area a tap really reaches: the label drawn around a switch or a round
 * choice, or the bigger tap area some small buttons have. An empty list is a pass.
 */
export function smallTouchTargets(page: Page, minimum = 44): Promise<string[]> {
  return page.evaluate((min) => {
    const controls =
      'button, a[href], select, textarea, summary, input:not([type="hidden"]):not([type="file"]), [role="tab"], [role="radio"], [role="switch"], [role="checkbox"], [role="slider"]';
    const root = document.querySelector('dialog[open]') ?? document.body;
    const found: string[] = [];
    for (const control of root.querySelectorAll<HTMLElement>(controls)) {
      // The "Skip to your sounds" link only shows for someone using a keyboard.
      if (control.closest('.skip-link') || !control.checkVisibility()) continue;
      const choice = control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio');
      const target = (choice && control.closest('label')) || control;
      const box = target.getBoundingClientRect();
      let width = box.width;
      let height = box.height;
      for (const part of ['::before', '::after']) {
        const style = getComputedStyle(target, part);
        if (style.content !== 'none' && style.position === 'absolute') {
          width = Math.max(width, parseFloat(style.width) || 0);
          height = Math.max(height, parseFloat(style.height) || 0);
        }
      }
      if (width < min - 0.5 || height < min - 0.5) {
        const name = (control.getAttribute('aria-label') ?? control.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
        found.push(`${control.tagName.toLowerCase()} "${name}" is only ${Math.round(width)} x ${Math.round(height)}`);
      }
    }
    return found;
  }, minimum);
}

export interface TabStop {
  /** What got the keyboard cursor, in words: its kind and its name. */
  label: string;
  /** Nothing is drawn over the middle of it, so a click or a tap would reach it. */
  clear: boolean;
  /** How well the ring that marks it stands out from what is around it, from 1 (invisible) to 21. 0 means no ring at all. */
  ring: number;
  /** A pop-up is open, yet this control is outside it: the pop-up did not keep the cursor in. */
  leaked: boolean;
}

/** Where the ring that marks the keyboard cursor is drawn, in screen pixels. */
interface Ring {
  box: { x: number; y: number; width: number; height: number };
  /** How far the ring floats away from that box, and how thick it is. */
  offset: number;
  thickness: number;
  screen: { width: number; height: number };
}

/**
 * Presses Tab through whatever is open, at most `limit` times, and writes down every control that got the keyboard
 * cursor, in order. It stops when the cursor comes round to where it started. Turn reduced motion on first, so
 * nothing is still sliding when the ring is looked at.
 */
export async function tabStops(page: Page, limit = 80): Promise<TabStop[]> {
  const stops: TabStop[] = [];
  let start = '';
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus').first();
    // Leaving the end of a pop-up hands the cursor to the browser itself for one press.
    if ((await focused.count()) === 0) continue;
    const seen = await focused.evaluate((el) => {
      // A hidden round choice or switch shows its ring on the label drawn next to it.
      const drawsRing = (target: Element | null): target is Element => {
        if (!target) return false;
        const style = getComputedStyle(target);
        return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
      };
      const bearer = [el, el.nextElementSibling].find(drawsRing);
      let ring: Ring | null = null;
      if (bearer) {
        const style = getComputedStyle(bearer);
        const { x, y, width, height } = bearer.getBoundingClientRect();
        ring = {
          box: { x, y, width, height },
          offset: parseFloat(style.outlineOffset) || 0,
          thickness: parseFloat(style.outlineWidth),
          screen: { width: window.innerWidth, height: window.innerHeight },
        };
      }

      const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
      const named = (el.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
      const labelled = Array.from((el as HTMLInputElement).labels ?? [])
        .map((label) => label.textContent)
        .join(' ');
      const name =
        clean(el.getAttribute('aria-label')) ||
        clean(named) ||
        clean(labelled) ||
        clean(el.textContent) ||
        clean(el.getAttribute('placeholder')) ||
        clean(el.getAttribute('title'));

      const popup = document.querySelector('dialog[open]');
      const where: number[] = [];
      for (let node: Element | null = el; node?.parentElement; node = node.parentElement) {
        where.unshift(Array.prototype.indexOf.call(node.parentElement.children, node));
      }
      return { label: `${el.tagName.toLowerCase()} "${name.slice(0, 50)}"`, ring, leaked: !!popup && !popup.contains(el), where: where.join('.') };
    });
    if (stops.length === 0) start = seen.where;
    else if (seen.where === start) break;
    stops.push({ label: seen.label, clear: await isClear(focused), ring: await ringStrength(page, seen.ring), leaked: seen.leaked });
  }
  return stops;
}

/**
 * How well the ring around the keyboard cursor stands out, from 1 (you can't see it) up to 21. It takes two small
 * pictures of the same spot, one as it is and one with every ring switched off, and compares the middle of the ring
 * with the same place in the other picture, on all four sides. A ring that is too pale, hidden under something, or
 * cut off by the edge of a scrolling strip scores low. A ring that is not drawn at all scores 0.
 */
async function ringStrength(page: Page, ring: Ring | null): Promise<number> {
  if (!ring) return 0;
  const { box, offset, thickness, screen } = ring;
  // How far out from the control's edge the middle of the ring is. A ring drawn inside the control is below zero.
  const middle = offset + thickness / 2;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const onScreen = (spot: { x: number; y: number }) => spot.x >= 0 && spot.y >= 0 && spot.x < screen.width && spot.y < screen.height;
  // On each side, three spots across the ring, so a ring that lands half a pixel off is still found.
  const across = [-1, 0, 1];
  const sides = [
    across.map((d) => ({ x: centre.x, y: box.y - middle - d })),
    across.map((d) => ({ x: centre.x, y: bottom + middle + d })),
    across.map((d) => ({ x: box.x - middle - d, y: centre.y })),
    across.map((d) => ({ x: right + middle + d, y: centre.y })),
  ].filter((spots) => spots.every(onScreen));
  if (sides.length === 0) return 0;

  const reach = Math.max(offset + thickness, 0) + 3;
  const left = Math.max(0, Math.floor(box.x - reach));
  const top = Math.max(0, Math.floor(box.y - reach));
  const clip = {
    x: left,
    y: top,
    width: Math.min(screen.width, Math.ceil(right + reach)) - left,
    height: Math.min(screen.height, Math.ceil(bottom + reach)) - top,
  };
  const withRing = (await page.screenshot({ clip })).toString('base64');
  const noRings = await page.addStyleTag({ content: '*, *::before, *::after { outline: none !important; }' });
  const withoutRing = (await page.screenshot({ clip })).toString('base64');
  await noRings.evaluate((style) => style.remove());

  const contrasts = await page.evaluate(
    async ({ withRing, withoutRing, clip, sides }) => {
      const light = (channel: number) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      const open = async (picture: string) => {
        const bytes = Uint8Array.from(atob(picture), (char) => char.charCodeAt(0));
        const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const paint = canvas.getContext('2d', { willReadFrequently: true })!;
        paint.drawImage(image, 0, 0);
        const scale = image.width / clip.width;
        return (spot: { x: number; y: number }) => {
          const [r, g, b] = paint.getImageData(Math.round((spot.x - clip.x) * scale), Math.round((spot.y - clip.y) * scale), 1, 1).data;
          return 0.2126 * light(r) + 0.7152 * light(g) + 0.0722 * light(b);
        };
      };
      const before = await open(withoutRing);
      const after = await open(withRing);
      return sides.map((spots) =>
        Math.max(
          ...spots.map((spot) => {
            const a = before(spot);
            const b = after(spot);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          }),
        ),
      );
    },
    { withRing, withoutRing, clip, sides },
  );
  return Math.min(...contrasts);
}

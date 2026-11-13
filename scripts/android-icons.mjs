// Android launcher icons, drawn from the same artwork as the web and desktop icons (scripts/icon-art.mjs).
// Writes android/app/src/main/res/mipmap-*/. Run it with: node scripts/android-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { render } from './icon-art.mjs';

const RES = new URL('../android/app/src/main/res/', import.meta.url);
// How many pixels one dp is at each screen density.
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [density, k] of Object.entries(DENSITIES)) {
  const dir = new URL(`mipmap-${density}/`, RES);
  mkdirSync(dir, { recursive: true });
  // Adaptive icons are 108dp with only the middle 66dp always visible, so the pads shrink to fit inside it.
  writeFileSync(new URL('ic_launcher_foreground.png', dir), render(Math.round(108 * k), { scale: 0.66 }));
  // Older phones draw these two as they are: a rounded square and a circle.
  writeFileSync(new URL('ic_launcher.png', dir), render(Math.round(48 * k), { corner: 0.22 }));
  writeFileSync(new URL('ic_launcher_round.png', dir), render(Math.round(48 * k), { corner: 0.5 }));
}
console.log('android launcher icons');

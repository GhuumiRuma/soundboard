// Generates the web and desktop app icons (no dependencies): node scripts/icons.mjs
// Android launcher icons come from scripts/android-icons.mjs; desktop icons are made from assets/icon-1024.png
// with `npx tauri icon assets/icon-1024.png`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { faviconSvg, render } from './icon-art.mjs';

const PUBLIC = new URL('../public/', import.meta.url);
const ASSETS = new URL('../assets/', import.meta.url);
mkdirSync(PUBLIC, { recursive: true });
mkdirSync(ASSETS, { recursive: true });

const files = [
  [PUBLIC, 'pwa-192.png', render(192, { corner: 0.22 })],
  [PUBLIC, 'pwa-512.png', render(512, { corner: 0.22 })],
  [PUBLIC, 'maskable-512.png', render(512, { scale: 0.84 })],
  // iOS rounds the corners itself and needs an opaque square
  [PUBLIC, 'apple-touch-icon.png', render(180)],
  // macOS icon shape: tile inset by about 10% with rounded corners
  [ASSETS, 'icon-1024.png', render(1024, { corner: 0.2237, inset: 0.0977 })],
];
for (const [dir, name, data] of files) {
  writeFileSync(new URL(name, dir), data);
  console.log(`${name}  ${data.length} bytes`);
}

writeFileSync(new URL('favicon.svg', PUBLIC), faviconSvg());
console.log('favicon.svg');

// Soundboard artwork, drawn in code so there are no image-tool dependencies.
// A 2x2 grid of sound pads in StreamStudio's tile colours; the top-left pad is "playing" (level bars and a glow).
import { deflateSync, crc32 } from 'node:zlib';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const css = (c) => '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const WHITE = [1, 1, 1];
const BLACK = [0, 0, 0];

const BG_TOP = hex('#251f36');
const BG_BOTTOM = hex('#0d0b13');
const GLOW = hex('#8B5CF6');
const HALO_COLOR = hex('#A78BFA');

// Geometry in unit coordinates (0..1, y down).
const GRID_FROM = 0.17;
const GAP = 0.06;
const PAD = 0.3;
const PAD_RADIUS = 0.08;
const HALO = 0.07;
const PADS = ['#7C3AED', '#DB2777', '#2563EB', '#EA580C'].map((color, i) => ({
  color,
  left: GRID_FROM + (i % 2) * (PAD + GAP),
  top: GRID_FROM + Math.floor(i / 2) * (PAD + GAP),
}));
const BARS = [
  { dx: -0.078, half: 0.05 },
  { dx: 0, half: 0.092 },
  { dx: 0.078, half: 0.066 },
];
const BAR_HALF_WIDTH = 0.021;

// Signed distance to a rounded box centred on (cx, cy).
function sdBox(px, py, cx, cy, hx, hy, r) {
  const qx = Math.abs(px - cx) - (hx - r);
  const qy = Math.abs(py - cy) - (hy - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function shade(pu, pv, scale) {
  let c = mix(BG_TOP, BG_BOTTOM, pv);
  const gd = Math.hypot(pu - 0.5, pv - 0.5) / 0.6;
  if (gd < 1) c = mix(c, GLOW, 0.2 * (1 - gd) ** 2);
  // glyph space: scale around the centre
  const qu = (pu - 0.5) / scale + 0.5;
  const qv = (pv - 0.5) / scale + 0.5;
  PADS.forEach((pad, i) => {
    const cx = pad.left + PAD / 2;
    const cy = pad.top + PAD / 2;
    const d = sdBox(qu, qv, cx, cy, PAD / 2, PAD / 2, PAD_RADIUS);
    if (d <= 0) {
      const base = hex(pad.color);
      const t = clamp((qu - pad.left + (qv - pad.top)) / (2 * PAD), 0, 1);
      c = mix(mix(base, WHITE, 0.32), mix(base, BLACK, 0.12), t);
      if (i === 0) {
        for (const bar of BARS) {
          if (sdBox(qu, qv, cx + bar.dx, cy, BAR_HALF_WIDTH, bar.half, BAR_HALF_WIDTH) <= 0) c = mix(c, WHITE, 0.96);
        }
      }
    } else if (i === 0 && d < HALO) {
      c = mix(c, HALO_COLOR, 0.5 * (1 - d / HALO) ** 2);
    }
  });
  return c;
}

/**
 * @param size output pixels
 * @param corner tile corner radius (0 = full-bleed square)
 * @param scale size of the pads relative to the tile (maskable and adaptive icons keep them inside the safe zone)
 * @param inset transparent margin around the whole tile (0..0.5), as macOS expects
 * @returns PNG bytes
 */
export function render(size, { corner = 0, scale = 1, inset = 0 } = {}) {
  const SS = 4;
  const px = Buffer.alloc(size * size * 4);
  const fit = 1 - 2 * inset;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const pu = ((x + (sx + 0.5) / SS) / size - 0.5) / fit + 0.5;
          const pv = ((y + (sy + 0.5) / SS) / size - 0.5) / fit + 0.5;
          if (pu < 0 || pu > 1 || pv < 0 || pv > 1) continue;
          if (corner > 0 && sdBox(pu, pv, 0.5, 0.5, 0.5, 0.5, corner) > 0) continue;
          const c = shade(pu, pv, scale);
          r += c[0];
          g += c[1];
          b += c[2];
          a += 1;
        }
      }
      const i = (y * size + x) * 4;
      // stored un-premultiplied: average colour of the covered samples, alpha = coverage
      px[i] = a ? Math.round((r / a) * 255) : 0;
      px[i + 1] = a ? Math.round((g / a) * 255) : 0;
      px[i + 2] = a ? Math.round((b / a) * 255) : 0;
      px[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return encodePng(size, size, px);
}

function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The same artwork as a 64 x 64 SVG (favicon). */
export function faviconSvg() {
  const f = (v) => +(v * 64).toFixed(2);
  const gradients = PADS.map((pad, i) => {
    const base = hex(pad.color);
    return `<linearGradient id="p${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${css(mix(base, WHITE, 0.32))}"/><stop offset="1" stop-color="${css(mix(base, BLACK, 0.12))}"/></linearGradient>`;
  });
  const pads = PADS.map(
    (pad, i) => `<rect x="${f(pad.left)}" y="${f(pad.top)}" width="${f(PAD)}" height="${f(PAD)}" rx="${f(PAD_RADIUS)}" fill="url(#p${i})"/>`,
  );
  const cx = PADS[0].left + PAD / 2;
  const cy = PADS[0].top + PAD / 2;
  const bars = BARS.map(
    (bar) =>
      `<rect x="${f(cx + bar.dx - BAR_HALF_WIDTH)}" y="${f(cy - bar.half)}" width="${f(BAR_HALF_WIDTH * 2)}" height="${f(bar.half * 2)}" rx="${f(BAR_HALF_WIDTH)}" fill="#fff" fill-opacity="0.96"/>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${css(BG_TOP)}"/><stop offset="1" stop-color="${css(BG_BOTTOM)}"/></linearGradient>
    ${gradients.join('\n    ')}
  </defs>
  <rect width="64" height="64" rx="${f(0.22)}" fill="url(#bg)"/>
  ${pads.join('\n  ')}
  ${bars.join('\n  ')}
</svg>
`;
}

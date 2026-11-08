// Generates the app icons as PNG files without any image library.
// Design: ivory background, a sage ring (the cycle) and a dusty-rose dot on it.
// Run: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const IVORY = [0xfb, 0xf7, 0xf0];
const SAGE = [0x6f, 0x8f, 0x78];
const ROSE = [0xc0, 0x7f, 0x82];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}
/** scale < 1 shrinks the motif (maskable icons need a safe zone). */
function render(size, scale = 1) {
  const SS = 4; // supersampling for smooth edges
  const c = size / 2;
  const ringR = size * 0.30 * scale, ringW = size * 0.075 * scale;
  const dotR = size * 0.085 * scale;
  const angle = -Math.PI / 4; // dot at upper right
  const dx = c + ringR * Math.cos(angle), dy = c + ringR * Math.sin(angle);
  return png(size, (x, y) => {
    let acc = [0, 0, 0];
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
      let col = IVORY;
      const d = Math.hypot(px - c, py - c);
      if (Math.abs(d - ringR) <= ringW / 2) col = SAGE;
      if (Math.hypot(px - dx, py - dy) <= dotR + ringW * 0.45) col = IVORY; // halo
      if (Math.hypot(px - dx, py - dy) <= dotR) col = ROSE;
      acc = acc.map((v, i) => v + col[i]);
    }
    return acc.map((v) => Math.round(v / (SS * SS)));
  });
}
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/apple-touch-icon.png', render(180));
writeFileSync('public/icons/icon-192.png', render(192));
writeFileSync('public/icons/icon-512.png', render(512));
writeFileSync('public/icons/icon-maskable-512.png', render(512, 0.78));
console.log('icons written');

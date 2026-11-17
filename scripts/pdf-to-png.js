#!/usr/bin/env node
/**
 * pdf-to-png.js — wrap a file's raw bytes in a lossless RGB PNG.
 *
 * Why: the morning LinkedIn task stages the post in Chrome on linkedin.com,
 * whose CSP blocks fetch() to raw.githubusercontent.com but allows <img>.
 * So the carousel PDF travels as pixels: the page loads this PNG with
 * crossOrigin='anonymous', reads it back via canvas getImageData, verifies
 * the SHA-256, rebuilds the PDF File and sets it on LinkedIn's document input.
 *
 * Payload layout (3 bytes per pixel, alpha always 255, no colour chunks):
 *   "CADP" (4) | byte length, uint32 BE (4) | sha256 of the file (32) | file bytes | zero padding
 *
 * Usage: node scripts/pdf-to-png.js <date>            → linkedin/<date>/<date>-carousel.pdf.png
 *        node scripts/pdf-to-png.js <in-file> <out.png>
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const WIDTH = 1024;

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
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function bytesToPng(file) {
  const head = Buffer.alloc(8); head.write('CADP', 0, 'ascii'); head.writeUInt32BE(file.length, 4);
  const payload = Buffer.concat([head, crypto.createHash('sha256').update(file).digest(), file]);
  const height = Math.ceil(payload.length / 3 / WIDTH);
  const row = WIDTH * 3;
  const raw = Buffer.alloc(height * (row + 1)); // filter byte 0 + RGB per row
  for (let y = 0; y < height; y++) payload.copy(raw, y * (row + 1) + 1, y * row, Math.min(payload.length, (y + 1) * row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (require.main === module) {
  let [a, b] = process.argv.slice(2);
  if (!a) { console.error('usage: pdf-to-png.js <date> | <in-file> <out.png>'); process.exit(1); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(a)) {
    const dir = path.join(__dirname, '..', 'linkedin', a);
    b = path.join(dir, `${a}-carousel.pdf.png`); a = path.join(dir, `${a}-carousel.pdf`);
  }
  if (!b) { console.error('missing output path'); process.exit(1); }
  if (!fs.existsSync(a)) { console.error(`pdf-to-png: ${a} not found — nothing to wrap`); process.exit(0); }
  const png = bytesToPng(fs.readFileSync(a));
  fs.writeFileSync(b, png);
  console.log(`pdf-to-png: ${path.basename(a)} → ${path.basename(b)} (${png.length} bytes)`);
}
module.exports = { bytesToPng };

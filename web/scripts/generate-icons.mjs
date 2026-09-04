/**
 * Renders the BinTrack glyph (a bin outline with an item inside) to the PNG
 * sizes the PWA manifest and iOS home screen need.
 *
 *   node scripts/generate-icons.mjs
 *
 * Hand-rasterised with 4× supersampling and encoded with Node's zlib, so the
 * icons are reproducible with no image dependency in the toolchain.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const SS = 4 // supersampling factor

/** The glyph, described in a 32×32 space to match public/favicon.svg. */
function glyphAlpha(x, y) {
  // Rounded-square bin outline: between an outer and an inner rounded rect.
  const outer = roundedRect(x, y, 5, 5, 22, 22, 3)
  const inner = roundedRect(x, y, 7, 7, 18, 18, 1)
  const ring = outer && !inner
  // The item sitting in the bin.
  const dx = x - 16
  const dy = y - 16
  const dot = dx * dx + dy * dy <= 16
  return ring || dot ? 1 : 0
}

function roundedRect(x, y, rx, ry, w, h, r) {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false
  const cx = Math.min(Math.max(x, rx + r), rx + w - r)
  const cy = Math.min(Math.max(y, ry + r), ry + h - r)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r + 0.0001 || (x >= rx + r && x <= rx + w - r) || (y >= ry + r && y <= ry + h - r)
}

function render(size, { background, foreground, padding }) {
  const pixels = Buffer.alloc(size * size * 4)
  const drawable = size - padding * 2

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let covered = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = ((px + (sx + 0.5) / SS - padding) / drawable) * 32
          const fy = ((py + (sy + 0.5) / SS - padding) / drawable) * 32
          if (fx >= 0 && fx <= 32 && fy >= 0 && fy <= 32) covered += glyphAlpha(fx, fy)
        }
      }
      const a = covered / (SS * SS)
      const i = (py * size + px) * 4
      // Composite the foreground over the background colour.
      pixels[i] = Math.round(background[0] * (1 - a) + foreground[0] * a)
      pixels[i + 1] = Math.round(background[1] * (1 - a) + foreground[1] * a)
      pixels[i + 2] = Math.round(background[2] * (1 - a) + foreground[2] * a)
      pixels[i + 3] = 255
    }
  }
  return pixels
}

function encodePng(size, pixels) {
  // Each scanline is prefixed with filter type 0 (none).
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0, 0)
  return Buffer.concat([length, body, crc])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return c ^ 0xffffffff
}

const NEAR_BLACK = [10, 10, 11]
const NEAR_WHITE = [250, 250, 250]

const targets = [
  // Maskable icons need the glyph inside the safe zone, hence the padding.
  { file: 'pwa-192.png', size: 192, background: NEAR_BLACK, foreground: NEAR_WHITE, padding: 24 },
  { file: 'pwa-512.png', size: 512, background: NEAR_BLACK, foreground: NEAR_WHITE, padding: 64 },
  { file: 'apple-touch-icon.png', size: 180, background: NEAR_WHITE, foreground: NEAR_BLACK, padding: 22 },
]

for (const target of targets) {
  const png = encodePng(target.size, render(target.size, target))
  writeFileSync(join(OUT, target.file), png)
  console.log(`wrote public/${target.file}  ${target.size}×${target.size}  ${png.length} bytes`)
}

// Generates the home-screen icons into public/.
//
//   node scripts/make-icons.mjs
//
// There's no image tooling on the machine this was built on, and pulling
// in a whole image library to draw one flag seemed steep. This writes the
// PNGs directly: rasterise the mark with supersampling for smooth edges,
// then deflate the scanlines into the three chunks a PNG needs.
//
// The mark is the same flag as the Rounds tab icon in Shell.tsx, on a
// 24x24 grid, so the app and its icon stay the same drawing.

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const GREEN = [28, 124, 74] // --color-green
const WHITE = [255, 255, 255]
const SAMPLES = 4 // per axis, so 16 samples a pixel

// ---------- the mark, in 24x24 units ----------
const STROKE = 1.9
const HALF = STROKE / 2
const POLE = { ax: 8, ay: 3, bx: 8, by: 16 }
const PENNANT = [
  [8, 3],
  [15.5, 5.75],
  [8, 8.5],
]
const BALL = { cx: 8, cy: 19, r: 2.4 }

// The drawing isn't centred in its own box: it spans x 5.6–15.5 and
// y 3–21.4, so centre on the ink rather than on the grid.
const INK_CX = 10.55
const INK_CY = 12.2

function distToSegment(px, py, { ax, ay, bx, by }) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function inTriangle(px, py, [[x1, y1], [x2, y2], [x3, y3]]) {
  const sign = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy)
  const d1 = sign(px, py, x1, y1, x2, y2)
  const d2 = sign(px, py, x2, y2, x3, y3)
  const d3 = sign(px, py, x3, y3, x1, y1)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

/** Is this point inside the white mark? */
const inMark = (x, y) =>
  distToSegment(x, y, POLE) <= HALF ||
  inTriangle(x, y, PENNANT) ||
  Math.abs(Math.hypot(x - BALL.cx, y - BALL.cy) - BALL.r) <= HALF

// ---------- PNG ----------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(size, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour
  // Each scanline is prefixed with its filter type; 0 means "none".
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let at = 0
  for (let y = 0; y < size; y++) {
    raw[at++] = 0
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3
      raw[at++] = rgb[i]
      raw[at++] = rgb[i + 1]
      raw[at++] = rgb[i + 2]
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** markFraction: how much of the icon's width the 24-unit grid spans. */
function render(size, markFraction) {
  const rgb = Buffer.alloc(size * size * 3)
  const scale = (size * markFraction) / 24
  const originX = size / 2 - INK_CX * scale
  const originY = size / 2 - INK_CY * scale
  const step = 1 / SAMPLES

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = (x + (sx + 0.5) * step - originX) / scale
          const py = (y + (sy + 0.5) * step - originY) / scale
          if (inMark(px, py)) hits++
        }
      }
      const coverage = hits / (SAMPLES * SAMPLES)
      const i = (y * size + x) * 3
      for (let c = 0; c < 3; c++) {
        rgb[i + c] = Math.round(GREEN[c] + (WHITE[c] - GREEN[c]) * coverage)
      }
    }
  }
  return encodePng(size, rgb)
}

// Maskable icons get cropped to a circle on Android, so that mark sits
// well inside the 80% safe zone while the rest fill the square.
const ICONS = [
  ['icon-180.png', 180, 0.66],
  ['icon-192.png', 192, 0.66],
  ['icon-512.png', 512, 0.66],
  ['icon-maskable-512.png', 512, 0.46],
]

mkdirSync(PUBLIC_DIR, { recursive: true })
for (const [name, size, fraction] of ICONS) {
  const png = render(size, fraction)
  writeFileSync(join(PUBLIC_DIR, name), png)
  console.log(`${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`)
}

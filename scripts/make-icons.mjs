// Builds the maskable home-screen icon from the app artwork.
//
//   npm run icons
//
// The artwork in public/sandbagger-icon-*.png is used as-is everywhere
// except one place. Android doesn't show an icon as a square: it crops it
// to whatever shape the launcher uses, and only guarantees a circle
// covering the middle 80%. Handing it artwork that runs to the edges gets
// the beret and the chin sliced off.
//
// So this makes one extra file: the same drawing, shrunk and centred on
// its own background colour, with room around it for the crop to eat.
// The corners it discards are then plain background.
//
// There's no image library on the machine this was built on, so the PNG
// is decoded and re-encoded here. Both source and output are 8-bit
// non-interlaced, which is the simple case.

import { deflateSync, inflateSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const SOURCE = 'sandbagger-icon-1024.png'
const OUTPUT = 'sandbagger-icon-maskable-512.png'
const OUTPUT_SIZE = 512
// How much of the icon the artwork spans. The subject sits inside the
// safe circle at this size; only background gets cropped.
const ARTWORK_FRACTION = 0.78

// ---------- decode ----------

/** Reads an 8-bit non-interlaced PNG into flat RGBA bytes. */
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG')

  let width = 0
  let height = 0
  let channels = 0
  const idat = []

  let offset = 8
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const depth = data[8]
      const colorType = data[9]
      if (depth !== 8) throw new Error(`Only 8-bit PNGs are supported (got ${depth})`)
      if (data[12] !== 0) throw new Error('Interlaced PNGs are not supported')
      channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
      if (!channels) throw new Error(`Unsupported colour type ${colorType}`)
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += length + 12 // length + type + data + crc
  }

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)

  // Undo the per-scanline filter. Each one is relative to the pixel to the
  // left (a), the one above (b), and the one above-left (c).
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const out = pixels.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0
      const b = prev ? prev[i] : 0
      const c = prev && i >= channels ? prev[i - channels] : 0
      let value = line[i]
      switch (filter) {
        case 0: break
        case 1: value += a; break
        case 2: value += b; break
        case 3: value += (a + b) >> 1; break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          break
        }
        default: throw new Error(`Unknown filter ${filter}`)
      }
      out[i] = value & 0xff
    }
  }

  // Normalise everything to RGBA so the rest doesn't care.
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const s = i * channels
    const d = i * 4
    if (channels === 4) {
      rgba[d] = pixels[s]; rgba[d + 1] = pixels[s + 1]; rgba[d + 2] = pixels[s + 2]; rgba[d + 3] = pixels[s + 3]
    } else if (channels === 3) {
      rgba[d] = pixels[s]; rgba[d + 1] = pixels[s + 1]; rgba[d + 2] = pixels[s + 2]; rgba[d + 3] = 255
    } else if (channels === 2) {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s]; rgba[d + 3] = pixels[s + 1]
    } else {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s]; rgba[d + 3] = 255
    }
  }
  return { width, height, rgba }
}

// ---------- encode ----------

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

/** Encodes flat RGB bytes as a truecolour PNG. Maskable icons are always opaque. */
function encodePng(size, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let at = 0
  for (let y = 0; y < size; y++) {
    raw[at++] = 0 // filter: none
    rgb.copy(raw, at, y * size * 3, (y + 1) * size * 3)
    at += size * 3
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- compose ----------

/** Averages over the source area behind each destination pixel. */
function sampleBox(src, srcSize, x0, x1, y0, y1) {
  let r = 0, g = 0, b = 0, a = 0, n = 0
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    if (y < 0 || y >= srcSize) continue
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      if (x < 0 || x >= srcSize) continue
      const i = (y * srcSize + x) * 4
      r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]
      n++
    }
  }
  return n === 0 ? [0, 0, 0, 0] : [r / n, g / n, b / n, a / n]
}

const source = decodePng(readFileSync(join(PUBLIC_DIR, SOURCE)))
if (source.width !== source.height) throw new Error('The icon artwork must be square')

// The colour to pad with: whatever the artwork's own corner is. Falls back
// to the app's paper if the artwork is transparent there.
const cornerAlpha = source.rgba[3]
const background = cornerAlpha > 0 ? [source.rgba[0], source.rgba[1], source.rgba[2]] : [0xf6, 0xf6, 0xf2]

const artworkSize = Math.round(OUTPUT_SIZE * ARTWORK_FRACTION)
const inset = Math.round((OUTPUT_SIZE - artworkSize) / 2)
const scale = source.width / artworkSize

const out = Buffer.alloc(OUTPUT_SIZE * OUTPUT_SIZE * 3)
for (let y = 0; y < OUTPUT_SIZE; y++) {
  for (let x = 0; x < OUTPUT_SIZE; x++) {
    const d = (y * OUTPUT_SIZE + x) * 3
    const inArtwork = x >= inset && x < inset + artworkSize && y >= inset && y < inset + artworkSize
    if (!inArtwork) {
      out[d] = background[0]; out[d + 1] = background[1]; out[d + 2] = background[2]
      continue
    }
    const [r, g, b, a] = sampleBox(
      source.rgba,
      source.width,
      (x - inset) * scale,
      (x - inset + 1) * scale,
      (y - inset) * scale,
      (y - inset + 1) * scale,
    )
    // Flatten onto the background; a maskable icon can't be transparent.
    const alpha = a / 255
    out[d] = Math.round(r * alpha + background[0] * (1 - alpha))
    out[d + 1] = Math.round(g * alpha + background[1] * (1 - alpha))
    out[d + 2] = Math.round(b * alpha + background[2] * (1 - alpha))
  }
}

const png = encodePng(OUTPUT_SIZE, out)
writeFileSync(join(PUBLIC_DIR, OUTPUT), png)
console.log(
  `${OUTPUT}  ${OUTPUT_SIZE}x${OUTPUT_SIZE}  ${(png.length / 1024).toFixed(1)} kB  ` +
    `(artwork at ${Math.round(ARTWORK_FRACTION * 100)}%, padded with #${background.map((c) => c.toString(16).padStart(2, '0')).join('')})`,
)

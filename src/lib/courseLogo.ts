import { supabase } from './supabase'
import { blobToDataUrl } from './photos'
import type { Course } from '../types'

// Turning whatever image someone has into a logo the cards can use.
//
// The image comes from a file, a paste (long-press a logo on the course's
// website, Copy, then Paste here), or a crop of a photographed scorecard.
// Whatever the source: trim the empty margin, fade a light paper
// background out to transparent (a photo of a card is grey-white, not
// white, and would sit on the card as a grey box), shrink it, and pick
// the colours it's drawn in so the hole row can match.

const BUCKET = 'course-logos'
const WORK = 1024 // long side while working
const OUT_HEIGHT = 240 // stored height; wide marks stay wide
const OUT_WIDTH = 960

export interface PreparedLogo {
  blob: Blob
  /** For showing before it's saved. */
  dataUrl: string
  /** The colours it's drawn in, most used first. Hex. */
  colours: string[]
  /** White artwork on nothing: needs the colour behind it. */
  dark: boolean
  wide: boolean
  tall: boolean
}

/** A crop in fractions of the image, 0-1, as the scanner reports it. */
export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase()

export async function prepareLogo(source: Blob, box?: Box): Promise<PreparedLogo> {
  if (!source.type.startsWith('image/')) throw new Error('That isn’t an image')
  const bitmap = await createImageBitmap(source)
  const crop = box
    ? (() => {
        // A little extra round the box: the scanner's edges are close, not exact,
        // and the trim below takes back any spare paper.
        const pad = 0.06
        const w = box.x1 - box.x0
        const h = box.y1 - box.y0
        const x0 = Math.max(0, box.x0 - w * pad)
        const y0 = Math.max(0, box.y0 - h * pad)
        const x1 = Math.min(1, box.x1 + w * pad)
        const y1 = Math.min(1, box.y1 + h * pad)
        return { sx: x0 * bitmap.width, sy: y0 * bitmap.height, sw: (x1 - x0) * bitmap.width, sh: (y1 - y0) * bitmap.height }
      })()
    : { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height }
  if (crop.sw < 8 || crop.sh < 8) throw new Error('That logo is too small to use')

  const scale = Math.min(1, WORK / Math.max(crop.sw, crop.sh))
  const W = Math.max(1, Math.round(crop.sw * scale))
  const H = Math.max(1, Math.round(crop.sh * scale))
  const work = document.createElement('canvas')
  work.width = W
  work.height = H
  const ctx = work.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H)
  bitmap.close()
  const img = ctx.getImageData(0, 0, W, H)
  const px = img.data

  // The background is whatever the border is: transparent, paper, or a
  // coloured panel the logo sits on.
  let br = 0, bg = 0, bb = 0, ba = 0, n = 0
  const sample = (x: number, y: number) => {
    const i = (y * W + x) * 4
    br += px[i]; bg += px[i + 1]; bb += px[i + 2]; ba += px[i + 3]; n++
  }
  for (let x = 0; x < W; x++) { sample(x, 0); sample(x, H - 1) }
  for (let y = 0; y < H; y++) { sample(0, y); sample(W - 1, y) }
  br /= n; bg /= n; bb /= n; ba /= n
  const clearBg = ba < 40
  const lightBg = !clearBg && lum(br, bg, bb) > 0.62

  // Fade a light background out: near it is transparent, clearly off it
  // is solid, a soft edge between so curves don't go jagged.
  const dist = (i: number) => Math.hypot(px[i] - br, px[i + 1] - bg, px[i + 2] - bb)
  if (lightBg) {
    const t0 = 28, t1 = 70
    for (let i = 0; i < px.length; i += 4) {
      const d = dist(i)
      const a = d <= t0 ? 0 : d >= t1 ? 1 : (d - t0) / (t1 - t0)
      px[i + 3] = Math.round(px[i + 3] * a)
    }
    ctx.putImageData(img, 0, 0)
  }

  // Trim to what's left. A dark or coloured panel stays as part of the logo.
  const solid = (i: number) => (clearBg || lightBg ? px[i + 3] > 24 : dist(i) > 40)
  let minX = W, minY = H, maxX = -1, maxY = -1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (solid((y * W + x) * 4)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error('There’s no logo in that image, just background')
  if (!clearBg && !lightBg) {
    // Panel logo: keep the whole crop, panel and all.
    minX = 0; minY = 0; maxX = W - 1; maxY = H - 1
  }
  const tw = maxX - minX + 1
  const th = maxY - minY + 1
  const m = Math.round(Math.max(tw, th) * 0.04)

  // The colours it's drawn in: opaque pixels, bucketed, near-white left
  // out (it's the paper, or the white artwork the dark flag handles).
  const counts = new Map<string, { n: number; r: number; g: number; b: number }>()
  let fg = 0, fgLight = 0
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = (y * W + x) * 4
      if (px[i + 3] < 200) continue
      fg++
      const L = lum(px[i], px[i + 1], px[i + 2])
      if (L > 0.86) { fgLight++; continue }
      const key = `${px[i] >> 5},${px[i + 1] >> 5},${px[i + 2] >> 5}`
      const c = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
      c.n++; c.r += px[i]; c.g += px[i + 1]; c.b += px[i + 2]
      counts.set(key, c)
    }
  }
  const colours: string[] = []
  const picked: [number, number, number][] = []
  for (const c of [...counts.values()].sort((a, b) => b.n - a.n)) {
    if (c.n < fg * 0.02) break
    const rgb: [number, number, number] = [c.r / c.n, c.g / c.n, c.b / c.n]
    if (picked.some((p) => Math.hypot(p[0] - rgb[0], p[1] - rgb[1], p[2] - rgb[2]) < 60)) continue
    picked.push(rgb)
    colours.push(hex(...rgb))
    if (colours.length >= 5) break
  }
  if (!clearBg && !lightBg) {
    const panel = hex(br, bg, bb)
    if (colours[0] !== panel) colours.unshift(panel)
  }

  const out = document.createElement('canvas')
  const ow = tw + m * 2
  const oh = th + m * 2
  const s = Math.min(1, OUT_HEIGHT / oh, OUT_WIDTH / ow)
  out.width = Math.max(1, Math.round(ow * s))
  out.height = Math.max(1, Math.round(oh * s))
  const octx = out.getContext('2d')
  if (!octx) throw new Error('Canvas unavailable')
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(work, minX - m, minY - m, ow, oh, 0, 0, out.width, out.height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the logo'))), 'image/png'),
  )
  const ratio = ow / oh
  return {
    blob,
    dataUrl: await blobToDataUrl(blob),
    colours,
    // Mostly white artwork on a see-through background vanishes on white.
    dark: clearBg && fg > 0 && fgLight / fg > 0.6,
    wide: ratio > 2.6,
    tall: ratio < 0.75,
  }
}

/** The image on the clipboard, if there is one. Needs a tap to call it. */
export async function readClipboardImage(): Promise<Blob> {
  if (!navigator.clipboard?.read) throw new Error('This browser can’t paste images here. Save the logo and choose it instead.')
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'))
    if (type) return item.getType(type)
  }
  throw new Error('There’s no image on the clipboard. Long-press the logo on the course’s site and tap Copy first.')
}

/** Puts the logo where everyone can load it and returns its URL. Local mode keeps it inline. */
export async function uploadCourseLogo(logo: PreparedLogo, course: Course): Promise<string> {
  if (!supabase) return logo.dataUrl
  const path = `${course.groupId}/${course.id}-${Date.now().toString(36)}.png`
  const { error } = await supabase.storage.from(BUCKET).upload(path, logo.blob, { contentType: 'image/png' })
  if (error) throw new Error(`Couldn’t upload the logo: ${error.message}`)
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** Clears out a logo file this app uploaded, once nothing points at it. Best effort. */
export async function removeCourseLogoFile(url: string | undefined): Promise<void> {
  if (!supabase || !url) return
  const marker = `/object/public/${BUCKET}/`
  const at = url.indexOf(marker)
  if (at < 0) return // a built-in logo or a data URL
  await supabase.storage.from(BUCKET).remove([decodeURIComponent(url.slice(at + marker.length))])
}

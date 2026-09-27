import type { Player } from '../types'
import { fmt1 } from '../types'

// The result as one picture, sized for the group text: the round's scene
// across the top, the course and the day, the podium, and the SANDBAGGER
// stamp on anyone who earned it. Drawn on a canvas by hand, so nothing
// leaves the phone; then handed to the share sheet (or saved, where
// there's no share sheet).

export interface ShareInput {
  course: string
  dateLabel: string
  weatherLine?: string
  /** Up to three, winner first. */
  podium: { player: Player; net: number; gross: number; sandbagger: boolean }[]
  headline: string
  groupName: string
  /** The round's banner: an <svg> scene or an <img> photo already on screen. */
  banner: Element | null
}

const W = 1080
const H = 1350
const FOREST = '#1c4632'
const CREAM = '#efe3c8'
const ON_FOREST = '#f3ead4'
const FONT = 'Manrope, "Segoe UI", sans-serif'

function loadImage(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (cors) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** The banner as something drawable: an SVG scene serialised, or the photo. */
async function bannerImage(el: Element | null): Promise<HTMLImageElement | null> {
  if (!el) return null
  try {
    if (el instanceof SVGSVGElement) {
      const clone = el.cloneNode(true) as SVGSVGElement
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      clone.setAttribute('width', '1600')
      clone.setAttribute('height', '1000')
      // The flag's flutter is a CSS animation the snapshot can't see; drop the class.
      clone.querySelectorAll('.scene-flag, .scene-rain').forEach((n) => n.removeAttribute('class'))
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
      try {
        return await loadImage(url)
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    }
    if (el instanceof HTMLImageElement) return await loadImage(el.src, true)
  } catch {
    // A photo from another host that won't allow canvas use: fall back to plain forest.
  }
  return null
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height)
  const sw = w / scale
  const sh = h / scale
  // Anchored to the bottom, like the scenes themselves: lose sky, never the green.
  ctx.drawImage(img, (img.width - sw) / 2, img.height - sh, sw, sh, x, y, w, h)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.lineTo(x, y + h)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

export async function drawShareCard(input: ShareInput): Promise<Blob> {
  await document.fonts?.ready
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = FOREST
  ctx.fillRect(0, 0, W, H)

  // The scene, fading into forest.
  const banner = await bannerImage(input.banner)
  const top = 640
  if (banner) cover(ctx, banner, 0, 0, W, top)
  const fade = ctx.createLinearGradient(0, top * 0.45, 0, top)
  fade.addColorStop(0, 'rgba(28,70,50,0)')
  fade.addColorStop(1, FOREST)
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, W, top)

  // Course and day.
  ctx.fillStyle = ON_FOREST
  ctx.font = `800 84px ${FONT}`
  ctx.fillText(input.course, 72, 560, W - 144)
  ctx.globalAlpha = 0.8
  ctx.font = `600 36px ${FONT}`
  ctx.fillText([input.dateLabel, input.weatherLine].filter(Boolean).join('  ·  '), 72, 618, W - 144)
  ctx.globalAlpha = 1

  // The podium: second, first, third.
  const order = input.podium.length === 3 ? [input.podium[1], input.podium[0], input.podium[2]] : input.podium
  const colW = 280
  const gap = 24
  const startX = (W - (order.length * colW + (order.length - 1) * gap)) / 2
  const base = 1165
  const heights = [190, 140, 100]
  order.forEach((p, i) => {
    const rank = input.podium.indexOf(p)
    const x = startX + i * (colW + gap)
    const h = heights[rank]
    // Block
    ctx.fillStyle = rank === 0 ? '#2b6247' : rank === 1 ? '#244f3a' : '#1f4533'
    roundRect(ctx, x, base - h, colW, h, 28)
    ctx.fill()
    ctx.fillStyle = rank === 0 ? CREAM : 'rgba(243,234,212,0.75)'
    ctx.font = `800 72px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(String(rank + 1), x + colW / 2, base - h + 82)
    // Avatar
    const cy = base - h - 178
    const r = rank === 0 ? 66 : 56
    ctx.beginPath()
    ctx.arc(x + colW / 2, cy, r + 6, 0, Math.PI * 2)
    ctx.fillStyle = rank === 0 ? CREAM : 'rgba(243,234,212,0.25)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + colW / 2, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = p.player.color
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `800 ${Math.round(r * 0.72)}px ${FONT}`
    ctx.fillText(p.player.initials, x + colW / 2, cy + r * 0.26)
    // Name and net
    ctx.fillStyle = ON_FOREST
    ctx.font = `800 44px ${FONT}`
    ctx.fillText(p.player.name.split(" ")[0], x + colW / 2, cy + r + 54, colW)
    ctx.globalAlpha = 0.75
    ctx.font = `600 32px ${FONT}`
    ctx.fillText(`net ${fmt1(p.net)} · ${p.gross}`, x + colW / 2, cy + r + 94, colW)
    ctx.globalAlpha = 1
    // The stamp
    if (p.sandbagger) {
      ctx.save()
      ctx.translate(x + colW / 2, cy - r - 26)
      ctx.rotate(-0.14)
      ctx.strokeStyle = '#e7735f'
      ctx.lineWidth = 6
      ctx.font = `800 34px ${FONT}`
      const label = 'SANDBAGGER'
      const tw = ctx.measureText(label).width + 36
      roundRect(ctx, -tw / 2, -30, tw, 56, 8)
      ctx.stroke()
      ctx.fillStyle = '#e7735f'
      ctx.fillText(label, 0, 12)
      ctx.restore()
    }
    ctx.textAlign = 'left'
  })

  // Headline and sign-off.
  ctx.fillStyle = CREAM
  ctx.font = `800 48px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText(input.headline, W / 2, 1232, W - 144)
  ctx.textAlign = 'left'
  try {
    const icon = await loadImage('/sandbagger-icon-180.png')
    ctx.save()
    roundRect(ctx, 72, 1256, 60, 60, 16)
    ctx.clip()
    ctx.drawImage(icon, 72, 1256, 60, 60)
    ctx.restore()
  } catch {
    // no icon, no problem
  }
  ctx.fillStyle = ON_FOREST
  ctx.font = `800 34px ${FONT}`
  ctx.fillText('Sandbagger', 150, 1298)
  ctx.globalAlpha = 0.6
  ctx.font = `600 30px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(input.groupName, W - 72, 1298)
  ctx.globalAlpha = 1
  ctx.textAlign = 'left'

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card'))), 'image/png'))
}

/** The share sheet with the picture attached, or a download where there isn't one. */
export async function shareCard(blob: Blob, fileName: string, title: string) {
  const file = new File([blob], fileName, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title })
      return
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

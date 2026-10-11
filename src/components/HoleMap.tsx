import { useEffect, useMemo, useRef, useState } from 'react'
import { greenCentre, hazardsInPlay, metres, ON_HOLE_METRES, projector, teeOf, yards, type CourseMap, type FeatureKind, type LngLat, type MapHole } from '../lib/courseMap'

// One hole, drawn from above in the colours of the course scenes, turned
// so you always play up the screen: tee at the bottom, green at the top.
// Small on the Hole view (where the scene used to be); full screen when
// tapped, where a target you can drag shows the distance to it and what's
// left from there.

const FILL: Record<FeatureKind, string> = {
  r: '#5f9a5c',
  w: '#74b4d4',
  f: '#b2d896',
  t: '#a3d189',
  g: '#8fd16f',
  b: '#efe1b4',
}
const ROUGH = '#94bf7c'

interface Props {
  map: CourseMap
  hole: MapHole
  /** Where you are, if known and on this hole. Distances are from the tee otherwise. */
  from?: LngLat | null
  mode: 'mini' | 'full'
  target?: LngLat | null
  onTarget?: (p: LngLat) => void
  /** Pixels at the top the hole should stay clear of. */
  padTop?: number
  className?: string
}

export default function HoleMap({ map, hole, from, mode, target, onTarget, padTop = 0, className = '' }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const centre = greenCentre(map, hole)
  const tee = teeOf(map, hole)
  const here = from && metres(from, centre) < ON_HOLE_METRES ? from : null
  const start = here ?? tee

  // The frame: a metre grid round the green, turned so tee-to-green is up.
  const frame = useMemo(() => {
    const pr = projector(centre)
    const [tx, ty] = pr.to(tee)
    const len = Math.hypot(tx, ty) || 1
    const ux = -tx / len, uy = -ty / len
    const rot = (p: LngLat): [number, number] => {
      const [x, y] = pr.to(p)
      return [x * uy - y * ux, x * ux + y * uy]
    }
    // Full screen and on the hole: what's left of it, from you to the
    // green, the way a yardage book's page does. Otherwise the whole hole.
    const pts = (mode === 'full' && here ? [here, centre, ...(hole.green ?? [])] : [...(hole.line ?? [tee]), centre, ...(hole.green ?? [])]).map(rot)
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    const m = mode === 'full' ? 30 : 22
    let minY = Math.min(...ys) - m, maxY = Math.max(...ys) + m + 8
    // Near the green, still show enough round it to read.
    if (maxY - minY < 150) {
      const grow = (150 - (maxY - minY)) / 2
      minY -= grow
      maxY += grow
    }
    return { pr, ux, uy, rot, minX: Math.min(...xs) - m, maxX: Math.max(...xs) + m, minY, maxY }
  }, [centre, tee, hole, mode, here])

  const { w, h } = size
  // The hole fits below whatever sits over the top edge (the Hole view's buttons).
  const hh = Math.max(1, h - padTop)
  const midY = padTop + hh / 2
  const s = w && h ? Math.min(w / (frame.maxX - frame.minX), hh / (frame.maxY - frame.minY)) : 1
  const cx = (frame.minX + frame.maxX) / 2
  const cy = (frame.minY + frame.maxY) / 2
  const toScreen = (p: LngLat): [number, number] => {
    const [rx, ry] = frame.rot(p)
    return [w / 2 + (rx - cx) * s, midY - (ry - cy) * s]
  }
  const fromScreen = (sx: number, sy: number): LngLat => {
    const rx = (sx - w / 2) / s + cx
    const ry = -(sy - midY) / s + cy
    return frame.pr.from(frame.uy * rx + frame.ux * ry, -frame.ux * rx + frame.uy * ry)
  }
  const path = (ring: LngLat[]) => ring.map((p, i) => `${i ? 'L' : 'M'}${toScreen(p).map((v) => v.toFixed(1)).join(' ')}`).join('') + 'Z'

  // Only shapes near enough to matter; a long par 5 still draws quickly.
  const reach = Math.max(frame.maxX - frame.minX, frame.maxY - frame.minY) + 40
  const shapes = useMemo(
    () => map.features.filter((f) => f.p.some((p) => metres(p, centre) < reach)),
    [map.features, centre, reach],
  )

  const hazards = mode === 'full' ? hazardsInPlay(map, hole, start) : []

  // Dragging the target: a press anywhere puts it there, and it follows the finger.
  const svgRef = useRef<SVGSVGElement>(null)
  const place = (e: React.PointerEvent) => {
    if (!onTarget || !svgRef.current) return
    const r = svgRef.current.getBoundingClientRect()
    onTarget(fromScreen(e.clientX - r.left, e.clientY - r.top))
  }

  const [sx, sy] = toScreen(start)
  const [gx, gy] = toScreen(centre)
  const [tx, ty] = target ? toScreen(target) : [0, 0]
  const chip = (x: number, y: number, label: string, key: string) => (
    <g key={key} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} pointerEvents="none">
      <rect x={-label.length * 3.9 - 9} y={-11} width={label.length * 7.8 + 18} height={22} rx={11} fill="#182019" opacity="0.92" />
      <text textAnchor="middle" y={4.5} fontSize={13} fontWeight={700} fill="#ffffff">
        {label}
      </text>
    </g>
  )

  return (
    <div ref={box} className={`${/\babsolute\b/.test(className) ? '' : 'relative'} overflow-hidden ${className}`} style={{ backgroundColor: ROUGH }}>
      {w > 0 && h > 0 && (
        <svg
          ref={svgRef}
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label={`Map of hole ${hole.n}`}
          className={onTarget ? 'touch-none' : ''}
          onPointerDown={(e) => {
            if (!onTarget) return
            ;(e.target as Element).setPointerCapture?.(e.pointerId)
            place(e)
          }}
          onPointerMove={(e) => {
            if (onTarget && e.buttons) place(e)
          }}
        >
          {shapes.map((f, i) => (
            <path key={i} d={path(f.p)} fill={FILL[f.k]} opacity={f.k === 'r' ? 0.75 : 1} stroke={f.k === 'g' ? '#6fb556' : f.k === 'b' ? '#d9c88f' : 'none'} strokeWidth={f.k === 'g' || f.k === 'b' ? 1 : 0} />
          ))}
          {hole.green && !shapes.some((f) => f.k === 'g' && f.p === hole.green) && (
            <path d={path(hole.green)} fill={FILL.g} stroke="#6fb556" strokeWidth={1} />
          )}

          {/* The line of play: from you (or the tee), through the target if there is one. */}
          <g stroke="#182019" strokeOpacity="0.75" strokeWidth={1.6} strokeDasharray="3 4" fill="none" pointerEvents="none">
            {target ? (
              <>
                <line x1={sx} y1={sy} x2={tx} y2={ty} />
                <line x1={tx} y1={ty} x2={gx} y2={gy} />
              </>
            ) : (
              <line x1={sx} y1={sy} x2={gx} y2={gy} />
            )}
          </g>

          {/* The flag, at the middle of the green. */}
          <g transform={`translate(${gx.toFixed(1)} ${gy.toFixed(1)})`} pointerEvents="none">
            <line x1={0} y1={0} x2={0} y2={-16} stroke="#ffffff" strokeWidth={1.6} />
            <path d="M0 -16 L10 -12.5 L0 -9 Z" fill="#cf4a35" />
            <circle r={2.2} fill="#182019" />
          </g>

          {hazards.map((hz, i) => {
            const [hx, hy] = toScreen(hz.at)
            const label = hz.kind === 'w' ? `Water ${hz.reach} · ${hz.carry}` : `Bunker ${hz.carry}`
            return (
              <text key={i} x={hx + 10} y={hy + 4} fontSize={12} fontWeight={700} fill={hz.kind === 'w' ? '#0c447c' : '#6b4a12'} stroke="#ffffff" strokeWidth={3} paintOrder="stroke" pointerEvents="none">
                {label}
              </text>
            )
          })}

          {target && (
            <>
              <circle cx={tx} cy={ty} r={15} fill="none" stroke="#ffffff" strokeWidth={3} pointerEvents="none" />
              <circle cx={tx} cy={ty} r={3} fill="#ffffff" pointerEvents="none" />
              {chip((sx + tx) / 2, (sy + ty) / 2, `${yards(start, target)} yds`, 'to')}
              {chip((tx + gx) / 2, (ty + gy) / 2, `${yards(target, centre)} left`, 'left')}
            </>
          )}

          {here ? (
            <g pointerEvents="none">
              <circle cx={sx} cy={sy} r={9} fill="#ffffff" />
              <circle cx={sx} cy={sy} r={6} fill="#2f6fa3" />
            </g>
          ) : (
            <circle cx={sx} cy={sy} r={4} fill="#ffffff" stroke="#182019" strokeWidth={1.5} pointerEvents="none" />
          )}
        </svg>
      )}
      <span className="pointer-events-none absolute bottom-1 right-1.5 text-caption text-ink/50">© OpenStreetMap</span>
    </div>
  )
}

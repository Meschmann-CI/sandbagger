import { useEffect, useRef, useState } from 'react'
import { money } from '../lib/money'

// The small celebrations: confetti, a number that rolls, a rubber stamp.
// Each one is tied to something that just happened on the course, and
// each one stands down when the phone asks for reduced motion.

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// iOS Safari has never had navigator.vibrate, and the whole group is on
// iPhones. Since Safari 18, toggling an <input type="checkbox" switch>
// plays the system's light tap, and clicking a hidden one's label from
// script does the same. It's a workaround Apple could close, in which
// case this goes quiet again, which is no worse than before.
function iosTap() {
  const label = document.createElement('label')
  label.ariaHidden = 'true'
  label.style.display = 'none'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  label.appendChild(input)
  document.head.appendChild(label)
  label.click()
  label.remove()
}

/**
 * A short buzz. A pattern is [on, off, on, ...] in ms; on an iPhone each
 * "on" becomes one tap at the same spacing, since a tap has no length.
 */
export function buzz(pattern: number | number[] = 20) {
  // Browsers refuse (and log an error) before the first tap on the page,
  // which is exactly when the handover opens. Skip it then.
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  if (activation && !activation.hasBeenActive) return
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
      return
    }
    const steps = Array.isArray(pattern) ? pattern : [pattern]
    let at = 0
    steps.forEach((ms, i) => {
      if (i % 2 === 0) setTimeout(iosTap, at)
      at += ms
    })
  } catch {
    // Not supported, or blocked: silence is fine.
  }
}

const CONFETTI = ['#efe3c8', '#d9b45a', '#b98a24', '#f6e7b0', '#ffffff', '#86c46c']

/**
 * Gold confetti from a point, over the whole screen. Fires once per
 * change of `fire` (a counter), and draws nothing when motion is reduced.
 */
export function Confetti({ fire, originY = 0.35, count = 110 }: { fire: number; originY?: number; count?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!fire || reducedMotion()) return
    const el = canvas.current
    if (!el) return
    const w = window.innerWidth
    const h = window.innerHeight
    const dpr = window.devicePixelRatio || 1
    el.width = w * dpr
    el.height = h * dpr
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    const bits = Array.from({ length: count }, () => ({
      x: w / 2,
      y: h * originY,
      vx: (Math.random() - 0.5) * 11,
      vy: -Math.random() * 10 - 3,
      w: 4 + Math.random() * 5,
      h: 7 + Math.random() * 7,
      a: Math.random() * 6,
      va: (Math.random() - 0.5) * 0.3,
      c: CONFETTI[(Math.random() * CONFETTI.length) | 0],
    }))
    let frame = 0
    let raf = 0
    const tick = () => {
      ctx.clearRect(0, 0, w, h)
      for (const b of bits) {
        b.vy += 0.2
        b.vx *= 0.99
        b.x += b.vx
        b.y += b.vy
        b.a += b.va
        ctx.save()
        ctx.translate(b.x, b.y)
        ctx.rotate(b.a)
        ctx.fillStyle = b.c
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.a)))
        ctx.restore()
      }
      if (++frame < 220) raf = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, w, h)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [fire, originY, count])
  return <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-[80] h-full w-full" aria-hidden />
}

/**
 * An amount of money that rolls down to $0 when `run` turns true, then
 * calls `onDone`. Settling up should feel like something happened.
 */
export function RollDown({ amount, run, onDone, className = '' }: { amount: number; run: boolean; onDone: () => void; className?: string }) {
  const [shown, setShown] = useState(amount)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    if (!run) {
      setShown(amount)
      return
    }
    if (reducedMotion()) {
      done.current()
      return
    }
    const start = performance.now()
    const ms = 700
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      // Ease out: fast off the top, settling onto zero.
      setShown(Math.round(amount * (1 - p) ** 3 * 100) / 100)
      if (p < 1) raf = requestAnimationFrame(step)
      else done.current()
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [run, amount])
  return <span className={`tabular-nums ${className}`}>{money(shown)}</span>
}

/** The rubber stamp on anyone who played suspiciously well. */
export function SandbagStamp({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      className={`stamp-in inline-block shrink-0 rounded-[4px] border-2 border-flag font-extrabold uppercase text-flag ${
        size === 'md' ? 'px-2 py-0.5 text-footnote tracking-[0.14em]' : 'px-1.5 py-px text-caption tracking-[0.12em]'
      }`}
      style={{ transform: 'rotate(-8deg)' }}
      title="Played well below their handicap"
    >
      Sandbagger
    </span>
  )
}

/**
 * A number that counts up from zero the first time it's shown in a
 * session, then just sits there. About 700ms, fast off the start and
 * settling on the value, so the data feels live without making anyone
 * wait. `id` names it, so coming back to the screen doesn't replay it.
 */
export function CountUp({ value, id, format = (n) => String(Math.round(n)), className = '' }: { value: number; id: string; format?: (n: number) => string; className?: string }) {
  const key = `sandbagger-counted:${id}:${value}`
  const [shown, setShown] = useState(() => {
    try {
      return reducedMotion() || sessionStorage.getItem(key) ? value : 0
    } catch {
      return value
    }
  })
  useEffect(() => {
    if (shown === value) return
    const start = performance.now()
    const ms = 700
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      setShown(value * (1 - (1 - p) ** 3))
      if (p < 1) raf = requestAnimationFrame(step)
      else {
        setShown(value)
        try {
          sessionStorage.setItem(key, '1')
        } catch {
          // fine: it counts again next time
        }
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // Runs once per mount; `shown` starting at the value means nothing to do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, key])
  return <span className={`tabular-nums ${className}`}>{format(shown)}</span>
}

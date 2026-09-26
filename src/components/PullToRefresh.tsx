import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../data/store'
import { buzz } from './Delight'

// Pull down at the top of a screen to fetch the latest from the group.
// A ball rolls toward the cup as you pull; let go past the line and it
// drops in while the refresh runs, and the flag comes out of the hole
// when it's done. Home-screen apps on iOS have no pull-to-refresh of
// their own, so this is the only one there is.
//
// Off on the scoring screen (the pad is down there and a thumb drags a
// lot) and whenever a sheet or dialog is up.

const TRIGGER = 64
const MAX = 110

export default function PullToRefresh() {
  const { refresh } = useStore()
  const { pathname } = useLocation()
  const [pull, setPull] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'refreshing' | 'done'>('idle')
  const pullRef = useRef(0)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const disabled = /^\/rounds\/[^/]+\/card/.test(pathname)

  useEffect(() => {
    if (disabled) return
    let startY = 0
    let startX = 0
    let tracking = false
    const set = (v: number) => {
      pullRef.current = v
      setPull(v)
    }
    const blocked = () => !!document.querySelector('[role="dialog"], [role="alertdialog"]')

    const onStart = (e: TouchEvent) => {
      if (phaseRef.current !== 'idle' || window.scrollY > 0 || e.touches.length !== 1 || blocked()) return
      startY = e.touches[0].clientY
      startX = e.touches[0].clientX
      tracking = true
    }
    const onMove = (e: TouchEvent) => {
      if (!tracking) return
      const dy = e.touches[0].clientY - startY
      const dx = e.touches[0].clientX - startX
      // A sideways swipe (the rounds carousel) or any scroll away from
      // the top ends it.
      if (window.scrollY > 0 || Math.abs(dx) > Math.abs(dy)) {
        tracking = false
        set(0)
        return
      }
      set(dy > 0 ? Math.min(MAX, dy * 0.5) : 0)
    }
    const onEnd = async () => {
      if (!tracking) return
      tracking = false
      if (pullRef.current < TRIGGER) {
        set(0)
        return
      }
      set(TRIGGER)
      setPhase('refreshing')
      const started = Date.now()
      try {
        await refresh()
      } catch {
        // Offline: the ball still sinks; what's on screen is what we have.
      }
      // Long enough to see the ball drop, even when the network is quick.
      await new Promise((r) => setTimeout(r, Math.max(0, 700 - (Date.now() - started))))
      setPhase('done')
      buzz(15)
      setTimeout(() => {
        set(0)
        setPhase('idle')
      }, 550)
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [disabled, refresh])

  if (disabled || (pull === 0 && phase === 'idle')) return null

  const p = Math.min(1, pull / TRIGGER)
  const sunk = phase !== 'idle'
  const ballX = sunk ? 94 : 14 + 74 * p
  const easing = 'transition-all duration-500 ease-[cubic-bezier(0.3,1.3,0.5,1)]'

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-[env(safe-area-inset-top)]"
      style={{ transform: `translateY(${pull - 44}px)`, transition: tracking(phase) ? undefined : 'transform 0.35s ease' }}
      aria-hidden
    >
      <div className="mt-2 rounded-full border border-line bg-card/95 px-2 py-1 shadow-[0_6px_18px_rgba(24,32,25,0.14)] backdrop-blur">
        <svg width="120" height="34" viewBox="0 0 120 34">
          <line x1="6" y1="27" x2="114" y2="27" stroke="var(--color-line-strong)" strokeWidth="1.5" strokeLinecap="round" />
          <ellipse cx="94" cy="27" rx="7" ry="2.4" fill="var(--color-ink)" />
          <g className={easing} style={{ transform: phase === 'done' ? 'translateY(-7px)' : 'none' }}>
            <line x1="94" y1="6" x2="94" y2="27" stroke="var(--color-ink-dim)" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M94 6 l10 3.4 -10 3.4z" fill="var(--color-flag)" />
          </g>
          <circle
            className={sunk ? easing : undefined}
            cx={ballX}
            cy={sunk ? 28.5 : 22}
            r={sunk ? 3.2 : 4.6}
            fill="#ffffff"
            stroke="var(--color-ink-faint)"
            strokeWidth="1"
            style={{ opacity: phase === 'done' ? 0 : 1 }}
          />
        </svg>
      </div>
    </div>
  )
}

// While the finger is down the pill follows it exactly; once it lets go
// it eases back. (The phase is idle for as long as a pull is live.)
const tracking = (phase: string) => phase === 'idle'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PrimaryButton } from './ui'
import { buzz } from './Delight'

// Attesting the card. On a paper card the scorer and the player both
// sign before it's official, so when the last hole is in, the round asks
// for your initials. Scribble them with a finger, tap Attest, and the
// result card turns over.
//
// Signatures are kept on this phone (localStorage), so each golfer signs
// on their own. Showing everyone's on every phone would need a column on
// the round in the database.

const key = (roundId: string, playerId: string) => `sandbagger-attested:${roundId}:${playerId}`

export interface Attestation {
  date: string
  signature: string
}

export function readAttestation(roundId: string, playerId: string): Attestation | null {
  try {
    const raw = localStorage.getItem(key(roundId, playerId))
    return raw ? (JSON.parse(raw) as Attestation) : null
  } catch {
    return null
  }
}

function saveAttestation(roundId: string, playerId: string, a: Attestation) {
  try {
    localStorage.setItem(key(roundId, playerId), JSON.stringify(a))
  } catch {
    // private mode: it asks again next visit
  }
}

export function AttestSheet({
  roundId,
  playerId,
  name,
  onClose,
  onAttested,
}: {
  roundId: string
  playerId: string
  name: string
  onClose: () => void
  onAttested: (a: Attestation) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [inked, setInked] = useState(false)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const dpr = window.devicePixelRatio || 1
    const rect = el.getBoundingClientRect()
    el.width = rect.width * dpr
    el.height = rect.height * dpr
    const ctx = el.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 3.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1c4632'
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }

  const clear = () => {
    const el = canvas.current
    if (!el) return
    el.getContext('2d')!.clearRect(0, 0, el.width, el.height)
    setInked(false)
  }

  const attest = () => {
    const el = canvas.current
    if (!el || !inked) return
    const a = { date: new Date().toISOString().slice(0, 10), signature: el.toDataURL('image/png') }
    saveAttestation(roundId, playerId, a)
    buzz([15, 60, 25])
    onAttested(a)
  }

  return createPortal(
    <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true" aria-label="Attest the card">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 animate-[fade_0.2s_ease-out]" />
      <div className="sheet-up absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl bg-paper px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2.5 shadow-[0_-12px_40px_rgba(0,0,0,0.2)]">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-line-strong" />
        <div className="mt-3 flex items-center justify-between">
          <h2 className="text-title font-bold tracking-tight text-ink">Attest the card</h2>
          <button onClick={onClose} className="px-1 text-footnote font-bold text-ink-faint">
            Cancel
          </button>
        </div>
        <p className="mt-1 text-footnote text-ink-dim">Every hole is in. Your initials make it official, same as a paper card.</p>

        {/* The signing strip, drawn like the bottom of a scorecard */}
        <div className="relative mt-4 overflow-hidden rounded-2xl border border-line-strong bg-card">
          <div className="flex border-b border-line text-caption font-semibold uppercase tracking-wider text-ink-faint">
            <span className="flex-1 px-3 py-1.5">Attested</span>
            <span className="border-l border-line px-3 py-1.5">{name}</span>
          </div>
          <canvas
            ref={canvas}
            className="block h-36 w-full touch-none"
            onPointerDown={(e) => {
              drawing.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
              const ctx = e.currentTarget.getContext('2d')!
              const [x, y] = point(e)
              ctx.beginPath()
              ctx.moveTo(x, y)
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return
              const ctx = e.currentTarget.getContext('2d')!
              const [x, y] = point(e)
              ctx.lineTo(x, y)
              ctx.stroke()
              if (!inked) setInked(true)
            }}
            onPointerUp={() => {
              drawing.current = false
            }}
            aria-label="Draw your initials"
          />
          <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed border-line-strong" />
          {!inked && (
            <span className="pointer-events-none absolute inset-x-0 bottom-12 text-center text-footnote text-ink-faint">Initial here</span>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={clear} disabled={!inked} className="rounded-xl bg-ink/[0.06] px-5 py-3 text-body font-bold text-ink-dim disabled:opacity-40">
            Clear
          </button>
          <PrimaryButton onClick={attest} disabled={!inked} className="flex-1">
            Attest
          </PrimaryButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Player } from '../types'
import { money } from '../lib/money'

export function Avatar({ player, size = 40 }: { player: Player; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full font-bold shrink-0 text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: player.color,
      }}
    >
      {player.initials}
    </div>
  )
}

const CARD_BASE = 'rounded-2xl border border-line bg-card shadow-[0_1px_2px_rgba(24,32,25,0.05)]'

// Navigation cards are the app's main control, so a tappable one renders
// as a real button: reachable by keyboard, announced as an action, and it
// gets a focus ring. As a bare div with a click handler it was none of
// those things.
export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${CARD_BASE} w-full text-left cursor-pointer active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green ${className}`}
      >
        {children}
      </button>
    )
  }
  return <div className={`${CARD_BASE} ${className}`}>{children}</div>
}

/** A tappable row inside a Card list — same reasoning as Card above. */
export function RowButton({ children, onClick, className = '' }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left cursor-pointer active:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green ${className}`}
    >
      {children}
    </button>
  )
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-1 mb-2.5 mt-7">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-faint">{children}</h2>
      {action}
    </div>
  )
}

export function MoneyBadge({ amount, className = '' }: { amount: number; className?: string }) {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : ''
  const color = amount > 0 ? 'text-green' : amount < 0 ? 'text-flag' : 'text-ink-faint'
  return (
    <span className={`font-bold tabular-nums ${color} ${className}`}>
      {sign}
      {money(Math.abs(amount))}
    </span>
  )
}

/**
 * A "?" that opens a short explainer next to whatever it's attached to.
 *
 * Tap to open, tap anywhere to close — no hover, because there's no
 * hover on a phone and a rules panel you can't dismiss with a thumb is
 * worse than no rules panel. The card it sits in never gets taller: the
 * panel floats over the content, pinned to the right edge so it can't
 * run off the side of a narrow screen.
 */
export function HelpTip({ title, lines }: { title: string; lines: string[] }) {
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)

  // The "?" is rarely at the edge of its card, so right-aligning the
  // panel to the button alone sent it off the side of a 375px screen.
  // Measure once it's up and slide it back inside.
  useLayoutEffect(() => {
    if (!open) {
      setShift(0)
      return
    }
    const el = panel.current
    if (!el) return
    const margin = 10
    const box = el.getBoundingClientRect()
    // The rect already includes any shift from a previous pass, so work
    // from the untranslated position.
    const left = box.left - shift
    const right = box.right - shift
    if (left < margin) setShift(margin - left)
    else if (right > window.innerWidth - margin) setShift(window.innerWidth - margin - right)
    else setShift(0)
  }, [open, shift])

  return (
    <span className="relative inline-flex shrink-0 align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`How ${title} works`}
        className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border text-[11px] font-extrabold leading-none transition ${
          open ? 'bg-ink text-white border-ink' : 'border-line-strong bg-card text-ink-faint'
        }`}
      >
        ?
      </button>
      {open && (
        <>
          {/* Catches the dismissing tap without stealing the first one
              from whatever's underneath being read. */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <span
            ref={panel}
            role="tooltip"
            style={{ transform: `translateX(${shift}px)` }}
            className="absolute right-0 top-[calc(100%+6px)] z-50 w-[264px] rounded-xl border border-line-strong bg-card p-3 text-left shadow-[0_8px_24px_rgba(24,32,25,0.16)]"
          >
            <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">{title}</span>
            {lines.map((line, i) => (
              <span key={i} className="block text-[12px] leading-[1.45] text-ink-dim mb-1.5 last:mb-0">
                {line}
              </span>
            ))}
          </span>
        </>
      )}
    </span>
  )
}

export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'gold' | 'green' | 'flag' }) {
  const tones = {
    default: 'bg-paper text-ink-dim border-line',
    gold: 'bg-gold-soft text-gold border-gold/30',
    green: 'bg-green-soft text-green border-green/25',
    flag: 'bg-flag-soft text-flag border-flag/25',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function EmptyState({ title, sub, cta }: { title: string; sub?: string; cta?: ReactNode }) {
  return (
    <div className="text-center py-14 px-6">
      <div className="text-4xl mb-3">⛳</div>
      <p className="text-lg font-extrabold text-ink">{title}</p>
      {sub && <p className="text-sm text-ink-dim mt-1.5 max-w-[270px] mx-auto">{sub}</p>}
      {cta && <div className="mt-5">{cta}</div>}
    </div>
  )
}

// The Saddam: the trophy that belongs to whoever won the last group
// round. The artwork is black line art on an opaque white background, so
// multiply blending drops the white and lets it sit on the gold cards and
// tinted rows without a visible square around it.
export function SaddamIcon({ size = 18 }: { size?: number }) {
  return (
    <img
      src="/saddam.png"
      alt="The Saddam"
      width={size}
      height={size}
      style={{ width: size, height: size, mixBlendMode: 'multiply' }}
      className="shrink-0 select-none"
      draggable={false}
    />
  )
}

export function SaddamBadge({ size = 18 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-gold-soft border border-gold/30 text-ink shrink-0"
      style={{ width: size + 8, height: size + 8 }}
      title="Current holder of the Saddam"
    >
      <SaddamIcon size={size} />
    </span>
  )
}

export function PrimaryButton({ children, onClick, disabled, className = '' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl bg-green px-5 py-3 font-bold text-[15px] text-white shadow-[0_2px_6px_rgba(28,124,74,0.35)] disabled:opacity-30 disabled:shadow-none active:scale-[0.98] transition ${className}`}
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, onClick, className = '' }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border border-line-strong bg-card px-5 py-3 font-bold text-[15px] text-ink-dim active:bg-paper transition ${className}`}
    >
      {children}
    </button>
  )
}

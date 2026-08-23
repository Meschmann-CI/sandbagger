import type { ReactNode } from 'react'
import type { Player } from '../types'

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

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-line bg-card shadow-[0_1px_2px_rgba(24,32,25,0.05)] ${onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''} ${className}`}
    >
      {children}
    </div>
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
      {sign}${Math.abs(amount)}
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

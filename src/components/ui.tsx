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

// The Saddam: the little trophy that belongs to whoever won the last
// group round. Gold cup, unmistakable mustache.
export function SaddamIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="The Saddam" role="img">
      <path d="M7 4 H17 V10 a5 5 0 0 1 -10 0 Z" fill="#e0b23e" stroke="#b98a24" strokeWidth="1.1" />
      <path d="M7 5.5 H4.2 a0.5 0.5 0 0 0 -0.5 0.6 C4.1 8.6 5.4 10.2 7.4 10.8" stroke="#b98a24" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M17 5.5 H19.8 a0.5 0.5 0 0 1 0.5 0.6 C19.9 8.6 18.6 10.2 16.6 10.8" stroke="#b98a24" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M11 14.6 h2 l0.6 3 h-3.2 Z" fill="#b98a24" />
      <rect x="8.2" y="17.6" width="7.6" height="2.6" rx="0.9" fill="#8a6519" />
      <path d="M9.2 8.2 c0.7 -0.9 2 -0.6 2.5 0.15 c-0.9 0.5 -2 0.4 -2.5 -0.15 Z" fill="#4a3410" />
      <path d="M14.8 8.2 c-0.7 -0.9 -2 -0.6 -2.5 0.15 c0.9 0.5 2 0.4 2.5 -0.15 Z" fill="#4a3410" />
    </svg>
  )
}

export function SaddamBadge({ size = 18 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-gold-soft border border-gold/30 shrink-0"
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

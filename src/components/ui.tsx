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
// round. Drawn as a silhouette so the cap and the moustache still read at
// badge size, and in currentColor so it sits on any background.
export function SaddamIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-label="The Saddam" role="img">
      {/* peaked cap, swept up to the left, with its insignia */}
      <path d="M3.1 6.5 C6.4 2.2 11.4 0.6 15.6 1.3 c3.4 0.6 4.4 3.3 3.6 6.6 l-0.5 2.2 -14.3 0 C3.2 10.1 2.4 9.4 2.6 8.5 Z" />
      <circle cx="15.3" cy="4.6" r="1.35" fill="#fff" />
      {/* ears */}
      <path d="M4.6 12.1 c-1 0 -1.5 0.8 -1.4 1.9 0.1 1.2 0.7 2 1.7 2 Z" />
      <path d="M19.4 12.1 c1 0 1.5 0.8 1.4 1.9 -0.1 1.2 -0.7 2 -1.7 2 Z" />
      {/* head and jaw */}
      <path d="M4.9 8.6 h14.2 l0.5 6.6 c0.2 2 -0.9 3.3 -2.2 4 -0.9 0.5 -1.4 1 -1.9 1.7 -0.9 1.3 -2.1 2 -3.5 2 s-2.6 -0.7 -3.5 -2 c-0.5 -0.7 -1 -1.2 -1.9 -1.7 -1.3 -0.7 -2.4 -2 -2.2 -4 Z" />
      {/* eyes, knocked out of the silhouette */}
      <path d="M6.6 10.6 h4.2 v2.7 h-4.2 Z" fill="#fff" />
      <path d="M13.2 10.6 h4.2 v2.7 h-4.2 Z" fill="#fff" />
      <circle cx="8.7" cy="12" r="0.85" />
      <circle cx="15.3" cy="12" r="0.85" />
      {/* nose bridge */}
      <path d="M11.4 10.9 h1.2 v4.2 h-1.2 Z" fill="#fff" />
      {/* the moustache */}
      <path d="M7.2 16.2 c1.6 -0.6 3.2 -0.9 4.8 -0.9 s3.2 0.3 4.8 0.9 v1.9 h-9.6 Z" fill="#fff" />
      <path d="M7.9 17.1 c1.3 -0.4 2.7 -0.6 4.1 -0.6 s2.8 0.2 4.1 0.6" stroke="currentColor" strokeWidth="1.1" fill="none" />
    </svg>
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

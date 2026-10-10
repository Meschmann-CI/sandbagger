import { useId } from 'react'
import type { Badge } from '../lib/badges'
import { COLORS, ICONS, SHAPES, TROPHY_ART, type ArtShelf, type TrophyArt } from '../lib/trophyArt'

// The shelf a trophy's kind sits on, for one the art file doesn't know yet.
const SHELF_OF: Record<Badge['kind'], ArtShelf> = { legend: 'legend', brag: 'brag', group: 'group', odd: 'odd', locker: 'locker', shame: 'nobody' }

/**
 * One trophy as its badge: the shelf's shape and colours with a numeral
 * or an icon on the face, pencil gray in the same shape until it's
 * earned, a lock dot on the locked ones and a count dot on the ones
 * earned more than once. Artwork from the Claude Design handoff
 * (lib/trophyArt.ts); the dots sit on top as HTML, as it specifies.
 */
export function Medal({ badge, size = 66 }: { badge: Badge; size?: number }) {
  const art: TrophyArt = TROPHY_ART[badge.key] ?? { shelf: SHELF_OF[badge.kind], num: badge.mark }
  const dot = Math.max(18, Math.round(size * 0.26))
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <TrophyBadge art={art} locked={!badge.earned} size={size} />
      {badge.earned && badge.count > 1 && (
        <span
          className="absolute flex items-center justify-center rounded-full bg-[#1A1F1C] px-1 font-extrabold text-white ring-2 ring-paper tabular-nums"
          style={{ right: '-4%', top: '-2%', height: dot, minWidth: dot, fontSize: Math.max(11, Math.round(size * 0.14)) }}
        >
          {badge.count}
        </span>
      )}
      {!badge.earned && (
        <span
          className="absolute flex items-center justify-center rounded-full bg-[#8E8B82] ring-2 ring-paper"
          style={{ right: '-4%', bottom: '2%', width: dot, height: dot }}
          aria-hidden
        >
          <svg width={dot * 0.55} height={dot * 0.55} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
          </svg>
        </span>
      )}
    </span>
  )
}

/** The badge itself: rim, recessed face, dimples, sheen, and the glyph. */
export function TrophyBadge({ art, locked = false, size = 120 }: { art: TrophyArt; locked?: boolean; size?: number }) {
  // Gradient and clip ids must be unique on the page and safe inside url(#…).
  const id = `tb${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const shelf = SHAPES[art.shelf] ? art.shelf : 'brag'
  const c = COLORS[locked ? 'locked' : shelf]
  const shape = SHAPES[shelf]
  const face = 'translate(60 60) scale(0.8) translate(-60 -60)'
  const num = art.num ?? ''
  const sub = art.sub ?? ''
  const iconD = !num && art.icon ? ICONS[art.icon] : ''
  const numSize = num.length <= 1 ? 52 : num.length === 2 ? 44 : num.length === 3 ? 34 : 27
  const numY = sub ? Math.round(52 + numSize * 0.7) : Math.round(60 + numSize * 0.36)
  const shadow = locked ? 0 : 0.22
  const font = "Manrope, 'Helvetica Neue', Arial, sans-serif"
  return (
    <svg viewBox="-8 -8 136 136" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id={`${id}r`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor={c.rim1} />
          <stop offset="0.5" stopColor={c.rim2} />
          <stop offset="1" stopColor={c.rim3} />
        </linearGradient>
        <linearGradient id={`${id}f`} x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor={c.face1} />
          <stop offset="1" stopColor={c.face2} />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <path d={shape} transform={face} />
        </clipPath>
        <pattern id={`${id}d`} width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.35" fill="#000" fillOpacity="0.09" />
          <circle cx="6" cy="6" r="1.35" fill="#000" fillOpacity="0.09" />
        </pattern>
        <filter id={`${id}s`} x="-20%" y="-20%" width="140%" height="140%">
          {locked ? (
            <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodColor="#3C3728" floodOpacity="0.18" />
          ) : (
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#32301A" floodOpacity="0.28" />
          )}
        </filter>
      </defs>
      <g filter={`url(#${id}s)`}>
        <path d={shape} fill={`url(#${id}r)`} />
        <path d={shape} transform="translate(60 60) scale(0.865) translate(-60 -60)" fill="#000" fillOpacity="0.3" />
        <path d={shape} transform={face} fill={`url(#${id}f)`} />
      </g>
      <g clipPath={`url(#${id}c)`}>
        <rect x="0" y="0" width="120" height="120" fill={`url(#${id}d)`} />
        <ellipse cx="60" cy="22" rx="56" ry="30" fill="#fff" fillOpacity="0.17" />
      </g>
      <path d={shape} transform={face} fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="1.2" />
      {iconD ? (
        <g transform="translate(34 34) scale(2.1667)" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.1">
          {shadow > 0 && <path d={iconD} stroke="#000" strokeOpacity={shadow} transform="translate(0 0.75)" />}
          <path d={iconD} stroke={c.glyph} />
        </g>
      ) : num ? (
        <>
          {sub && (
            <text x="60" y="44" textAnchor="middle" fontFamily={font} fontWeight="800" fontSize="10" letterSpacing="1.4" fill={c.glyph} fillOpacity="0.88">
              {sub}
            </text>
          )}
          {shadow > 0 && (
            <text x="60" y={numY + 1.5} textAnchor="middle" fontFamily={font} fontWeight="800" fontSize={numSize} letterSpacing="-1" fill="#000" fillOpacity={shadow}>
              {num}
            </text>
          )}
          <text x="60" y={numY} textAnchor="middle" fontFamily={font} fontWeight="800" fontSize={numSize} letterSpacing="-1" fill={c.glyph}>
            {num}
          </text>
        </>
      ) : null}
    </svg>
  )
}

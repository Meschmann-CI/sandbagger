import type { Badge } from '../lib/badges'
import { ICONS, SHAPES, TROPHY_ART, type ArtShelf, type TrophyArt } from '../lib/trophyArt'
import { EXTRA_TROPHY_ART } from '../lib/trophyArtExtra'

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
  const art: TrophyArt = TROPHY_ART[badge.key] ?? EXTRA_TROPHY_ART[badge.key] ?? { shelf: SHELF_OF[badge.kind], num: badge.mark }
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

// Flat (Matt, 2026-10-22, option 1b of the Bandit refinement): one flat
// rim and one flat face, no gradients, dimples, sheen or shadow. Each
// shelf keeps its own colour (Matt: the other shelves shouldn't go gray);
// the brags are brass, locked ones pencil gray. Shapes and glyphs unchanged.
const FLAT: Record<ArtShelf | 'locked', { rim: string; face: string; glyph: string }> = {
  legend: { rim: '#D9AE4A', face: '#22543A', glyph: '#F1D58C' },
  brag: { rim: '#C6A55C', face: '#EBDCAE', glyph: '#5C3F0E' },
  group: { rim: '#B9C1CA', face: '#4579B5', glyph: '#FFFFFF' },
  odd: { rim: '#B9C1CA', face: '#8863AE', glyph: '#FFFFFF' },
  locker: { rim: '#D8A193', face: '#CD5F7A', glyph: '#FFFFFF' },
  nobody: { rim: '#AA906C', face: '#926341', glyph: '#FFF1DC' },
  locked: { rim: '#D9D7CF', face: '#F1F0EB', glyph: '#A3A096' },
}

/** The badge itself: a flat rim, a flat face and the glyph. */
export function TrophyBadge({ art, locked = false, size = 120 }: { art: TrophyArt; locked?: boolean; size?: number }) {
  const shelf = SHAPES[art.shelf] ? art.shelf : 'brag'
  const c = FLAT[locked ? 'locked' : shelf]
  const shape = SHAPES[shelf]
  const face = 'translate(60 60) scale(0.8) translate(-60 -60)'
  const num = art.num ?? ''
  const sub = art.sub ?? ''
  const iconD = !num && art.icon ? ICONS[art.icon] : ''
  const numSize = num.length <= 1 ? 52 : num.length === 2 ? 44 : num.length === 3 ? 34 : 27
  const numY = sub ? Math.round(52 + numSize * 0.7) : Math.round(60 + numSize * 0.36)
  const font = "Manrope, 'Helvetica Neue', Arial, sans-serif"
  return (
    <svg viewBox="-8 -8 136 136" width={size} height={size} aria-hidden>
      <path d={shape} fill={c.rim} />
      <path d={shape} transform={face} fill={c.face} />
      {iconD ? (
        <g transform="translate(34 34) scale(2.1667)" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.1">
          <path d={iconD} stroke={c.glyph} />
        </g>
      ) : num ? (
        <>
          {sub && (
            <text x="60" y="44" textAnchor="middle" fontFamily={font} fontWeight="700" fontSize="10" letterSpacing="1.4" fill={c.glyph} fillOpacity="0.85">
              {sub}
            </text>
          )}
          <text x="60" y={numY} textAnchor="middle" fontFamily={font} fontWeight="700" fontSize={numSize} letterSpacing="-1" fill={c.glyph}>
            {num}
          </text>
        </>
      ) : null}
    </svg>
  )
}

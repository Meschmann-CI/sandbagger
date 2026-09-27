import type { ScoreKind } from '../lib/courses'

// How a hole's score reads against par, drawn the way a paper card is:
// a circle under par and a square over it, two of each for an eagle or a
// double. The good news is the loudest thing on the card: circles are
// fairway green with a soft fill, while squares are gray hairlines and
// never red. Red means money you owe everywhere else in the app, and a
// rough day used to turn a whole row into a wall of it. The second ring
// is a box-shadow: a 1.5px gap in the card's colour, then the ring. The
// live card and the finished card both draw from here so they can't
// drift apart. (Class names written out whole: Tailwind only generates
// what it can read in the source.)
export const SCORE_MARK: Record<ScoreKind, string> = {
  albatross:
    'rounded-full border-[1.5px] border-gold bg-gold-soft text-gold font-extrabold shadow-[0_0_0_1.5px_var(--color-card),0_0_0_3px_var(--color-gold)]',
  eagle:
    'rounded-full border-[1.5px] border-green bg-green-soft text-green-deep font-extrabold shadow-[0_0_0_1.5px_var(--color-card),0_0_0_3px_var(--color-green)]',
  birdie: 'rounded-full border-[1.5px] border-green bg-green-soft text-green-deep font-extrabold',
  par: 'text-ink font-bold',
  bogey: 'rounded-[4px] border border-ink-faint/45 text-ink font-bold',
  double:
    'rounded-[4px] border border-ink-faint/45 text-ink font-bold shadow-[0_0_0_2px_var(--color-card),0_0_0_3px_rgb(104_114_106/0.45)]',
  worse:
    'rounded-[4px] border border-ink-faint/45 bg-ink/[0.06] text-ink font-bold shadow-[0_0_0_2px_var(--color-card),0_0_0_3px_rgb(104_114_106/0.45)]',
}

/** The strokes a golfer gets on a hole, as the dots a paper card carries. */
export function StrokeDots({ count }: { count?: number }) {
  return (
    <span className="flex h-2 items-center justify-center gap-[2px]" aria-hidden>
      {Array.from({ length: Math.min(count ?? 0, 3) }, (_, k) => (
        <span key={k} className="h-[4px] w-[4px] rounded-full bg-gold" />
      ))}
    </span>
  )
}

function Swatch({ kind }: { kind: ScoreKind }) {
  return <span className={`inline-block h-3 w-3 ${SCORE_MARK[kind]} scale-90`} />
}

/** The key under a card. `strokeLabel` only when the card shows stroke dots. */
export function MarkLegend({ pars, strokeLabel }: { pars: boolean; strokeLabel?: string }) {
  return (
    <>
      {strokeLabel && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[5px] w-[5px] rounded-full bg-gold" /> {strokeLabel}
        </span>
      )}
      {pars && (
        <>
          <span className="inline-flex items-center gap-1.5">
            <Swatch kind="eagle" /> eagle
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Swatch kind="birdie" /> birdie
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Swatch kind="bogey" /> bogey
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Swatch kind="double" /> double+
          </span>
        </>
      )}
    </>
  )
}

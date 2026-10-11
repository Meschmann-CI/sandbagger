import { useEffect, useState } from 'react'
import { drawable, greenCentre, greenYards, metres, ON_HOLE_METRES, teeOf, type CourseMap, type LngLat, type MapHole } from '../lib/courseMap'
import HoleMap from './HoleMap'
import { Icon } from './icons'

// The hole full screen: drag the target anywhere for the distance to it
// and what's left, with front, middle and back of the green underneath.
// Opened from the drawing on the Hole view, and from a course's page to
// look the holes over at home (distances from the tee then).

/** Where the target starts: the dogleg's corner, or a little over halfway to the green. */
function defaultTarget(map: CourseMap, hole: MapHole, start: LngLat): LngLat {
  const c = greenCentre(map, hole)
  const bend = hole.line && hole.line.length > 2 ? hole.line[1] : null
  // The corner only when it's on the way: from off to one side of a
  // dogleg, going via the corner is a detour, not a layup.
  if (bend && metres(start, bend) > 40 && metres(start, bend) + metres(bend, c) < metres(start, c) * 1.12) return bend
  const f = 0.55
  return [start[0] + (c[0] - start[0]) * f, start[1] + (c[1] - start[1]) * f]
}

interface Props {
  map: CourseMap
  /** The map's hole for round hole index 0-17, if it has one. */
  holeAt: (i: number) => MapHole | undefined
  index: number
  onIndex: (i: number) => void
  par?: number | null
  from?: LngLat | null
  /** Shown over the map, fixed to the screen. Off: laid out in the page (the course map page). */
  overlay?: boolean
  onClose?: () => void
}

export default function HoleMapSheet({ map, holeAt, index, onIndex, par, from, overlay = true, onClose }: Props) {
  const hole = holeAt(index)
  const centre = hole ? greenCentre(map, hole) : null
  const here = from && centre && metres(from, centre) < ON_HOLE_METRES ? from : null
  const start = hole ? (here ?? teeOf(map, hole)) : null
  const [target, setTarget] = useState<LngLat | null>(null)

  // A fresh target on each hole, and again when the GPS first finds you.
  const located = !!here
  useEffect(() => {
    setTarget(hole && start ? defaultTarget(map, hole, start) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, hole, located])

  // Prev and next skip holes the map doesn't have.
  const step = (dir: 1 | -1) => {
    for (let i = index + dir; i >= 0 && i < 18; i += dir) {
      if (holeAt(i)) return onIndex(i)
    }
  }
  const g = hole && start ? greenYards(map, hole, start) : null

  return (
    <div className={overlay ? 'fixed inset-y-0 left-1/2 z-[70] flex w-full max-w-md -translate-x-1/2 flex-col bg-paper' : 'flex flex-col'} style={overlay ? { paddingTop: 'env(safe-area-inset-top)' } : { height: 'calc(100dvh - 260px)', minHeight: 380 }}>
      <div className="flex items-center gap-2 border-b border-line bg-card px-3 py-2">
        <button onClick={() => step(-1)} aria-label="Previous hole" className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-ink active:scale-95">
          <Icon name="chevronLeft" size={20} />
        </button>
        <p className="flex-1 text-center text-headline font-bold text-ink">
          Hole {index + 1}
          {par ? ` · Par ${par}` : hole?.par ? ` · Par ${hole.par}` : ''}
        </p>
        <button onClick={() => step(1)} aria-label="Next hole" className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-ink active:scale-95">
          <Icon name="chevronRight" size={20} />
        </button>
        {onClose && (
          <button onClick={onClose} className="ml-1 px-2 text-footnote font-bold text-green">
            Done
          </button>
        )}
      </div>

      {hole && drawable(hole) ? (
        <HoleMap map={map} hole={hole} from={here} mode="full" target={target} onTarget={setTarget} className="min-h-0 flex-1" />
      ) : (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-footnote text-ink-dim">
          {hole ? 'Only the green is marked for this hole, so there’s nothing to draw. The distance to it still shows on the card.' : 'This hole isn’t on the map yet.'}
        </div>
      )}

      {g && (
        <div className="border-t border-line bg-card" style={overlay ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}>
          {!here && <p className="pt-2 text-center text-caption text-ink-faint">From the tee</p>}
          <div className="grid grid-cols-3 py-2 text-center">
            {(
              [
                ['Front', g.front],
                ['Middle', g.middle],
                ['Back', g.back],
              ] as const
            ).map(([label, v]) => (
              <div key={label}>
                <p className="text-caption font-semibold text-ink-faint">{label}</p>
                <p className="text-title font-extrabold tabular-nums text-ink">{v ?? '–'}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

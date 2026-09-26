import type { AppData, Round } from '../types'
import { courseSlug } from './courses'
import { HOLE_COUNT, cardOf, hasCard } from './holes'

// Racing yourself. A ghost is one of your own earlier cards at the same
// course, shown a hole at a time as you fill in today's — never ahead
// of where you are, because knowing you're chasing a 4 on the tee
// changes the swing, and that's not the point. The comparison is the
// point: same course, same you, different day.

export interface GhostOption {
  round: Round
  gross: number
  best: boolean
}

/** Earlier cards this golfer has at the round's course, newest first. */
export function ghostOptions(data: AppData, round: Round, playerId: string): GhostOption[] {
  const slug = courseSlug(round.courseName)
  const rows = data.rounds
    .filter((r) => r.id !== round.id && courseSlug(r.courseName) === slug && r.date <= round.date)
    .map((r) => ({ round: r, rp: r.players.find((p) => p.playerId === playerId) }))
    .filter((x): x is { round: Round; rp: NonNullable<typeof x.rp> } => !!x.rp && hasCard(x.rp))
    .map(({ round: r, rp }) => ({ round: r, gross: cardOf(rp).reduce<number>((s, h) => s + (h ?? 0), 0), best: false }))
    .sort((a, b) => b.round.date.localeCompare(a.round.date))
  const low = Math.min(...rows.map((r) => r.gross))
  for (const r of rows) r.best = rows.length > 1 && r.gross === low
  return rows
}

export interface GhostView {
  playerId: string
  round: Round
  /** The ghost's full card. Callers reveal it only where the live card has a score. */
  card: (number | null)[]
}

export function ghostFor(data: AppData, round: Round, playerId: string): GhostView | null {
  const g = round.ghosts?.find((x) => x.playerId === playerId)
  if (!g) return null
  const earlier = data.rounds.find((r) => r.id === g.roundId)
  const rp = earlier?.players.find((p) => p.playerId === playerId)
  if (!earlier || !rp || !hasCard(rp)) return null
  return { playerId, round: earlier, card: cardOf(rp) }
}

/**
 * Live against ghost over the holes the live card has filled in.
 * Positive = live is worse (more strokes), the way "+2" reads on a card.
 */
export function ghostDiff(live: (number | null)[], ghost: (number | null)[]) {
  let liveSum = 0
  let ghostSum = 0
  let holes = 0
  for (let i = 0; i < HOLE_COUNT; i++) {
    if (live[i] == null || ghost[i] == null) continue
    liveSum += live[i] as number
    ghostSum += ghost[i] as number
    holes++
  }
  return { holes, liveSum, ghostSum, diff: liveSum - ghostSum }
}

export const fmtDiff = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `−${Math.abs(n)}`)

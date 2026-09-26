import type { AppData, Round } from '../types'
import { hasScore, isGroupRound, isSoloRound, net, round1 } from '../types'
import { byDate, roundWinnerIds } from './stats'
import { coursePar, findCourse } from './courses'

// The rules behind the app's little reactions. Kept apart from the UI so
// the thresholds are in one place to argue about.

export interface Sandbag {
  playerId: string
  /** Strokes better than expected. */
  by: number
  /** What "expected" meant: their handicap against par, or their own average. */
  basis: 'handicap' | 'average'
}

/** How far under expectations counts as suspicious. */
const UNDER_HANDICAP = 3
const UNDER_AVERAGE = 5
const AVERAGE_NEEDS = 3

/**
 * Who, in a group round, played well enough below their handicap that
 * the group gets to say so. With par known: a net score three or more
 * under par. Without par: a gross five or more under their own average
 * from earlier rounds, once there are at least three to average.
 */
export function sandbaggers(data: AppData, round: Round): Sandbag[] {
  if (isSoloRound(round) || !isGroupRound(round)) return []
  const par = coursePar(findCourse(data, round.courseName))
  const out: Sandbag[] = []
  for (const rp of round.players.filter(hasScore)) {
    if (par != null) {
      const by = round1(par - net(rp))
      if (by >= UNDER_HANDICAP) out.push({ playerId: rp.playerId, by, basis: 'handicap' })
      continue
    }
    const earlier = data.rounds
      .filter((r) => r.id !== round.id && r.date < round.date)
      .map((r) => r.players.find((p) => p.playerId === rp.playerId))
      .filter((p): p is NonNullable<typeof p> => !!p && hasScore(p))
      .map((p) => p.gross as number)
    if (earlier.length < AVERAGE_NEEDS) continue
    const avg = earlier.reduce((a, b) => a + b, 0) / earlier.length
    const by = round1(avg - rp.gross)
    if (by >= UNDER_AVERAGE) out.push({ playerId: rp.playerId, by, basis: 'average' })
  }
  return out
}

export type Streak = { kind: 'hot' | 'cold'; count: number }

/** Three group wins running is hot; four group rounds without one is cold. */
const HOT_AFTER = 3
const COLD_AFTER = 4

/** Every golfer's current run of group rounds, where it's long enough to show. */
export function streakStates(data: AppData): Map<string, Streak> {
  const out = new Map<string, Streak>()
  const group = byDate(data.rounds).filter(isGroupRound)
  for (const player of data.players) {
    const mine = group.filter((r) => r.players.some((rp) => rp.playerId === player.id && hasScore(rp)))
    let wins = 0
    let losses = 0
    for (let i = mine.length - 1; i >= 0; i--) {
      const won = roundWinnerIds(mine[i]).includes(player.id)
      if (won && losses === 0) wins++
      else if (!won && wins === 0) losses++
      else break
    }
    if (wins >= HOT_AFTER) out.set(player.id, { kind: 'hot', count: wins })
    else if (losses >= COLD_AFTER) out.set(player.id, { kind: 'cold', count: losses })
  }
  return out
}

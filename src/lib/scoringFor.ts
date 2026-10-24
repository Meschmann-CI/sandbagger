import type { Round } from '../types'
import { cardOf, HOLE_COUNT } from './holes'

// Who a phone keeps score for, and whose entry wins (Matt, 2026-10-24,
// after a round where he kept his own and Barry's card but not Pat's).
//
// - Each phone picks golfers per round. Unpicked, it's everyone.
// - Whoever's holding it is asked first, then the rest in card order.
// - A golfer's own entry for a hole wins over anyone else's
//   (`RoundPlayer.selfHoles`, enforced again by merge_round_scores), and
//   once a golfer has entered any hole for themselves, other phones stop
//   asking for them: they're keeping their own.
// Same rules as BanditCore/ScoringFor.swift.

/** Golfers other than `me` who have entered a score for themselves. */
export const selfScoring = (round: Round, me: string | undefined) =>
  new Set(round.players.filter((p) => p.playerId !== me && p.selfHoles?.some(Boolean)).map((p) => p.playerId))

/** The golfers this phone asks for, in order: me first, then card order; only those picked, less anyone keeping their own. */
export function asks(round: Round, me: string | undefined, picked: string[] | undefined): string[] {
  const mine = round.players.map((p) => p.playerId)
  const chosen = new Set(picked ?? mine)
  const own = selfScoring(round, me)
  const rest = mine.filter((id) => id !== me && chosen.has(id) && !own.has(id))
  return me && mine.includes(me) && chosen.has(me) ? [me, ...rest] : rest
}

/** Whether `playerId`'s hole `h` was entered by the golfer themselves. */
export const enteredByThemselves = (round: Round, playerId: string, h: number) =>
  !!round.players.find((p) => p.playerId === playerId)?.selfHoles?.[h]

/**
 * A save as `me` sees it: holes another golfer entered for themselves stay
 * as they were, and holes `me` changed on their own card are marked as
 * entered by themselves.
 */
export function guardOwnHoles(before: Round | undefined, after: Round, me: string): Round {
  if (!before) return after
  return {
    ...after,
    players: after.players.map((rp) => {
      const was = before.players.find((p) => p.playerId === rp.playerId)
      if (!was) return rp
      const old = cardOf(was)
      const oldPutts = Array.from({ length: HOLE_COUNT }, (_, i) => was.putts?.[i] ?? null)
      const holes = cardOf(rp)
      const putts = Array.from({ length: HOLE_COUNT }, (_, i) => rp.putts?.[i] ?? null)
      const flags = Array.from({ length: HOLE_COUNT }, (_, i) => !!was.selfHoles?.[i])
      let changed = false
      for (let h = 0; h < HOLE_COUNT; h++) {
        if (rp.playerId === me) {
          if (holes[h] !== old[h] && holes[h] != null) {
            flags[h] = true
            changed = true
          }
        } else if (flags[h]) {
          if (holes[h] !== old[h]) {
            holes[h] = old[h]
            changed = true
          }
          if (putts[h] !== oldPutts[h]) {
            putts[h] = oldPutts[h]
            changed = true
          }
        }
      }
      if (!changed) return rp
      if (rp.playerId === me) return { ...rp, selfHoles: flags }
      const full = holes.every((h) => h != null)
      return {
        ...rp,
        holes: holes.some((h) => h != null) ? holes : undefined,
        putts: rp.putts ? putts : rp.putts,
        gross: full ? holes.reduce<number>((s, h) => s + (h ?? 0), 0) : was.gross,
      }
    }),
  }
}

// This phone's picks, per round. Kept on the phone only: it's about this
// phone, not the round. Nothing picked means everyone.
const PICKS_KEY = 'bandit-scoring-for'

const readPicks = (): Record<string, string[]> => {
  try {
    return JSON.parse(localStorage.getItem(PICKS_KEY) ?? '{}') as Record<string, string[]>
  } catch {
    return {}
  }
}

/** The golfers this phone picked for a round, or undefined when it hasn't chosen. */
export const pickedFor = (roundId: string | undefined): string[] | undefined => (roundId ? readPicks()[roundId] : undefined)

export function setPickedFor(roundId: string, ids: string[]) {
  try {
    localStorage.setItem(PICKS_KEY, JSON.stringify({ ...readPicks(), [roundId]: ids }))
  } catch {
    // Private mode: the pick lasts as long as the page.
  }
}

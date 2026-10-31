import type { Round } from '../types'
import { HOLE_COUNT, cardOf } from './holes'
import { todayISO } from './dates'
import { nth } from './bets'

// Pace of play. The live card stamps each hole with the moment its first
// score lands (`round.holeTimes`, one ISO instant a hole, written only on
// the day the round is played), and from those stamps a round knows how
// long it took, how long a hole takes, and which hole ate the afternoon.
// Only TheGrint keeps a clock, and only for one golfer; this is the
// group's. Same as BanditCore/Pace.swift.

export interface Pace {
  /** Holes with a stamp. */
  holes: number
  /** Minutes from the first stamped hole to the last. Needs two stamps. */
  elapsedMin: number | null
  /** The first and last stamped holes, 0-based. */
  from: number
  to: number
  /** Minutes a hole, over the holes between the first and last stamps. */
  perHoleMin: number | null
  /** The hole that took longest from the one before it: 0-based, and its minutes. */
  slowest: { hole: number; minutes: number } | null
}

const minutesBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60_000

export function paceOf(round: Pick<Round, 'holeTimes'>): Pace | null {
  const times = round.holeTimes
  if (!times) return null
  const stamped = times.map((t, h) => ({ h, t })).filter((x): x is { h: number; t: string } => !!x.t)
  if (stamped.length === 0) return null
  const first = stamped[0]
  const last = stamped[stamped.length - 1]
  if (stamped.length < 2) return { holes: 1, elapsedMin: null, from: first.h, to: last.h, perHoleMin: null, slowest: null }
  const elapsed = minutesBetween(first.t, last.t)
  if (!(elapsed >= 0)) return null
  const perHole = elapsed / (last.h - first.h)
  let slowest: Pace['slowest'] = null
  for (let i = 1; i < stamped.length; i++) {
    // Only holes stamped back to back say anything about one hole.
    if (stamped[i].h !== stamped[i - 1].h + 1) continue
    const minutes = minutesBetween(stamped[i - 1].t, stamped[i].t)
    if (!slowest || minutes > slowest.minutes) slowest = { hole: stamped[i].h, minutes }
  }
  return { holes: stamped.length, elapsedMin: elapsed, from: first.h, to: last.h, perHoleMin: perHole, slowest }
}

/** "4h 12m", "48 min". */
export function fmtDuration(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h}h ${rest}m` : `${h}h`
}

/** The round page's line: "3h 58m from the 1st to the 18th · 14 min a hole · the 7th took 31". */
export function paceLine(pace: Pace | null): string | null {
  if (!pace || pace.elapsedMin == null || pace.perHoleMin == null) return null
  const parts = [`${fmtDuration(pace.elapsedMin)} from the ${nth(pace.from + 1)} to the ${nth(pace.to + 1)}`, `${Math.round(pace.perHoleMin)} min a hole`]
  // A hole worth naming: half again the usual, and a real wait.
  if (pace.slowest && pace.slowest.minutes >= 15 && pace.slowest.minutes >= pace.perHoleMin * 1.5) {
    parts.push(`the ${nth(pace.slowest.hole + 1)} took ${Math.round(pace.slowest.minutes)}`)
  }
  return parts.join(' · ')
}

/** Minutes from the 1st hole's stamp to the 18th's, for the trophies; null unless both are in. */
export function roundMinutes(round: Pick<Round, 'holeTimes'>): number | null {
  const first = round.holeTimes?.[0]
  const last = round.holeTimes?.[HOLE_COUNT - 1]
  if (!first || !last) return null
  const m = minutesBetween(first, last)
  return m >= 0 ? m : null
}

/**
 * The stamps after a save: a hole with no score on any card before and
 * one now gets this moment, holes already stamped keep theirs, and a
 * hole scored earlier without a stamp stays blank (its time is unknown).
 * Only on the day: a card filled in afterwards is history, not pace.
 */
export function stampHoleTimes(round: Round, cards: Record<string, (number | null)[]>, now: Date, today = todayISO()): (string | null)[] | undefined {
  if (round.date !== today) return round.holeTimes
  const had = (h: number) => round.players.some((rp) => cardOf(rp)[h] != null)
  const has = (h: number) => round.players.some((rp) => (cards[rp.playerId] ?? cardOf(rp))[h] != null)
  let out = round.holeTimes ? [...round.holeTimes] : undefined
  for (let h = 0; h < HOLE_COUNT; h++) {
    if (out?.[h]) continue
    if (had(h) || !has(h)) continue
    if (!out) out = Array<string | null>(HOLE_COUNT).fill(null)
    out[h] = now.toISOString()
  }
  return out
}

/** Two stamp lists laid together, the earlier one winning a hole: what the server does in merge_hole_times. */
export function mergeHoleTimes(a: (string | null)[] | undefined, b: (string | null)[] | undefined): (string | null)[] | undefined {
  if (!a) return b
  if (!b) return a
  return Array.from({ length: HOLE_COUNT }, (_, h) => a[h] ?? b[h] ?? null)
}

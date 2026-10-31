import type { AppData } from '../types'
import { hasScore } from '../types'
import { byDate } from './stats'
import { coursePar, courseForRound, playingHandicap } from './courses'

// The sandbagger meter: how each golfer plays against the number they
// claim, over their last rounds at courses with a par. The app doesn't
// compute handicaps (GHIN does); this only measures the gap between the
// index a golfer gave and the golf they actually played, the way the
// form squares on Standings do for one round at a time. Positive means
// they beat their number. Same as BanditCore/SandbagMeter.swift.

/** Rounds the meter reads. */
export const METER_ROUNDS = 10
/** Fewer than this and the meter has nothing to say. */
export const METER_NEEDS = 3

export interface Meter {
  playerId: string
  /** Rounds read, newest last. */
  rounds: number
  /** Strokes better than their number, a round (positive = beat it). One decimal. */
  avgBy: number
  /** Rounds they beat their number. */
  beat: number
  /** Each round's margin, oldest first. */
  margins: number[]
}

export function sandbagMeter(data: AppData, playerId: string, last = METER_ROUNDS): Meter | null {
  const margins: number[] = []
  for (const r of byDate(data.rounds)) {
    const rp = r.players.find((p) => p.playerId === playerId)
    if (!rp || !hasScore(rp)) continue
    const course = courseForRound(data, r)
    const par = coursePar(course)
    if (par == null) continue
    // Strokes under net par: beat the number when positive.
    margins.push(par - (rp.gross - playingHandicap(course, rp.handicapSnapshot, r.tee)))
  }
  const recent = margins.slice(-last)
  if (recent.length < METER_NEEDS) return null
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length
  return { playerId, rounds: recent.length, avgBy: Math.round(avg * 10) / 10, beat: recent.filter((m) => m > 0).length, margins: recent }
}

/** Every member with enough rounds, the biggest bandit first. */
export function sandbagBoard(data: AppData, memberIds: string[]): Meter[] {
  return memberIds
    .map((id) => sandbagMeter(data, id))
    .filter((m): m is Meter => !!m)
    .sort((a, b) => b.avgBy - a.avgBy || b.beat - a.beat)
}

/** The word for where the needle sits. */
export function meterVerdict(m: Meter): string {
  if (m.avgBy >= 2) return 'Sandbagger'
  if (m.avgBy >= 0.5) return 'Playing above it'
  if (m.avgBy > -2) return 'Honest'
  return 'Vanity handicap'
}

/** "Beats the number by 3.1 a round, 8 of the last 10." */
export function meterLine(m: Meter): string {
  const by = Math.abs(m.avgBy).toFixed(1)
  const head = m.avgBy >= 0.05 ? `Beats the number by ${by} a round` : m.avgBy <= -0.05 ? `Misses the number by ${by} a round` : 'Plays right to the number'
  return `${head}, ${m.beat} of the last ${m.rounds}.`
}

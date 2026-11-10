import { round1, type AppData, type Round } from '../types'
import { cardComplete, cardOf, HOLE_COUNT } from './holes'
import { courseForRound, hasPars, padded } from './courses'
import { roundWinnerIds } from './stats'

// How a finished round went (2026-11-09): one line per golfer, their score
// against par after each hole, and the three holes worth naming. The round
// page draws it under the podium. Net is the standings' net, gross minus the
// day's handicap, so the handicap is spread evenly over the eighteen and
// each line ends on the number the podium shows. Only golfers with a full
// card are drawn, and only on a course with all eighteen pars.
// Same rules as BanditCore/RoundStory.swift.

export interface StoryLine {
  playerId: string
  /** Score to par after each hole, 18 entries, handicap spread evenly. */
  points: number[]
  /** Where the line ends, one decimal: net minus par. */
  final: number
}

export interface StoryBeat {
  /** 0-based hole. */
  hole: number
  playerId: string
  kind: 'lead' | 'eagle' | 'birdie' | 'blowup'
  /** The sentence under the chart, first names. */
  text: string
}

export interface RoundStory {
  /** False when nobody on the chart has a handicap: the lines are gross. */
  net: boolean
  lines: StoryLine[]
  /** At most three, in hole order. */
  beats: StoryBeat[]
  /** The outright winner, when they're on the chart. */
  winnerId?: string
}

export const STORY_BEATS = 3
const EPS = 1e-9

export function roundStory(data: AppData, round: Round): RoundStory | null {
  const course = courseForRound(data, round)
  if (!hasPars(course)) return null
  const pars = padded(course.pars)
  if (pars.length < HOLE_COUNT || pars.slice(0, HOLE_COUNT).some((p) => p == null)) return null
  const players = round.players.filter(cardComplete)
  if (!players.length) return null

  const lines: StoryLine[] = players.map((rp) => {
    const card = cardOf(rp)
    let toPar = 0
    const points = card.slice(0, HOLE_COUNT).map((h, i) => {
      toPar += h! - pars[i]!
      return toPar - (rp.handicapSnapshot * (i + 1)) / HOLE_COUNT
    })
    return { playerId: rp.playerId, points, final: round1(points[HOLE_COUNT - 1]) }
  })

  const winners = roundWinnerIds(round)
  const winnerId = winners.length === 1 && lines.some((l) => l.playerId === winners[0]) ? winners[0] : undefined
  const first = (id: string) => data.players.find((p) => p.id === id)?.name.trim().split(/\s+/)[0] ?? 'Someone'

  // The lead, hole by hole, off the lines as drawn: taken only by going
  // outright ahead, so a tie keeps whoever had it.
  const changes: { hole: number; leaderId: string; fromId: string }[] = []
  if (lines.length > 1) {
    let leaderId: string | undefined
    for (let i = 0; i < HOLE_COUNT; i++) {
      const best = Math.min(...lines.map((l) => l.points[i]))
      const ahead = lines.filter((l) => l.points[i] - best < EPS)
      if (ahead.length !== 1) continue
      if (!leaderId) leaderId = ahead[0].playerId
      else if (ahead[0].playerId !== leaderId) {
        changes.push({ hole: i, leaderId: ahead[0].playerId, fromId: leaderId })
        leaderId = ahead[0].playerId
      }
    }
  }

  type Scored = StoryBeat & { weight: number; order: number }
  const found: Scored[] = []
  changes.forEach((c, k) => {
    const decisive = k === changes.length - 1 && c.leaderId === winnerId
    found.push({
      hole: c.hole,
      playerId: c.leaderId,
      kind: 'lead',
      text: `${first(c.leaderId)} takes the lead from ${first(c.fromId)}${decisive ? ' and keeps it' : ''}.`,
      weight: decisive ? 6 : 3,
      order: players.length,
    })
  })
  players.forEach((rp, order) => {
    cardOf(rp)
      .slice(0, HOLE_COUNT)
      .forEach((h, i) => {
        const over = h! - pars[i]!
        const name = first(rp.playerId)
        if (over <= -2) found.push({ hole: i, playerId: rp.playerId, kind: 'eagle', text: h === 1 ? `${name} makes a hole in one.` : `${name} makes eagle.`, weight: 5, order })
        else if (over === -1) found.push({ hole: i, playerId: rp.playerId, kind: 'birdie', text: `${name} makes birdie.`, weight: rp.playerId === winnerId || players.length === 1 ? 2 : 1, order })
        else if (h! >= 8 || over >= 3) found.push({ hole: i, playerId: rp.playerId, kind: 'blowup', text: `${name} makes ${article(h!)} ${h}.`, weight: 2 + Math.min(3, Math.max(0, over - 3)), order })
      })
  })
  const beats = found
    .sort((a, b) => b.weight - a.weight || a.hole - b.hole || a.order - b.order)
    .slice(0, STORY_BEATS)
    .sort((a, b) => a.hole - b.hole || a.order - b.order)
    .map(({ weight: _weight, order: _order, ...beat }) => beat)

  return { net: players.some((rp) => rp.handicapSnapshot !== 0), lines, beats, winnerId }
}

/** "an 8", "an 11", "a 9". */
const article = (n: number) => (n === 8 || n === 11 || n === 18 ? 'an' : 'a')

/** "+2.2", "E", "−1.5"; whole numbers drop the decimal. */
export function storyLabel(n: number): string {
  const v = round1(n)
  if (v === 0) return 'E'
  const s = Number.isInteger(v) ? String(Math.abs(v)) : Math.abs(v).toFixed(1)
  return v > 0 ? `+${s}` : `−${s}`
}

/** "7th", "11th", for the beats' hole column. */
export function holeOrdinal(hole: number): string {
  const n = hole + 1
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${s}`
}

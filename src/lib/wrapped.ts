import type { AppData, Round, ScoredRoundPlayer } from '../types'
import { hasScore, isGroupRound, net } from '../types'
import { byDate, moneyTotals, roundWinnerIds, saddamReigns } from './stats'
import { badgesFor, type Badge } from './badges'

// Season Wrapped: one golfer's year, as the numbers a story-style recap
// needs. Everything is worked out from rounds already logged, and only
// rounds with the golfer's own score count.

export interface WrappedPhoto {
  id: string
  url: string
  roundId: string
  courseName: string
  date: string
}

export interface Wrapped {
  year: string
  rounds: number
  /** Rounds in each month, January first. */
  months: number[]
  /** The golfer's gross score in every round, oldest first. */
  scores: { roundId: string; date: string; gross: number }[]
  /** Average gross in the second half of the year's rounds minus the first half; negative is better. Needs 4 rounds. */
  trend: number | null
  /** Every photo from the year's rounds, oldest first. */
  photos: WrappedPhoto[]
  groupRounds: number
  groupWins: number
  busiestMonth: { name: string; rounds: number } | null
  best: { round: Round; gross: number } | null
  average: number | null
  homeTurf: { course: string; rounds: number; sample: Round } | null
  rival: { playerId: string; wins: number; losses: number; ties: number } | null
  money: number
  saddamDays: number
  badges: Badge[]
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function overlapDays(from: string, to: string, year: string) {
  const start = from < `${year}-01-01` ? `${year}-01-01` : from
  const end = to > `${year}-12-31` ? `${year}-12-31` : to
  if (end < start) return 0
  const [a, b] = [start, end].map((d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)))
  return Math.round((b - a) / 86_400_000)
}

export function wrappedFor(data: AppData, playerId: string, year: string, today: string): Wrapped {
  const mine = byDate(data.rounds).filter(
    (r) => r.date.startsWith(year) && r.players.some((p) => p.playerId === playerId && hasScore(p)),
  )
  const myRp = (r: Round) => r.players.find((p) => p.playerId === playerId) as ScoredRoundPlayer
  const group = mine.filter(isGroupRound)

  const byMonth = new Map<number, number>()
  for (const r of mine) byMonth.set(+r.date.slice(5, 7) - 1, (byMonth.get(+r.date.slice(5, 7) - 1) ?? 0) + 1)
  const topMonth = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0]

  const scores = mine.map((r) => ({ roundId: r.id, date: r.date, gross: myRp(r).gross }))
  const avg = (xs: typeof scores) => xs.reduce((sum, x) => sum + x.gross, 0) / xs.length
  const half = Math.floor(scores.length / 2)
  const trend = scores.length >= 4 ? Math.round((avg(scores.slice(-half)) - avg(scores.slice(0, half))) * 10) / 10 : null

  const best = mine.reduce<{ round: Round; gross: number } | null>((acc, r) => {
    const g = myRp(r).gross
    return !acc || g < acc.gross ? { round: r, gross: g } : acc
  }, null)

  const courses = new Map<string, Round[]>()
  for (const r of mine) courses.set(r.courseName, [...(courses.get(r.courseName) ?? []), r])
  const turf = [...courses.entries()].sort((a, b) => b[1].length - a[1].length)[0]

  // The rival: whoever you shared the most group rounds with, and how it went on net.
  const vs = new Map<string, { wins: number; losses: number; ties: number }>()
  for (const r of group) {
    const me = net(myRp(r))
    for (const other of r.players) {
      if (other.playerId === playerId || !hasScore(other)) continue
      const rec = vs.get(other.playerId) ?? { wins: 0, losses: 0, ties: 0 }
      const them = net(other)
      if (me < them) rec.wins++
      else if (me > them) rec.losses++
      else rec.ties++
      vs.set(other.playerId, rec)
    }
  }
  const rival = [...vs.entries()].sort((a, b) => b[1].wins + b[1].losses + b[1].ties - (a[1].wins + a[1].losses + a[1].ties))[0]

  const saddamDays = saddamReigns(data, today)
    .filter((r) => r.playerId === playerId)
    .reduce((sum, r) => sum + overlapDays(r.date, r.end, year), 0)

  return {
    year,
    rounds: mine.length,
    months: MONTHS.map((_, i) => byMonth.get(i) ?? 0),
    scores,
    trend,
    photos: mine.flatMap((r) =>
      (r.photos ?? []).map((p) => ({ id: p.id, url: p.url, roundId: r.id, courseName: r.courseName, date: r.date })),
    ),
    groupRounds: group.length,
    groupWins: group.filter((r) => roundWinnerIds(r).length === 1 && roundWinnerIds(r)[0] === playerId).length,
    busiestMonth: topMonth ? { name: MONTHS[topMonth[0]], rounds: topMonth[1] } : null,
    best,
    average: mine.length ? Math.round((mine.reduce((s, r) => s + myRp(r).gross, 0) / mine.length) * 10) / 10 : null,
    homeTurf: turf ? { course: turf[0], rounds: turf[1].length, sample: turf[1][turf[1].length - 1] } : null,
    rival: rival ? { playerId: rival[0], ...rival[1] } : null,
    money: moneyTotals(data, new Set(mine.map((r) => r.id))).get(playerId) ?? 0,
    saddamDays,
    badges: badgesFor(data, playerId, today).filter((b) => b.earned),
  }
}

/**
 * Up to `n` photos for a spread, taken a round at a time so every round
 * with pictures gets one before any round gets two. Oldest first.
 */
export function pickPhotos(photos: WrappedPhoto[], n: number): WrappedPhoto[] {
  const byRound = new Map<string, WrappedPhoto[]>()
  for (const p of photos) byRound.set(p.roundId, [...(byRound.get(p.roundId) ?? []), p])
  const queues = [...byRound.values()]
  const picked: WrappedPhoto[] = []
  for (let depth = 0; picked.length < n && queues.some((q) => q.length > depth); depth++) {
    for (const q of queues) if (q[depth] && picked.length < n) picked.push(q[depth])
  }
  return picked.sort((a, b) => a.date.localeCompare(b.date))
}

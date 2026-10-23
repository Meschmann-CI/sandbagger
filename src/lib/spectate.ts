import type { AppData, Round } from '../types'
import type { PushMessage } from './push'
import { cardOf, HOLE_COUNT } from './holes'
import { courseForRound, hasPars, padded } from './courses'

// Watching a round you're not in (Matt, 2026-10-23): a live leaderboard,
// the card cut to its last three holes, the moments, and pushes to the
// rest of the group at the turn and on a lead change. Everything is by
// gross ("easier to read"). Same rules as BanditCore/Spectate.swift.

export interface LiveLine {
  playerId: string
  /** Holes with a score. */
  thru: number
  strokes: number
  /** Against par on the holes played; null when the course has no pars. */
  toPar: number | null
}

/** Each golfer's standing as it is now, leader first. */
export function liveLines(data: AppData, round: Round): LiveLine[] {
  const course = courseForRound(data, round)
  const pars = hasPars(course) ? padded(course.pars) : null
  const lines = round.players.map((rp) => {
    const card = cardOf(rp)
    let strokes = 0
    let toPar = 0
    let thru = 0
    card.forEach((h, i) => {
      if (h == null) return
      thru++
      strokes += h
      toPar += h - (pars?.[i] ?? 4)
    })
    return { playerId: rp.playerId, thru, strokes, toPar: pars ? toPar : null, sortKey: toPar }
  })
  // With no pars, a par of 4 a hole keeps golfers on different holes comparable.
  return lines
    .sort((a, b) => (b.thru > 0 ? 1 : 0) - (a.thru > 0 ? 1 : 0) || a.sortKey - b.sortKey || b.thru - a.thru)
    .map(({ sortKey: _sortKey, ...line }) => line)
}

/** The three most recent holes anyone has scored, 0-based. */
export function cardSlice(round: Round): number[] {
  const last = Math.max(-1, ...round.players.map((rp) => cardOf(rp).reduce<number>((m, h, i) => (h != null ? i : m), -1)))
  if (last < 0) return []
  const start = Math.max(0, Math.min(last - 2, HOLE_COUNT - 3))
  return [start, start + 1, start + 2]
}

export interface LeadChange {
  /** 0-based hole after which the lead changed. */
  hole: number
  leaderId: string
  fromId: string
}

/**
 * The lead, replayed over the holes everyone has a score on, in order:
 * someone takes it only by going outright ahead, so a tie keeps the
 * leader. Holes one golfer has entered and another hasn't yet don't
 * count, so the lead can't flicker while the group is still typing.
 */
export function leadStory(round: Round): { leaderId?: string; changes: LeadChange[] } {
  if (round.players.length < 2) return { changes: [] }
  const cards = round.players.map(cardOf)
  const totals = round.players.map(() => 0)
  const changes: LeadChange[] = []
  let leaderId: string | undefined
  for (let i = 0; i < HOLE_COUNT; i++) {
    if (!cards.every((c) => c[i] != null)) continue
    cards.forEach((c, k) => (totals[k] += c[i]!))
    const best = Math.min(...totals)
    const ahead = totals.flatMap((t, k) => (t === best ? [round.players[k].playerId] : []))
    if (ahead.length !== 1) continue
    if (!leaderId) leaderId = ahead[0]
    else if (ahead[0] !== leaderId) {
      changes.push({ hole: i, leaderId: ahead[0], fromId: leaderId })
      leaderId = ahead[0]
    }
  }
  return { leaderId, changes }
}

/** Everyone has the front nine in. */
export const atTheTurn = (round: Round) =>
  round.players.length > 0 && round.players.every((rp) => cardOf(rp).slice(0, 9).every((h) => h != null))

export interface Moment {
  hole: number
  playerId: string
  kind: 'eagle' | 'birdie' | 'blowup' | 'lead'
  score?: number
}

/** Birdies and better, an 8 or triple bogey and worse, and lead changes; latest hole first. */
export function moments(data: AppData, round: Round): Moment[] {
  const course = courseForRound(data, round)
  const pars = hasPars(course) ? padded(course.pars) : null
  const out: Moment[] = []
  for (const rp of round.players) {
    cardOf(rp).forEach((h, i) => {
      if (h == null) return
      const par = pars?.[i]
      if (par != null && h <= par - 2) out.push({ hole: i, playerId: rp.playerId, kind: 'eagle', score: h })
      else if (par != null && h === par - 1) out.push({ hole: i, playerId: rp.playerId, kind: 'birdie', score: h })
      else if (h >= 8 || (par != null && h >= par + 3)) out.push({ hole: i, playerId: rp.playerId, kind: 'blowup', score: h })
    })
  }
  for (const c of leadStory(round).changes) out.push({ hole: c.hole, playerId: c.leaderId, kind: 'lead' })
  return out.sort((a, b) => b.hole - a.hole || (a.kind === 'lead' ? 1 : 0) - (b.kind === 'lead' ? 1 : 0))
}

/** "+3", "E", "−2", or strokes when there are no pars. */
export const toParLabel = (line: Pick<LiveLine, 'toPar' | 'strokes'>) =>
  line.toPar == null ? String(line.strokes) : line.toPar === 0 ? 'E' : line.toPar > 0 ? `+${line.toPar}` : `−${-line.toPar}`

/** "Split Rock" from "Split Rock Golf Course". */
const short = (name: string) => name.replace(/ (Golf Course|Golf Club|Country Club|Golf Links)$/, '')

/**
 * The pushes a save sends to the rest of the group: the turn and a lead
 * change. The final has its own push already. Only for a round being
 * played today, to members who aren't in it and haven't muted it.
 */
export function spectatorNews(data: AppData, before: Round | undefined, after: Round, today: string): PushMessage[] {
  if (after.date !== today || after.players.length < 2) return []
  const inRound = new Set(after.players.map((p) => p.playerId))
  const to = data.group.memberIds.filter((id) => {
    const p = data.players.find((x) => x.id === id)
    return !inRound.has(id) && !p?.guest && !p?.mutedRounds?.includes(after.id)
  })
  if (!to.length) return []
  const name = (id: string) => data.players.find((p) => p.id === id)?.name.split(' ')[0] ?? 'Someone'
  const course = short(after.courseName)
  const url = `/rounds/${after.id}/watch`
  const out: PushMessage[] = []

  if (before && !atTheTurn(before) && atTheTurn(after)) {
    const coursePars = courseForRound(data, after)
    const pars = hasPars(coursePars) ? padded(coursePars.pars).slice(0, 9) : null
    const front = after.players
      .map((rp) => ({ id: rp.playerId, out: cardOf(rp).slice(0, 9).reduce<number>((s, h) => s + (h ?? 0), 0) }))
      .sort((a, b) => a.out - b.out)
    const par = pars && pars.every((p) => p != null) ? pars.reduce<number>((s, p) => s + p!, 0) : null
    const first = front[0]
    const firstLabel = par == null ? `${first.out}` : `${first.out} (${toParLabel({ toPar: first.out - par, strokes: first.out })})`
    out.push({
      toPlayerIds: to,
      title: `${course} at the turn`,
      body: [`${name(first.id)} ${firstLabel}`, ...front.slice(1).map((f) => `${name(f.id)} ${f.out}`)].join(', ') + '.',
      url,
    })
  }

  const was = before ? leadStory(before).changes.length : 0
  const now = leadStory(after)
  if (before && now.changes.length > was) {
    const c = now.changes[now.changes.length - 1]
    // Scored over the holes the lead was decided on: everyone's, through c.hole.
    const coursePars = courseForRound(data, after)
    const pars = hasPars(coursePars) ? padded(coursePars.pars) : null
    const label = (id: string) => {
      const card = cardOf(after.players.find((p) => p.playerId === id)!)
      let strokes = 0
      let toPar = 0
      for (let i = 0; i <= c.hole; i++) {
        if (!after.players.every((rp) => cardOf(rp)[i] != null)) continue
        strokes += card[i]!
        toPar += card[i]! - (pars?.[i] ?? 4)
      }
      return toParLabel({ strokes, toPar: pars ? toPar : null })
    }
    out.push({
      toPlayerIds: to,
      title: `Lead change at ${course}`,
      body: `${name(c.leaderId)} takes the lead on ${c.hole + 1}. ${name(c.leaderId)} ${label(c.leaderId)}, ${name(c.fromId)} ${label(c.fromId)}.`,
      url,
    })
  }
  return out
}

import type { AppData, Round } from '../types'
import { coursePar, courseForRound, hasPars, padded } from './courses'
import { cardOf } from './holes'
import { leadStory, moments } from './spectate'
import { paceLine, paceOf } from './pace'
import { roundStandings, saddamState } from './stats'
import { trophiesFrom } from './trophyMoments'
import { sandbaggers } from './delight'

// The facts the broadcaster calls the round from (supabase/functions/recap).
// Everything is what the app already knows: the cards, the standings,
// where the lead changed, the eagles and blow-ups, the pace, the trophies
// handed out, the money, the chirps from home, and the Saddam. Names are
// first names; nothing free-typed by the group goes in except the chirps
// (capped, and the function may quote one). Same shape as
// BanditCore/RecapFacts.swift, so both apps get the same call.

export interface RecapFacts {
  course: string
  date: string
  /** Par for the holes played, when the course has pars. */
  par: number | null
  pars: (number | null)[] | null
  golfers: {
    name: string
    handicap: number
    gross: number
    net: number
    rank: number
    /** 18 entries when the round was scored hole by hole. */
    holes: (number | null)[] | null
    /** Lower than every earlier gross on record, with at least three to beat. */
    personalBest: boolean
  }[]
  leadChanges: { afterHole: number; leader: string; from: string }[]
  moments: { hole: number; name: string; kind: 'eagle' | 'birdie' | 'blowup'; score: number; par: number | null }[]
  pace: string | null
  trophies: { name: string; earned: string[] }[]
  /** "Played N better than the handicap says." */
  sandbaggers: { name: string; by: number }[]
  money: { game: string; lines: string[] }[]
  chirps: { from: string; to: string; text: string }[]
  saddam: { holder: string | null; changedHands: boolean; defenses: number } | null
  note: string | null
}

const first = (name: string) => name.split(' ')[0]

export function recapFacts(data: AppData, round: Round, today: string): RecapFacts {
  const nameOf = (id: string) => first(data.players.find((p) => p.id === id)?.name ?? 'Someone')
  const course = courseForRound(data, round)
  const pars = hasPars(course) ? padded(course.pars) : null
  const standings = roundStandings(round)
  const scored = round.players.filter((rp) => rp.gross != null)
  const anyHoles = scored.some((rp) => cardOf(rp).some((h) => h != null))

  const golfers = standings.map((s) => {
    const rp = round.players.find((p) => p.playerId === s.playerId)!
    const earlier = data.rounds
      .filter((r) => r.id !== round.id && r.date <= round.date)
      .flatMap((r) => r.players.filter((p) => p.playerId === s.playerId && p.gross != null).map((p) => p.gross!))
    return {
      name: nameOf(s.playerId),
      handicap: rp.handicapSnapshot,
      gross: s.gross,
      net: s.netScore,
      rank: s.rank,
      holes: anyHoles && cardOf(rp).some((h) => h != null) ? cardOf(rp) : null,
      personalBest: earlier.length >= 3 && earlier.every((g) => g > s.gross),
    }
  })

  const story = anyHoles ? leadStory(round) : { changes: [] }
  const ms = anyHoles ? moments(data, round) : []
  const saddam = saddamState(data)
  const winnerId = standings[0]?.playerId
  const trophies = scored
    .map((rp) => ({ name: nameOf(rp.playerId), earned: trophiesFrom(data, round.id, rp.playerId, today).map((t) => t.badge.label) }))
    .filter((t) => t.earned.length > 0)
  const money = data.bets
    .filter((b) => b.roundId === round.id && b.results.some((r) => r.amount !== 0))
    .map((b) => ({
      game: b.name,
      lines: b.results.filter((r) => r.amount !== 0).map((r) => `${nameOf(r.playerId)} ${r.amount > 0 ? '+' : '-'}$${Math.abs(r.amount)}`),
    }))
  const chirps = (data.chirps ?? [])
    .filter((c) => c.roundId === round.id)
    .slice(-8)
    .map((c) => ({ from: nameOf(c.fromId), to: nameOf(c.toId), text: c.text.slice(0, 140) }))

  return {
    course: round.courseName,
    date: round.date,
    par: coursePar(course),
    pars,
    golfers,
    leadChanges: story.changes.map((c) => ({ afterHole: c.hole + 1, leader: nameOf(c.leaderId), from: nameOf(c.fromId) })),
    moments: ms
      .filter((m) => m.kind !== 'lead')
      .sort((a, b) => a.hole - b.hole)
      .map((m) => ({ hole: m.hole + 1, name: nameOf(m.playerId), kind: m.kind as 'eagle' | 'birdie' | 'blowup', score: m.score ?? 0, par: pars?.[m.hole] ?? null })),
    pace: paceLine(paceOf(round)),
    trophies,
    sandbaggers: sandbaggers(data, round).map((b) => ({ name: nameOf(b.playerId), by: b.by })),
    money,
    chirps,
    saddam:
      scored.length >= 2
        ? {
            holder: saddam.holderId ? nameOf(saddam.holderId) : null,
            changedHands: saddam.since === round.date && saddam.holderId === winnerId && !saddam.byHand,
            defenses: saddam.defenses,
          }
        : null,
    note: round.notes?.trim() || null,
  }
}

import {
  hasScore,
  isGroupRound,
  net,
  round1,
  scored,
  type AppData,
  type Player,
  type Round,
  type ScoredRoundPlayer,
} from '../types'

export const byDate = (rounds: Round[]) =>
  [...rounds].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

// ---------- Head-to-head (pairwise net comparison within each round) ----------

export interface H2H {
  aId: string
  bId: string
  aWins: number
  bWins: number
  ties: number
  lastWinnerId?: string
  lastWinDate?: string
  aStreak: number // positive = A's current streak, negative = B's
  biggestMargin?: { winnerId: string; margin: number; round: Round }
  lastAWinDate?: string
  lastBWinDate?: string
}

export function headToHead(data: AppData, aId: string, bId: string): H2H {
  const h: H2H = { aId, bId, aWins: 0, bWins: 0, ties: 0, aStreak: 0 }
  for (const round of byDate(data.rounds)) {
    // Needs both cards in; a round with a score still outstanding hasn't
    // settled anything yet.
    const a = round.players.find((p) => p.playerId === aId && hasScore(p)) as ScoredRoundPlayer | undefined
    const b = round.players.find((p) => p.playerId === bId && hasScore(p)) as ScoredRoundPlayer | undefined
    if (!a || !b) continue
    const diff = net(a) - net(b)
    if (diff === 0) {
      h.ties++
      continue
    }
    const winnerId = diff < 0 ? aId : bId
    const margin = round1(Math.abs(diff))
    if (winnerId === aId) {
      h.aWins++
      h.lastAWinDate = round.date
      h.aStreak = h.aStreak > 0 ? h.aStreak + 1 : 1
    } else {
      h.bWins++
      h.lastBWinDate = round.date
      h.aStreak = h.aStreak < 0 ? h.aStreak - 1 : -1
    }
    h.lastWinnerId = winnerId
    h.lastWinDate = round.date
    if (!h.biggestMargin || margin > h.biggestMargin.margin) {
      h.biggestMargin = { winnerId, margin, round }
    }
  }
  return h
}

// ---------- Round results ----------

export interface RoundStanding {
  playerId: string
  gross: number
  netScore: number
  rank: number // 1-based, ties share rank
}

export function roundStandings(round: Round): RoundStanding[] {
  const sorted = scored(round).sort((a, b) => net(a) - net(b))
  const out: RoundStanding[] = []
  sorted.forEach((rp, i) => {
    const prev = out[i - 1]
    const rank = prev && net(sorted[i - 1]) === net(rp) ? prev.rank : i + 1
    out.push({ playerId: rp.playerId, gross: rp.gross, netScore: net(rp), rank })
  })
  return out
}

export const roundWinnerIds = (round: Round) =>
  roundStandings(round).filter((s) => s.rank === 1).map((s) => s.playerId)

// ---------- Leaderboard ----------
// Wins and streaks only count group rounds (2+ players). Averages and
// bests include everything, solo grinds included.

export interface LeaderRow {
  player: Player
  rounds: number
  wins: number
  avgGross: number | null
  bestGross: number | null
  streak: number // consecutive group-round wins
  money: number
}

export function leaderboard(data: AppData, rounds = data.rounds): LeaderRow[] {
  const ordered = byDate(rounds)
  const rows = data.players.map((player) => {
    const mine = ordered.filter((r) => r.players.some((p) => p.playerId === player.id))
    const mineGroup = mine.filter(isGroupRound)
    // Rounds counts every round they were in; the score-based stats only
    // count the ones they've actually posted.
    const grosses = mine
      .map((r) => r.players.find((p) => p.playerId === player.id))
      .filter((rp) => rp && hasScore(rp))
      .map((rp) => rp!.gross as number)
    let wins = 0
    for (const r of mineGroup) if (roundWinnerIds(r).includes(player.id)) wins++
    let streak = 0
    for (let i = mineGroup.length - 1; i >= 0; i--) {
      if (roundWinnerIds(mineGroup[i]).includes(player.id)) streak++
      else break
    }
    const roundIds = new Set(rounds.map((r) => r.id))
    const money = data.bets
      .filter((b) => roundIds.has(b.roundId))
      .flatMap((b) => b.results)
      .filter((res) => res.playerId === player.id)
      .reduce((sum, res) => sum + res.amount, 0)
    return {
      player,
      rounds: mine.length,
      wins,
      avgGross: grosses.length ? grosses.reduce((a, b) => a + b, 0) / grosses.length : null,
      bestGross: grosses.length ? Math.min(...grosses) : null,
      streak,
      money,
    }
  })
  return rows.sort((a, b) => b.wins - a.wins || (a.avgGross ?? 999) - (b.avgGross ?? 999))
}

// ---------- The Saddam ----------
// The little trophy. It goes to whoever won the most recent group round.
// On a tie for the lowest net, it stays where it is.

export interface SaddamState {
  holderId: string | null
  since: string | null
  courseName: string | null
  defenses: number // group rounds the holder has survived since taking it
}

export function saddamState(data: AppData): SaddamState {
  let holderId: string | null = null
  let since: string | null = null
  let courseName: string | null = null
  let defenses = 0
  for (const round of byDate(data.rounds).filter(isGroupRound)) {
    const winners = roundWinnerIds(round)
    if (winners.length === 1 && winners[0] !== holderId) {
      holderId = winners[0]
      since = round.date
      courseName = round.courseName
      defenses = 0
    } else if (holderId) {
      defenses++
    }
  }
  return { holderId, since, courseName, defenses }
}

// ---------- Money ----------

export function moneyTotals(data: AppData, roundIds?: Set<string>) {
  const totals = new Map<string, number>()
  for (const p of data.players) totals.set(p.id, 0)
  for (const bet of data.bets) {
    if (roundIds && !roundIds.has(bet.roundId)) continue
    for (const res of bet.results) {
      totals.set(res.playerId, (totals.get(res.playerId) ?? 0) + res.amount)
    }
  }
  return totals
}

// ---------- Personal stats ----------

export interface PlayerStats {
  rounds: number
  soloRounds: number
  avgGross: number | null
  bestGross: number | null
  bestNet: number | null
  money: number
  saddamHeld: boolean
  last5: { round: Round; gross: number | null }[]
  /** Rounds they're in where their own score is still missing. */
  awaitingScore: Round[]
}

export function playerStats(data: AppData, playerId: string): PlayerStats {
  const mine = byDate(data.rounds).filter((r) => r.players.some((p) => p.playerId === playerId))
  const myEntry = (r: Round) => r.players.find((p) => p.playerId === playerId)
  const myScored = mine.map(myEntry).filter((rp): rp is ScoredRoundPlayer => !!rp && hasScore(rp))
  const grosses = myScored.map((rp) => rp.gross)
  const nets = myScored.map(net)
  return {
    rounds: mine.length,
    soloRounds: mine.filter((r) => !isGroupRound(r)).length,
    avgGross: grosses.length ? grosses.reduce((a, b) => a + b, 0) / grosses.length : null,
    bestGross: grosses.length ? Math.min(...grosses) : null,
    bestNet: nets.length ? Math.min(...nets) : null,
    money: moneyTotals(data).get(playerId) ?? 0,
    saddamHeld: saddamState(data).holderId === playerId,
    awaitingScore: mine.filter((r) => {
      const rp = myEntry(r)
      return !!rp && !hasScore(rp)
    }),
    last5: mine.slice(-5).reverse().map((round) => ({
      round,
      gross: myEntry(round)?.gross ?? null,
    })),
  }
}

// ---------- Dates & copy ----------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function prettyDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

export function shortDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`
}

// Itinerary times are free text ("9:40 AM", "4:00 PM check-in"), so they
// need parsing before they can be sorted — string order puts 7:30 PM
// ahead of 9:40 AM.
export function timeToMinutes(raw?: string): number {
  if (!raw) return 24 * 60 + 1 // untimed items sink to the bottom of the day
  const m = raw.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?/i)
  if (!m) return 24 * 60 + 1
  let hour = Number(m[1]) % 12
  if (m[3].toLowerCase() === 'p') hour += 12
  return hour * 60 + Number(m[2] ?? 0)
}

export function trashTalk(data: AppData): string[] {
  const lines: string[] = []
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? '???'

  for (let i = 0; i < data.players.length; i++) {
    for (let j = i + 1; j < data.players.length; j++) {
      const a = data.players[i]
      const b = data.players[j]
      const h = headToHead(data, a.id, b.id)
      if (h.aWins + h.bWins === 0) continue
      if (h.aStreak >= 3) lines.push(`${name(a.id)} has beaten ${name(b.id)} ${h.aStreak} times in a row. Someone check on ${name(b.id)}.`)
      if (h.aStreak <= -3) lines.push(`${name(b.id)} has beaten ${name(a.id)} ${-h.aStreak} times in a row. Someone check on ${name(a.id)}.`)
      if (h.bWins > 0 && h.lastBWinDate && h.aStreak >= 2)
        lines.push(`${name(b.id)} has not beaten ${name(a.id)} since ${prettyDate(h.lastBWinDate)}.`)
      if (h.aWins > 0 && h.lastAWinDate && h.aStreak <= -2)
        lines.push(`${name(a.id)} has not beaten ${name(b.id)} since ${prettyDate(h.lastAWinDate)}.`)
      if (h.bWins === 0 && h.aWins >= 2) lines.push(`${name(b.id)} is ${h.bWins}–${h.aWins} lifetime against ${name(a.id)}. Ouch.`)
      if (h.aWins === 0 && h.bWins >= 2) lines.push(`${name(a.id)} is ${h.aWins}–${h.bWins} lifetime against ${name(b.id)}. Ouch.`)
    }
  }

  const money = moneyTotals(data)
  let worstId: string | null = null
  let worst = 0
  for (const [pid, amt] of money) if (amt < worst) { worst = amt; worstId = pid }
  if (worstId) lines.push(`${name(worstId)} is down $${Math.abs(worst)} all-time. The ATM of the group.`)

  const saddam = saddamState(data)
  if (saddam.holderId && saddam.defenses >= 2)
    lines.push(`${name(saddam.holderId)} has held the Saddam for ${saddam.defenses + 1} straight group rounds. Somebody do something.`)

  return lines
}

export function courseSuggestions(data: AppData): string[] {
  const seen = new Map<string, number>()
  for (const r of byDate(data.rounds).reverse()) {
    seen.set(r.courseName, (seen.get(r.courseName) ?? 0) + 1)
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
}

import { saddamCounts, type AppData, type Round } from '../types'
import { bookedRounds } from './bookings'
import { shortDay } from './dates'
import { gameLabel, listed } from './games'
import { money } from './money'
import { myOutstanding } from './settlements'
import { byDate, headToHead, leaderboard, saddamState } from './stats'

// Home on the morning of a round (2026-11-09): when a round you're playing
// is booked for today and nobody has scored yet, the forest band is that
// round, not the season race. These are its three lines: what's at stake,
// where the golfers stand with each other, and the money. Pure, so both
// apps say the same thing. Same rules as BanditCore/GameDay.swift.

export interface GameDayLine {
  label: string
  text: string
}

/** Today's booking that this golfer is playing in, the earliest tee time first. */
export function gameDayRound(data: AppData, meId: string, today: string): Round | undefined {
  return bookedRounds(data).find((r) => r.date === today && r.players.some((p) => p.playerId === meId))
}

export function gameDayLines(data: AppData, round: Round, meId: string): GameDayLine[] {
  const first = (id: string) => data.players.find((p) => p.id === id)?.name.trim().split(/\s+/)[0] ?? 'Someone'
  const others = round.players.map((p) => p.playerId).filter((id) => id !== meId)
  const playing = (id: string | null) => !!id && round.players.some((p) => p.playerId === id)
  const lines: GameDayLine[] = []

  // The Saddam goes to whoever wins a group round outright, holder there or not.
  if (others.length > 0 && saddamCounts(round)) {
    const s = saddamState(data)
    const since = s.since ? ` since ${shortDay(s.since)}` : ''
    const text = !s.holderId
      ? "Nobody holds it yet. Win outright and it's yours."
      : s.holderId === meId
        ? `Yours${since}. Anyone who beats you outright takes it.`
        : playing(s.holderId)
          ? `${first(s.holderId)} has had it${since}. Win outright and it's yours.`
          : `${first(s.holderId)} isn't playing. Win outright and it's yours.`
    lines.push({ label: 'At stake', text: `The Saddam. ${text}` })
  }

  if (others.length === 1) {
    const other = others[0]
    const h = headToHead(data, meId, other)
    const name = first(other)
    const record =
      h.aWins + h.bWins + h.ties === 0
        ? `First time you and ${name} have played.`
        : h.aWins > h.bWins
          ? `You lead ${name} ${h.aWins} to ${h.bWins}.`
          : h.bWins > h.aWins
            ? `${name} leads you ${h.bWins} to ${h.aWins}.`
            : `Level at ${h.aWins} each.`
    const last = h.lastWinnerId ? (h.lastWinnerId === meId ? ' You took the last one.' : ` ${name} took the last one.`) : ''
    lines.push({ label: 'You two', text: record + last })
  } else if (others.length > 1) {
    const year = round.date.slice(0, 4)
    const board = leaderboard(data, byDate(data.rounds).filter((r) => r.date.startsWith(year)))
    const wins = round.players.map((p) => `${p.playerId === meId ? 'You' : first(p.playerId)} ${board.find((row) => row.player.id === p.playerId)?.wins ?? 0}`)
    lines.push({ label: 'Season', text: `Wins in ${year}: ${wins.join(', ')}.` })
  }

  const bets = data.bets.filter((b) => b.roundId === round.id)
  const on = bets.length
    ? `${listed(bets.map((b) => `${b.stake > 0 ? `${money(b.stake)} ` : ''}${b.type === 'custom' ? b.name : gameLabel(b.type)}`))} ${bets.length === 1 ? 'is' : 'are'} on.`
    : 'No bets on it yet.'
  // What's already owed between you and the golfers you're playing, from before today.
  const owed = new Map<string, number>()
  for (const d of myOutstanding(data, meId)) {
    if (d.href === `/rounds/${round.id}`) continue
    const other = d.fromId === meId ? d.toId : d.fromId
    if (!others.includes(other)) continue
    owed.set(other, (owed.get(other) ?? 0) + (d.toId === meId ? d.amount : -d.amount))
  }
  const going = others.flatMap((id) => {
    const n = owed.get(id) ?? 0
    return n > 0 ? [`${first(id)} owes you ${money(n)} going in.`] : n < 0 ? [`You owe ${first(id)} ${money(-n)} going in.`] : []
  })
  lines.push({ label: 'Money', text: [on, ...going].join(' ') })
  return lines
}

/** "1h 12m", "45 min"; null once the tee time has passed or isn't a clock time. */
export function teeOffIn(teeMinutes: number, nowMinutes: number): string | null {
  const mins = teeMinutes - nowMinutes
  if (teeMinutes > 24 * 60 || mins <= 0) return null
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

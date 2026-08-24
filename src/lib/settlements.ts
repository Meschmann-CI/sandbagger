import type { AppData, Round, Trip } from '../types'
import { canSeeTrip } from '../types'
import { settleUp, tripBalances, type Settlement } from './money'

// Who still owes who, across everything. One place computes it, so the
// number on the Home screen can never disagree with the card on the
// round or the trip it came from.

/**
 * The bets on one round, netted down and reduced by anything already
 * paid back. Positive net = owed money, matching a trip's balances.
 */
export function roundBetSettlements(data: AppData, round: Round): Settlement[] {
  const bets = data.bets.filter((b) => b.roundId === round.id)
  if (bets.length === 0) return []
  const net = new Map<string, number>()
  const shift = (id: string, by: number) => net.set(id, (net.get(id) ?? 0) + by)
  for (const bet of bets) for (const result of bet.results) shift(result.playerId, result.amount)
  for (const p of data.payments) {
    if (p.roundId !== round.id) continue
    shift(p.fromId, p.amount)
    shift(p.toId, -p.amount)
  }
  return settleUp([...net].map(([playerId, n]) => ({ playerId, paid: 0, share: 0, net: n })))
}

/** A trip's costs, same idea. */
export function tripSettlements(data: AppData, trip: Trip): Settlement[] {
  const expenses = data.expenses.filter((e) => e.tripId === trip.id)
  if (expenses.length === 0) return []
  const payments = data.payments.filter((p) => p.tripId === trip.id)
  return settleUp(tripBalances(expenses, payments, trip.attendeeIds))
}

export interface OutstandingDebt extends Settlement {
  /** Where the debt came from — a course name or a trip name. */
  label: string
  /** Where to go to settle it. */
  href: string
}

/**
 * Everything this golfer still owes or is owed, biggest first. Only
 * their own debts: what two other people owe each other is their
 * business, and it's already on the round or the trip.
 */
export function myOutstanding(data: AppData, playerId: string): OutstandingDebt[] {
  const out: OutstandingDebt[] = []
  for (const round of data.rounds) {
    for (const s of roundBetSettlements(data, round)) {
      if (s.fromId !== playerId && s.toId !== playerId) continue
      out.push({ ...s, label: round.courseName, href: `/rounds/${round.id}` })
    }
  }
  for (const trip of data.trips) {
    if (!canSeeTrip(trip, playerId)) continue
    for (const s of tripSettlements(data, trip)) {
      if (s.fromId !== playerId && s.toId !== playerId) continue
      out.push({ ...s, label: trip.name, href: `/trips/${trip.id}` })
    }
  }
  return out.sort((a, b) => b.amount - a.amount)
}

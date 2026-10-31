import type { AppData, Bet, BetResult } from '../types'
import { settleFromCard } from './bets'
import { courseForRound } from './courses'

// A bet's money as the cards say now, not as the last phone to save
// said. With two phones each keeping some golfers, the results stored on
// the row come from whichever phone saved last, settled from its own copy
// of the card, which may have been missing the other phone's holes
// (audit 2026-10-24, item 14). Standings, Settle up, Venmo and Wrapped
// all read through here, so they agree with the round page, which has
// always settled live.
//
// A bet the card can't speak for (custom, hand-typed, saved before
// net/gross was stored, or a game this version doesn't know) keeps its
// stored results: those are final.

export function betResults(data: AppData, bet: Bet): BetResult[] {
  const round = data.rounds.find((r) => r.id === bet.roundId)
  if (!round) return bet.results
  const live = settleFromCard(bet, round, courseForRound(data, round))
  return live ? live.results : bet.results
}

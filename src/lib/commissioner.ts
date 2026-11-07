import type { AppData, Trip, TripOption } from '../types'
import { saddamState } from './stats'

// The commissioner (Matt, 2026-11-07): whoever holds the Saddam. No
// election, no extra field; it moves with the trophy. Three powers, kept
// simple on purpose: a tied vote goes the commissioner's way, the
// commissioner can veto an option, and first pick in the round playlist
// once that exists. Same rules as BanditCore/Commissioner.swift.

export const commissionerId = (data: AppData): string | null => saddamState(data).holderId

export interface VoteRace {
  /** Most votes first, ties in the order added, vetoed options last. */
  options: TripOption[]
  /** The option in front, or null when nothing has a vote or a tie is undecided. */
  leadingId: string | null
  /** Two or more live options share the top count. */
  tied: boolean
  /** How the leader was decided: by the votes, or by the commissioner's own vote on a tie. */
  decided: 'votes' | 'commissioner' | null
}

export const isVetoed = (o: TripOption) => !!o.vetoedById

/** The state of a trip's vote, with the commissioner's two powers applied. */
export function voteRace(trip: Trip, commissioner: string | null): VoteRace {
  const indexed = trip.options.map((o, i) => ({ o, i }))
  const live = indexed.filter((x) => !isVetoed(x.o))
  const byVotes = (a: { o: TripOption; i: number }, b: { o: TripOption; i: number }) => b.o.votes.length - a.o.votes.length || a.i - b.i
  const options = [...live.sort(byVotes), ...indexed.filter((x) => isVetoed(x.o)).sort((a, b) => a.i - b.i)].map((x) => x.o)
  const top = Math.max(0, ...live.map((x) => x.o.votes.length))
  const leaders = live.filter((x) => x.o.votes.length === top && top > 0).map((x) => x.o)
  if (leaders.length === 1) return { options, leadingId: leaders[0].id, tied: false, decided: 'votes' }
  if (leaders.length === 0) return { options, leadingId: null, tied: false, decided: null }
  const call = commissioner ? leaders.find((o) => o.votes.includes(commissioner)) : undefined
  return call
    ? { options, leadingId: call.id, tied: true, decided: 'commissioner' }
    : { options, leadingId: null, tied: true, decided: null }
}

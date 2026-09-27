import type { AppData } from '../types'
import type { IconName } from '../components/icons'
import { canSeeTrip, hasScore, isGroupRound } from '../types'
import { byDate, holeStats, playerStats, roundWinnerIds, saddamDays } from './stats'
import { cardOf } from './holes'
import { sandbaggers } from './delight'

// The trophy shelf on You. Every badge comes from data the app already
// keeps (scores, cards, the Saddam's history, trips), so there's nothing
// new to record and old rounds count. Earned badges sit on the shelf in
// gold; the next few you haven't earned sit beside them in gray, which is
// the point: something to chase on the next round.

export interface Badge {
  key: string
  label: string
  /** What goes in the medal: a short number or word. */
  mark: string
  earned: boolean
  /** Drawn in the medal instead of `mark`. 'saddam' is the trophy art itself. */
  icon?: IconName | 'saddam'
  /** Why you have it, or what it takes. */
  detail: string
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function badgesFor(data: AppData, playerId: string, today: string): Badge[] {
  const stats = playerStats(data, playerId)
  const game = holeStats(data, playerId)
  const saddam = saddamDays(data, today).get(playerId)
  const mine = byDate(data.rounds).filter((r) => r.players.some((rp) => rp.playerId === playerId && hasScore(rp)))

  // Best run of group wins, all time.
  let run = 0
  let bestRun = 0
  for (const r of mine.filter(isGroupRound)) {
    run = roundWinnerIds(r).includes(playerId) ? run + 1 : 0
    bestRun = Math.max(bestRun, run)
  }

  const stamps = mine.filter((r) => sandbaggers(data, r).some((s) => s.playerId === playerId)).length
  const aces = data.rounds.reduce((n, r) => {
    const rp = r.players.find((p) => p.playerId === playerId)
    return rp ? n + cardOf(rp).filter((h) => h === 1).length : n
  }, 0)
  const trips = data.trips.filter((t) => t.status !== 'planning' && t.attendeeIds.includes(playerId) && canSeeTrip(t, playerId)).length
  const best = stats.bestGross

  const badges: Badge[] = [
    {
      key: 'saddam',
      label: saddam ? `Saddam ×${saddam.reigns}` : 'The Saddam',
      mark: 'S',
      icon: 'saddam',
      earned: !!saddam,
      detail: saddam ? `${plural(saddam.days, 'day')} holding it` : 'Win a group round outright',
    },
  ]

  // Scoring milestones: the ones you've cleared, then the next one up.
  for (const target of [100, 90, 80]) {
    const earned = best != null && best < target
    badges.push({
      key: `break${target}`,
      label: earned ? `Broke ${target}` : `Break ${target}`,
      mark: earned ? String(best) : String(target - 1),
      earned,
      detail: earned ? `Best round ${best}` : `Shoot ${target - 1} or better`,
    })
  }

  badges.push(
    {
      key: 'birdie',
      label: 'Birdie',
      mark: String(game.counts.birdie || '−1'),
      earned: game.counts.birdie > 0,
      detail: game.counts.birdie ? `${plural(game.counts.birdie, 'birdie')} on a card` : 'One under on any hole',
    },
    {
      key: 'eagle',
      label: 'Eagle',
      mark: '−2',
      earned: game.counts.eagle + game.counts.albatross > 0,
      detail: 'Two under on any hole',
    },
    {
      key: 'streak',
      label: 'Hot streak',
      mark: String(Math.max(bestRun, 3)),
      icon: 'flame',
      earned: bestRun >= 3,
      detail: bestRun >= 3 ? `${bestRun} group wins in a row` : 'Three group wins in a row',
    },
    {
      key: 'sandbagger',
      label: stamps > 1 ? `Sandbagger ×${stamps}` : 'Sandbagger',
      mark: 'SB',
      earned: stamps > 0,
      detail: stamps ? 'Stamped for playing well under the handicap' : 'Play well under your handicap',
    },
    { key: 'trip', label: trips > 1 ? `${trips} trips` : 'Road trip', mark: String(trips || 1), icon: 'suitcase', earned: trips > 0, detail: 'Go on a golf trip' },
    { key: 'ace', label: 'Ace', mark: '1', earned: aces > 0, detail: aces ? 'A hole in one' : 'The one everyone wants' },
  )

  // Earned first, keeping their order, with only the best scoring
  // milestone (Broke 90 says Broke 100 already); then the locked ones,
  // with only the next milestone up, so Break 80 doesn't show before 90.
  const isBreak = (b: Badge) => b.key.startsWith('break')
  const earned = badges.filter((b) => b.earned)
  const bestBreak = earned.filter(isBreak).pop()
  const locked = badges.filter((b) => !b.earned)
  const nextBreak = locked.find(isBreak)
  return [...earned.filter((b) => !isBreak(b) || b === bestBreak), ...locked.filter((b) => !isBreak(b) || b === nextBreak)]
}

/** A golfer's index at each round they posted, oldest first, then today's. */
export function indexHistory(data: AppData, playerId: string, current: number): { date: string; index: number }[] {
  const points = byDate(data.rounds)
    .map((r) => ({ date: r.date, rp: r.players.find((p) => p.playerId === playerId) }))
    .filter((x) => x.rp && hasScore(x.rp))
    .map((x) => ({ date: x.date, index: x.rp!.handicapSnapshot }))
  return [...points, { date: '9999-12-31', index: current }]
}

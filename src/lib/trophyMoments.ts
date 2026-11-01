import type { AppData, Round } from '../types'
import { badgesFor, type Badge, type BadgeKind } from './badges'

// Trophies earned by one round (Matt, 2026-10-22, option A). A golfer's
// own trophies pop up the moment their score lands (a card finished, or
// a total entered), and the group gets one push per golfer: "Barry
// earned Broke 90 and 3 other trophies at Split Rock". The ones the other
// cards decide wait for the final (Matt, 2026-11-01). Same rules as
// BanditCore/TrophyMoments.swift.

export interface EarnedTrophy {
  badge: Badge
  /** The golfer's first of this one. */
  first: boolean
}

/**
 * Which trophies a save hands out: `mine` are the ones only your own card
 * decides, `everyone` the ones the other cards decide too, `all` both.
 */
export type TrophyScope = 'mine' | 'everyone' | 'all'

/**
 * A trophy the other cards decide too: a win, a skin, a partner's holes.
 * Handed out at the final, not when your own card closes, so nobody is
 * told they won by a stroke with a card still out.
 */
export const needsEveryone = (b: Pick<Badge, 'kind' | 'key'>) =>
  b.kind === 'group' || b.key === 'sweep' || b.key === 'donor' || b.key === 'streak'

const SHELF: Record<BadgeKind, number> = { legend: 0, brag: 1, group: 2, odd: 3, locker: 4, shame: 5 }

/** The trophies this round earned the golfer, firsts before repeats: every trophy whose count is higher with the round than without it. */
export function trophiesFrom(data: AppData, roundId: string, playerId: string, today: string, scope: TrophyScope = 'all'): EarnedTrophy[] {
  const without: AppData = { ...data, rounds: data.rounds.filter((r) => r.id !== roundId) }
  const before = new Map(badgesFor(without, playerId, today).map((b) => [b.key, b.earned ? b.count : 0]))
  const inScope = (b: Badge) => scope === 'all' || (scope === 'everyone') === needsEveryone(b)
  // The Saddam has its own handover moment.
  return badgesFor(data, playerId, today)
    .filter((b) => b.earned && b.key !== 'saddam' && inScope(b) && b.count > (before.get(b.key) ?? 0))
    .map((badge) => ({ badge, first: (before.get(badge.key) ?? 0) === 0 }))
    .sort((a, b) => (a.first !== b.first ? (a.first ? -1 : 1) : SHELF[a.badge.kind] - SHELF[b.badge.kind]))
}

/** A round with every golfer's score in. */
export const roundIsFinal = (r: Round) => r.players.length > 0 && r.players.every((p) => p.gross != null)

/** The golfers whose score landed on this save: a card finished, or a total entered. */
export function closedOut(before: Round | undefined, after: Round): string[] {
  return after.players
    .filter((p) => p.gross != null && (before?.players.find((b) => b.playerId === p.playerId)?.gross ?? null) == null)
    .map((p) => p.playerId)
}

/** "Barry earned Broke 90" / "…and Snowman" / "…and 3 other trophies", at the course. */
export function trophyPushTitle(name: string, course: string, trophies: EarnedTrophy[]): string {
  if (!trophies.length) return ''
  const rest = trophies.length - 1
  const tail = rest === 0 ? '' : rest === 1 ? ` and ${trophies[1].badge.label}` : ` and ${rest} other trophies`
  return `${name} earned ${trophies[0].badge.label}${tail} at ${course}`
}

/** The line under a trophy in the moment: what it takes, and whether it's a first. */
export const trophyWhy = (t: EarnedTrophy) => (t.first ? `${t.badge.how} First time.` : `${t.badge.how} That's ${t.badge.count}.`)

/** "Split Rock" from "Split Rock Golf Course", the way the iPhone app shortens names. */
export const shortCourse = (name: string) => name.replace(/ (Golf Course|Golf Club|Country Club|Golf Links)$/, '')

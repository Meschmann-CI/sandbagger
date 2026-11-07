import { fmt1, type AppData, type Round } from '../types'
import type { PushMessage } from './push'
import { closedOut, roundIsFinal, shortCourse, trophiesFrom, trophyPushTitle, trophyWhy, type EarnedTrophy, type TrophyScope } from './trophyMoments'
import { spectatorNews } from './spectate'
import { roundStandings } from './stats'

// What one change to a round tells the group: the Final, each golfer's
// trophies, the turn and a lead change. `before` and `after` are the
// round as this phone knew it and knows it now, whether the change was
// typed here or came in on a reload from another phone, so a line two
// phones cross between them (Matt types Pat's 18th, Barry his own,
// neither save alone finishing the round) is still crossed (audit
// 2026-10-24, item 11). Each moment carries keys; the store marks them on
// this phone and claims them on the server before a push goes, so every
// phone that sees the moment sends it at most once between them (item
// 12), and a score cleared and typed again fires nothing twice (item 13).
// Same rules as BanditCore/RoundMoments.swift.

export interface RoundMoment {
  /** Announced once per round, across every phone. */
  keys: string[]
  push?: PushMessage
  /** A golfer's trophies from this round, for the sheet on their own phone. */
  trophies?: { playerId: string; course: string; won: EarnedTrophy[] }
}

export const trophiesKey = (playerId: string, scope: 'mine' | 'everyone') => `trophies:${playerId}:${scope}`
export const FINAL_KEY = 'final'

/** `already` says which keys this phone has announced for the round. */
export function roundMoments(data: AppData, before: Round | undefined, after: Round, today: string, already: (key: string) => boolean): RoundMoment[] {
  const out: RoundMoment[] = []
  const others = data.group.memberIds.filter((id) => id !== data.currentUserId)
  const closed = new Set(closedOut(before, after))
  const final = roundIsFinal(after) && !(before && roundIsFinal(before))
  const course = shortCourse(after.courseName)

  // A golfer's own trophies when their score lands, the ones the other
  // cards decide at the final (Matt, 2026-11-01).
  for (const rp of after.players) {
    const scopes: ('mine' | 'everyone')[] = []
    if (closed.has(rp.playerId) && !already(trophiesKey(rp.playerId, 'mine'))) scopes.push('mine')
    if (final && !already(trophiesKey(rp.playerId, 'everyone'))) scopes.push('everyone')
    if (!scopes.length) continue
    const p = data.players.find((x) => x.id === rp.playerId)
    if (!p || p.guest) continue
    const scope: TrophyScope = scopes.length === 2 ? 'all' : scopes[0]
    const won = trophiesFrom(data, after.id, p.id, today, scope)
    if (!won.length) continue
    const rest = won.slice(1).map((t) => t.badge.label)
    out.push({
      keys: scopes.map((s) => trophiesKey(rp.playerId, s)),
      trophies: { playerId: p.id, course, won },
      push: {
        toPlayerIds: others,
        title: trophyPushTitle(p.name.split(' ')[0], course, won),
        body: rest.length >= 2 ? `${rest.join(', ')}.` : trophyWhy(won[0]),
        url: `/rounds/${after.id}`,
      },
    })
  }

  // The moment the last score lands is the moment the group hears the
  // result. A round logged whole after the fact has no `before` and sends
  // only the trophies, as it always did.
  if (before && final && after.players.length > 1 && !already(FINAL_KEY)) {
    const standings = roundStandings(after)
    const winner = data.players.find((p) => p.id === standings[0]?.playerId)
    out.push({
      keys: [FINAL_KEY],
      push: {
        toPlayerIds: others,
        title: `Final at ${after.courseName}`,
        body: `${winner ? `${winner.name} takes it, net ${fmt1(standings[0].netScore)}.` : 'All the cards are in.'} Rate the course while it’s fresh.`,
        url: `/rounds/${after.id}`,
      },
    })
  }

  // The turn and a lead change, to whoever is watching from home.
  for (const news of spectatorNews(data, before, after, today)) {
    if (news.key && already(news.key)) continue
    out.push({ keys: news.key ? [news.key] : [], push: news })
  }
  return out
}

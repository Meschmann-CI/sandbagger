import type { Player, Trip } from '../types'
import type { PushMessage } from './push'
import { tripDateRange } from './dates'

// Who hears about a trip being booked (Matt, 2026-10-22: "people should get
// push notifications for when a new round/trip is booked and they are
// included in it"). Everyone on it when it's booked, whether it was booked
// from the start or decided after a vote; anyone added to it afterwards.
// Never whoever made the change. Same rules as tripNews in Store.swift.
export function tripNews(before: Trip | undefined, after: Trip, me: Player | undefined): PushMessage | null {
  if (after.status !== 'booked') return null
  const who = me?.name.split(' ')[0] ?? 'Someone'
  const when = tripDateRange(after.startDate, after.endDate)
  const url = `/trips/${after.id}`
  if (before?.status !== 'booked') {
    const to = after.attendeeIds.filter((id) => id !== me?.id)
    return to.length ? { toPlayerIds: to, title: `${who} booked ${after.name}`, body: `${when ? `${when}. ` : ''}You're on it.`, url } : null
  }
  const added = after.attendeeIds.filter((id) => !before.attendeeIds.includes(id) && id !== me?.id)
  return added.length ? { toPlayerIds: added, title: `${who} put you on ${after.name}`, body: when ? `${when}.` : undefined, url } : null
}

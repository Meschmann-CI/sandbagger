import type { BagClub } from '../types'

// What's in the bag (Matt, 2026-10-30): each club by a short code the
// apps share, with how far a full swing goes and what the club is. The
// order is the order a bag is laid out in, driver to putter. Same codes
// and rules as BanditCore/Bag.swift.

export const CLUBS = [
  'D', '3W', '5W', '7W', '9W',
  '2H', '3H', '4H', '5H', '6H', '7H',
  '2I', '3I', '4I', '5I', '6I', '7I', '8I', '9I',
  'PW', 'GW', 'SW', 'LW',
  'P',
] as const
export type ClubCode = (typeof CLUBS)[number]

/** "Driver", "3 wood", "5 hybrid", "7 iron", "Pitching wedge", "Putter". */
export function clubLabel(code: string): string {
  if (code === 'D') return 'Driver'
  if (code === 'P') return 'Putter'
  if (code === 'PW') return 'Pitching wedge'
  if (code === 'GW') return 'Gap wedge'
  if (code === 'SW') return 'Sand wedge'
  if (code === 'LW') return 'Lob wedge'
  const n = code.slice(0, -1)
  const kind = code.slice(-1)
  if (kind === 'W') return `${n} wood`
  if (kind === 'H') return `${n} hybrid`
  if (kind === 'I') return `${n} iron`
  return code
}

/** The chip: "Driver", "3W", "5H", "7i", "PW", "Putter". */
export function clubShort(code: string): string {
  if (code === 'D') return 'Driver'
  if (code === 'P') return 'Putter'
  return code.endsWith('I') ? `${code.slice(0, -1)}i` : code
}

/** A sensible starting number for the stepper, by club. */
export const TYPICAL_YARDS: Record<string, number> = {
  D: 230, '3W': 210, '5W': 195, '7W': 185, '9W': 175,
  '2H': 200, '3H': 190, '4H': 180, '5H': 170, '6H': 160, '7H': 150,
  '2I': 200, '3I': 190, '4I': 180, '5I': 170, '6I': 160, '7I': 150, '8I': 140, '9I': 130,
  PW: 115, GW: 100, SW: 85, LW: 70,
}

const rank = (code: string) => {
  const i = (CLUBS as readonly string[]).indexOf(code)
  return i < 0 ? CLUBS.length : i
}

/** Driver to putter, the way a bag is laid out. */
export function sortBag(bag: BagClub[]): BagClub[] {
  return [...bag].sort((a, b) => rank(a.club) - rank(b.club) || a.id.localeCompare(b.id))
}

/**
 * The club for a shot of `yards`: the shortest club that still gets
 * there, else the longest one in the bag. Clubs with no yards, and the
 * putter, don't count.
 */
export function clubFor(bag: BagClub[], yards: number): BagClub | undefined {
  const swings = bag.filter((c) => c.club !== 'P' && c.yards != null && c.yards > 0)
  if (!swings.length) return undefined
  const reaching = swings.filter((c) => c.yards! >= yards).sort((a, b) => a.yards! - b.yards!)
  return reaching[0] ?? swings.sort((a, b) => b.yards! - a.yards!)[0]
}

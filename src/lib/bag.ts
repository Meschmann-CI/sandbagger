import type { BagClub } from '../types'

// What's in the bag (Matt, 2026-10-30): each club by a short code the
// apps share, with how far a full swing goes and what the club is. The
// order is the order a bag is laid out in, driver to putter; the lofted
// wedges (Matt, 2026-10-30: 52, 54, 56, 60 and their neighbours) sit
// among PW, GW, SW and LW by loft. Same codes and rules as
// BanditCore/Bag.swift.

export const CLUBS = [
  'D', '3W', '5W', '7W', '9W',
  '2H', '3H', '4H', '5H', '6H', '7H',
  '2I', '3I', '4I', '5I', '6I', '7I', '8I', '9I',
  'PW', 'GW', '50', '52', '54', '56', 'SW', '58', '60', 'LW',
  'P',
] as const
export type ClubCode = (typeof CLUBS)[number]

/** "Driver", "3 wood", "5 hybrid", "7 iron", "Pitching wedge", "56° wedge", "Putter". */
export function clubLabel(code: string): string {
  if (/^\d+$/.test(code)) return `${code}° wedge`
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

/** The chip: "Driver", "3W", "5H", "7i", "PW", "56°", "Putter". */
export function clubShort(code: string): string {
  if (/^\d+$/.test(code)) return `${code}°`
  if (code === 'D') return 'Driver'
  if (code === 'P') return 'Putter'
  return code.endsWith('I') ? `${code.slice(0, -1)}i` : code
}

/** A sensible starting number for the stepper, by club. */
export const TYPICAL_YARDS: Record<string, number> = {
  D: 230, '3W': 210, '5W': 195, '7W': 185, '9W': 175,
  '2H': 200, '3H': 190, '4H': 180, '5H': 170, '6H': 160, '7H': 150,
  '2I': 200, '3I': 190, '4I': 180, '5I': 170, '6I': 160, '7I': 150, '8I': 140, '9I': 130,
  PW: 115, GW: 100, '50': 100, '52': 95, '54': 90, '56': 85, SW: 85, '58': 75, '60': 70, LW: 70,
}

/** An id for a club someone just added. */
export const newClubId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.floor(Math.random() * 1e12).toString(16)}`

const rank = (code: string) => {
  const i = (CLUBS as readonly string[]).indexOf(code)
  return i < 0 ? CLUBS.length : i
}

/** Driver to putter, the way a bag is laid out. */
export function sortBag(bag: BagClub[]): BagClub[] {
  return [...bag].sort((a, b) => rank(a.club) - rank(b.club) || a.id.localeCompare(b.id))
}

/**
 * The makes a bag is likely to hold, matched against what someone typed
 * ("Titleist TSR3", "Vokey SM10", "Scotty Cameron Newport"). The more
 * specific names come first so "Titleist Vokey" reads as Vokey. `logo` is
 * the file type of public/brands/<key>.<logo>; a make without one shows as
 * its name on the badge.
 */
export interface Brand {
  key: string
  name: string
  match: RegExp
  logo?: 'svg' | 'png'
}

export const BRANDS: Brand[] = [
  { key: 'scotty', name: 'Scotty Cameron', match: /scotty/, logo: 'png' },
  { key: 'vokey', name: 'Vokey', match: /vokey/, logo: 'png' },
  { key: 'odyssey', name: 'Odyssey', match: /odyssey/, logo: 'svg' },
  { key: 'titleist', name: 'Titleist', match: /titleist/, logo: 'svg' },
  { key: 'callaway', name: 'Callaway', match: /callaway/, logo: 'svg' },
  { key: 'taylormade', name: 'TaylorMade', match: /taylor\s*made/, logo: 'svg' },
  { key: 'ping', name: 'Ping', match: /\bping\b/, logo: 'svg' },
  { key: 'mizuno', name: 'Mizuno', match: /mizuno/, logo: 'svg' },
  { key: 'srixon', name: 'Srixon', match: /srixon/, logo: 'svg' },
  { key: 'cleveland', name: 'Cleveland', match: /cleveland/, logo: 'svg' },
  { key: 'wilson', name: 'Wilson', match: /wilson/, logo: 'svg' },
  { key: 'pxg', name: 'PXG', match: /\bpxg\b/, logo: 'svg' },
  { key: 'cobra', name: 'Cobra', match: /\bcobra\b/, logo: 'svg' },
  { key: 'bridgestone', name: 'Bridgestone', match: /bridgestone/, logo: 'svg' },
  { key: 'honma', name: 'Honma', match: /honma/, logo: 'svg' },
  { key: 'xxio', name: 'XXIO', match: /xxio/ },
  { key: 'touredge', name: 'Tour Edge', match: /tour\s*edge/, logo: 'png' },
  { key: 'hogan', name: 'Ben Hogan', match: /hogan/, logo: 'svg' },
  { key: 'nike', name: 'Nike', match: /\bnike\b/, logo: 'svg' },
  { key: 'adams', name: 'Adams', match: /\badams\b/, logo: 'png' },
]

/** Where the make's logo lives, or undefined for a make we only have the name of. */
export function brandLogoSrc(b: Brand): string | undefined {
  return b.logo ? `/brands/${b.key}.${b.logo}` : undefined
}

/** The make named in a club's brand text, or undefined for one we don't know. */
export function brandOf(text: string | undefined): Brand | undefined {
  if (!text) return undefined
  const t = text.toLowerCase()
  return BRANDS.find((b) => b.match.test(t))
}

/** The three numbers worth a glance: the longest club, a mid iron, the shortest full swing. */
export function bagHeadlines(bag: BagClub[]): BagClub[] {
  const swings = sortBag(bag).filter((c) => c.club !== 'P' && c.yards != null)
  if (swings.length <= 3) return swings
  const mid = swings.find((c) => c.club === '7I') ?? swings[Math.floor(swings.length / 2)]
  const picks = [swings[0], mid, swings[swings.length - 1]]
  return picks.filter((c, i) => picks.indexOf(c) === i)
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

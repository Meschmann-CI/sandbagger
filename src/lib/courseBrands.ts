import { courseSlug } from './courses'
import type { Course, CourseBrand } from '../types'

export type { CourseBrand }

// Each course's own look, so a card from Bethpage reads like a card from
// Bethpage: its logo, and the colour its printed card would use for the
// hole row.
//
// Two sources. A brand set in the app (the course's Edit card, or the
// logo the scanner found on a photographed card) lives on the course row
// and wins. Below it, the built-in list: logos in public/logos, pulled
// from each course's own site (private app, four golfers), matched on the
// course slug by pattern, because rounds carry the course as free text
// ("Split Rock", "Split Rock Golf Course") and both should find the same
// brand. A course with neither keeps the Bandit card.

// The group's stored brands by slug. The store refreshes this whenever
// the courses change, so courseBrand(name) stays a plain lookup that any
// screen can call without being handed the data.
let stored = new Map<string, CourseBrand>()
let storedFrom: Course[] | null = null
export function syncStoredBrands(courses: Course[]) {
  if (courses === storedFrom) return
  storedFrom = courses
  stored = new Map(courses.filter((c) => c.brand?.color).map((c) => [c.slug, c.brand!]))
}

interface Entry extends CourseBrand {
  match: RegExp
}

const WESTCHESTER: CourseBrand = { logo: '/logos/westchester-county.png', color: '#093C4D' }

// First match wins, so the specific courses of a multi-course facility
// come before the facility itself.
const BRANDS: Entry[] = [
  // Bethpage: one Caddy Boy, five courses, each in its own colour.
  { match: /^bethpage black/, logo: '/logos/bethpage.png', color: '#1A1A1A' },
  { match: /^bethpage blue/, logo: '/logos/bethpage.png', color: '#293280' },
  { match: /^bethpage green/, logo: '/logos/bethpage.png', color: '#116738' },
  { match: /^bethpage red/, logo: '/logos/bethpage.png', color: '#B92634' },
  { match: /^bethpage yellow/, logo: '/logos/bethpage.png', color: '#E8B400', ink: '#1A1A1A' },
  { match: /^bethpage/, logo: '/logos/bethpage.png', color: '#116738' },

  // Eisenhower Park: Nassau County publishes no golf logo, so colour only.
  { match: /^eisenhower.*red/, color: '#C8102E' },
  { match: /^eisenhower.*blue/, color: '#1F4E9C' },
  { match: /^eisenhower/, color: '#64748B' },

  { match: /^harbor links/, logo: '/logos/harbor-links.png', color: '#1B1C20', tall: true },
  { match: /middle bay/, logo: '/logos/middle-bay.png', color: '#096D3B' },

  // New York City courses. Most run under GolfNYC, which gives each its
  // own mark; Dyker Beach and Pelham/Split Rock are American Golf's.
  { match: /^bally.?s golf links|ferry point/, logo: '/logos/ballys-golf-links-at-ferry-point.png', color: '#D00000', wide: true },
  { match: /^clearview/, logo: '/logos/clearview-park.png', color: '#1A1A1A' },
  { match: /^douglaston/, logo: '/logos/douglaston.png', color: '#B81D1D' },
  { match: /^dyker beach/, logo: '/logos/dyker-beach.png', color: '#1A1A1A' },
  { match: /^forest park/, logo: '/logos/forest-park.png', color: '#8A5530' },
  { match: /^kissena/, logo: '/logos/kissena-park.png', color: '#0E5990' },
  { match: /^la tourette/, logo: '/logos/la-tourette.png', color: '#051D44' },
  { match: /^marine park/, logo: '/logos/marine-park.png', color: '#1B2A41', dark: true, wide: true },
  { match: /^(pelham bay|split rock)/, logo: '/logos/pelham-bay-split-rock.png', color: '#1A1A1A' },
  { match: /^silver lake/, logo: '/logos/silver-lake.png', color: '#3A4A5A', dark: true, wide: true },
  { match: /^van cortlandt/, logo: '/logos/van-cortlandt.png', color: '#014A36' },

  // Everywhere else the group has played. Dutcher, Overpeck, Hendricks
  // Field and Weequahic publish no course logo of their own (only a town
  // or county seal), so they keep the Sandbagger card.
  { match: /^brownson/, logo: '/logos/brownson.jpg', color: '#1F5A30' },
  { match: /^centennial/, logo: '/logos/centennial.png', color: '#5E5539' },
  { match: /^haig point/, logo: '/logos/haig-point.png', color: '#3F4145' },
  { match: /^hilton head national/, logo: '/logos/hilton-head-national.png', color: '#00473C' },
  { match: /^new york country club/, logo: '/logos/new-york-country-club.png', color: '#1A1A1A', dark: true },
  { match: /^palm beach golf club/, logo: '/logos/palm-beach-sydney.png', color: '#2B8C88', wide: true },
  { match: /^patriot hills/, logo: '/logos/patriot-hills.png', color: '#0913B0', tall: true },
  { match: /^putnam county/, logo: '/logos/putnam-county.png', color: '#002E56' },
  { match: /^river vale/, logo: '/logos/river-vale.png', color: '#980A0A', wide: true },
  { match: /^sea pines/, logo: '/logos/sea-pines-atlantic-dunes.svg', color: '#A90533', wide: true },
  { match: /^somers national/, logo: '/logos/somers-national.png', color: '#616028' },
  { match: /union vale/, logo: '/logos/union-vale.png', color: '#33413A', dark: true, wide: true },

  // Westchester County runs these six under one Golf Westchester mark.
  { match: /^(dunwoodie|maple moor|mohansic|saxon woods|sprain lake|hudson hills)/, ...WESTCHESTER },
]

// The colour of a tee marker, from its name, for the dot beside the
// yardage. Combination and unusual tees get no dot rather than a guess.
const TEE_COLOUR: Record<string, string> = {
  blue: '#1F5FBF',
  white: '#FFFFFF',
  red: '#C8102E',
  gold: '#E0A800',
  yellow: '#E0A800',
  black: '#1A1A1A',
  green: '#127A4D',
  silver: '#A7B0B5',
  gray: '#A7B0B5',
  grey: '#A7B0B5',
  orange: '#E06A1B',
  purple: '#6B3FA0',
  copper: '#B87333',
  tan: '#C9A97A',
}
export const teeColour = (name?: string | null) => {
  if (!name) return undefined
  const word = name.trim().toLowerCase().replace(/\s*tees?$/, '').split(/[\s/-]+/)[0]
  return TEE_COLOUR[word] ?? TEE_COLOUR[word.replace(/s$/, '')]
}

/** Black or white, whichever reads on `hex`. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.4 ? '#1A1A1A' : '#FFFFFF'
}

/**
 * The hole band's fill for a tee colour. A white tee's band on a white
 * card is no band at all, so very light colours are shaded a touch toward
 * ink: still plainly white tees, but a strip you can see.
 */
export function bandFill(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
  if (lum < 0.82) return hex
  const ink = [24, 32, 25]
  const t = lum > 0.95 ? 0.09 : 0.05
  return `#${rgb.map((c, i) => Math.round(c + (ink[i] - c) * t).toString(16).padStart(2, '0')).join('')}`
}

export function courseBrand(courseName: string | undefined): (CourseBrand & { ink: string }) | null {
  if (!courseName) return null
  const slug = courseSlug(courseName)
  const own = stored.get(slug)
  if (own) return { ...own, ink: own.ink ?? inkOn(own.color) }
  return builtInBrand(courseName)
}

/** The built-in list only, ignoring anything set in the app. */
export function builtInBrand(courseName: string): (CourseBrand & { ink: string }) | null {
  const slug = courseSlug(courseName)
  const hit = BRANDS.find((b) => b.match.test(slug))
  if (!hit) return null
  const { match: _match, ...brand } = hit
  return { ...brand, ink: brand.ink ?? inkOn(brand.color) }
}

import { courseSlug } from './courses'

// Each course's own look, so a card from Bethpage reads like a card from
// Bethpage: its logo, and the colour its printed card would use for the
// hole row. Logos live in public/logos, pulled from each course's own
// site (private app, four golfers). Matched on the course slug by
// pattern, because rounds carry the course as free text ("Split Rock",
// "Split Rock Golf Course") and both should find the same brand.
// A course with no entry keeps the Sandbagger card.

export interface CourseBrand {
  /** Path under public/, or undefined when the course has no usable logo. */
  logo?: string
  /** The hole row's background. */
  color: string
  /** Text on that background; worked out from `color` when left out. */
  ink?: string
  /** A logo drawn tall and narrow gets a taller slot. */
  tall?: boolean
  /** White artwork: it sits on `color` instead of on white, or it vanishes. */
  dark?: boolean
  /** A long wordmark: unreadable in a square tile, so lists keep the scene. */
  wide?: boolean
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

export function courseBrand(courseName: string | undefined): (CourseBrand & { ink: string }) | null {
  if (!courseName) return null
  const slug = courseSlug(courseName)
  const hit = BRANDS.find((b) => b.match.test(slug))
  if (!hit) return null
  const { match: _match, ...brand } = hit
  return { ...brand, ink: brand.ink ?? inkOn(brand.color) }
}

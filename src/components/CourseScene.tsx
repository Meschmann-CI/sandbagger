import { useId, type ReactNode } from 'react'

// Little painted landscapes that stand in for a photo: a round with no
// pictures, a course, a trip.
//
// A scene is two choices. The landscape belongs to the course, so a
// course looks like itself everywhere it appears: pines for anything
// named for them, dunes and water for a links or a beach course, mesas
// for the desert, rolling parkland otherwise. The light belongs to the
// round (morning, midday, golden hour, twilight), so the fifth round at
// Cobbs Creek is still Cobbs Creek but not the same picture as the
// fourth. Before this, one key picked both, and the same course turned
// up as three different places down the Rounds list.
//
// Drawn in a 160×100 box and cropped to fill whatever shape holds them,
// anchored to the ground: a wide banner loses sky, never the green and
// the flag.

export const LANDSCAPES = ['parkland', 'links', 'pines', 'desert'] as const
export type Landscape = (typeof LANDSCAPES)[number]
export const LIGHTS = ['morning', 'midday', 'golden', 'twilight'] as const
export type Light = (typeof LIGHTS)[number]

// FNV-1a: spreads similar keys across the options, where a plain *31
// hash piled half of them onto one.
function hash(key: string) {
  let h = 0x811c9dc5
  for (const ch of key.trim().toLowerCase()) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

const HINTS: [RegExp, Landscape][] = [
  [/pine|forest|woods|timber|cedar|spruce/, 'pines'],
  [/desert|canyon|mesa|ranch|cactus|palm|sedona|scottsdale|tucson|phoenix|vegas|arizona|\baz\b|\bnm\b|\bnv\b/, 'desert'],
  [/links|dune|beach|bay|shore|ocean|sea|harbou?r|island|marine|coast|bandon|kiawah|hilton head|sand/, 'links'],
]

/** The course's landscape: from its name when the name says, else parkland more often than not. */
export function landscapeFor(course: string): Landscape {
  const name = course.toLowerCase()
  for (const [re, land] of HINTS) if (re.test(name)) return land
  return (['parkland', 'parkland', 'pines', 'links'] as const)[hash(name) % 4]
}

/** A round's light, from its id. */
export function lightFor(key: string): Light {
  return LIGHTS[hash(key) % LIGHTS.length]
}

/** Lights for a list, in order: each key's own, nudged along when it would match its neighbour. */
export function lightsFor(keys: string[]): Light[] {
  const out: Light[] = []
  for (const key of keys) {
    let l = lightFor(key)
    if (out.length && out[out.length - 1] === l) l = LIGHTS[(LIGHTS.indexOf(l) + 1) % LIGHTS.length]
    out.push(l)
  }
  return out
}

interface Palette {
  sky: string[]
  orb: { x: number; y: number; r: number; fill: string }
  stars?: boolean
  clouds: number
  far: string
  mid: string
  near: string
  green: string
  water: string
  sand: string
  tree: string
  tree2: string
  mesa: string
  pole: string
  cloth: string
}

const PALETTES: Record<Light, Palette> = {
  morning: {
    sky: ['#9fc9e8', '#e6f1ec'],
    orb: { x: 34, y: 34, r: 9, fill: '#fff4cf' },
    clouds: 0.85,
    far: '#9cc08a', mid: '#6aa257', near: '#4f8a43', green: '#86c46c',
    water: '#6fb0d0', sand: '#eadcae', tree: '#3d6b53', tree2: '#2f5a45', mesa: '#c99a78',
    pole: '#ffffff', cloth: '#cf4a35',
  },
  midday: {
    sky: ['#76b0de', '#d6ebf5'],
    orb: { x: 84, y: 13, r: 8, fill: '#fffbe8' },
    clouds: 0.95,
    far: '#94bd6f', mid: '#5f9a4a', near: '#4a8540', green: '#8fca66',
    water: '#4f9cc4', sand: '#ecdcaa', tree: '#35684a', tree2: '#28573d', mesa: '#c9865e',
    pole: '#ffffff', cloth: '#cf4a35',
  },
  golden: {
    sky: ['#f2b872', '#f8e3c2'],
    orb: { x: 40, y: 52, r: 14, fill: '#fbe7b0' },
    clouds: 0.35,
    far: '#b5a866', mid: '#7d9447', near: '#5f7a38', green: '#9ab65a',
    water: '#d7a77c', sand: '#f3dfb3', tree: '#5a6b3a', tree2: '#48592f', mesa: '#c47a52',
    pole: '#ffffff', cloth: '#cf4a35',
  },
  twilight: {
    sky: ['#2f3f6b', '#7c6f9e', '#e9a88a'],
    orb: { x: 124, y: 26, r: 7, fill: '#f6ecd2' },
    stars: true,
    clouds: 0,
    far: '#3b5647', mid: '#2e4a3c', near: '#243c30', green: '#466b52',
    water: '#5b6590', sand: '#8a7c78', tree: '#1f3a2e', tree2: '#182f25', mesa: '#5c4a60',
    pole: '#f6ecd2', cloth: '#e9a88a',
  },
}

/** Pin in the cup, on a green whose centre is (x, y). The flag stirs, unless motion is reduced. */
function Flag({ x, y, pole, cloth }: { x: number; y: number; pole: string; cloth: string }) {
  return (
    <>
      <line x1={x} y1={y - 19} x2={x} y2={y} stroke={pole} strokeWidth="1.3" strokeLinecap="round" />
      <path className="scene-flag" style={{ transformOrigin: `${x}px ${y - 16}px` }} d={`M${x} ${y - 19} l9 3.2 -9 3.2z`} fill={cloth} />
    </>
  )
}

function pineRow(xs: [number, number][], base: number, fill: string) {
  return xs.map(([x, h], i) => <path key={i} d={`M${x} ${base - h} l${h * 0.34} ${h} h${-h * 0.68}z`} fill={fill} />)
}

function art(land: Landscape, p: Palette, sky: string): ReactNode {
  const heavens = (
    <>
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          {p.sky.map((c, i) => (
            <stop key={i} offset={i / (p.sky.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <rect width="160" height="100" fill={`url(#${sky})`} />
      {p.stars && (
        <g fill="#ffffff">
          <circle cx="22" cy="14" r="0.9" />
          <circle cx="58" cy="9" r="0.7" />
          <circle cx="84" cy="20" r="0.8" />
          <circle cx="102" cy="11" r="0.6" />
          <circle cx="146" cy="16" r="0.8" />
        </g>
      )}
      <circle cx={p.orb.x} cy={p.orb.y} r={p.orb.r} fill={p.orb.fill} opacity="0.95" />
      {p.clouds > 0 && (
        <g fill="#ffffff" opacity={p.clouds}>
          <ellipse cx="62" cy="22" rx="13" ry="4.5" />
          <ellipse cx="71" cy="19" rx="8" ry="4.5" />
          <ellipse cx="128" cy="32" rx="11" ry="3.5" />
        </g>
      )}
    </>
  )
  const flag = (x: number, y: number) => <Flag x={x} y={y} pole={p.pole} cloth={p.cloth} />
  switch (land) {
    case 'parkland':
      return (
        <>
          {heavens}
          <path d="M0 62 Q30 48 62 56 T128 50 T160 54 V100 H0Z" fill={p.far} />
          <circle cx="18" cy="58" r="7" fill={p.tree} />
          <circle cx="27" cy="60" r="5" fill={p.tree2} />
          <path d="M0 74 Q50 60 96 70 T160 66 V100 H0Z" fill={p.mid} />
          <ellipse cx="72" cy="84" rx="10" ry="2.6" fill={p.sand} />
          <ellipse cx="112" cy="76" rx="22" ry="5" fill={p.green} />
          {flag(114, 76)}
          <path d="M0 90 Q60 80 160 91 V100 H0Z" fill={p.near} />
        </>
      )
    case 'links':
      return (
        <>
          {heavens}
          <rect y="52" width="160" height="12" fill={p.water} />
          <path d="M0 56 Q20 54 40 56 T80 56 T120 56 T160 56" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" />
          <path d="M0 64 Q30 56 60 64 T120 60 T160 64 V100 H0Z" fill={p.sand} />
          <path d="M0 74 Q40 66 90 74 T160 72 V100 H0Z" fill={p.mid} />
          <ellipse cx="50" cy="80" rx="20" ry="4.5" fill={p.green} />
          {flag(52, 80)}
          <path d="M0 91 Q80 84 160 92 V100 H0Z" fill={p.near} />
        </>
      )
    case 'pines':
      return (
        <>
          {heavens}
          {pineRow([[4, 22], [15, 30], [26, 24], [38, 32], [50, 26], [118, 28], [130, 34], [142, 25], [154, 31]], 66, p.tree)}
          {pineRow([[10, 18], [32, 22], [124, 20], [148, 21]], 68, p.tree2)}
          <path d="M0 70 Q60 62 160 70 V100 H0Z" fill={p.mid} />
          <ellipse cx="80" cy="78" rx="22" ry="5" fill={p.green} />
          {flag(82, 78)}
          <path d="M0 89 Q80 82 160 89 V100 H0Z" fill={p.near} />
        </>
      )
    case 'desert':
      return (
        <>
          {heavens}
          <path d="M0 60 H18 L24 50 H52 L58 60 H100 L106 54 H130 L136 60 H160 V100 H0Z" fill={p.mesa} />
          <path d="M0 68 Q60 60 160 68 V100 H0Z" fill={p.sand} />
          <path d="M14 100 Q40 76 92 78 T152 100Z" fill={p.mid} />
          <ellipse cx="104" cy="83" rx="16" ry="4" fill={p.green} />
          {flag(106, 83)}
        </>
      )
  }
}

/**
 * `course` picks the landscape. `light` picks the time of day; leave it
 * out for the course on its own (its page, its row in a list), which gets
 * the course's own light so it stays the same picture there too.
 */
export default function CourseScene({ course, light, className = '' }: { course: string; light?: Light; className?: string }) {
  const sky = `sky${useId().replace(/:/g, '')}`
  const land = landscapeFor(course)
  const which = light ?? (['morning', 'midday', 'golden'] as const)[hash(course) % 3]
  // Half the courses see their landscape from the other side, so two
  // courses that share one (Mid Pines, Pine Needles) still aren't the
  // same picture side by side.
  const mirrored = (hash(`${course}|side`) & 1) === 1
  return (
    <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMax slice" className={`block ${className}`} aria-hidden>
      <g transform={mirrored ? 'translate(160 0) scale(-1 1)' : undefined}>{art(land, PALETTES[which], sky)}</g>
    </svg>
  )
}

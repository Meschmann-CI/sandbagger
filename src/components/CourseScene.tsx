import { useId, type ReactNode } from 'react'

// Little painted landscapes that stand in for a photo: a round with no
// pictures, a course, a trip. Six of them, rotating. A key picks one and
// always the same one (a course's name, a round's id), and a list never
// puts the same scene twice in a row, because the group plays the same
// few courses over and over and a row of identical tiles is the monotony
// these are here to break. Drawn in a 160×100 box and cropped to fill
// whatever shape holds them, anchored to the ground: a wide banner loses
// sky, never the green and the flag.

export const SCENES = ['morning', 'golden', 'links', 'pines', 'desert', 'twilight'] as const
export type SceneName = (typeof SCENES)[number]

// FNV-1a: spreads similar names ("Pine Needles", "Mid Pines") across the
// scenes, where a plain *31 hash piled half of them onto one.
export function sceneFor(key: string): SceneName {
  let h = 0x811c9dc5
  for (const ch of key.trim().toLowerCase()) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return SCENES[h % SCENES.length]
}

/** Scenes for a list, in order: each key's own, nudged along when it would match its neighbour. */
export function scenesFor(keys: string[]): SceneName[] {
  const out: SceneName[] = []
  for (const key of keys) {
    let s = sceneFor(key)
    if (out.length && out[out.length - 1] === s) s = SCENES[(SCENES.indexOf(s) + 1) % SCENES.length]
    out.push(s)
  }
  return out
}

/** Pin in the cup, on a green whose centre is (x, y). */
function Flag({ x, y, pole = '#ffffff', cloth = '#cf4a35' }: { x: number; y: number; pole?: string; cloth?: string }) {
  return (
    <>
      <line x1={x} y1={y - 19} x2={x} y2={y} stroke={pole} strokeWidth="1.3" strokeLinecap="round" />
      <path d={`M${x} ${y - 19} l9 3.2 -9 3.2z`} fill={cloth} />
    </>
  )
}

function Sky({ id, stops }: { id: string; stops: string[] }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {stops.map((c, i) => (
            <stop key={i} offset={i / (stops.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <rect width="160" height="100" fill={`url(#${id})`} />
    </>
  )
}

function pines(xs: [number, number][], base: number, fill: string) {
  return xs.map(([x, h], i) => <path key={i} d={`M${x} ${base - h} l${h * 0.34} ${h} h${-h * 0.68}z`} fill={fill} />)
}

function art(scene: SceneName, sky: string): ReactNode {
  switch (scene) {
    case 'morning':
      return (
        <>
          <Sky id={sky} stops={['#9fc9e8', '#e6f1ec']} />
          <g fill="#ffffff" opacity="0.85">
            <ellipse cx="38" cy="22" rx="13" ry="4.5" />
            <ellipse cx="47" cy="19" rx="8" ry="4.5" />
            <ellipse cx="120" cy="30" rx="11" ry="3.5" />
          </g>
          <path d="M0 62 Q30 48 62 56 T128 50 T160 54 V100 H0Z" fill="#9cc08a" />
          <path d="M0 74 Q50 60 96 70 T160 66 V100 H0Z" fill="#6aa257" />
          <ellipse cx="112" cy="76" rx="22" ry="5" fill="#86c46c" />
          <Flag x={114} y={76} />
          <path d="M0 90 Q60 80 160 91 V100 H0Z" fill="#4f8a43" />
        </>
      )
    case 'golden':
      return (
        <>
          <Sky id={sky} stops={['#f2b872', '#f8e3c2']} />
          <circle cx="42" cy="52" r="14" fill="#fbe7b0" opacity="0.95" />
          <path d="M0 60 Q40 50 80 58 T160 52 V100 H0Z" fill="#b5a866" />
          <path d="M0 72 Q60 62 110 72 T160 70 V100 H0Z" fill="#7d9447" />
          <ellipse cx="88" cy="83" rx="12" ry="3" fill="#f3dfb3" />
          <ellipse cx="120" cy="77" rx="20" ry="4.5" fill="#9ab65a" />
          <Flag x={122} y={77} />
          <path d="M0 90 Q70 82 160 90 V100 H0Z" fill="#5f7a38" />
        </>
      )
    case 'links':
      return (
        <>
          <Sky id={sky} stops={['#b8d9ea', '#eef5f3']} />
          <rect y="52" width="160" height="12" fill="#5d9fc0" />
          <path d="M0 56 Q20 54 40 56 T80 56 T120 56 T160 56" fill="none" stroke="#9cc6da" strokeWidth="1" />
          <path d="M0 64 Q30 56 60 64 T120 60 T160 64 V100 H0Z" fill="#e5d2a1" />
          <path d="M0 74 Q40 66 90 74 T160 72 V100 H0Z" fill="#8fae5e" />
          <ellipse cx="50" cy="80" rx="20" ry="4.5" fill="#a3c46e" />
          <Flag x={52} y={80} />
          <path d="M0 91 Q80 84 160 92 V100 H0Z" fill="#6f9148" />
        </>
      )
    case 'pines':
      return (
        <>
          <Sky id={sky} stops={['#cfdfe3', '#f1f4ee']} />
          {pines([[4, 22], [15, 30], [26, 24], [38, 32], [50, 26], [118, 28], [130, 34], [142, 25], [154, 31]], 66, '#3d6b53')}
          {pines([[10, 18], [32, 22], [124, 20], [148, 21]], 68, '#2f5a45')}
          <path d="M0 70 Q60 62 160 70 V100 H0Z" fill="#74a35a" />
          <ellipse cx="80" cy="78" rx="22" ry="5" fill="#8fc26f" />
          <Flag x={82} y={78} />
          <path d="M0 89 Q80 82 160 89 V100 H0Z" fill="#5b8c47" />
        </>
      )
    case 'desert':
      return (
        <>
          <Sky id={sky} stops={['#f3b58c', '#f9e2c6']} />
          <circle cx="128" cy="28" r="8" fill="#fff1d6" />
          <path d="M0 60 H18 L24 50 H52 L58 60 H100 L106 54 H130 L136 60 H160 V100 H0Z" fill="#c9865e" />
          <path d="M0 68 Q60 60 160 68 V100 H0Z" fill="#ecc996" />
          <path d="M14 100 Q40 76 92 78 T152 100Z" fill="#7aa85a" />
          <ellipse cx="104" cy="83" rx="16" ry="4" fill="#93c06b" />
          <Flag x={106} y={83} />
        </>
      )
    case 'twilight':
      return (
        <>
          <Sky id={sky} stops={['#2f3f6b', '#7c6f9e', '#e9a88a']} />
          <g fill="#ffffff">
            <circle cx="22" cy="14" r="0.9" />
            <circle cx="58" cy="9" r="0.7" />
            <circle cx="84" cy="20" r="0.8" />
            <circle cx="102" cy="11" r="0.6" />
            <circle cx="146" cy="16" r="0.8" />
          </g>
          <circle cx="124" cy="26" r="7" fill="#f6ecd2" />
          <path d="M0 62 Q40 52 90 60 T160 56 V100 H0Z" fill="#3b5647" />
          <path d="M0 74 Q60 64 160 72 V100 H0Z" fill="#2e4a3c" />
          <ellipse cx="60" cy="79" rx="20" ry="4.5" fill="#466b52" />
          <Flag x={62} y={79} pole="#f6ecd2" cloth="#e9a88a" />
        </>
      )
  }
}

export default function CourseScene({ name, scene, className = '' }: { name?: string; scene?: SceneName; className?: string }) {
  const sky = `sky${useId().replace(/:/g, '')}`
  const which = scene ?? sceneFor(name ?? '')
  return (
    <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMax slice" className={`block ${className}`} aria-hidden>
      {art(which, sky)}
    </svg>
  )
}

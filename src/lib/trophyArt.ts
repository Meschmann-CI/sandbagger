// Trophy artwork, from the Claude Design handoff (design/sandbagger-trophies
// beside the repo; regenerate with scripts/make-trophy-art.mjs rather
// than editing by hand). Six shelves, six shapes: a rosette for the
// legendary one, a crest for the brags, a ball for the group ones, a
// diamond for the odd ones, a locker plate for the locker room and a divot
// for the ones nobody wants. Every face has the dimple texture and a soft
// sheen; locked ones are pencil gray in the same shape.

export type ArtShelf = 'legend' | 'brag' | 'group' | 'odd' | 'locker' | 'nobody'
export interface ArtColors {
  rim1: string
  rim2: string
  rim3: string
  face1: string
  face2: string
  glyph: string
}
export interface TrophyArt {
  shelf: ArtShelf
  /** A key in ICONS, unless the trophy shows a numeral. */
  icon?: string
  /** The numeral on the face, which wins over an icon. */
  num?: string
  /** The small caps line above the numeral. */
  sub?: string
}

export const SHAPES: Record<ArtShelf, string> = {
  legend: 'M60.0 6.0 A11.1 11.1 0 0 1 80.7 10.1 A11.1 11.1 0 0 1 98.2 21.8 A11.1 11.1 0 0 1 109.9 39.3 A11.1 11.1 0 0 1 114.0 60.0 A11.1 11.1 0 0 1 109.9 80.7 A11.1 11.1 0 0 1 98.2 98.2 A11.1 11.1 0 0 1 80.7 109.9 A11.1 11.1 0 0 1 60.0 114.0 A11.1 11.1 0 0 1 39.3 109.9 A11.1 11.1 0 0 1 21.8 98.2 A11.1 11.1 0 0 1 10.1 80.7 A11.1 11.1 0 0 1 6.0 60.0 A11.1 11.1 0 0 1 10.1 39.3 A11.1 11.1 0 0 1 21.8 21.8 A11.1 11.1 0 0 1 39.3 10.1 A11.1 11.1 0 0 1 60.0 6.0 Z',
  brag: 'M60 5 C78 13 95 15 110 15 V58 C110 88 90 106 60 116 C30 106 10 88 10 58 V15 C25 15 42 13 60 5 Z',
  group: 'M6 60 A54 54 0 1 0 114 60 A54 54 0 1 0 6 60 Z',
  odd: 'M50 13 Q60 3 70 13 L107 50 Q117 60 107 70 L70 107 Q60 117 50 107 L13 70 Q3 60 13 50 Z',
  locker: 'M60 7 C101 7 113 19 113 60 C113 101 101 113 60 113 C19 113 7 101 7 60 C7 19 19 7 60 7 Z',
  nobody: 'M18 38 C28 16 58 8 80 13 C104 18 117 38 112 62 C108 86 92 106 66 110 C40 114 14 102 8 78 C4 62 10 50 18 38 Z'
}

const SILVER = { rim1: '#FFFFFF', rim2: '#C3CAD2', rim3: '#6E7886' }
export const COLORS: Record<ArtShelf | 'locked', ArtColors> = {
  legend: { rim1: '#FFF1C2', rim2: '#D9AE4A', rim3: '#86621A', face1: '#2F7049', face2: '#143826', glyph: '#F1D58C' },
  brag: { rim1: '#FFF6DC', rim2: '#E3C072', rim3: '#9A7329', face1: '#F8DE9C', face2: '#D6A04A', glyph: '#5A3B08' },
  group: { ...SILVER, face1: '#6297D2', face2: '#2B5A97', glyph: '#FFFFFF' },
  odd: { ...SILVER, face1: '#A985C9', face2: '#674292', glyph: '#FFFFFF' },
  locker: { rim1: '#FDE6DE', rim2: '#D8A193', rim3: '#8C5345', face1: '#EC8199', face2: '#AE3D5C', glyph: '#FFFFFF' },
  nobody: { rim1: '#E6D8C2', rim2: '#AA906C', rim3: '#66513A', face1: '#B8835A', face2: '#6C4428', glyph: '#FFF1DC' },
  locked: { rim1: '#FAF9F5', rim2: '#DEDCD4', rim3: '#B5B2A8', face1: '#F0EFEA', face2: '#DDDBD3', glyph: '#9C998F' }
}

// 24x24 stroke icons (round caps and joins, stroke 2.1).
export const ICONS: Record<string, string> = {
  phone: 'M5 3.5h3.5l2 5-2.5 1.5a11 11 0 0 0 6 6l1.5-2.5 5 2v3.5a2 2 0 0 1-2 2A17 17 0 0 1 3 5.5a2 2 0 0 1 2-2z',
  bird: 'M3 14c2.5-1.5 4.5-1.5 7-.5 1-4.5 4-7.5 8-7.5l3 2.5-2.5 1c0 5.5-4 9.5-9.5 9.5H6l2.5-3c-2.5 0-4-1-5.5-2z M17 8.5h.01',
  flag: 'M7 21V3l10 4-10 4 M3.5 21h7 M15 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
  card: 'M5.5 3h13v18h-13z M8.5 12l2.5 2.5 4.5-5',
  b2b: 'M2.5 12a4.75 4.75 0 1 0 9.5 0a4.75 4.75 0 1 0 -9.5 0 M12 12a4.75 4.75 0 1 0 9.5 0a4.75 4.75 0 1 0 -9.5 0',
  train: 'M6.5 3.5h11a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15V6a2.5 2.5 0 0 1 2.5-2.5z M4 11h16 M8 21l2-3.5 M16 21l-2-3.5 M8 14.5h.01 M16 14.5h.01',
  target: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0 M11.5 12a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0',
  broom: 'M20 3l-7.5 7.5 M9 9l6 6 M9 9c-3 0-5.5 2.5-6.5 5.5L2 21l6.5-.5c3-1 5.5-3.5 5.5-6.5 M6 15l-2 3.5 M9.5 17l-2 3',
  flame: 'M12 22c4 0 7-3 7-7 0-4.5-3.5-6.5-4.5-11-2 2-3 4-3 6.5-1-1-2-2-2-4-3 2.5-4.5 5.5-4.5 8.5 0 4 3 7 7 7z',
  crown: 'M3 8l4.5 4.5L12 5l4.5 7.5L21 8l-2 10.5H5z M5 21.5h14',
  camera: 'M4 7.5h3l2-3h6l2 3h3a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z M8.5 13.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0',
  comeback: 'M3 18l5.5-5.5 4 3.5L21 7.5 M14.5 7.5H21v6.5',
  heart: 'M12 20.5s-8.5-5-8.5-11.5A4.75 4.75 0 0 1 12 6.5 4.75 4.75 0 0 1 20.5 9c0 6.5-8.5 11.5-8.5 11.5z',
  cat: 'M5 20.5v-9L4 3.5l5 3.5h6l5-3.5-1 8v9z M9 13h.01 M15 13h.01 M10.5 16.5l1.5 1 1.5-1',
  swap: 'M7.5 3.5L3.5 7.5l4 4 M3.5 7.5h14 M16.5 12.5l4 4-4 4 M20.5 16.5h-14',
  three: 'M9.5 6a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M3.5 17a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M15.5 17a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0',
  circle: 'M20 12a8 8 0 1 1-2.35-5.65 M20 3.5V8h-4.5 M4 12a8 8 0 0 0 .5 2.8',
  crosshair: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0 M12 2v5 M12 17v5 M2 12h5 M17 12h5',
  balls: 'M2.5 13a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0 M12.5 13a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0 M5.5 12h.01 M8 14.5h.01 M15.5 12h.01 M18 14.5h.01',
  dollar: 'M12 2v20 M17 6H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6.5',
  sandbag: 'M9 2.5h6L14 6c4 2 6.5 6 6.5 9a6 6 0 0 1-6 6h-5a6 6 0 0 1-6-6c0-3 2.5-7 6.5-9z M9.5 6h5 M9.5 13.5h5',
  ribbon: 'M7 8.5a5 5 0 1 0 10 0a5 5 0 1 0 -10 0 M9 12.5l-2 8.5 5-3 5 3-2-8.5',
  mirror: 'M12 2.5v19 M9 6.5H4.5v11H9 M15 6.5h4.5v11H15',
  rainbow: 'M2 18a10 10 0 0 1 20 0 M6 18a6 6 0 0 1 12 0 M10 18a2 2 0 0 1 4 0',
  equals: 'M4 9h16 M4 15h16',
  scale: 'M12 3v17.5 M7.5 20.5h9 M5 6.5h14 M5 6.5L2 13a3 3 0 0 0 6 0z M19 6.5L16 13a3 3 0 0 0 6 0z',
  shuffle: 'M3 7h4l10 10h4 M3 17h4l3-3 M14 10l3-3h4 M18 4l3 3-3 3 M18 14l3 3-3 3',
  globe: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M3 12h18 M12 3c3.5 3 3.5 15 0 18 M12 3c-3.5 3-3.5 15 0 18',
  pin: 'M12 21.5s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z M9.5 9.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0',
  calendar: 'M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4 M15 15.5a3 3 0 1 1-1-2.2 M15 12.5v1.5h-1.5',
  ghost: 'M5 21V10a7 7 0 0 1 14 0v11l-2.3-2-2.4 2-2.3-2-2.3 2-2.4-2z M9.5 10.5h.01 M14.5 10.5h.01',
  stairsUp: 'M3 20h4.5v-4.5H12V11h4.5V6.5H21',
  stairsDown: 'M3 6.5h4.5V11H12v4.5h4.5V20H21',
  house: 'M3 11l9-7 9 7 M5.5 9.5V20h13V9.5 M10 20v-6h4v6',
  dice: 'M2.5 6.5h9v9h-9z M12.5 8.5h9v9h-9z M7 11h.01 M17 13h.01',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
  car: 'M3 16.5v-4l2.5-5.5h13l2.5 5.5v4z M3 12.5h18 M5 16.5v2.5h3v-2.5 M16 16.5v2.5h3v-2.5 M7 14.5h.01 M17 14.5h.01',
  stopwatch: 'M5 13.5a7 7 0 1 0 14 0a7 7 0 1 0 -14 0 M12 13.5V9.5 M10 2.5h4 M12 2.5v4 M18 6.5l1.5-1.5',
  battery: 'M2.5 8h16v8h-16z M21.5 11v2 M5.5 11v2',
  smile: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M8 14.5s1.5 2 4 2 4-2 4-2 M9 9.5h.01 M15 9.5h.01',
  steps: 'M8 2.5c2 0 3 2 3 5s-1 4.5-3 4.5-3-1.5-3-4.5 1-5 3-5z M5.5 15h5 M5.5 15c0 2 1 3.5 2.5 3.5s2.5-1.5 2.5-3.5 M16 6.5c2 0 3 2 3 5s-1 4.5-3 4.5-3-1.5-3-4.5 1-5 3-5z M13.5 19h5',
  snowflake: 'M12 2v20 M3.3 7l17.4 10 M3.3 17L20.7 7 M9 3.5l3 2 3-2 M9 20.5l3-2 3 2',
  ticket: 'M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z M14.5 7v2 M14.5 11v2 M14.5 15v2',
  snowman: 'M9 6.5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M6.5 15.5a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0 -11 0 M12 13.5h.01 M12 17h.01 M3 11l3.5 2 M21 11l-3.5 2',
  heartbreak: 'M12 20.5s-8.5-5-8.5-11.5A4.75 4.75 0 0 1 12 6.5 4.75 4.75 0 0 1 20.5 9c0 6.5-8.5 11.5-8.5 11.5z M12 6.5l-2 4.5 3 2-2 4',
  nope: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M5.6 5.6l12.8 12.8',
  cocktail: 'M4 4h16l-8 9z M12 13v7.5 M8 20.5h8 M7 7h10',
  book: 'M12 6.5c-2-1.5-5-2-8.5-2v14c3.5 0 6.5.5 8.5 2 2-1.5 5-2 8.5-2v-14c-3.5 0-6.5.5-8.5 2z M12 6.5v14',
  gift: 'M3 8.5h18v4H3z M5 12.5V21h14v-8.5 M12 8.5V21 M12 8.5C11 5.5 7 3.5 6 5.5s2 3 6 3 M12 8.5c1-3 5-5 6-3s-2 3-6 3',
  skull: 'M12 2.5a8 8 0 0 0-8 8c0 3 2 5 3 6v3.5h10v-3.5c1-1 3-3 3-6a8 8 0 0 0-8-8z M9 11.5h.01 M15 11.5h.01 M10.5 20v-2 M13.5 20v-2',
  blank: 'M4 7V4h3 M10.5 4h3 M17 4h3v3 M20 10.5v3 M20 17v3h-3 M13.5 20h-3 M7 20H4v-3 M4 13.5v-3'
}

/** Each trophy's artwork, keyed by the app's trophy key (lib/badges.ts). */
export const TROPHY_ART: Record<string, TrophyArt> = {
  jenny: { shelf: 'legend', icon: 'phone' },
  break100: { shelf: 'brag', num: '100', sub: 'SUB' },
  break90: { shelf: 'brag', num: '90', sub: 'SUB' },
  break80: { shelf: 'brag', num: '80', sub: 'SUB' },
  break70: { shelf: 'brag', num: '70', sub: 'SUB' },
  birdie: { shelf: 'brag', icon: 'bird' },
  eagle: { shelf: 'brag', num: '−2', sub: 'EAGLE' },
  albatross: { shelf: 'brag', num: '−3', sub: 'ALBA' },
  ace: { shelf: 'brag', icon: 'flag' },
  even: { shelf: 'brag', num: 'E' },
  clean: { shelf: 'brag', icon: 'card' },
  barrage: { shelf: 'brag', num: '3', sub: 'BIRDIES' },
  backtoback: { shelf: 'brag', icon: 'b2b' },
  partrain: { shelf: 'brag', icon: 'train' },
  pb: { shelf: 'brag', num: 'PB' },
  netpar: { shelf: 'brag', icon: 'target' },
  sweep: { shelf: 'brag', icon: 'broom' },
  streak: { shelf: 'brag', icon: 'flame' },
  saddam: { shelf: 'brag', icon: 'crown' },
  photo: { shelf: 'group', icon: 'camera' },
  twins: { shelf: 'group', num: '=' },
  comeback: { shelf: 'group', icon: 'comeback' },
  soulmates: { shelf: 'group', icon: 'heart' },
  copycat: { shelf: 'group', icon: 'cat' },
  swingers: { shelf: 'group', icon: 'swap' },
  threesome: { shelf: 'group', icon: 'three' },
  circle: { shelf: 'group', icon: 'circle' },
  friendlyfire: { shelf: 'group', icon: 'crosshair' },
  blueballs: { shelf: 'group', icon: 'balls' },
  moneyshot: { shelf: 'group', icon: 'dollar' },
  sandbagger: { shelf: 'group', icon: 'sandbag' },
  participation: { shelf: 'group', icon: 'ribbon' },
  mirror: { shelf: 'odd', icon: 'mirror' },
  rainbow: { shelf: 'odd', icon: 'rainbow' },
  consistent: { shelf: 'odd', icon: 'equals' },
  average: { shelf: 'odd', icon: 'scale' },
  sevens: { shelf: 'odd', num: '777' },
  walkoff: { shelf: 'odd', num: '18', sub: 'BIRDIE' },
  opening: { shelf: 'odd', num: '1', sub: 'BIRDIE' },
  chaos: { shelf: 'odd', icon: 'shuffle' },
  ironman: { shelf: 'odd', num: '36', sub: 'HOLES' },
  globetrotter: { shelf: 'odd', icon: 'globe' },
  regular: { shelf: 'odd', icon: 'pin' },
  groundhog: { shelf: 'odd', icon: 'calendar' },
  ghostbuster: { shelf: 'odd', icon: 'ghost' },
  staircase: { shelf: 'odd', icon: 'stairsUp' },
  countdown: { shelf: 'odd', icon: 'stairsDown' },
  fourkind: { shelf: 'odd', num: '4', sub: 'OF A KIND' },
  fullhouse: { shelf: 'odd', icon: 'house' },
  snakeeyes: { shelf: 'odd', icon: 'dice' },
  blackjack: { shelf: 'odd', num: '21' },
  bottles: { shelf: 'odd', num: '99' },
  critic: { shelf: 'odd', icon: 'star' },
  trip: { shelf: 'odd', icon: 'car' },
  nice: { shelf: 'locker', num: '69' },
  deuce: { shelf: 'locker', num: '2' },
  bde: { shelf: 'locker', num: 'BDE' },
  premature: { shelf: 'locker', icon: 'stopwatch' },
  couldntfinish: { shelf: 'locker', icon: 'battery' },
  happyending: { shelf: 'locker', icon: 'smile' },
  walkofshame: { shelf: 'locker', icon: 'steps' },
  shrinkage: { shelf: 'locker', icon: 'snowflake' },
  hallpass: { shelf: 'locker', icon: 'ticket' },
  doublepar: { shelf: 'nobody', num: '×2', sub: 'PAR' },
  snowman: { shelf: 'nobody', icon: 'snowman' },
  triple: { shelf: 'nobody', num: '100+' },
  centurion: { shelf: 'nobody', num: 'C' },
  heartbreaker: { shelf: 'nobody', icon: 'heartbreak' },
  bogeytrain: { shelf: 'nobody', icon: 'train' },
  parfree: { shelf: 'nobody', icon: 'nope' },
  hangover: { shelf: 'nobody', icon: 'cocktail' },
  par3: { shelf: 'nobody', num: '6+', sub: 'PAR 3' },
  twonines: { shelf: 'nobody', icon: 'book' },
  triplethreat: { shelf: 'nobody', num: '+3', sub: '×3' },
  donor: { shelf: 'nobody', icon: 'gift' },
  newlow: { shelf: 'nobody', icon: 'skull' },
  roughstart: { shelf: 'nobody', num: '7+', sub: 'HOLE 1' },
  boxcars: { shelf: 'nobody', num: '12' },
  ghosted: { shelf: 'nobody', icon: 'blank' },
}

import type { BetType } from '../types'

// The games menu: every money game, what it says on the menu, and who it
// suits. The rules cards themselves live in gameCards.ts.

export interface GameInfo {
  type: BetType
  label: string
  /** The line under the name on the menu. */
  blurb: string
  /** Whether the card settles it alone, or it needs a tap or two as you play. */
  kind: 'card' | 'taps'
  /** The small print: how the game gets its numbers. */
  how: string
  /** How many golfers it takes. */
  fits: (golfers: number) => boolean
}

const twoOrMore = (n: number) => n >= 2

export const GAMES: GameInfo[] = [
  { type: 'skins', label: 'Skins', blurb: 'Low score wins the hole. Ties carry and stack.', kind: 'card', how: 'Card does the maths', fits: twoOrMore },
  { type: 'nassau', label: 'Nassau', blurb: 'Front, back and eighteen. Match play adds presses.', kind: 'card', how: 'Card does the maths', fits: twoOrMore },
  { type: 'wolf', label: 'Wolf', blurb: 'The wolf picks a partner, or goes lone for double.', kind: 'taps', how: 'One call a hole', fits: (n) => n === 4 },
  { type: 'vegas', label: 'Vegas', blurb: 'Two v two. Your scores make a number, low first.', kind: 'card', how: 'Card does the maths', fits: (n) => n === 4 },
  { type: 'match', label: 'Match', blurb: 'One on one, hole by hole. Most holes up takes it.', kind: 'card', how: 'Card does the maths', fits: (n) => n === 2 },
  { type: 'rabbit', label: 'Rabbit', blurb: 'Win a hole outright to catch it. Hold it at the turn or the 18th.', kind: 'card', how: 'Card does the maths', fits: twoOrMore },
  { type: 'snake', label: 'Snake', blurb: 'Three-putt and the snake is yours. Last one holding it pays.', kind: 'card', how: 'Needs putts on the card', fits: twoOrMore },
  { type: 'sixes', label: 'Sixes', blurb: 'Two v two, new partners every six holes. Everyone pairs once.', kind: 'card', how: 'Card does the maths', fits: (n) => n === 4 },
  { type: 'stableford', label: 'Stableford', blurb: 'Points for pars and birdies. One blow-up hole barely hurts.', kind: 'card', how: 'Card does the maths', fits: twoOrMore },
  { type: 'bbb', label: 'Bingo Bango Bongo', blurb: 'First on, closest, first in. Anyone can win a hole.', kind: 'taps', how: 'Three taps a hole', fits: twoOrMore },
  { type: 'junk', label: 'Junk', blurb: 'Greenies, sandies, barkies, chip-ins. A point from each of the others.', kind: 'taps', how: 'A tap when it happens', fits: twoOrMore },
  { type: 'hammer', label: 'Hammer', blurb: 'Double the hole any time. Turn it down and you lose it.', kind: 'taps', how: 'A tap to hammer', fits: (n) => n === 2 || n === 4 },
  { type: 'custom', label: 'Something else', blurb: 'Closest to the pin, longest drive, whatever you shook on.', kind: 'taps', how: 'You pick the winner', fits: twoOrMore },
]

export const gameInfo = (type: BetType): GameInfo => GAMES.find((g) => g.type === type) ?? GAMES[GAMES.length - 1]

/** The name a bet of this type goes by when nobody gives it one. */
export const gameLabel = (type: BetType) => (type === 'custom' ? 'Custom' : gameInfo(type).label)

const COUNT_WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']
export const countWord = (n: number) => COUNT_WORDS[n] ?? String(n)

/** "Wolf, Vegas and Sixes", for the menu's small print. */
export function listed(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

import type { AppData, Round, RoundPlayer } from '../types'
import { canSeeTrip, hasScore, isGroupRound } from '../types'
import type { IconName } from '../components/icons'
import { byDate, roundStandings, roundWinnerIds, saddamDays } from './stats'
import { HOLE_COUNT, cardOf } from './holes'
import { courseSlug, findCourse, hasPars, hasStrokeIndex, padded, strokesOffLow } from './courses'

// The trophy case. Every trophy is worked out from data the app already
// keeps (totals, hole-by-hole cards, course pars, bets, the Saddam's
// history, trips), so nothing new is recorded and every old round counts.
//
// Six shelves: legendary (one of a kind), the ones people brag about
// (gold), the ones you can only earn with the group (forest), the odd
// ones (sky), the locker-room ones (plum), and the ones nobody wants
// (tarnished). Earned trophies show how many times and when first;
// locked ones say what it takes. A few ideas need data the app doesn't
// keep yet (putts, penalty strokes, tee times, birthdays), so they're
// not here until it does.

export type BadgeKind = 'legend' | 'brag' | 'group' | 'odd' | 'locker' | 'shame'

export const KIND_LABEL: Record<BadgeKind, string> = {
  legend: 'Legendary',
  brag: 'Brag-worthy',
  group: 'Group trophy',
  odd: 'Oddity',
  locker: 'Locker room',
  shame: 'Nobody wants this one',
}

export interface Badge {
  key: string
  kind: BadgeKind
  label: string
  /** What goes in the medal: a short number or word. */
  mark: string
  /** Drawn in the medal instead of `mark`. 'saddam' is the trophy art itself. */
  icon?: IconName | 'saddam'
  /** What it takes, in a sentence. */
  how: string
  earned: boolean
  /** Times earned (rounds it happened in, or 1 for a career milestone). */
  count: number
  firstDate?: string
  /** The round it most recently happened in, when there is one. */
  roundId?: string
  /** A line about your own record, e.g. "121 days holding it". */
  note?: string
}

/** One of my rounds, with the hole-by-hole facts the trophies check. */
interface Facts {
  round: Round
  rp: RoundPlayer
  gross: number | null
  card: (number | null)[]
  /** All 18 holes have a score. */
  complete: boolean
  pars: (number | null)[] | null
  /** Score minus par per hole, null where either is missing. */
  diffs: (number | null)[]
  parTotal: number | null
  out: number
  in: number
}

type Check = (f: Facts, ctx: Ctx) => boolean

interface Ctx {
  data: AppData
  me: string
  today: string
  /** My gross scores before this round, oldest first. */
  prior: number[]
  /** My rounds so far including this one. */
  soFar: Facts[]
}

interface Def {
  key: string
  kind: BadgeKind
  label: string
  mark: string
  icon?: IconName | 'saddam'
  how: string
  check: Check
}

const count = (xs: (number | null)[], test: (n: number) => boolean) => xs.filter((x) => x != null && test(x)).length
const some = (xs: (number | null)[], test: (n: number) => boolean) => xs.some((x) => x != null && test(x))

/** A run of `len` consecutive holes, all known, all passing. */
function run(xs: (number | null)[], len: number, test: (n: number) => boolean) {
  let streak = 0
  for (const x of xs) {
    streak = x != null && test(x) ? streak + 1 : 0
    if (streak >= len) return true
  }
  return false
}
const pairs = (xs: (number | null)[], test: (a: number, b: number) => boolean) => {
  for (let i = 0; i + 1 < xs.length; i++) if (xs[i] != null && xs[i + 1] != null && test(xs[i]!, xs[i + 1]!)) return true
  return false
}

/** Every hole of this round's skins games, replayed: who won it outright, who tied, and how many skins were riding on it. */
interface SkinsHole {
  winner: string | null
  tied: string[]
  /** Skins carried in from tied holes before this one. */
  carryIn: number
}
function skinsHoles(data: AppData, round: Round): SkinsHole[] {
  const course = findCourse(data, round.courseName)
  const out: SkinsHole[] = []
  for (const bet of data.bets.filter((b) => b.roundId === round.id && b.type === 'skins' && !b.manual && b.net !== undefined)) {
    const entries = bet.results.map((r) => round.players.find((p) => p.playerId === r.playerId)).filter((p): p is RoundPlayer => !!p)
    if (entries.length < 2 || (bet.net && !hasStrokeIndex(course))) continue
    const given = bet.net && course ? strokesOffLow(course, entries, round.tee) : {}
    let carry = 0
    for (let h = 0; h < HOLE_COUNT; h++) {
      const scores = entries.map((rp) => ({ id: rp.playerId, s: cardOf(rp)[h] == null ? null : (cardOf(rp)[h] as number) - (given[rp.playerId]?.[h] ?? 0) }))
      if (scores.some((x) => x.s == null)) continue
      const best = Math.min(...scores.map((x) => x.s as number))
      const top = scores.filter((x) => x.s === best).map((x) => x.id)
      if (top.length === 1) {
        out.push({ winner: top[0], tied: [], carryIn: carry })
        carry = 0
      } else {
        out.push({ winner: null, tied: top, carryIn: carry })
        carry++
      }
    }
  }
  return out
}
/** Skins won per golfer in this round's skins games. */
function skinsWon(data: AppData, round: Round): Map<string, number> {
  const out = new Map<string, number>()
  for (const h of skinsHoles(data, round)) if (h.winner) out.set(h.winner, (out.get(h.winner) ?? 0) + 1 + h.carryIn)
  return out
}

/** Everyone else's cards in the round, where they have one. */
const others = (f: Facts, me: string) =>
  f.round.players.filter((p) => p.playerId !== me).map((p) => cardOf(p)).filter((c) => c.some((h) => h != null))
/** Every card in the round, mine included. */
const everyone = (f: Facts) => f.round.players.map((p) => cardOf(p)).filter((c) => c.some((h) => h != null))
const window5 = (xs: (number | null)[], test: (w: number[]) => boolean) => {
  for (let i = 0; i + 5 <= xs.length; i++) {
    const w = xs.slice(i, i + 5)
    if (w.every((x) => x != null) && test(w as number[])) return true
  }
  return false
}
const steps = (xs: (number | null)[], len: number, step: number) => {
  for (let i = 0; i + len <= xs.length; i++) {
    const w = xs.slice(i, i + len)
    if (w.every((x) => x != null) && w.every((x, k) => k === 0 || x === (w[k - 1] as number) + step)) return true
  }
  return false
}
const daysApart = (a: string, b: string) =>
  Math.abs(Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) / 86_400_000

const DEFS: Def[] = [
  // ---- The ones people brag about ----
  { key: 'break100', kind: 'brag', label: 'Broke 100', mark: '99', how: 'Finish a round under 100.', check: (f) => f.gross != null && f.gross < 100 },
  { key: 'break90', kind: 'brag', label: 'Broke 90', mark: '89', how: 'Finish a round under 90.', check: (f) => f.gross != null && f.gross < 90 },
  { key: 'break80', kind: 'brag', label: 'Broke 80', mark: '79', how: 'Finish a round under 80.', check: (f) => f.gross != null && f.gross < 80 },
  { key: 'break70', kind: 'brag', label: 'Broke 70', mark: '69', how: 'Finish a round under 70.', check: (f) => f.gross != null && f.gross < 70 },
  { key: 'birdie', kind: 'brag', label: 'First Birdie', mark: '−1', how: 'One under par on any hole.', check: (f) => some(f.diffs, (d) => d === -1) },
  { key: 'eagle', kind: 'brag', label: 'The Eagle Has Landed', mark: '−2', how: 'Two under par on a hole.', check: (f) => some(f.diffs, (d) => d === -2) },
  { key: 'albatross', kind: 'brag', label: 'Albatross', mark: '−3', how: 'Three under par on a hole. Rarer than an ace.', check: (f) => some(f.diffs, (d) => d <= -3) },
  { key: 'ace', kind: 'brag', label: 'Ace', mark: '1', icon: 'flag', how: 'A hole in one.', check: (f) => some(f.card, (s) => s === 1) },
  { key: 'even', kind: 'brag', label: 'Even Steven', mark: 'E', how: 'Shoot par or better for the round.', check: (f) => f.gross != null && f.parTotal != null && f.gross <= f.parTotal },
  { key: 'clean', kind: 'brag', label: 'Clean Card', mark: '0', how: 'A full round with no bogeys.', check: (f) => f.complete && !!f.pars && f.diffs.every((d) => d != null && d <= 0) },
  { key: 'barrage', kind: 'brag', label: 'Birdie Barrage', mark: '3×', how: 'Three or more birdies in one round.', check: (f) => count(f.diffs, (d) => d <= -1) >= 3 },
  { key: 'backtoback', kind: 'brag', label: 'Back-to-Back', mark: '2×', how: 'Birdies on consecutive holes.', check: (f) => pairs(f.diffs, (a, b) => a <= -1 && b <= -1) },
  { key: 'partrain', kind: 'brag', label: 'Par Train', mark: '5', how: 'Five straight holes at par or better.', check: (f) => run(f.diffs, 5, (d) => d <= 0) },
  { key: 'pb', kind: 'brag', label: 'Personal Best', mark: 'PB', how: 'Beat your lowest recorded score.', check: (f, c) => f.gross != null && c.prior.length > 0 && f.gross < Math.min(...c.prior) },
  { key: 'netpar', kind: 'brag', label: 'Playing to Your Number', mark: 'N', how: 'Shoot net par or better.', check: (f) => f.gross != null && f.parTotal != null && f.gross - f.rp.handicapSnapshot <= f.parTotal },
  {
    key: 'sweep',
    kind: 'brag',
    label: 'Skins Sweep',
    mark: '3',
    icon: 'cash',
    how: 'Win three or more skins in a single round.',
    check: (f, c) => (skinsWon(c.data, f.round).get(c.me) ?? 0) >= 3,
  },

  // ---- The ones nobody wants ----
  { key: 'doublepar', kind: 'shame', label: 'Double Par', mark: '2×', how: 'Double par or worse on a hole.', check: (f) => f.card.some((s, i) => s != null && f.pars?.[i] != null && s >= 2 * f.pars[i]!) },
  { key: 'snowman', kind: 'shame', label: 'Snowman', mark: '8', how: 'Make an 8 on any hole.', check: (f) => some(f.card, (s) => s === 8) },
  { key: 'triple', kind: 'shame', label: 'Triple Digits', mark: '100', how: 'Shoot 100 or more.', check: (f) => f.gross != null && f.gross >= 100 },
  { key: 'centurion', kind: 'shame', label: 'The Centurion', mark: '100', how: 'Shoot exactly 100. So close.', check: (f) => f.gross === 100 },
  { key: 'heartbreaker', kind: 'shame', label: 'Heartbreaker', mark: '90', how: 'Shoot exactly 90 or 80, missing the milestone by one.', check: (f) => f.gross === 90 || f.gross === 80 },
  { key: 'bogeytrain', kind: 'shame', label: 'Bogey Train', mark: '5', how: 'Five straight holes at bogey or worse.', check: (f) => run(f.diffs, 5, (d) => d >= 1) },
  { key: 'parfree', kind: 'shame', label: 'Par-Free Zone', mark: '0', how: 'A full round without a single par or better.', check: (f) => f.complete && !!f.pars && f.diffs.every((d) => d != null && d >= 1) },
  { key: 'hangover', kind: 'shame', label: 'Birdie Hangover', mark: '+2', how: 'Double bogey or worse on the hole right after a birdie.', check: (f) => pairs(f.diffs, (a, b) => a <= -1 && b >= 2) },
  { key: 'par3', kind: 'shame', label: 'Par 3 Nightmare', mark: '6', how: 'Six or worse on a par 3.', check: (f) => f.card.some((s, i) => s != null && f.pars?.[i] === 3 && s >= 6) },
  { key: 'twonines', kind: 'shame', label: 'Tale of Two Nines', mark: '+8', how: 'Back nine eight or more strokes worse than the front.', check: (f) => f.complete && f.in - f.out >= 8 },
  { key: 'triplethreat', kind: 'shame', label: 'Triple Threat', mark: '3×', how: 'Three or more triple bogeys in one round.', check: (f) => count(f.diffs, (d) => d >= 3) >= 3 },
  {
    key: 'donor',
    kind: 'shame',
    label: 'The Donor',
    mark: '0',
    icon: 'cash',
    how: 'Win zero skins in a round where the others won six or more.',
    check: (f, c) => {
      const won = skinsWon(c.data, f.round)
      if (!won.size && !c.data.bets.some((b) => b.roundId === f.round.id && b.type === 'skins')) return false
      const others = [...won.entries()].filter(([id]) => id !== c.me).reduce((s, [, n]) => s + n, 0)
      return (won.get(c.me) ?? 0) === 0 && others >= 6
    },
  },
  { key: 'newlow', kind: 'shame', label: 'New Low (the Bad Kind)', mark: 'PW', how: 'Set a new personal worst score.', check: (f, c) => f.gross != null && c.prior.length >= 3 && f.gross > Math.max(...c.prior) },
  { key: 'roughstart', kind: 'shame', label: 'Rough Start', mark: '7', how: 'Seven or worse on the first hole.', check: (f) => f.card[0] != null && f.card[0]! >= 7 },

  // ---- The odd ones ----
  { key: 'mirror', kind: 'odd', label: 'Mirror Nines', mark: '=', how: 'Identical front and back nine scores.', check: (f) => f.complete && f.out === f.in },
  { key: 'rainbow', kind: 'odd', label: 'Rainbow Round', mark: '5', how: 'A birdie, par, bogey, double and triple all in one round.', check: (f) => [-1, 0, 1, 2, 3].every((n) => f.diffs.includes(n)) },
  { key: 'consistent', kind: 'odd', label: 'Mr. Consistent', mark: '0/1', how: 'Every hole a par or a bogey, nothing else.', check: (f) => f.complete && !!f.pars && f.diffs.every((d) => d === 0 || d === 1) },
  {
    key: 'average',
    kind: 'odd',
    label: 'Perfectly Average',
    mark: 'avg',
    how: 'Shoot exactly your running average (after five rounds).',
    check: (f, c) => f.gross != null && c.prior.length >= 5 && f.gross === Math.round(c.prior.reduce((s, n) => s + n, 0) / c.prior.length),
  },
  { key: 'sevens', kind: 'odd', label: 'Lucky Sevens', mark: '777', how: 'Three 7s on the card in one round.', check: (f) => count(f.card, (s) => s === 7) >= 3 },
  { key: 'walkoff', kind: 'odd', label: 'Walk-Off', mark: '18', how: 'Birdie the 18th hole.', check: (f) => f.diffs[17] != null && f.diffs[17]! <= -1 },
  { key: 'opening', kind: 'odd', label: 'Opening Statement', mark: '1', how: 'Birdie the 1st hole.', check: (f) => f.diffs[0] != null && f.diffs[0]! <= -1 },
  {
    key: 'photo',
    kind: 'group',
    label: 'Photo Finish',
    mark: '1',
    how: 'Win a group round by a stroke or less.',
    check: (f, c) => {
      if (!isGroupRound(f.round)) return false
      const s = roundStandings(f.round)
      return s[0]?.playerId === c.me && s.length > 1 && s[1].rank > 1 && s[1].netScore - s[0].netScore <= 1
    },
  },
  {
    key: 'twins',
    kind: 'group',
    label: 'Twins',
    mark: '=',
    how: "Tie another golfer's total in the same round.",
    check: (f, c) => f.gross != null && f.round.players.some((p) => p.playerId !== c.me && hasScore(p) && p.gross === f.gross),
  },
  {
    key: 'comeback',
    kind: 'group',
    label: 'Comeback Kid',
    mark: '+5',
    how: 'Win the round after trailing by five or more at the turn.',
    check: (f, c) => {
      if (!isGroupRound(f.round)) return false
      const winners = roundWinnerIds(f.round)
      if (winners.length !== 1 || winners[0] !== c.me) return false
      const front = (rp: RoundPlayer) => {
        const card = cardOf(rp).slice(0, 9)
        return card.every((h) => h != null) ? card.reduce<number>((s, h) => s + (h as number), 0) : null
      }
      const mine = front(f.rp)
      const theirs = f.round.players.filter((p) => p.playerId !== c.me && hasScore(p)).map(front)
      if (mine == null || theirs.some((t) => t == null) || !theirs.length) return false
      return mine - Math.min(...(theirs as number[])) >= 5
    },
  },
  { key: 'chaos', kind: 'odd', label: 'Chaos Round', mark: '≠', how: 'No two holes in a row with the same score.', check: (f) => f.complete && !pairs(f.card, (a, b) => a === b) },
  { key: 'ironman', kind: 'odd', label: 'Iron Man', mark: '36', how: 'Log 36 holes in one day.', check: (f, c) => c.soFar.filter((x) => x.round.date === f.round.date).length >= 2 },
  {
    key: 'globetrotter',
    kind: 'odd',
    label: 'Globetrotter',
    mark: '10',
    icon: 'pin',
    how: 'Play ten different courses.',
    check: (_f, c) => new Set(c.soFar.map((x) => courseSlug(x.round.courseName))).size >= 10,
  },
  {
    key: 'regular',
    kind: 'odd',
    label: 'Regular',
    mark: '10',
    how: 'Play the same course ten times.',
    check: (f, c) => c.soFar.filter((x) => courseSlug(x.round.courseName) === courseSlug(f.round.courseName)).length >= 10,
  },
  { key: 'groundhog', kind: 'odd', label: 'Groundhog Day', mark: '↺', how: 'Shoot the exact same total as your previous round.', check: (f, c) => f.gross != null && c.prior.length > 0 && f.gross === c.prior[c.prior.length - 1] },
  {
    key: 'ghostbuster',
    kind: 'odd',
    label: 'Ghostbuster',
    mark: 'G',
    icon: 'ghost',
    how: 'Race your ghost and beat it over 18.',
    check: (f, c) => {
      const g = f.round.ghosts?.find((x) => x.playerId === c.me)
      const earlier = g && c.data.rounds.find((r) => r.id === g.roundId)?.players.find((p) => p.playerId === c.me)
      if (!earlier || !f.complete) return false
      const theirs = cardOf(earlier)
      if (theirs.some((h) => h == null)) return false
      return f.out + f.in < theirs.reduce<number>((s, h) => s + (h as number), 0)
    },
  },

  // ---- Legendary ----
  {
    key: 'jenny',
    kind: 'legend',
    label: "Jenny's Number",
    mark: '867',
    how: 'Score 8, 6, 7, 5, 3 on five holes in a row. Legendary.',
    check: (f) => window5(f.card, (w) => w.join() === '8,6,7,5,3'),
  },

  // ---- More odd ones ----
  { key: 'staircase', kind: 'odd', label: 'Staircase', mark: '↗', how: 'Scores go up by one on four straight holes, like 3, 4, 5, 6.', check: (f) => steps(f.card, 4, 1) },
  { key: 'countdown', kind: 'odd', label: 'Countdown', mark: '↘', how: 'Scores drop by one on four straight holes, like 6, 5, 4, 3.', check: (f) => steps(f.card, 4, -1) },
  { key: 'fourkind', kind: 'odd', label: 'Four of a Kind', mark: '4×', how: 'The same score on four holes in a row.', check: (f) => steps(f.card, 4, 0) },
  {
    key: 'fullhouse',
    kind: 'odd',
    label: 'Full House',
    mark: '3+2',
    how: 'Over five straight holes, three of one score and two of another.',
    check: (f) =>
      window5(f.card, (w) => {
        const n = [...new Set(w)].map((v) => w.filter((x) => x === v).length).sort()
        return n.length === 2 && n[0] === 2 && n[1] === 3
      }),
  },
  { key: 'snakeeyes', kind: 'odd', label: 'Snake Eyes', mark: '2·2', how: 'Two holes with a 2 in the same round.', check: (f) => count(f.card, (s) => s === 2) >= 2 },
  { key: 'blackjack', kind: 'odd', label: 'Blackjack', mark: '21', how: 'Finish exactly 21 over par.', check: (f) => f.gross != null && f.parTotal != null && f.gross - f.parTotal === 21 },
  { key: 'bottles', kind: 'odd', label: '99 Bottles', mark: '99', how: 'Shoot exactly 99. Broke 100 by the skin of your teeth.', check: (f) => f.gross === 99 },

  // ---- More of the ones nobody wants ----
  { key: 'boxcars', kind: 'shame', label: 'Boxcars', mark: '12', how: 'A 12 on any hole.', check: (f) => some(f.card, (s) => s === 12) },
  {
    key: 'ghosted',
    kind: 'shame',
    label: 'Ghosted',
    mark: '–',
    how: 'Leave a hole blank on a finished scorecard.',
    check: (f, c) => f.card.some((h) => h != null) && f.card.slice(0, HOLE_COUNT).some((h) => h == null) && (f.gross != null || f.round.date < c.today),
  },

  // ---- Group trophies: only possible with company ----
  {
    key: 'soulmates',
    kind: 'group',
    label: 'Soulmates',
    mark: '5=',
    how: "Tie a playing partner's score on five or more holes in one round.",
    check: (f, c) => others(f, c.me).some((card) => card.filter((h, i) => h != null && h === f.card[i]).length >= 5),
  },
  {
    key: 'copycat',
    kind: 'group',
    label: 'Copycat',
    mark: '3=',
    how: "Match a partner's score on three straight holes.",
    check: (f, c) => others(f, c.me).some((card) => run(card.map((h, i) => (h != null && h === f.card[i] ? 1 : null)), 3, () => true)),
  },
  {
    key: 'swingers',
    kind: 'group',
    label: 'Swingers',
    mark: '⇄',
    how: 'You and another golfer trade the lead three or more times in a round.',
    check: (f, c) => {
      const players = f.round.players.filter((p) => cardOf(p).some((h) => h != null))
      if (players.length < 2 || !players.some((p) => p.playerId === c.me)) return false
      const total = new Map(players.map((p) => [p.playerId, 0]))
      let leader: string | null = null
      let changes = 0
      let iLed = false
      for (let h = 0; h < HOLE_COUNT; h++) {
        if (players.some((p) => cardOf(p)[h] == null)) break
        for (const p of players) total.set(p.playerId, total.get(p.playerId)! + (cardOf(p)[h] as number))
        const low = Math.min(...total.values())
        const top = [...total.entries()].filter(([, t]) => t === low).map(([id]) => id)
        if (top.length !== 1) continue
        if (leader && top[0] !== leader && (top[0] === c.me || leader === c.me)) changes++
        leader = top[0]
        if (leader === c.me) iLed = true
      }
      return iLed && changes >= 3
    },
  },
  {
    key: 'threesome',
    kind: 'group',
    label: 'Threesome',
    mark: '3×',
    how: 'Three golfers, you among them, birdie the same hole.',
    check: (f) =>
      !!f.pars &&
      f.diffs.some((d, i) => d != null && d <= -1 && everyone(f).filter((card) => card[i] != null && f.pars![i] != null && card[i]! - f.pars![i]! <= -1).length >= 3),
  },
  {
    key: 'circle',
    kind: 'group',
    label: 'Circle Jerk',
    mark: '≡',
    how: 'Everyone in a group of three or more makes the exact same score on a hole.',
    check: (f) => {
      const cards = f.round.players.map((p) => cardOf(p))
      return cards.length >= 3 && f.card.some((h, i) => h != null && cards.every((card) => card[i] === h))
    },
  },
  {
    key: 'friendlyfire',
    kind: 'group',
    label: 'Friendly Fire',
    mark: '+2',
    how: 'Everyone in a group of three or more makes double bogey or worse on the same hole.',
    check: (f) => {
      const cards = f.round.players.map((p) => cardOf(p))
      return !!f.pars && cards.length >= 3 && f.pars.some((par, i) => par != null && cards.every((card) => card[i] != null && card[i]! - par >= 2))
    },
  },
  {
    key: 'blueballs',
    kind: 'group',
    label: 'Blue Balls',
    mark: '4',
    icon: 'cash',
    how: 'Tie on a hole that would have won you four or more carried-over skins.',
    check: (f, c) => skinsHoles(c.data, f.round).some((h) => h.carryIn >= 3 && h.tied.includes(c.me)),
  },
  {
    key: 'moneyshot',
    kind: 'group',
    label: 'Money Shot',
    mark: '4+',
    icon: 'cash',
    how: 'Win a single skin worth four or more with the carryovers.',
    check: (f, c) => skinsHoles(c.data, f.round).some((h) => h.carryIn >= 3 && h.winner === c.me),
  },
  {
    key: 'sandbagger',
    kind: 'group',
    label: 'Sandbagger',
    mark: 'SB',
    how: 'Beat your handicap by five or more net strokes. The group will have questions.',
    check: (f) => f.gross != null && f.parTotal != null && f.gross - f.rp.handicapSnapshot <= f.parTotal - 5,
  },
  {
    key: 'participation',
    kind: 'group',
    label: 'Participation Trophy',
    mark: '3',
    how: 'Finish last in the group three rounds in a row.',
    check: (_f, c) => {
      const last3 = c.soFar.filter((x) => isGroupRound(x.round) && x.gross != null).slice(-3)
      return (
        last3.length === 3 &&
        last3.every((x) => {
          const st = roundStandings(x.round)
          return st.length > 1 && st[st.length - 1].netScore === st.find((s) => s.playerId === c.me)?.netScore
        })
      )
    },
  },

  // ---- Locker room ----
  { key: 'nice', kind: 'locker', label: 'Nice', mark: '69', how: 'Shoot exactly 69. Or, for the rest of us, make a 6 then a 9 on back-to-back holes.', check: (f) => f.gross === 69 || pairs(f.card, (a, b) => a === 6 && b === 9) },
  { key: 'deuce', kind: 'locker', label: 'Dropped a Deuce', mark: '2', how: 'Make a 2 on any hole.', check: (f) => some(f.card, (s) => s === 2) },
  { key: 'bde', kind: 'locker', label: 'BDE', mark: '−2', how: 'Eagle a par 5.', check: (f) => f.card.some((s, i) => s != null && f.pars?.[i] === 5 && s <= 3) },
  {
    key: 'premature',
    kind: 'locker',
    label: 'Premature',
    mark: '1',
    how: 'Birdie the 1st, then not a single par or better the rest of the way.',
    check: (f) => f.complete && f.diffs[0] != null && f.diffs[0]! <= -1 && f.diffs.slice(1).every((d) => d != null && d >= 1),
  },
  {
    key: 'couldntfinish',
    kind: 'locker',
    label: "Couldn't Finish",
    mark: '15',
    how: 'On pace to break a milestone (100, 90, 80, 70) through 15, then miss it.',
    check: (f) => {
      if (!f.complete || !f.pars || f.pars.slice(15).some((p) => p == null)) return false
      const through15 = f.card.slice(0, 15).reduce<number>((s, h) => s + (h as number), 0)
      const pace = through15 + f.pars.slice(15).reduce<number>((s, p) => s + (p as number), 0)
      const final = f.out + f.in
      return [100, 90, 80, 70].some((m) => pace < m && final >= m)
    },
  },
  { key: 'happyending', kind: 'locker', label: 'Happy Ending', mark: '3', how: 'Par or better on 16, 17 and 18.', check: (f) => f.diffs.slice(15, 18).length === 3 && f.diffs.slice(15, 18).every((d) => d != null && d <= 0) },
  { key: 'walkofshame', kind: 'locker', label: 'Walk of Shame', mark: '18', how: 'Double par or worse on the 18th.', check: (f) => f.card[17] != null && f.pars?.[17] != null && f.card[17]! >= 2 * f.pars[17]! },
  { key: 'shrinkage', kind: 'locker', label: 'Shrinkage', mark: '❄', how: 'Log a round between December and February.', check: (f) => [12, 1, 2].includes(+f.round.date.slice(5, 7)) },
  { key: 'hallpass', kind: 'locker', label: 'Hall Pass', mark: '3', how: 'Log three rounds within seven days.', check: (f, c) => c.soFar.filter((x) => daysApart(x.round.date, f.round.date) <= 6).length >= 3 },
]

function factsFor(data: AppData, round: Round, rp: RoundPlayer): Facts {
  const card = cardOf(rp)
  const course = findCourse(data, round.courseName)
  const pars = hasPars(course) ? padded(course.pars) : null
  const diffs = card.map((s, i) => (s != null && pars?.[i] != null ? s - pars[i]! : null))
  const complete = card.length >= HOLE_COUNT && card.slice(0, HOLE_COUNT).every((h) => h != null)
  const sum = (a: number, b: number) => card.slice(a, b).reduce<number>((s, h) => s + (h ?? 0), 0)
  return {
    round,
    rp,
    gross: hasScore(rp) ? rp.gross : null,
    card,
    complete,
    pars,
    diffs,
    parTotal: pars && pars.every((p) => p != null) ? pars.reduce<number>((s, p) => s + (p as number), 0) : null,
    out: sum(0, 9),
    in: sum(9, 18),
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function badgesFor(data: AppData, playerId: string, today: string): Badge[] {
  const mine = byDate(data.rounds)
    .map((r) => ({ r, rp: r.players.find((p) => p.playerId === playerId) }))
    .filter((x): x is { r: Round; rp: RoundPlayer } => !!x.rp && (hasScore(x.rp) || cardOf(x.rp).some((h) => h != null)))
    .map(({ r, rp }) => factsFor(data, r, rp))

  const tally = new Map<string, { count: number; firstDate?: string; roundId?: string }>()
  const prior: number[] = []
  const soFar: Facts[] = []
  // Career milestones count once, on the round that got you there.
  const once = new Set(['globetrotter', 'regular'])
  for (const f of mine) {
    soFar.push(f)
    const ctx: Ctx = { data, me: playerId, today, prior: [...prior], soFar }
    for (const def of DEFS) {
      const t = tally.get(def.key)
      if (once.has(def.key) && t) continue
      if (!def.check(f, ctx)) continue
      tally.set(def.key, { count: (t?.count ?? 0) + 1, firstDate: t?.firstDate ?? f.round.date, roundId: f.round.id })
    }
    if (f.gross != null) prior.push(f.gross)
  }

  const badges: Badge[] = DEFS.map((def) => {
    const t = tally.get(def.key)
    return { key: def.key, kind: def.kind, label: def.label, mark: def.mark, icon: def.icon, how: def.how, earned: !!t, count: t?.count ?? 0, firstDate: t?.firstDate, roundId: t?.roundId }
  })

  // The ones that come from the group's history rather than a single card.
  const saddam = saddamDays(data, today).get(playerId)
  let streak = 0
  let bestStreak = 0
  let streakDate: string | undefined
  for (const f of mine.filter((x) => isGroupRound(x.round))) {
    streak = roundWinnerIds(f.round).length === 1 && roundWinnerIds(f.round)[0] === playerId ? streak + 1 : 0
    if (streak > bestStreak) {
      bestStreak = streak
      if (streak === 3) streakDate = f.round.date
    }
  }
  const trips = data.trips.filter((t) => t.status !== 'planning' && t.attendeeIds.includes(playerId) && canSeeTrip(t, playerId))
  const rated = data.courseRatings.filter((r) => r.playerId === playerId).length

  badges.unshift({
    key: 'saddam',
    kind: 'brag',
    label: saddam ? `The Saddam ×${saddam.reigns}` : 'The Saddam',
    mark: 'S',
    icon: 'saddam',
    how: 'Win a group round outright with the Saddam on the line.',
    earned: !!saddam,
    count: saddam?.reigns ?? 0,
    note: saddam ? `${plural(saddam.days, 'day')} holding it` : undefined,
  })
  badges.splice(1, 0, {
    key: 'streak',
    kind: 'brag',
    label: 'Hot Streak',
    mark: '3',
    icon: 'flame',
    how: 'Three group wins in a row.',
    earned: bestStreak >= 3,
    count: bestStreak >= 3 ? 1 : 0,
    firstDate: streakDate,
    note: bestStreak >= 3 ? `Best run: ${bestStreak} straight` : undefined,
  })
  badges.push(
    {
      key: 'trip',
      kind: 'odd',
      label: trips.length > 1 ? `Road Trip ×${trips.length}` : 'Road Trip',
      mark: String(trips.length || 1),
      icon: 'suitcase',
      how: 'Go on a golf trip with the group.',
      earned: trips.length > 0,
      count: trips.length,
      firstDate: trips.map((t) => t.startDate).filter(Boolean).sort()[0],
    },
    {
      key: 'critic',
      kind: 'odd',
      label: 'Course Critic',
      mark: '10',
      icon: 'star',
      how: 'Rate ten different courses.',
      earned: rated >= 10,
      count: rated >= 10 ? 1 : 0,
      note: rated && rated < 10 ? `${rated} of 10 rated` : undefined,
    },
  )
  return badges
}

/** Earned first (brags, then oddities, then the shameful ones), then what's next to chase. */
export function shelfOrder(badges: Badge[]): Badge[] {
  const rank: Record<BadgeKind, number> = { legend: 0, brag: 1, group: 2, odd: 3, locker: 4, shame: 5 }
  const earned = badges.filter((b) => b.earned).sort((a, b) => rank[a.kind] - rank[b.kind])
  // Only the next scoring milestone is worth chasing: Break 80 before 90 is noise.
  const locked = badges.filter((b) => !b.earned && (b.kind === 'brag' || b.kind === 'group'))
  const nextBreak = locked.find((b) => b.key.startsWith('break'))
  return [...earned, ...locked.filter((b) => !b.key.startsWith('break') || b === nextBreak)]
}

/** A golfer's index at each round they posted, oldest first, then today's. */
export function indexHistory(data: AppData, playerId: string, current: number): { date: string; index: number }[] {
  const points = byDate(data.rounds)
    .map((r) => ({ date: r.date, rp: r.players.find((p) => p.playerId === playerId) }))
    .filter((x) => x.rp && hasScore(x.rp))
    .map((x) => ({ date: x.date, index: x.rp!.handicapSnapshot }))
  return [...points, { date: '9999-12-31', index: current }]
}

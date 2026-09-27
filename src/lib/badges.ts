import type { AppData, Round, RoundPlayer } from '../types'
import { canSeeTrip, hasScore, isGroupRound } from '../types'
import type { IconName } from '../components/icons'
import { byDate, roundStandings, roundWinnerIds, saddamDays } from './stats'
import { HOLE_COUNT, cardOf } from './holes'
import { courseSlug, findCourse, hasPars, padded } from './courses'
import { sandbaggers } from './delight'
import { settleFromCard } from './bets'

// The trophy case. Every trophy is worked out from data the app already
// keeps (totals, hole-by-hole cards, course pars, bets, the Saddam's
// history, trips), so nothing new is recorded and every old round counts.
//
// Three kinds: the ones people brag about (gold), the ones nobody wants
// (tarnished), and the odd ones (sky). Earned trophies show how many
// times and when first; locked ones say what it takes. A few ideas need
// data the app doesn't keep yet (putts, penalty strokes, tee times,
// birthdays), so they're not here until it does.

export type BadgeKind = 'brag' | 'shame' | 'odd'

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

/** Skins won per golfer in this round's skins bets, from the card. */
function skinsWon(data: AppData, round: Round): Map<string, number> {
  const out = new Map<string, number>()
  const course = findCourse(data, round.courseName)
  for (const bet of data.bets.filter((b) => b.roundId === round.id && b.type === 'skins')) {
    for (const line of settleFromCard(bet, round, course)?.detail ?? []) {
      const m = line.match(/^(\d+) skins?\|(.+)$/)
      if (m) out.set(m[2], (out.get(m[2]) ?? 0) + Number(m[1]))
    }
  }
  return out
}

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
    kind: 'odd',
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
    kind: 'odd',
    label: 'Twins',
    mark: '=',
    how: "Tie another golfer's total in the same round.",
    check: (f, c) => f.gross != null && f.round.players.some((p) => p.playerId !== c.me && hasScore(p) && p.gross === f.gross),
  },
  {
    key: 'comeback',
    kind: 'odd',
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
  { key: 'sandbagger', kind: 'odd', label: 'Sandbagger', mark: 'SB', how: 'Get stamped for playing well under your handicap.', check: (f, c) => sandbaggers(c.data, f.round).some((s) => s.playerId === c.me) },
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
    const ctx: Ctx = { data, me: playerId, prior: [...prior], soFar }
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
  const rank: Record<BadgeKind, number> = { brag: 0, odd: 1, shame: 2 }
  const earned = badges.filter((b) => b.earned).sort((a, b) => rank[a.kind] - rank[b.kind])
  // Only the next scoring milestone is worth chasing: Break 80 before 90 is noise.
  const locked = badges.filter((b) => !b.earned && b.kind !== 'shame')
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

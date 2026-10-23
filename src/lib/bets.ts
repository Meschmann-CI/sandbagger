import type { Bet, BetResult, Course, NassauPlay, Round, RoundPlayer, VegasPlay, WolfPlay } from '../types'
import { BACK, FRONT, HOLE_COUNT, cardOf, strokes } from './holes'
import { hasSlopeRating, hasStrokeIndex, padded, playingHandicap, strokesByHole, strokesOffLow } from './courses'

// Working out who owes what from the card. Both games pay per unit: the
// winner of a unit collects the stake from every other player in the bet,
// so the amounts always sum to zero.

export interface BetOutcome {
  results: BetResult[]
  /** Plain-language lines explaining how it was worked out. */
  detail: string[]
  /** True when the card has enough in it to compute anything. */
  computable: boolean
}

const emptyOutcome = (playerIds: string[], why: string): BetOutcome => ({
  results: playerIds.map((playerId) => ({ playerId, amount: 0 })),
  detail: [why],
  computable: false,
})

const zeroed = (playerIds: string[]) => new Map(playerIds.map((id) => [id, 0]))

// Money moves only between golfers actually on the round. A bet keeps
// the ids it was placed with, so someone taken off the round after the
// first tee would otherwise still be charged for holes they never played.
const idsOf = (entries: RoundPlayer[]) => entries.map((rp) => rp.playerId)

function pay(totals: Map<string, number>, winnerId: string, others: string[], stake: number) {
  totals.set(winnerId, (totals.get(winnerId) ?? 0) + stake * others.length)
  for (const id of others) totals.set(id, (totals.get(id) ?? 0) - stake)
}

const toResults = (totals: Map<string, number>): BetResult[] =>
  [...totals.entries()].map(([playerId, amount]) => ({ playerId, amount: Math.round(amount * 100) / 100 }))

/**
 * Skins with carryovers, the way they're actually played: lowest score
 * on a hole wins its skin, a tie pushes the skin onto the next hole, and
 * that keeps stacking until somebody wins a hole outright and takes the
 * lot. A stack still standing after the last judged hole dies unclaimed.
 *
 * The payout rule, since it comes up in the parking lot: every skin is
 * worth the stake FROM EACH other player, so a hole carrying two pushes
 * pays three stakes a head. Money follows skins won — there's no
 * separate end-of-round kitty.
 *
 * Winner-take-all flips that: the stake is each player's ante into one
 * pot, and whoever holds the most skins at the end takes the lot. Skins
 * are counted exactly the same way — carried stacks still stack — they
 * just decide one pot instead of paying as they land. A tie for most
 * splits the pot; no skins won at all and the money stays put.
 *
 * Net gives strokes OFF THE LOW handicap — the best player plays
 * scratch, everyone else gets their difference on the hardest holes.
 * That needs the course's stroke index; which holes get a stroke decides
 * who wins them, so there's no honest way to spread them without it.
 */
export function calcSkins(
  round: Round,
  playerIds: string[],
  stake: number,
  useNet: boolean,
  course?: Course,
  winnerTakeAll = false,
): BetOutcome {
  const entries = playerIds
    .map((id) => round.players.find((rp) => rp.playerId === id))
    .filter((rp): rp is RoundPlayer => !!rp)
  if (entries.length < 2) return emptyOutcome(playerIds, 'Needs at least two golfers.')

  const ranked = hasStrokeIndex(course) ? course : null
  if (useNet && !ranked) {
    return emptyOutcome(
      playerIds,
      "Net skins needs this course's stroke index. Add it from the Courses page, or play them gross.",
    )
  }

  const strokes = new Map<string, number[]>()
  if (useNet && ranked) {
    const given = strokesOffLow(ranked, entries, round.tee)
    for (const rp of entries) strokes.set(rp.playerId, given[rp.playerId])
  }

  const ids = idsOf(entries)
  const totals = zeroed(ids)
  const detail: string[] = []
  const won = new Map<string, number>()
  let holesJudged = 0
  let carrying = 0

  for (let h = 0; h < HOLE_COUNT; h++) {
    const scores = entries.map((rp) => ({
      id: rp.playerId,
      score: cardOf(rp)[h] == null ? null : (cardOf(rp)[h] as number) - (strokes.get(rp.playerId)?.[h] ?? 0),
    }))
    // Every golfer in the bet needs a score on the hole to judge it.
    if (scores.some((s) => s.score == null)) continue
    holesJudged++
    const best = Math.min(...scores.map((s) => s.score as number))
    const winners = scores.filter((s) => s.score === best)
    if (winners.length !== 1) {
      carrying++
      continue
    }
    const skins = 1 + carrying
    carrying = 0
    const winnerId = winners[0].id
    if (!winnerTakeAll) pay(totals, winnerId, ids.filter((id) => id !== winnerId), stake * skins)
    won.set(winnerId, (won.get(winnerId) ?? 0) + skins)
  }

  if (holesJudged === 0) {
    return emptyOutcome(playerIds, 'No hole has a score for everyone in the bet yet.')
  }

  detail.push(`${holesJudged} hole${holesJudged === 1 ? '' : 's'} judged.`)
  if (useNet && ranked)
    detail.push(
      hasSlopeRating(ranked)
        ? 'Strokes off the low course handicap (slope-adjusted), hardest holes first.'
        : 'Strokes off the low handicap, hardest holes first.',
    )
  for (const [id, count] of [...won.entries()].sort((a, b) => b[1] - a[1])) {
    detail.push(`${count} skin${count === 1 ? '' : 's'}|${id}`)
  }
  // One pot, most skins takes it. Settled here rather than per hole, so
  // mid-round the money shows who'd take it as things stand.
  if (winnerTakeAll && won.size > 0) {
    const most = Math.max(...won.values())
    const leaders = [...won.entries()].filter(([, n]) => n === most).map(([id]) => id)
    const losers = ids.filter((id) => !leaders.includes(id))
    // Split in whole cents, the leftover cent or two to the first leaders
    // (the money.ts rule), so the pot nets to exactly zero.
    const stakeCents = Math.round(stake * 100)
    const potCents = stakeCents * losers.length
    const base = Math.floor(potCents / leaders.length)
    const remainder = potCents - base * leaders.length
    for (const id of losers) totals.set(id, (totals.get(id) ?? 0) - stakeCents / 100)
    leaders.forEach((id, i) => totals.set(id, (totals.get(id) ?? 0) + (base + (i < remainder ? 1 : 0)) / 100))
    if (leaders.length === 1) {
      detail.push(
        holesJudged === HOLE_COUNT
          ? `Most skins takes the pot|${leaders[0]}`
          : `Holding the pot as it stands|${leaders[0]}`,
      )
    } else {
      detail.push(`Tied at ${most} skins apiece, so the pot splits.`)
    }
  } else if (winnerTakeAll) {
    detail.push('No skins won yet. The pot sits.')
  }
  if (carrying > 0) {
    detail.push(
      holesJudged === HOLE_COUNT
        ? `${carrying} skin${carrying === 1 ? '' : 's'} died on the 18th unclaimed.`
        : `${carrying} skin${carrying === 1 ? '' : 's'} carrying. Next outright winner takes ${carrying + 1}.`,
    )
  }
  return { results: toResults(totals), detail, computable: true }
}

/**
 * Nassau: three separate bets at the same stake — front nine, back nine,
 * and the full eighteen. Net subtracts the handicap (halved on a nine),
 * which is the usual casual approximation when there's no stroke index to
 * allocate shots hole by hole.
 */
export function calcNassau(
  round: Round,
  playerIds: string[],
  stake: number,
  useNet: boolean,
  /** With its stroke index filled in, strokes fall on the holes they should. */
  course?: Course,
): BetOutcome {
  const entries = playerIds
    .map((id) => round.players.find((rp) => rp.playerId === id))
    .filter((rp): rp is RoundPlayer => !!rp)
  if (entries.length < 2) return emptyOutcome(playerIds, 'Needs at least two golfers.')

  const ids = idsOf(entries)
  const totals = zeroed(ids)
  const detail: string[] = []
  let decided = 0

  // A scorecard doesn't spread a handicap evenly — it gives a stroke on
  // the hardest hole, then the next, and so on. Halving it across a nine
  // assumes both nines are equally hard, which is rarely true and is why
  // this was only ever an approximation.
  const ranked = hasStrokeIndex(course) ? course : null
  const allocation = new Map<string, number[]>()
  if (ranked && useNet) {
    // Full handicap each in a nassau (not off the low), converted to the
    // course handicap when rating and slope are in.
    for (const rp of entries) allocation.set(rp.playerId, strokesByHole(ranked, playingHandicap(ranked, rp.handicapSnapshot, round.tee)))
  }

  const segments: { label: string; from: number; to: number; allowance: number }[] = [
    { label: 'Front nine', from: FRONT[0], to: FRONT[1], allowance: 0.5 },
    { label: 'Back nine', from: BACK[0], to: BACK[1], allowance: 0.5 },
    { label: 'Eighteen', from: 0, to: HOLE_COUNT, allowance: 1 },
  ]

  for (const seg of segments) {
    const complete = entries.every((rp) => cardOf(rp).slice(seg.from, seg.to).every((h) => h != null))
    if (!complete) {
      detail.push(`${seg.label}: not all holes in yet.`)
      continue
    }
    const scores = entries.map((rp) => {
      const given = allocation.get(rp.playerId)
      // Without an index to allocate by, the course handicap (a whole
      // number, slope-adjusted where the course has one) is halved for a
      // nine and rounded, so a 16.9 and a 17.0 get the same strokes.
      const allowance = given
        ? given.slice(seg.from, seg.to).reduce((sum, n) => sum + n, 0)
        : Math.round(Math.round(playingHandicap(course, rp.handicapSnapshot, round.tee)) * seg.allowance)
      return {
        id: rp.playerId,
        score: strokes(rp, seg.from, seg.to) - (useNet ? allowance : 0),
      }
    })
    const best = Math.min(...scores.map((s) => s.score))
    const winners = scores.filter((s) => Math.abs(s.score - best) < 0.0001)
    if (winners.length !== 1) {
      detail.push(`${seg.label}: halved.`)
      continue
    }
    decided++
    const winnerId = winners[0].id
    pay(totals, winnerId, ids.filter((id) => id !== winnerId), stake)
    detail.push(`${seg.label}: won|${winnerId}`)
  }

  // Say which way the strokes were worked out, so the number is
  // explainable when somebody disputes it in the car park.
  if (useNet) {
    detail.push(
      ranked
        ? 'Strokes given hole by hole off the stroke index.'
        : "Handicaps split evenly over the nines. Add this course's stroke index for the real allocation.",
    )
  }

  if (decided === 0 && detail.every((d) => !d.includes('|'))) {
    return { results: toResults(totals), detail, computable: false }
  }
  return { results: toResults(totals), detail, computable: true }
}

/**
 * Match play: one on one, hole by hole. Win a hole by scoring lower on
 * it; most holes up takes the stake. The match closes early once the
 * lead is bigger than the holes left — that's what "3&2" means.
 *
 * Net gives the DIFFERENCE in handicaps, not each player's full number,
 * as strokes on the hardest holes. That's the convention off a real
 * card, and it's why net here demands the course's stroke index: which
 * specific holes get a stroke decides who wins those holes, so there is
 * no honest way to spread them without the ranking.
 */
export function calcMatchPlay(
  round: Round,
  playerIds: string[],
  stake: number,
  useNet: boolean,
  course?: Course,
): BetOutcome {
  const entries = playerIds
    .map((id) => round.players.find((rp) => rp.playerId === id))
    .filter((rp): rp is RoundPlayer => !!rp)
  // Both checks: two names in the bet, and both actually on the round —
  // otherwise a stray id silently turns a threesome into somebody
  // else's head-to-head.
  if (playerIds.length !== 2 || entries.length !== 2) {
    return emptyOutcome(playerIds, 'Match play is one on one. Pick exactly two golfers from this round.')
  }

  const [a, b] = entries
  const ranked = hasStrokeIndex(course) ? course : null
  if (useNet && !ranked) {
    return emptyOutcome(
      playerIds,
      "Net match play needs this course's stroke index. Add it from the Courses page, or play the match gross.",
    )
  }

  // Strokes for the weaker player, hardest holes first, off the course
  // handicaps when rating and slope are in.
  let strokesA = Array<number>(HOLE_COUNT).fill(0)
  let strokesB = Array<number>(HOLE_COUNT).fill(0)
  let diff = 0 // positive = A gets strokes
  if (useNet && ranked) {
    diff = playingHandicap(ranked, a.handicapSnapshot, round.tee) - playingHandicap(ranked, b.handicapSnapshot, round.tee)
    if (diff > 0) strokesA = strokesByHole(ranked, diff)
    else if (diff < 0) strokesB = strokesByHole(ranked, -diff)
  }

  // Holes are judged in order, and only as far as both cards go —
  // a match has a running state, unlike skins.
  const cardA = cardOf(a)
  const cardB = cardOf(b)
  let up = 0 // positive = A leads
  let thru = 0
  let closedWithLeft: number | null = null
  for (let h = 0; h < HOLE_COUNT; h++) {
    if (cardA[h] == null || cardB[h] == null) break
    thru = h + 1
    const netA = cardA[h]! - strokesA[h]
    const netB = cardB[h]! - strokesB[h]
    if (netA < netB) up++
    else if (netB < netA) up--
    const remaining = HOLE_COUNT - thru
    if (Math.abs(up) > remaining) {
      closedWithLeft = remaining
      break
    }
  }

  if (thru === 0) return emptyOutcome(playerIds, 'No hole has a score for both golfers yet.')

  const totals = zeroed(idsOf(entries))
  const detail: string[] = []
  const leaderId = up > 0 ? a.playerId : b.playerId
  const loserId = up > 0 ? b.playerId : a.playerId

  if (useNet && ranked) {
    const given = Math.abs(Math.round(diff))
    const receiverId = diff > 0 ? a.playerId : b.playerId
    if (given > 0) detail.push(`Gets ${given} stroke${given === 1 ? '' : 's'}, hardest holes first|${receiverId}`)
  }

  // Decided — either closed early ("3&2") or on the last green ("1 up").
  // A win at the 18th is never written "1&0"; that's not how a card reads.
  if (closedWithLeft != null || thru === HOLE_COUNT) {
    if (up === 0) {
      detail.push('All square after eighteen. Nobody pays.')
      return { results: toResults(totals), detail, computable: true }
    }
    pay(totals, leaderId, [loserId], stake)
    const margin =
      closedWithLeft != null && closedWithLeft > 0 ? `${Math.abs(up)}&${closedWithLeft}` : `${Math.abs(up)} up`
    detail.push(`Takes it ${margin}|${leaderId}`)
    return { results: toResults(totals), detail, computable: true }
  }

  // Still live.
  const remaining = HOLE_COUNT - thru
  if (up === 0) detail.push(`All square thru ${thru}.`)
  else detail.push(`${Math.abs(up)} up thru ${thru}${Math.abs(up) === remaining ? ', dormie' : ''}|${leaderId}`)
  return { results: toResults(totals), detail, computable: false }
}

/** Winner-takes-all on a one-off bet, e.g. closest to the pin. */
export function calcCustom(playerIds: string[], winnerId: string | null, stake: number): BetOutcome {
  const totals = zeroed(playerIds)
  if (!winnerId) return emptyOutcome(playerIds, 'Pick who won it.')
  pay(totals, winnerId, playerIds.filter((id) => id !== winnerId), stake)
  return { results: toResults(totals), detail: ['Winner takes the stake from each of the others.'], computable: true }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** 1st, 2nd, 3rd, 11th. */
export function nth(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/** "the 9th", "the 9th and 11th", "the 9th, 10th and 11th" (0-based holes in). */
function holeList(holes: number[]): string {
  const names = holes.map((h) => nth(h + 1))
  return `the ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}`
}

const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Nassau as it's played between two: three matches at the same stake,
 * the front nine, the back nine and the eighteen, each won by holes up,
 * not by total strokes. Net gives the difference in course handicaps as
 * strokes on the hardest holes, same as a straight match.
 *
 * Presses are new bets at the same stake from a hole to the end of its
 * nine. A press made by hand is stored on the bet; an automatic one
 * isn't, it's worked out here every time: whenever a golfer goes
 * `autoPress` down in any bet on a nine (the nine itself or a press), a
 * new press starts on the next hole. Each bet sets one off, once. A
 * press already made by hand on that hole counts as it.
 */
export function calcNassauMatch(
  round: Round,
  playerIds: string[],
  stake: number,
  useNet: boolean,
  course?: Course,
  play?: NassauPlay,
): BetOutcome {
  const entries = playerIds
    .map((id) => round.players.find((rp) => rp.playerId === id))
    .filter((rp): rp is RoundPlayer => !!rp)
  if (playerIds.length !== 2 || entries.length !== 2) {
    return emptyOutcome(playerIds, 'Match-play Nassau is one on one. Pick exactly two golfers from this round.')
  }
  const [a, b] = entries
  const ranked = hasStrokeIndex(course) ? course : null
  if (useNet && !ranked) {
    return emptyOutcome(
      playerIds,
      "Net match play needs this course's stroke index. Add it from the Courses page, or play the match gross.",
    )
  }

  // Strokes for the weaker player, hardest holes first.
  let strokesA = Array<number>(HOLE_COUNT).fill(0)
  let strokesB = Array<number>(HOLE_COUNT).fill(0)
  let diff = 0 // positive = A gets strokes
  if (useNet && ranked) {
    diff = playingHandicap(ranked, a.handicapSnapshot, round.tee) - playingHandicap(ranked, b.handicapSnapshot, round.tee)
    if (diff > 0) strokesA = strokesByHole(ranked, diff)
    else if (diff < 0) strokesB = strokesByHole(ranked, -diff)
  }

  // Each hole as A sees it: 1 won, -1 lost, 0 halved. Judged in order,
  // and only as far as both cards go.
  const cardA = cardOf(a)
  const cardB = cardOf(b)
  const holes: number[] = []
  for (let h = 0; h < HOLE_COUNT; h++) {
    if (cardA[h] == null || cardB[h] == null) break
    const netA = cardA[h]! - strokesA[h]
    const netB = cardB[h]! - strokesB[h]
    holes.push(netA < netB ? 1 : netB < netA ? -1 : 0)
  }
  const thru = holes.length
  if (thru === 0) return emptyOutcome(playerIds, 'No hole has a score for both golfers yet.')

  interface Leg {
    label: string
    from: number
    to: number
  }
  const autoPress = play?.autoPress && play.autoPress > 0 ? play.autoPress : 0
  const manual = (play?.presses ?? [])
    .map((p) => p.hole)
    .filter((h) => Number.isInteger(h) && h >= 0 && h < HOLE_COUNT)
    .sort((x, y) => x - y)
  const pressLeg = (h: number, to: number): Leg => ({ label: `the press from the ${nth(h + 1)}`, from: h, to })

  // Each nine with its presses, in the order they started.
  const nines: Leg[][] = [
    { label: 'the front', from: FRONT[0], to: FRONT[1] },
    { label: 'the back', from: BACK[0], to: BACK[1] },
  ].map((nine) => {
    const legs: Leg[] = [nine, ...manual.filter((h) => h >= nine.from && h < nine.to).map((h) => pressLeg(h, nine.to))]
    if (!autoPress) return legs
    const pressed = new Set<Leg>()
    for (let h = nine.from; h < Math.min(nine.to, thru); h++) {
      for (const leg of [...legs]) {
        if (leg.from > h || pressed.has(leg)) continue
        let up = 0
        for (let k = leg.from; k <= h; k++) up += holes[k]
        if (Math.abs(up) < autoPress) continue
        pressed.add(leg)
        // A press can't start past the nine, and one made by hand on that
        // hole already answers it.
        if (h + 1 >= nine.to || legs.some((l) => l !== nine && l.from === h + 1)) continue
        legs.push(pressLeg(h + 1, nine.to))
      }
    }
    return legs.sort((x, y) => (x === nine ? -1 : y === nine ? 1 : x.from - y.from))
  })
  const legs = [...nines[0], ...nines[1], { label: 'the eighteen', from: 0, to: HOLE_COUNT }]

  const totals = zeroed(idsOf(entries))
  const detail: string[] = []
  if (useNet && ranked) {
    const given = Math.abs(Math.round(diff))
    const receiverId = diff > 0 ? a.playerId : b.playerId
    if (given > 0) detail.push(`Gets ${plural(given, 'stroke')}, hardest holes first|${receiverId}`)
  }

  let open = 0
  for (const leg of legs) {
    // Walk the leg's holes until the card runs out or the lead is bigger
    // than the holes left, which closes it ("3&2").
    let up = 0
    let played = 0
    let closedWithLeft: number | null = null
    for (let h = leg.from; h < Math.min(leg.to, thru); h++) {
      up += holes[h]
      played++
      const left = leg.to - h - 1
      if (Math.abs(up) > left) {
        closedWithLeft = left
        break
      }
    }
    if (played === 0) {
      open++
      // The back nine before the turn says nothing; a press does.
      if (leg.label.startsWith('the press')) detail.push(`${capitalised(leg.label)} is on.`)
      continue
    }
    const remaining = leg.to - leg.from - played
    const leaderId = up > 0 ? a.playerId : b.playerId
    const loserId = up > 0 ? b.playerId : a.playerId
    if (closedWithLeft != null || remaining === 0) {
      if (up === 0) {
        detail.push(`${capitalised(leg.label)} halved.`)
        continue
      }
      pay(totals, leaderId, [loserId], stake)
      const margin = closedWithLeft != null && closedWithLeft > 0 ? `${Math.abs(up)}&${closedWithLeft}` : `${Math.abs(up)} up`
      detail.push(`Takes ${leg.label} ${margin}|${leaderId}`)
      continue
    }
    open++
    const last = leg.from + played
    if (up === 0) detail.push(`${capitalised(leg.label)} all square thru ${last}.`)
    else detail.push(`${Math.abs(up)} up on ${leg.label} thru ${last}${Math.abs(up) === remaining ? ', dormie' : ''}|${leaderId}`)
  }

  return { results: toResults(totals), detail, computable: open === 0 }
}

/** The wolf's calls besides a partner. */
export const LONE_WOLF = 'lone'
export const BLIND_WOLF = 'blind'

/** The tee order a wolf bet plays in: the one saved, if it still names these four, else as listed. */
export function wolfOrder(ids: string[], play?: WolfPlay): string[] {
  const order = play?.order ?? []
  return order.length === ids.length && ids.every((id) => order.includes(id)) ? order : ids
}

/** Whose turn it is to be the wolf on a hole (0-based). */
export const wolfOn = (order: string[], hole: number) => order[hole % order.length]

/**
 * Wolf, for four. The wolf rotates in tee order, one hole each, so the
 * first two in the order get a fifth turn on the 17th and 18th. After
 * the drives the wolf calls a partner, and it's two against two, best
 * ball: each winner takes the stake from one loser. Or the wolf goes
 * lone, one against three for double the stake with each of them, or
 * calls blind wolf before anyone has hit, for triple. A tied hole
 * pushes and nothing moves.
 *
 * Net gives strokes off the low handicap, hole by hole, which needs the
 * stroke index (the same as skins). A hole with no call on it can't be
 * judged, so it waits until the call is put in.
 */
export function calcWolf(
  round: Round,
  playerIds: string[],
  stake: number,
  useNet: boolean,
  course?: Course,
  play?: WolfPlay,
): BetOutcome {
  const entries = playerIds
    .map((id) => round.players.find((rp) => rp.playerId === id))
    .filter((rp): rp is RoundPlayer => !!rp)
  if (playerIds.length !== 4 || entries.length !== 4) {
    return emptyOutcome(playerIds, 'Wolf is for four. Pick exactly four golfers from this round.')
  }
  const ranked = hasStrokeIndex(course) ? course : null
  if (useNet && !ranked) {
    return emptyOutcome(playerIds, "Net wolf needs this course's stroke index. Add it from the Courses page, or play it gross.")
  }
  const given: Record<string, number[]> = useNet && ranked ? strokesOffLow(ranked, entries, round.tee) : {}

  const ids = idsOf(entries)
  const order = wolfOrder(ids, play)
  const totals = zeroed(ids)
  const calls: string[] = []
  const waiting: number[] = []
  let played = 0
  let halved = 0

  for (let h = 0; h < HOLE_COUNT; h++) {
    const scores = new Map<string, number>()
    for (const rp of entries) {
      const raw = cardOf(rp)[h]
      if (raw != null) scores.set(rp.playerId, raw - (given[rp.playerId]?.[h] ?? 0))
    }
    // Everyone needs a score on the hole to judge it.
    if (scores.size < entries.length) continue
    const wolf = wolfOn(order, h)
    const pick = play?.picks?.[h] ?? null
    const alone = pick === LONE_WOLF || pick === BLIND_WOLF
    if (!pick || (!alone && (pick === wolf || !ids.includes(pick)))) {
      waiting.push(h)
      continue
    }
    played++
    const wolfSide = alone ? [wolf] : [wolf, pick]
    const others = ids.filter((id) => !wolfSide.includes(id))
    const low = (side: string[]) => Math.min(...side.map((id) => scores.get(id)!))
    const wolfLow = low(wolfSide)
    const othersLow = low(others)
    if (wolfLow === othersLow) {
      halved++
      continue
    }
    const wolfWon = wolfLow < othersLow
    if (alone) {
      const unit = stake * (pick === BLIND_WOLF ? 3 : 2)
      if (wolfWon) pay(totals, wolf, others, unit)
      else for (const id of others) pay(totals, id, [wolf], unit)
      calls.push(`${pick === BLIND_WOLF ? 'Went blind' : 'Went lone'} on the ${nth(h + 1)} and ${wolfWon ? 'won' : 'lost'}|${wolf}`)
    } else {
      const winners = wolfWon ? wolfSide : others
      const losers = wolfWon ? others : wolfSide
      winners.forEach((id, i) => pay(totals, id, [losers[i]], stake))
    }
  }

  if (played === 0) {
    return emptyOutcome(
      playerIds,
      waiting.length ? `No wolf call on ${holeList(waiting)} yet.` : 'No hole has a score for everyone in the bet yet.',
    )
  }
  const detail = [`${plural(played, 'hole')} played.`]
  if (useNet && ranked) detail.push('Strokes off the low handicap, hardest holes first.')
  detail.push(...calls)
  if (halved > 0) detail.push(`${plural(halved, 'hole')} halved.`)
  if (waiting.length) detail.push(`No call yet on ${holeList(waiting)}.`)
  return { results: toResults(totals), detail, computable: true }
}

/**
 * A team's Vegas number: the two scores side by side, low first, so a 4
 * and a 5 make 45 and a 4 and a 10 make 410. Flipped puts the high one
 * first (54). A net score below nothing counts as nothing.
 */
export function vegasNumber(scores: number[], flipped: boolean): number {
  const [lo, hi] = scores.map((s) => Math.max(0, s)).sort((x, y) => x - y)
  return Number(flipped ? `${hi}${lo}` : `${lo}${hi}`)
}

/** Two teams that split these four golfers two and two, or null. */
function vegasTeams(ids: string[], play?: VegasPlay): [string[], string[]] | null {
  const teams = play?.teams
  if (!teams || teams.length !== 2 || teams[0].length !== 2 || teams[1].length !== 2) return null
  const all = [...teams[0], ...teams[1]]
  return new Set(all).size === 4 && all.every((id) => ids.includes(id)) ? teams : null
}

/**
 * Vegas: two against two. On each hole a team puts its two scores side
 * by side, low first, and the lower number wins the difference in
 * points. The stake is per point and each golfer on the losing team pays
 * it to one on the winning team, so it's settled on the total at the
 * end. With the birdie flip, a team that makes a birdie (and the other
 * doesn't) turns the other team's number round, high first.
 *
 * Net gives strokes off the low handicap and judges birdies net, which
 * needs the stroke index.
 */
export function calcVegas(
  round: Round,
  playerIds: string[],
  stake: number,
  useNet: boolean,
  course?: Course,
  play?: VegasPlay,
): BetOutcome {
  const entries = playerIds
    .map((id) => round.players.find((rp) => rp.playerId === id))
    .filter((rp): rp is RoundPlayer => !!rp)
  if (playerIds.length !== 4 || entries.length !== 4) {
    return emptyOutcome(playerIds, 'Vegas is two against two. Pick exactly four golfers from this round.')
  }
  const ids = idsOf(entries)
  const teams = vegasTeams(ids, play)
  if (!teams) return emptyOutcome(playerIds, 'Pick the two teams.')
  const ranked = hasStrokeIndex(course) ? course : null
  if (useNet && !ranked) {
    return emptyOutcome(playerIds, "Net Vegas needs this course's stroke index. Add it from the Courses page, or play it gross.")
  }
  const given: Record<string, number[]> = useNet && ranked ? strokesOffLow(ranked, entries, round.tee) : {}
  const pars = padded(course?.pars)

  let played = 0
  let flips = 0
  let points = 0 // positive = the first team is ahead
  for (let h = 0; h < HOLE_COUNT; h++) {
    const score = (id: string) => {
      const raw = cardOf(entries.find((rp) => rp.playerId === id)!)[h]
      return raw == null ? null : raw - (given[id]?.[h] ?? 0)
    }
    const first = teams[0].map(score)
    const second = teams[1].map(score)
    if ([...first, ...second].some((s) => s == null)) continue
    played++
    const par = pars[h]
    const birdie = (team: (number | null)[]) => par != null && team.some((s) => (s as number) <= par - 1)
    let flipFirst = false
    let flipSecond = false
    if (play?.birdieFlip && par != null) {
      if (birdie(first) && !birdie(second)) flipSecond = true
      else if (birdie(second) && !birdie(first)) flipFirst = true
    }
    if (flipFirst || flipSecond) flips++
    points += vegasNumber(second as number[], flipSecond) - vegasNumber(first as number[], flipFirst)
  }

  if (played === 0) return emptyOutcome(playerIds, 'No hole has a score for everyone in the bet yet.')

  // Settled once on the total, in whole cents: every point is the stake
  // from each golfer on the losing team to one on the winning team.
  const totals = zeroed(ids)
  const [winners, losers] = points > 0 ? teams : [teams[1], teams[0]]
  const each = (Math.round(stake * 100) * Math.abs(points)) / 100
  if (points !== 0) {
    for (const id of winners) totals.set(id, (totals.get(id) ?? 0) + each)
    for (const id of losers) totals.set(id, (totals.get(id) ?? 0) - each)
  }

  const detail = [`${plural(played, 'hole')} played.`]
  if (useNet && ranked) detail.push('Strokes off the low handicap, hardest holes first.')
  detail.push(points === 0 ? 'Level on points.' : `Up ${plural(Math.abs(points), 'point')}|${winners.join('+')}`)
  if (flips > 0) detail.push(`${plural(flips, 'birdie flip')}.`)
  return { results: toResults(totals), detail, computable: true }
}

/**
 * Settles a saved bet from the round's cards, or returns null for bets
 * the card can't speak for: custom bets, hand-typed amounts, and bets
 * saved before net/gross was stored (their results are already final).
 *
 * This is what makes a bet placed on the first tee live — the same
 * function drives the status line while the cards fill in and the
 * results written back when they're saved.
 */
export function settleFromCard(bet: Bet, round: Round, course?: Course): BetOutcome | null {
  if (bet.type === 'custom' || bet.manual || bet.net === undefined) return null
  const ids = bet.results.map((r) => r.playerId)
  switch (bet.type) {
    case 'skins':
      return calcSkins(round, ids, bet.stake, bet.net, course, bet.winnerTakeAll)
    case 'nassau':
      return bet.nassau?.format === 'match'
        ? calcNassauMatch(round, ids, bet.stake, bet.net, course, bet.nassau)
        : calcNassau(round, ids, bet.stake, bet.net, course)
    case 'match':
      return calcMatchPlay(round, ids, bet.stake, bet.net, course)
    case 'wolf':
      return calcWolf(round, ids, bet.stake, bet.net, course, bet.wolf)
    case 'vegas':
      return calcVegas(round, ids, bet.stake, bet.net, course, bet.vegas)
    default:
      // A game this version doesn't know: its stored results stand.
      return null
  }
}

import type { BetResult, Course, Round, RoundPlayer } from '../types'
import { BACK, FRONT, HOLE_COUNT, cardOf, nineComparable, strokes } from './holes'
import { hasStrokeIndex, strokesByHole } from './courses'

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

function pay(totals: Map<string, number>, winnerId: string, others: string[], stake: number) {
  totals.set(winnerId, (totals.get(winnerId) ?? 0) + stake * others.length)
  for (const id of others) totals.set(id, (totals.get(id) ?? 0) - stake)
}

const toResults = (totals: Map<string, number>): BetResult[] =>
  [...totals.entries()].map(([playerId, amount]) => ({ playerId, amount: Math.round(amount * 100) / 100 }))

/**
 * Skins: lowest score on a hole wins it. A tie means nobody wins that
 * hole and it does not carry over.
 */
export function calcSkins(round: Round, playerIds: string[], stake: number): BetOutcome {
  const entries = playerIds
    .map((id) => round.players.find((rp) => rp.playerId === id))
    .filter((rp): rp is RoundPlayer => !!rp)
  if (entries.length < 2) return emptyOutcome(playerIds, 'Needs at least two golfers.')

  const totals = zeroed(playerIds)
  const detail: string[] = []
  const won = new Map<string, number>()
  let holesPlayed = 0
  let halved = 0

  for (let h = 0; h < HOLE_COUNT; h++) {
    const scores = entries.map((rp) => ({ id: rp.playerId, score: cardOf(rp)[h] }))
    // Every golfer in the bet needs a score on the hole to judge it.
    if (scores.some((s) => s.score == null)) continue
    holesPlayed++
    const best = Math.min(...scores.map((s) => s.score as number))
    const winners = scores.filter((s) => s.score === best)
    if (winners.length !== 1) {
      halved++
      continue
    }
    const winnerId = winners[0].id
    pay(totals, winnerId, playerIds.filter((id) => id !== winnerId), stake)
    won.set(winnerId, (won.get(winnerId) ?? 0) + 1)
  }

  if (holesPlayed === 0) {
    return emptyOutcome(playerIds, 'No hole has a score for everyone in the bet yet.')
  }

  detail.push(`${holesPlayed} hole${holesPlayed === 1 ? '' : 's'} judged, ${halved} halved.`)
  for (const [id, count] of [...won.entries()].sort((a, b) => b[1] - a[1])) {
    detail.push(`${count} skin${count === 1 ? '' : 's'}|${id}`)
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

  const totals = zeroed(playerIds)
  const detail: string[] = []
  let decided = 0

  // A scorecard doesn't spread a handicap evenly — it gives a stroke on
  // the hardest hole, then the next, and so on. Halving it across a nine
  // assumes both nines are equally hard, which is rarely true and is why
  // this was only ever an approximation.
  const ranked = hasStrokeIndex(course) ? course : null
  const allocation = new Map<string, number[]>()
  if (ranked && useNet) {
    for (const rp of entries) allocation.set(rp.playerId, strokesByHole(ranked, rp.handicapSnapshot))
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
      const allowance = given
        ? given.slice(seg.from, seg.to).reduce((sum, n) => sum + n, 0)
        : rp.handicapSnapshot * seg.allowance
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
    pay(totals, winnerId, playerIds.filter((id) => id !== winnerId), stake)
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

/** Winner-takes-all on a one-off bet, e.g. closest to the pin. */
export function calcCustom(playerIds: string[], winnerId: string | null, stake: number): BetOutcome {
  const totals = zeroed(playerIds)
  if (!winnerId) return emptyOutcome(playerIds, 'Pick who won it.')
  pay(totals, winnerId, playerIds.filter((id) => id !== winnerId), stake)
  return { results: toResults(totals), detail: ['Winner takes the stake from each of the others.'], computable: true }
}

export const nassauReady = (round: Round, playerIds: string[]) => {
  const entries = playerIds.map((id) => round.players.find((rp) => rp.playerId === id)).filter((rp): rp is RoundPlayer => !!rp)
  if (entries.length < 2) return false
  return (['front', 'back'] as const).some((half) =>
    entries.every((_, i) => i === 0 || nineComparable(entries[0], entries[i], half)),
  )
}

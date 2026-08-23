import type { Round, RoundPlayer } from '../types'

export const HOLE_COUNT = 18
export const FRONT = [0, 9] as const
export const BACK = [9, 18] as const

export const emptyCard = (): (number | null)[] => Array(HOLE_COUNT).fill(null)

/** Pads or trims a stored card to 18 so indexing is always safe. */
export function cardOf(rp: RoundPlayer): (number | null)[] {
  const card = rp.holes ?? []
  return Array.from({ length: HOLE_COUNT }, (_, i) => card[i] ?? null)
}

export const hasCard = (rp: RoundPlayer) => cardOf(rp).some((h) => h != null)
export const holesEntered = (rp: RoundPlayer) => cardOf(rp).filter((h) => h != null).length
export const cardComplete = (rp: RoundPlayer) => holesEntered(rp) === HOLE_COUNT

/** Strokes over a slice of the card, ignoring holes not filled in. */
export function strokes(rp: RoundPlayer, from = 0, to = HOLE_COUNT): number {
  return cardOf(rp)
    .slice(from, to)
    .reduce<number>((sum, h) => sum + (h ?? 0), 0)
}

export const outTotal = (rp: RoundPlayer) => strokes(rp, ...FRONT)
export const inTotal = (rp: RoundPlayer) => strokes(rp, ...BACK)

/** Whether both golfers filled in the same nine, so it can be compared. */
export function nineComparable(a: RoundPlayer, b: RoundPlayer, half: 'front' | 'back'): boolean {
  const [from, to] = half === 'front' ? FRONT : BACK
  const ca = cardOf(a).slice(from, to)
  const cb = cardOf(b).slice(from, to)
  return ca.every((h) => h != null) && cb.every((h) => h != null)
}

export const anyCards = (round: Round) => round.players.some(hasCard)

/**
 * The total a card implies. Kept in sync with `gross` on save so every
 * existing stat keeps working off the one field it always used.
 */
export const cardTotal = (card: (number | null)[]) =>
  card.some((h) => h != null) ? card.reduce<number>((sum, h) => sum + (h ?? 0), 0) : null

import type { AppData, Course, RoundPlayer } from '../types'
import { HOLE_COUNT, cardOf } from './holes'

// Par lives on the course, not the round, so filling it in once reaches
// backwards through every round ever played there.

/**
 * How a round's free-text course name finds its course record. Rounds are
 * typed by hand on a phone, so "Bethpage  Yellow" and "bethpage yellow"
 * have to land on the same course.
 */
export const courseSlug = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')

export const findCourse = (data: AppData, courseName: string): Course | undefined =>
  data.courses.find((c) => c.slug === courseSlug(courseName))

export const emptyPars = (): (number | null)[] => Array(HOLE_COUNT).fill(null)

/** Pads or trims a stored list to 18, so indexing is always safe. */
export const padded = (values: (number | null)[] | undefined): (number | null)[] =>
  Array.from({ length: HOLE_COUNT }, (_, i) => values?.[i] ?? null)

export const parsEntered = (course?: Course) => padded(course?.pars).filter((p) => p != null).length

/**
 * Whether there's enough here to show a score against par. Partial pars
 * are fine to save mid-entry but useless to compare against — "+4" is a
 * lie if four holes have no par.
 */
export function hasPars(course: Course | undefined): course is Course {
  return !!course && parsEntered(course) === HOLE_COUNT
}

export const strokeIndexEntered = (course?: Course) => padded(course?.strokeIndex).filter((n) => n != null).length

export function hasStrokeIndex(course: Course | undefined): course is Course {
  return !!course && strokeIndexEntered(course) === HOLE_COUNT
}

/** Course par, or null until every hole has one. */
export const coursePar = (course?: Course): number | null =>
  hasPars(course) ? padded(course.pars).reduce<number>((sum, p) => sum + (p ?? 0), 0) : null

/** Par over a slice of the card, for the front and back nines. */
export const parBetween = (course: Course, from: number, to: number) =>
  padded(course.pars)
    .slice(from, to)
    .reduce<number>((sum, p) => sum + (p ?? 0), 0)

/** Par for the holes this golfer actually has a score on. */
export function parForEnteredHoles(course: Course, rp: RoundPlayer): number {
  const card = cardOf(rp)
  return padded(course.pars).reduce<number>((sum, par, i) => sum + (card[i] != null ? (par ?? 0) : 0), 0)
}

/** "+4", "E", "−2". A true minus sign, to match the rest of the app. */
export const toPar = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `−${Math.abs(n)}`)

// How a hole's score reads against its par. Anything past a double bogey
// stops needing its own name.
export type ScoreKind = 'albatross' | 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'worse'

export function scoreKind(strokes: number, par: number): ScoreKind {
  const diff = strokes - par
  if (diff <= -3) return 'albatross'
  if (diff === -2) return 'eagle'
  if (diff === -1) return 'birdie'
  if (diff === 0) return 'par'
  if (diff === 1) return 'bogey'
  if (diff === 2) return 'double'
  return 'worse'
}

/** A course's holes hardest-first, for handing out strokes. */
export function holesByDifficulty(course: Course): number[] {
  const index = padded(course.strokeIndex)
  return index
    .map((rank, hole) => ({ rank: rank ?? Number.MAX_SAFE_INTEGER, hole }))
    .sort((a, b) => a.rank - b.rank)
    .map((h) => h.hole)
}

/**
 * Strokes given on each hole, the way a scorecard allocates them: one per
 * hole starting from the hardest, going round again for a handicap above
 * eighteen. Returns 18 entries.
 *
 * This is the real thing, rather than the halved-handicap approximation
 * the bets used before — which quietly assumed every hole was equally
 * hard, and so gave the wrong answer on any nine that wasn't.
 */
export function strokesByHole(course: Course, handicap: number): number[] {
  const strokes = Array<number>(HOLE_COUNT).fill(0)
  const whole = Math.round(handicap)
  if (whole <= 0) return strokes
  const order = holesByDifficulty(course)
  for (let given = 0; given < whole; given++) {
    strokes[order[given % HOLE_COUNT]]++
  }
  return strokes
}

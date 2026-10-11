import type { AppData, Course, CourseNine, Round } from '../types'
import { HOLE_COUNT } from './holes'

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

// Course pages are addressed by slug, so a rename leaves the screens
// behind it in history pointing at a name that's gone. Remembered for
// the session so Back still lands on the course.
const renamed = new Map<string, string>()
export const noteRename = (from: string, to: string) => {
  if (from === to) return
  renamed.delete(to) // renamed back: the old name is live again
  renamed.set(from, to)
}
export function currentSlug(slug: string): string {
  let s = slug
  for (let i = 0; i < 10 && renamed.has(s); i++) s = renamed.get(s)!
  return s
}

/** A typed course name tidied the way a rename stores it. */
export const cleanCourseName = (name: string) => name.trim().replace(/\s+/g, ' ')

/**
 * Why a course can't take this name, or null when it can. Another card
 * under the new name is a merge, which the rename won't do blind.
 */
export function renameProblem(data: AppData, oldSlug: string, newName: string): string | null {
  const clean = cleanCourseName(newName)
  if (clean.length < 2) return 'A course name needs at least two letters.'
  const other = data.courses.find((c) => c.slug === courseSlug(clean))
  const mine = data.courses.find((c) => c.slug === oldSlug)
  return other && other !== mine ? `You already have a course called ${other.name}.` : null
}

/** What a rename touches, for the confirm: rounds, ratings and lists. */
export function renameReach(data: AppData, oldSlug: string) {
  return {
    rounds: data.rounds.filter((r) => courseSlug(r.courseName) === oldSlug).length,
    ratings: data.courseRatings.filter((r) => r.courseSlug === oldSlug).length,
    rankings: data.courseRankings.filter((r) => r.slugs.includes(oldSlug)).length,
  }
}

/**
 * The app's copy of rename_course in schema.sql, so the screen changes at
 * once while the database does it for real: the course row, every round
 * played there, each rating, everyone's list and any home course. A
 * golfer who rated both names keeps the newer rating; a list holding
 * both keeps the higher spot.
 */
export function renameCourseIn(data: AppData, oldSlug: string, newName: string): AppData {
  const clean = cleanCourseName(newName)
  const slug = courseSlug(clean)
  const merging = slug !== oldSlug
  const newer = new Map<string, string>()
  if (merging) {
    for (const r of data.courseRatings) {
      if (r.courseSlug !== oldSlug && r.courseSlug !== slug) continue
      const seen = data.courseRatings.find((o) => o.playerId === r.playerId && o !== r && (o.courseSlug === oldSlug || o.courseSlug === slug))
      // Ties go to the one already under the new name, as in the SQL.
      if (seen && (seen.date > r.date || (seen.date === r.date && seen.courseSlug === slug))) newer.set(r.id, seen.id)
    }
  }
  return {
    ...data,
    courses: data.courses.map((c) => (c.slug === oldSlug ? { ...c, name: clean, slug } : c)),
    rounds: data.rounds.map((r) => (courseSlug(r.courseName) === oldSlug ? { ...r, courseName: clean } : r)),
    courseRatings: data.courseRatings
      .filter((r) => !newer.has(r.id))
      .map((r) => (r.courseSlug === oldSlug ? { ...r, courseSlug: slug, courseName: clean } : r)),
    courseRankings: data.courseRankings.map((k) =>
      k.slugs.includes(oldSlug) ? { ...k, slugs: [...new Set(k.slugs.map((s) => (s === oldSlug ? slug : s)))] } : k,
    ),
    players: data.players.map((p) => (p.homeCourse && courseSlug(p.homeCourse) === oldSlug ? { ...p, homeCourse: clean } : p)),
  }
}

// ---------- 27-hole courses ----------
// A course with three nines plays any two, in either order, and each
// pairing is its own 18: its own pars in order, its own stroke index and
// its own yards. Everything that scores a round asks courseForRound
// rather than findCourse, so the pairing reaches the cards, the strokes,
// the bets, the stats and the trophies from this one place.

const NINE = 9
const nine = (xs: (number | null)[] | undefined) => Array.from({ length: NINE }, (_, i) => xs?.[i] ?? null)
/** A tee name as typed anywhere, loosely: "White", "white", "Whites", "White Tees" all read "white". */
const teeKey = (name: string) => name.trim().toLowerCase().replace(/\s*tees?$/, '').replace(/s$/, '')
/** The nine's length off its longest tee, as the stand-in for which nine is harder. */
const nineLength = (n: CourseNine) =>
  Math.max(0, ...(n.tees ?? []).map((t) => (t.holeYards ?? []).reduce<number>((s, y) => s + (y ?? 0), 0)))

/** A round's two nines in the order played, or null on an ordinary course. */
export function ninesFor(course: Course | undefined, round: Pick<Round, 'nines'>): [CourseNine, CourseNine] | null {
  const nines = course?.nines
  if (!nines || nines.length < 2) return null
  const byName = (name?: string) => nines.find((n) => !!name && n.name.toLowerCase() === name.toLowerCase())
  const a = byName(round.nines?.[0])
  const b = byName(round.nines?.[1])
  return a && b && a !== b ? [a, b] : [nines[0], nines[1]]
}

/** "Meadows · Lakes", for a round on a 27-hole course. */
export function ninesLabel(course: Course | undefined, round: Pick<Round, 'nines'>): string | null {
  const pair = ninesFor(course, round)
  return pair ? `${pair[0].name} · ${pair[1].name}` : null
}

/**
 * The course as this round played it. On an ordinary course that's just
 * the course. On a 27-hole course it's the two nines joined in order: the
 * pars, the yards off every tee the card prints on both, and the stroke
 * index. The card gives each nine a 1-9 handicap; joined, the harder nine
 * takes the odd strokes and the other the evens, the usual rule, with the
 * longer nine standing in for the harder. Rating and slope stay the
 * course's own, since cards don't print one per pairing.
 */
export function courseForRound(data: AppData, round: Pick<Round, 'courseName' | 'nines' | 'tee'>): Course | undefined {
  const course = findCourse(data, round.courseName)
  const pair = ninesFor(course, round)
  if (!course || !pair) return course
  const [a, b] = pair
  const isDefault = course.nines![0] === a && course.nines![1] === b
  const joinedPars = [...nine(a.pars), ...nine(b.pars)]
  const aOdd = nineLength(a) >= nineLength(b)
  const index = (n: CourseNine, odd: boolean) => nine(n.strokeIndex).map((h) => (h == null ? null : odd ? 2 * h - 1 : 2 * h))
  const strokeIndex =
    a.strokeIndex && b.strokeIndex ? [...index(a, aOdd), ...index(b, !aOdd)] : isDefault ? course.strokeIndex : undefined
  const joined = (a.tees ?? []).flatMap((ta) => {
    const tb = b.tees?.find((t) => teeKey(t.name) === teeKey(ta.name))
    return tb ? [{ name: ta.name, holeYards: [...nine(ta.holeYards), ...nine(tb.holeYards)] }] : []
  })
  const tees = course.tees?.map((t) => ({ ...t, holeYards: joined.find((j) => teeKey(j.name) === teeKey(t.name))?.holeYards }))
  const row =
    joined.find((j) => !!round.tee && teeKey(j.name) === teeKey(round.tee)) ?? joined.find((j) => teeKey(j.name) === 'white') ?? joined[0]
  return {
    ...course,
    pars: joinedPars.every((p) => p != null) ? joinedPars : isDefault ? course.pars : joinedPars,
    strokeIndex,
    tees,
    yards: row?.holeYards ?? (isDefault ? course.yards : undefined),
    yardsTee: row?.name ?? (isDefault ? course.yardsTee : undefined),
  }
}

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
/** Whether the course can convert an index into a course handicap. */
export function hasSlopeRating(course: Course | undefined): course is Course {
  return !!course && course.slope != null && course.rating != null && hasPars(course)
}

/**
 * The rating and slope to play a round off: the tee named on the round
 * if the course lists it (men's set), else the course's default pair.
 * "White" matches "white", "Whites", "White tees" — the round's tee is
 * free text typed on a phone.
 */
export function teeFor(course: Course | undefined, teeName?: string): { rating: number; slope: number } | null {
  if (!course) return null
  // Both sides go through teeKey, so a course tee saved as "White Tees"
  // still matches a round typed "white".
  const wanted = teeName ? teeKey(teeName) : ''
  if (wanted && course.tees) {
    const hit = course.tees.find((t) => (t.gender ?? 'M') === 'M' && teeKey(t.name) === wanted)
    if (hit) return { rating: hit.rating, slope: hit.slope }
  }
  if (course.rating != null && course.slope != null) return { rating: course.rating, slope: course.slope }
  return null
}

/**
 * Each hole's yards for the tee a round is played from, read as loosely as
 * teeFor reads the tee. When that tee's holes aren't on file, the course's
 * own yardage row (from whichever tee the card was saved with) stands in,
 * and `tee` says which tee those yards really are.
 */
export function yardsFor(course: Course | undefined, teeName?: string): { yards: (number | null)[]; tee?: string } | null {
  if (!course) return null
  const norm = (s?: string) => (s ? teeKey(s) : undefined)
  const wanted = norm(teeName)
  const full = (ys?: (number | null)[]) => !!ys && ys.length === HOLE_COUNT && ys.some((y) => y != null)
  if (wanted && course.tees) {
    const hits = course.tees.filter((t) => norm(t.name) === wanted && full(t.holeYards))
    const hit = hits.find((t) => (t.gender ?? 'M') === 'M') ?? hits[0]
    if (hit) return { yards: hit.holeYards!, tee: hit.name }
  }
  if (full(course.yards)) return { yards: course.yards!, tee: course.yardsTee }
  return null
}

/**
 * The GHIN conversion: index × (slope ÷ 113) + (rating − par). This is
 * the number the GHIN app shows per course, and the one strokes should
 * come from — a 133 slope turns a 37.3 into a 43, not a 37. Falls back
 * to the raw index where the course's rating and slope aren't in yet,
 * which is exact only on a slope-113 course but is what the app always
 * did before.
 */
export function playingHandicap(course: Course | undefined, index: number, teeName?: string): number {
  if (!hasPars(course)) return index
  const tee = teeFor(course, teeName)
  const par = coursePar(course)
  if (!tee || par == null) return index
  return Math.round(index * (tee.slope / 113) + (tee.rating - par))
}

/**
 * Stroke allocation for a whole round, off the low handicap: the best
 * player plays scratch and everyone else gets their difference, hardest
 * holes first. This is what the dots on the scorecard show, and what net
 * skins settle by. (Match play's difference-of-two is the same thing for
 * two players.) Handicaps go through the course handicap conversion
 * first when the course's rating and slope are entered.
 */
export function strokesOffLow(
  course: Course,
  players: { playerId: string; handicapSnapshot: number }[],
  teeName?: string,
): Record<string, number[]> {
  const playing = players.map((p) => ({ id: p.playerId, hcp: playingHandicap(course, p.handicapSnapshot, teeName) }))
  const low = Math.min(...playing.map((p) => p.hcp))
  return Object.fromEntries(playing.map((p) => [p.id, strokesByHole(course, p.hcp - low)]))
}

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

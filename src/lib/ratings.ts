import type { AppData, CourseRating, RatingAspect } from '../types'
import { courseSlug } from './courses'

// Course ratings and rankings, and how the group's order falls out of
// everyone's personal lists.
//
// Two separate instruments on purpose. Stars answer "how good was it?"
// on a scale everyone understands, and on a five-point scale most decent
// courses end up as a 4. The ranking answers "which would you rather
// play?", where there are no ties — so it's what actually sorts them.

export const RATING_ASPECTS: { key: RatingAspect; label: string; hint: string }[] = [
  { key: 'conditions', label: 'Conditions', hint: 'Greens, fairways, bunkers' },
  { key: 'practice', label: 'Practice area', hint: 'Range, putting green, warm-up' },
  { key: 'clubhouse', label: 'Clubhouse', hint: 'Pro shop, locker room, the place itself' },
  { key: 'food', label: 'Food & drink', hint: 'Grill, bar, the turn' },
  { key: 'service', label: 'Service', hint: 'Starter, cart girl, staff' },
]

export interface CourseSummary {
  slug: string
  name: string
  town?: string
  /** Rounds the group has logged there. */
  rounds: number
  lastPlayed?: string
  ratings: CourseRating[]
  /** Group average of the overall stars, or null with no ratings in. */
  avg: number | null
  mine?: CourseRating
  aspectAvg: Partial<Record<RatingAspect, number>>
  /** 1 = the group's favourite. Null until somebody has ranked it. */
  groupRank: number | null
  /** How many members have it on their list. */
  rankedBy: number
  /** Position on the current user's list, 1-based, or null. */
  myRank: number | null
}

/** The name a course goes by: the course record if there is one, else the most recent round's spelling, else however it was rated. */
export function courseDisplayName(data: AppData, slug: string): string {
  const course = data.courses.find((c) => c.slug === slug)
  if (course) return course.name
  const round = [...data.rounds].reverse().find((r) => courseSlug(r.courseName) === slug)
  if (round) return round.courseName
  return data.courseRatings.find((r) => r.courseSlug === slug)?.courseName ?? slug
}

export const myRanking = (data: AppData, playerId = data.currentUserId): string[] =>
  data.courseRankings.find((r) => r.playerId === playerId)?.slugs ?? []

export const ratingFor = (data: AppData, slug: string, playerId = data.currentUserId): CourseRating | undefined =>
  data.courseRatings.find((r) => r.courseSlug === slug && r.playerId === playerId)

/** Has this golfer played the course, on any logged round. */
export const hasPlayed = (data: AppData, slug: string, playerId = data.currentUserId) =>
  data.rounds.some((r) => courseSlug(r.courseName) === slug && r.players.some((rp) => rp.playerId === playerId))

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

/**
 * The group's order, from everyone's personal lists.
 *
 * Each list hands out points by position: top of a list of n scores
 * n/n, the bottom scores 1/n, so a long list and a short one carry the
 * same weight. A course's score is its average across the members who
 * ranked it, pulled a little toward the middle for each vote it lacks —
 * one person's lone #1 shouldn't leapfrog a course three people put
 * near the top. Only members count; a guest's list is theirs to keep.
 */
export function groupRankScores(data: AppData): Map<string, { score: number; rankedBy: number }> {
  const points = new Map<string, number[]>()
  for (const ranking of data.courseRankings) {
    if (!data.group.memberIds.includes(ranking.playerId)) continue
    const n = ranking.slugs.length
    ranking.slugs.forEach((slug, i) => {
      const list = points.get(slug) ?? []
      list.push((n - i) / n)
      points.set(slug, list)
    })
  }
  const out = new Map<string, { score: number; rankedBy: number }>()
  for (const [slug, list] of points) {
    const sum = list.reduce((s, x) => s + x, 0)
    // One phantom vote at the midpoint.
    out.set(slug, { score: (sum + 0.5) / (list.length + 1), rankedBy: list.length })
  }
  return out
}

/** Every course the group knows about — played, rated, or carded — with its numbers. */
export function courseSummaries(data: AppData): CourseSummary[] {
  const slugs = new Set<string>()
  for (const r of data.rounds) slugs.add(courseSlug(r.courseName))
  for (const r of data.courseRatings) slugs.add(r.courseSlug)
  for (const c of data.courses) slugs.add(c.slug)

  const scores = groupRankScores(data)
  const mine = myRanking(data)

  const rows: CourseSummary[] = [...slugs].map((slug) => {
    const rounds = data.rounds.filter((r) => courseSlug(r.courseName) === slug)
    // Ratings from people still in the group. A removed member's stars
    // shouldn't keep steering the average.
    const ratings = data.courseRatings.filter(
      (r) => r.courseSlug === slug && (data.group.memberIds.includes(r.playerId) || r.playerId === data.currentUserId),
    )
    const aspectAvg: Partial<Record<RatingAspect, number>> = {}
    for (const { key } of RATING_ASPECTS) {
      const vals = ratings.map((r) => r.aspects?.[key]).filter((v): v is number => v != null)
      const m = mean(vals)
      if (m != null) aspectAvg[key] = m
    }
    const myIndex = mine.indexOf(slug)
    return {
      slug,
      name: courseDisplayName(data, slug),
      town: data.courses.find((c) => c.slug === slug)?.town,
      rounds: rounds.length,
      lastPlayed: rounds.map((r) => r.date).sort().at(-1),
      ratings,
      avg: mean(ratings.map((r) => r.overall)),
      mine: ratings.find((r) => r.playerId === data.currentUserId),
      aspectAvg,
      groupRank: null,
      rankedBy: scores.get(slug)?.rankedBy ?? 0,
      myRank: myIndex >= 0 ? myIndex + 1 : null,
    }
  })

  // Hand out the group's ordinals: ranked courses by score, ties broken
  // by stars, then by how often the group actually plays there.
  const ranked = rows
    .filter((r) => scores.has(r.slug))
    .sort(
      (a, b) =>
        scores.get(b.slug)!.score - scores.get(a.slug)!.score ||
        (b.avg ?? 0) - (a.avg ?? 0) ||
        b.rounds - a.rounds ||
        a.name.localeCompare(b.name),
    )
  ranked.forEach((r, i) => {
    r.groupRank = i + 1
  })

  return rows
}

/** Sorted for the ratings view: best-rated first, unrated (but played) after, by how often. */
export const byRating = (rows: CourseSummary[]) =>
  [...rows].sort(
    (a, b) =>
      (b.avg ?? -1) - (a.avg ?? -1) || b.ratings.length - a.ratings.length || b.rounds - a.rounds || a.name.localeCompare(b.name),
  )

/** Sorted for the rankings view: the group's order, then everything nobody has ranked. */
export const byGroupRank = (rows: CourseSummary[]) =>
  [...rows].sort(
    (a, b) =>
      (a.groupRank ?? Infinity) - (b.groupRank ?? Infinity) || (b.avg ?? -1) - (a.avg ?? -1) || a.name.localeCompare(b.name),
  )

// List surgery for the personal ranking, kept pure so the screen and
// the store agree on what "move up" means.

export function insertAt(list: string[], slug: string, index: number): string[] {
  const without = list.filter((s) => s !== slug)
  const at = Math.max(0, Math.min(without.length, index))
  return [...without.slice(0, at), slug, ...without.slice(at)]
}

export function moveBy(list: string[], slug: string, delta: number): string[] {
  const from = list.indexOf(slug)
  if (from < 0) return list
  return insertAt(list, slug, from + delta)
}

/** "4.3" for display; stars stay to one decimal like handicaps do. */
export const fmtStars = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** "1st", "2nd", "3rd", "11th" — for the rank badge. */
export function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const suffix = (['th', 'st', 'nd', 'rd'] as const)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

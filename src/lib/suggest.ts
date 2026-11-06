import type { Course, CourseTee } from '../types'
import type { CourseMap } from './courseMap'
import { metres, type LngLat } from './geo'

// What the Log sheet works out on its own (Matt, 2026-11-06): the course
// you're standing at, from the phone's GPS against the hole maps, and the
// tees for the golfers on the round, from their indexes. Same rules as
// BanditCore/Suggest.swift.

// ---------- Where you are ----------

/** A course and where its holes are, from its hole map. */
export interface CourseSpot {
  course: Course
  points: LngLat[]
}

export interface NearbyCourse {
  course: Course
  /** To the nearest mapped hole. */
  metres: number
}

/**
 * How close to a mapped hole counts as being at the course. A course is
 * a mile across, so the car park can be a long way from the middle of
 * it, but the 1st tee and the 18th green are never far from the clubhouse.
 */
export const AT_THE_COURSE_M = 1500

/** Where a course's holes are, for "are we there": the middle of each green. */
export const spotFrom = (map: CourseMap): LngLat[] => map.holes.map((h) => h.centre)

/** Metres to the nearest mapped hole: standing on the 14th tee counts as being there. */
export function metresToCourse(points: LngLat[], at: LngLat): number | null {
  let best: number | null = null
  for (const p of points) {
    const d = metres(at, p)
    if (best == null || d < best) best = d
  }
  return best
}

/** The course you're at, or null when no mapped hole is within reach. Only courses with a hole map can say. */
export function nearestCourse(at: LngLat, spots: CourseSpot[]): NearbyCourse | null {
  let best: NearbyCourse | null = null
  for (const s of spots) {
    const d = metresToCourse(s.points, at)
    if (d == null || d > AT_THE_COURSE_M) continue
    if (!best || d < best.metres) best = { course: s.course, metres: Math.round(d) }
  }
  return best
}

// ---------- Which tees ----------

export interface TeeSuggestion {
  tee: CourseTee
  /** The yardage that suits the group, before picking the closest tee to it. */
  target: number
  /** The golfers' indexes, averaged. */
  average: number
}

/**
 * The yardage a group of this index plays comfortably: a rough reading of
 * the tee-it-forward charts, which go by driver distance, through the
 * index a golfer who hits it that far tends to carry. Scratch to 5 plays
 * about 6,600, up to 10 about 6,300, up to 15 about 6,000, up to 20 about
 * 5,700, and higher about 5,400.
 */
export function targetYards(average: number): number {
  return average <= 5 ? 6600 : average <= 10 ? 6300 : average <= 15 ? 6000 : average <= 20 ? 5700 : 5400
}

/**
 * The course's men's tee whose length is closest to what the group's
 * indexes call for; the shorter one when two are as close. Nothing
 * without tees with yardage, or without golfers.
 */
export function suggestTee(course: Course | undefined, indexes: number[]): TeeSuggestion | null {
  if (!course?.tees || !indexes.length) return null
  const tees = course.tees.filter((t) => (t.gender ?? 'M') === 'M' && t.yards != null && t.yards > 0)
  if (!tees.length) return null
  const average = indexes.reduce((s, x) => s + x, 0) / indexes.length
  const target = targetYards(average)
  const tee = tees.reduce((best, t) => {
    const d = Math.abs(t.yards! - target)
    const bd = Math.abs(best.yards! - target)
    return d < bd || (d === bd && t.yards! < best.yards!) ? t : best
  })
  return { tee, target, average }
}

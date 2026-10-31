import type { AppData, Course, Round } from '../types'
import { HOLE_COUNT, cardOf, hasCard } from './holes'
import { courseForRound, courseSlug, hasPars, padded } from './courses'
import { nth } from './bets'

// How a golfer actually plays each hole at a course: the average, the
// best, how often they've made par, and the hole that has their number.
// The big apps all show hole-by-hole history; here it feeds the course
// page (everyone who's played it twice) and the live card ("You average
// 5.8 here"). Same as BanditCore/HoleHistory.swift.

export interface HoleLine {
  /** 0-based. */
  hole: number
  par: number | null
  /** Rounds with a score on this hole. */
  played: number
  /** One decimal. */
  avg: number | null
  best: number | null
  worst: number | null
  parOrBetter: number
}

export interface HoleHistory {
  playerId: string
  /** Rounds here with a card. */
  rounds: number
  holes: HoleLine[]
  /** The hole they do worst on against par, once it's a stroke or more over. */
  nemesis: HoleLine | null
}

/** Rounds at this course whose holes line up: on a 27 only the given pairing (default: the course's first two nines). */
export function roundsAtCourse(data: AppData, course: Course, nines?: [string, string]): Round[] {
  const slug = course.slug || courseSlug(course.name)
  const fallback = course.nines && course.nines.length >= 2 ? ([course.nines[0].name, course.nines[1].name] as [string, string]) : undefined
  const want = nines ?? fallback
  return data.rounds.filter((r) => {
    if (courseSlug(r.courseName) !== slug) return false
    if (!want) return true
    const theirs = r.nines ?? fallback
    return !!theirs && theirs[0] === want[0] && theirs[1] === want[1]
  })
}

export function holeHistory(data: AppData, course: Course, playerId: string, nines?: [string, string]): HoleHistory {
  const rounds = roundsAtCourse(data, course, nines)
  const played = courseForRound(data, { courseName: course.name, nines, tee: undefined }) ?? course
  const pars = hasPars(played) ? padded(played.pars) : Array<number | null>(HOLE_COUNT).fill(null)
  const strokes: number[][] = Array.from({ length: HOLE_COUNT }, () => [])
  let withCard = 0
  for (const r of rounds) {
    const rp = r.players.find((p) => p.playerId === playerId)
    if (!rp || !hasCard(rp)) continue
    withCard++
    const card = cardOf(rp)
    for (let h = 0; h < HOLE_COUNT; h++) {
      const s = card[h]
      if (s != null) strokes[h].push(s)
    }
  }
  const holes: HoleLine[] = strokes.map((list, h) => {
    const par = pars[h] ?? null
    if (list.length === 0) return { hole: h, par, played: 0, avg: null, best: null, worst: null, parOrBetter: 0 }
    const sum = list.reduce((a, b) => a + b, 0)
    return {
      hole: h,
      par,
      played: list.length,
      avg: Math.round((sum / list.length) * 10) / 10,
      best: Math.min(...list),
      worst: Math.max(...list),
      parOrBetter: par == null ? 0 : list.filter((s) => s <= par).length,
    }
  })
  let nemesis: HoleLine | null = null
  for (const line of holes) {
    if (line.played < 2 || line.par == null || line.avg == null) continue
    const over = line.avg - line.par
    if (over < 1) continue
    const best = nemesis ? nemesis.avg! - nemesis.par! : -Infinity
    if (over > best || (over === best && line.played > nemesis!.played)) nemesis = line
  }
  return { playerId, rounds: withCard, holes, nemesis }
}

/** The live card's line for a hole, once there's something to say (two rounds here). */
export function holeHistoryLine(history: HoleHistory, hole: number, name = 'You'): string | null {
  const line = history.holes[hole]
  if (!line || line.played < 2 || line.avg == null) return null
  const verb = name === 'You' ? 'average' : 'averages'
  const head = `${name} ${verb} ${line.avg.toFixed(1)} here`
  if (line.par != null && line.avg <= line.par) return `${head}. ${name === 'You' ? 'Your' : 'Their'} kind of hole.`
  if (line.par != null && line.parOrBetter === 0 && line.played >= 3) return `${head}. Never parred it.`
  return `${head}. Best ${line.best}.`
}

/** The course page's line about the hole that has them. */
export function nemesisLine(name: string, history: HoleHistory): string | null {
  const n = history.nemesis
  if (!n || n.avg == null || n.par == null) return null
  const whose = name === 'You' ? 'Your' : `${name}’s`
  const pars = n.parOrBetter === 0 ? 'never a par' : n.parOrBetter === 1 ? 'one par' : `${n.parOrBetter} pars`
  return `${whose} nemesis is the ${nth(n.hole + 1)}: ${n.avg.toFixed(1)} on a par ${n.par}, ${pars} in ${n.played} tries.`
}

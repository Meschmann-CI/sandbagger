import { supabase } from './supabase'
import type { CourseTee } from '../types'

// The course directory (GolfCourseAPI), through our `course-lookup`
// Edge Function, which holds the key. The free plan is 35 requests a day
// for the whole group, so nothing here searches as you type: a search
// runs when someone taps for it, answers are remembered for the session,
// and a course pulled in is saved to our own courses table for good.

export interface DirectoryMatch {
  id: string
  name: string
  town: string | null
  /** The directory has pars and tees for it, not just a name. */
  hasCard: boolean
}

export interface DirectoryCourse {
  id: string
  name: string
  town: string | null
  pars: (number | null)[]
  strokeIndex: (number | null)[]
  yards: (number | null)[]
  yardsTee: string | null
  rating: number | null
  slope: number | null
  tees: CourseTee[]
  hasCard: boolean
}

export const directorySupported = () => !!supabase

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('The course directory needs the online app')
  const { data, error } = await supabase.functions.invoke<T>('course-lookup', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.text === 'function') {
      const text = await ctx.text().catch(() => '')
      if (text) throw new Error(text)
    }
    throw new Error(error.message || 'The course directory didn’t answer')
  }
  if (!data) throw new Error('Nothing came back from the course directory')
  return data
}

const memo = new Map<string, unknown>()

export async function searchDirectory(q: string): Promise<DirectoryMatch[]> {
  const key = `q:${q.trim().toLowerCase()}`
  if (memo.has(key)) return memo.get(key) as DirectoryMatch[]
  const { results } = await invoke<{ results: DirectoryMatch[] }>({ q: q.trim() })
  memo.set(key, results)
  return results
}

export async function fetchDirectoryCourse(id: string): Promise<DirectoryCourse> {
  const key = `id:${id}`
  if (memo.has(key)) return memo.get(key) as DirectoryCourse
  const { course } = await invoke<{ course: DirectoryCourse }>({ id })
  memo.set(key, course)
  return course
}

// ---------- Catching up the courses the group already has ----------
//
// Courses saved before every tee's hole-by-hole yards were kept have one
// tee's row at most. This finds each one in the directory (one search,
// one fetch) and merges in the directory's tees, which carry their own
// yards. The group's pars, stroke index and default rating are left as
// they are: someone may have corrected them against the real card.

/** A name pared down to what tells two courses apart. */
const bare = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(the|golf|courses?|clubs?|country|links|gc|cc|state|park|at)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const words = (s: string) => bare(s).split(' ').filter(Boolean)
const city = (town?: string | null) => (town ?? '').split(',')[0].trim().toLowerCase()

/**
 * The one directory match that is plainly this course, or null when it
 * isn't clear. Compared word by word rather than as a string: a club with
 * several courses comes back as "Bethpage State Park Golf Courses" plus
 * "Black", which has every word of "Bethpage Black" but isn't spelled
 * like it. Two candidates that both fit still return null; a town breaks
 * the tie when there is one.
 */
export function pickMatch(name: string, town: string | null | undefined, results: DirectoryMatch[]): DirectoryMatch | null {
  const want = words(name)
  const withCard = results.filter((r) => r.hasCard)
  const same = (r: DirectoryMatch) => {
    const w = words(r.name)
    return w.length === want.length && want.every((t) => w.includes(t))
  }
  const exact = withCard.filter(same)
  if (exact.length === 1) return exact[0]
  // Every word of ours in theirs, or every word of theirs in ours.
  const covers = (r: DirectoryMatch) => {
    const w = words(r.name)
    return want.every((t) => w.includes(t)) || (w.length > 0 && w.every((t) => want.includes(t)))
  }
  const pool = exact.length > 1 ? exact : withCard.filter(covers)
  const inTown = town ? pool.filter((r) => city(r.town) === city(town)) : pool
  if (inTown.length === 1) return inTown[0]
  return pool.length === 1 && !town ? pool[0] : null
}

/** The directory's tees, plus any of ours it doesn't list (a scanned combo tee, say). */
export function mergeTees(ours: CourseTee[] | undefined, theirs: CourseTee[]): CourseTee[] {
  const key = (t: CourseTee) => `${t.name.trim().toLowerCase()}|${t.gender ?? 'M'}`
  const seen = new Set(theirs.map(key))
  return [...theirs, ...(ours ?? []).filter((t) => !seen.has(key(t)))]
}

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

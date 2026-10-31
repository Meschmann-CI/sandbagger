import type { AppData, Course, Player, Round } from '../types'
import { supabase } from './supabase'
import { courseSlug } from './courses'

// A link anyone can open to watch a round, no account (the `watch` Edge
// Function). Minted by a member from the round page, opened by whoever
// gets the text at /#/watch/<round>.<token>, which App.tsx serves
// outside the sign-in gate (pages/PublicWatch.tsx).

/** The link for a round, from the server. Cloud mode only. */
export async function watchLink(roundId: string): Promise<string> {
  if (!supabase) throw new Error('Sharing a link needs the online app')
  const { data, error } = await supabase.functions.invoke<{ url: string }>('watch', { body: { round_id: roundId, site: window.location.origin } })
  if (error || !data?.url) throw new Error('Couldn’t make the link right now')
  return data.url
}

/** Shares it the way the phone does, or copies it. Returns true when it was copied rather than shared. */
export async function shareWatchLink(round: Round, url: string): Promise<boolean> {
  const title = `Watch ${round.courseName}`
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text: `Follow our round at ${round.courseName} live.`, url })
      return false
    } catch {
      // Cancelled, or not allowed here: copy instead.
    }
  }
  await navigator.clipboard.writeText(url)
  return true
}

/** What the public page gets back: the round, first names, the course's pars. */
export interface WatchView {
  round: Pick<Round, 'id' | 'courseName' | 'date' | 'tee' | 'nines' | 'players'>
  players: Pick<Player, 'id' | 'name' | 'initials' | 'color'>[]
  course: { name: string; pars: (number | null)[]; strokeIndex?: (number | null)[]; nines?: Course['nines'] } | null
}

/** Fetches the view for a link's key ("<round>.<token>"). */
export async function fetchWatchView(key: string): Promise<WatchView> {
  const [roundId, token] = key.split('.')
  const base = import.meta.env.VITE_SUPABASE_URL?.trim()
  if (!base || !roundId || !token) throw new Error('That link is not one of ours')
  const r = await fetch(`${base}/functions/v1/watch?r=${encodeURIComponent(roundId)}&t=${encodeURIComponent(token)}`, { cache: 'no-store' })
  if (!r.ok) throw new Error((await r.text().catch(() => '')) || 'That link didn’t work')
  return (await r.json()) as WatchView
}

/** The view as the shape the live-round helpers read (liveLines, courseForRound). */
export function dataFromView(view: WatchView): { data: AppData; round: Round } {
  const round: Round = { ...view.round, groupId: 'public', players: view.round.players.map((rp) => ({ ...rp, handicapSnapshot: 0 })) }
  const course: Course | null = view.course
    ? { id: 'public', groupId: 'public', name: view.course.name, slug: courseSlug(view.course.name), pars: view.course.pars, strokeIndex: view.course.strokeIndex, nines: view.course.nines }
    : null
  const data: AppData = {
    players: view.players.map((p) => ({ ...p, handicap: 0 })),
    group: { id: 'public', name: '', inviteCode: '', adminId: '', memberIds: view.players.map((p) => p.id) },
    courses: course ? [course] : [],
    courseRatings: [],
    courseRankings: [],
    rounds: [round],
    trips: [],
    bets: [],
    expenses: [],
    payments: [],
    currentUserId: '',
  }
  return { data, round }
}

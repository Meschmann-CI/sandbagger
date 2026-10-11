import { fetchCourseMap, saveCourseMap } from './courseMap'
import { holdUpdates } from './holdUpdates'
import type { Course } from '../types'

// Pulling hole maps, outside any one screen.
//
// It used to run inside the Courses page, so moving to another tab cut
// it off and coming back showed a fresh card as if nothing had happened.
// Now the queue lives here: it carries on while you move around the app,
// any screen can show its progress, and the courses still to do are kept
// on the phone, so a run cut short by the app closing picks up where it
// left off the next time the app is open.

const QUEUE_KEY = 'bandit-map-queue-v1'

export interface MapJobState {
  running: boolean
  /** 1-based position in the current run, and its length. */
  at: number
  of: number
  current: string | null
  added: string[]
  missed: string[]
  busy: string[]
  /** Course ids saved during this session, so lists can update without a refetch. */
  done: string[]
}

let state: MapJobState = { running: false, at: 0, of: 0, current: null, added: [], missed: [], busy: [], done: [] }
let queue: Course[] = []
const listeners = new Set<() => void>()

const emit = (next: Partial<MapJobState>) => {
  state = { ...state, ...next }
  for (const l of listeners) l()
}
const persist = () => {
  try {
    if (queue.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
    else localStorage.removeItem(QUEUE_KEY)
  } catch {
    // Not kept; a closed app just won't resume.
  }
}

export const mapJobState = () => state
export function onMapJobChange(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
/** Courses this phone found no usable map for, per group: not tried again by Get them. */
export const skippedKey = (groupId: string) => `bandit-maps-skipped:v1:${groupId}`
export function skippedMaps(groupId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(skippedKey(groupId)) ?? '[]') as string[]
  } catch {
    return []
  }
}
function skip(c: Course) {
  try {
    localStorage.setItem(skippedKey(c.groupId), JSON.stringify([...new Set([...skippedMaps(c.groupId), c.id])]))
  } catch {
    // Not remembered; it's tried again next time.
  }
}

/** Adds courses to the queue (skipping ones already in it) and starts it if it isn't going. */
export function queueMaps(courses: Course[]) {
  const have = new Set(queue.map((c) => c.id))
  const fresh = courses.filter((c) => !have.has(c.id))
  if (!fresh.length) return
  queue.push(...fresh)
  persist()
  if (!state.running) void run(true)
  else emit({ of: state.of + fresh.length })
}

/** Carries on a run the app was closed in the middle of. */
export function resumeMaps() {
  if (state.running) return
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    const saved = raw ? (JSON.parse(raw) as Course[]) : []
    if (saved.length) {
      queue = saved
      void run(true)
    }
  } catch {
    // Nothing to resume.
  }
}

async function run(fresh: boolean) {
  const release = holdUpdates() // a new version won't reload the app under a run
  emit({ running: true, at: 0, of: queue.length, current: null, ...(fresh ? { added: [], missed: [], busy: [] } : {}) })
  let at = 0
  try {
    while (queue.length) {
      const c = queue[0]
      at++
      emit({ at, current: c.name })
      try {
        const r = await fetchCourseMap(c)
        if (r.map) {
          await saveCourseMap(c, r.map, false)
          emit({ added: [...state.added, c.name], done: [...state.done, c.id] })
        } else {
          skip(c)
          emit({ missed: [...state.missed, c.name] })
        }
      } catch {
        // OpenStreetMap busy: leave it for another try and take a breather.
        emit({ busy: [...state.busy, c.name] })
        await new Promise((r) => setTimeout(r, 15000))
      }
      queue.shift()
      persist()
      await new Promise((r) => setTimeout(r, 1200))
    }
  } finally {
    release()
    emit({ running: false, current: null })
  }
}

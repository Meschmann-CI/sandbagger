import type { AppData } from '../types'
import type { Backend, Change } from './backend'

// Writes that couldn't reach the server yet.
//
// The service worker gets the app to open on the back nine; this gets
// what you type there to survive the walk back. A failed write used to
// surface as "that didn't save — reload to check", which threw away the
// score someone had just tapped in. Now it waits in a queue on the device
// and goes out when there's signal again.
//
// Only the cloud backend is wrapped: localStorage writes don't fail for
// want of a network.

const STORAGE_KEY = 'sandbagger-outbox-v1'

interface Queued {
  id: string
  change: Change
}

let queue: Queued[] = restore()
let flushing = false
// Set when a flush is asked for while one is already running. Without it
// the reconnect gets swallowed: the in-flight attempt is still waiting on
// a request that was doomed before the network came back, so it fails,
// exits, and nothing is left to notice that the connection returned.
let rerun = false
let lastError: string | null = null
const listeners = new Set<() => void>()

// Direct sends (not queued) that haven't settled yet, and how many writes
// the server has refused since the module loaded. Together they let a
// caller wait for "everything I handed over has landed" (whenSettled).
let inflight = 0
let refusals = 0
const waiters: Array<{ since: number; resolve: (ok: boolean) => void }> = []

/**
 * Thrown by a backend when a write can't be judged right now: no session
 * to send it with (the token expired while the phone slept and the refresh
 * hasn't happened yet), or the server answered 401. The outbox keeps the
 * change and retries, exactly as it would for no signal. Without this an
 * anon-key request bounces off row-level security with the same message a
 * genuine refusal has, and the score is dropped as poison.
 */
export class RetryLater extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RetryLater'
  }
}

function restore(): Queued[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as Queued[]) : []
  } catch {
    return []
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // Out of storage. The queue still lives in memory for this session.
  }
}

function announce() {
  persist()
  for (const listener of listeners) listener()
  settle()
}

// Wakes whenSettled callers once nothing is queued or in flight. A waiter
// gets `false` if any write was refused after it started waiting.
function settle() {
  if (inflight > 0 || flushing || queue.length > 0) return
  while (waiters.length > 0) {
    const w = waiters.shift()!
    w.resolve(refusals === w.since)
  }
}

/**
 * Resolves once every write handed to apply so far has either reached the
 * server or been refused: `true` if they all landed, `false` if the server
 * rejected one in the meantime. A queued write keeps this waiting until the
 * connection returns. For cleanup that must not run ahead of the row it
 * depends on, such as deleting the old logo file only after the course row
 * stopped pointing at it.
 */
export function whenSettled(): Promise<boolean> {
  return new Promise((resolve) => {
    waiters.push({ since: refusals, resolve })
    settle()
  })
}

/** For useSyncExternalStore. Returns a stable string so React can compare it. */
export const outboxSnapshot = () => `${queue.length}:${lastError ?? ''}`

export const outboxStatus = () => ({ pending: queue.length, error: lastError })

export function onOutboxChange(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// A dropped connection looks different depending on where it broke, and
// none of the variants are worth losing a score over. A genuine rejection
// from the server — a permission error, a bad row — is not this, and has
// to surface instead of retrying forever.
export function looksLikeConnectivity(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (error instanceof TypeError) return true // fetch() rejects with this
  if (error instanceof RetryLater) return true
  // A missing or stale token is a connectivity problem in disguise: the
  // write is fine, the phone just can't prove who it is until the refresh
  // goes through. PostgREST says PGRST301 / "JWT expired", storage says 401.
  const status = typeof error === 'object' && error !== null ? (error as { status?: unknown; statusCode?: unknown }) : null
  if (status && (status.status === 401 || status.statusCode === 401 || status.statusCode === '401')) return true
  const message = error instanceof Error ? error.message : String(error)
  if (/\bjwt\b|expired|pgrst30[12]|unauthorized|\b401\b(?![0-9a-f-])/i.test(message)) return true
  return /failed to fetch|networkerror|network request failed|load failed|timeout|econn|offline/i.test(message)
}

export function withOutbox(inner: Backend): Backend {
  // The cloud backend derives everything it writes from the change
  // itself and ignores this argument; it's only in the signature because
  // the localStorage backend rewrites its whole snapshot. Holding the
  // last one we saw keeps the types honest on replay.
  let latest: AppData | null = null

  const send = async (change: Change) => inner.apply(change, latest as AppData)

  const flush = async () => {
    if (flushing) {
      rerun = true
      return
    }
    if (queue.length === 0) return
    flushing = true
    try {
      do {
        rerun = false
        while (queue.length > 0) {
          const next = queue[0]
          try {
            await send(next.change)
          } catch (error) {
            if (looksLikeConnectivity(error)) break // still offline; try again later
            // The server refused this one. Retrying can only fail the
            // same way, and leaving it at the front would block
            // everything behind it, so drop it and say so.
            lastError = error instanceof Error ? error.message : String(error)
            refusals++
            queue.shift()
            announce()
            continue
          }
          queue.shift()
          lastError = null
          announce()
        }
      } while (rerun)
    } finally {
      flushing = false
      announce()
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => void flush())
    // Coming back to the app is as good a moment as any to retry.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void flush()
    })
    void flush()
  }

  return {
    ...inner,

    async apply(change: Change, next: AppData) {
      latest = next

      // Anything already waiting has to go first, or a round could land
      // after the edit that was meant to follow it.
      if (queue.length > 0) {
        queue.push({ id: `${Date.now()}-${queue.length}`, change })
        announce()
        void flush()
        return
      }

      inflight++
      try {
        await send(change)
        if (lastError) {
          lastError = null
          announce()
        }
      } catch (error) {
        if (!looksLikeConnectivity(error)) {
          refusals++
          throw error
        }
        queue.push({ id: `${Date.now()}-0`, change })
        announce()
      } finally {
        inflight--
        settle()
      }
    },
  }
}

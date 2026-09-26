import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { Round, RoundPhoto } from '../types'
import { uploadRoundPhoto } from '../lib/photos'

// Photos taken where there's no signal.
//
// Scores already queue on the phone and go out from the parking lot
// (outbox.ts). A photo taken on the 14th tee deserves the same: it
// waits here, shows on the round straight away as "waiting for signal",
// and uploads itself when the network is back. The shared round record
// only learns about the photo once the file is actually up, so nobody
// else ever sees a broken image.
//
// localStorage holds a few megabytes, and a shrunk photo is ~300KB, so
// this is good for a dozen or so. Past that the enqueue fails loudly
// rather than silently losing the newest one.

const STORAGE_KEY = 'sandbagger-photo-outbox-v1'

export interface PendingPhoto {
  id: string
  roundId: string
  byId: string
  takenAt: string
  dataUrl: string
}

let queue: PendingPhoto[] = restore()
let flushing = false
const listeners = new Set<() => void>()

function restore(): PendingPhoto[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as PendingPhoto[]) : []
  } catch {
    return []
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
}

function announce() {
  for (const l of listeners) l()
}

/** Throws when the phone's storage is full — the caller tells the golfer. */
export function enqueuePhoto(item: PendingPhoto) {
  queue = [...queue, item]
  try {
    persist()
  } catch {
    queue = queue.filter((q) => q.id !== item.id)
    throw new Error('Too many photos waiting for signal — try this one again when you’re back online.')
  }
  announce()
}

export const pendingPhotosFor = (roundId: string) => queue.filter((q) => q.roundId === roundId)
const snapshot = () => queue.map((q) => q.id).join(',')
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function usePendingPhotos(roundId: string): PendingPhoto[] {
  useSyncExternalStore(subscribe, snapshot, () => '')
  return pendingPhotosFor(roundId)
}

/**
 * Mounted once in the shell. Whenever the network comes back or the app
 * is brought forward, uploads whatever is waiting and attaches each
 * photo to its round.
 */
export function usePhotoOutboxFlush(rounds: Round[], updateRound: (round: Round) => void) {
  const roundsRef = useRef(rounds)
  roundsRef.current = rounds
  const updateRef = useRef(updateRound)
  updateRef.current = updateRound

  useEffect(() => {
    const flush = async () => {
      if (flushing || queue.length === 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
      flushing = true
      try {
        for (const item of [...queue]) {
          const round = roundsRef.current.find((r) => r.id === item.roundId)
          if (!round) {
            // The round was deleted while the photo waited. Nothing to attach it to.
            queue = queue.filter((q) => q.id !== item.id)
            persist()
            announce()
            continue
          }
          try {
            const photo: RoundPhoto = await uploadRoundPhoto(item.dataUrl, round, item.id, item.byId, item.takenAt)
            const latest = roundsRef.current.find((r) => r.id === item.roundId) ?? round
            updateRef.current({ ...latest, photos: [...(latest.photos ?? []), photo] })
            queue = queue.filter((q) => q.id !== item.id)
            persist()
            announce()
          } catch {
            // Still no signal, or the bucket said no. Leave it and try later.
            break
          }
        }
      } finally {
        flushing = false
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void flush()
    }
    window.addEventListener('online', flush)
    document.addEventListener('visibilitychange', onVisible)
    void flush()
    return () => {
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}

import type { AppData } from '../types'
import type { Backend, Change } from './backend'
import { seedData } from './seed'

const STORAGE_KEY = 'sandbagger-v4'

// Local mode keeps the whole app state in one localStorage blob. The
// change descriptor is irrelevant here — we just rewrite the snapshot.
export const localBackend: Backend = {
  cloud: false,

  async load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as AppData
        // A snapshot saved before a collection existed doesn't have it.
        // Backfilling here beats making every screen defensive about it,
        // and beats bumping the storage key, which would throw away
        // whatever the browser is already holding.
        return { ...stored, courses: stored.courses ?? [] }
      }
    } catch {
      // fall through to the sample data
    }
    return seedData
  },

  async apply(change: Change, next: AppData) {
    if (change.kind === 'reset') {
      // Clear and stop, so the next load falls back to the sample data.
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Browser storage is only a few megabytes and trip photos are the
      // one thing big enough to fill it.
      alert("Couldn't save — browser storage is full. Remove a photo or two and try again.")
    }
  },
}

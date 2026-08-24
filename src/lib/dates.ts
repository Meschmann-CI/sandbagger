// Dates in this app are plain yyyy-mm-dd strings in the golfer's own
// timezone — the date on the scorecard, not an instant in time.
//
// `new Date().toISOString()` is UTC, so an evening round on the US east
// coast gets stamped with tomorrow's date and lands in the wrong day on
// every screen that compares against today. Build the string from the
// local calendar fields instead.

const pad = (n: number) => String(n).padStart(2, '0')

export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * Today, locally. Call this per render rather than caching it at module
 * load — the app sits open on a phone overnight and a stale "today"
 * quietly misfiles the next morning's round.
 */
export const todayISO = () => toISODate(new Date())

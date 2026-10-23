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

/** The local date n days back, for "recent enough to still ask about" cut-offs. */
export const daysAgoISO = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toISODate(d)
}

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000

/** Whole days from one yyyy-mm-dd to another, by the calendar (DST can't shave one off). */
export const daysBetween = (from: string, to: string) => Math.round(dayNumber(to) - dayNumber(from))

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Nov 4" from "2026-11-04". */
export const shortDay = (iso: string) => `${MONTHS_SHORT[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`

/** "Wed" for "2026-11-04". */
export const weekdayShort = (iso: string) =>
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay()]

/** "Saturday" for "2026-11-01". */
export const weekdayName = (iso: string) =>
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay()]

/** "Nov 4 – 7", or "Oct 30 – Nov 2" across a month. */
export function tripDateRange(start?: string, end?: string): string | undefined {
  if (!start) return undefined
  if (!end || end === start) return shortDay(start)
  return `${shortDay(start)} – ${start.slice(0, 7) === end.slice(0, 7) ? +end.slice(8, 10) : shortDay(end)}`
}

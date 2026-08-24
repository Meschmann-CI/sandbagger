// Sanity check for a typed gross score.
//
// The places a score can be entered each had their own idea of a legal
// number, and the quick-add on a round had none at all. A mistyped "8"
// for "80" goes straight into the lifetime record and quietly rewrites
// the leaderboard.
//
// The rule is to flag, never to correct. Silently turning someone's 8
// into an 18 is worse than storing the 8: they can see a warning and fix
// it, but they can't see a number the app changed behind their back. The
// bounds below only stop the +/− steppers running away.

/** An ace on every hole — nothing below this is a round. */
export const GROSS_FLOOR = 18
export const GROSS_CEILING = 200

// The band where no comment is warranted.
const TYPICAL_LOW = 50
const TYPICAL_HIGH = 160

/** A nudge to show under the input, or null when the number looks normal. */
export function grossWarning(n: number): string | null {
  if (!Number.isFinite(n)) return null
  if (n < TYPICAL_LOW) return `${n} is very low for eighteen holes — check the number?`
  if (n > TYPICAL_HIGH) return `${n} is very high — check the number?`
  return null
}

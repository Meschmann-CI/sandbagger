// Milestone watch on the live card: what the rest of the round has to be
// to break 100, 90, 80 or 70. "Bogey golf from here breaks 90." Shown
// once the back half is in sight. Same as BanditCore/Milestone.swift.

export const MILESTONES = [70, 80, 90, 100]
/** Holes in before the watch starts talking. */
export const MILESTONE_AFTER = 9

export interface MilestoneWatch {
  target: number
  /** Holes still to play. */
  left: number
  /** Strokes over par the rest can take and still break it (negative: needs birdies). */
  spare: number
  line: string
}

export function milestoneWatch(card: (number | null)[], pars: (number | null)[]): MilestoneWatch | null {
  const played = card.map((s, i) => (s != null ? i : -1)).filter((i) => i >= 0)
  if (played.length < MILESTONE_AFTER || played.length >= card.length) return null
  if (pars.some((p) => p == null)) return null
  const strokes = played.reduce((sum, i) => sum + (card[i] as number), 0)
  const rest = card.map((s, i) => (s == null ? i : -1)).filter((i) => i >= 0)
  const left = rest.length
  const parLeft = rest.reduce((sum, i) => sum + (pars[i] as number), 0)
  for (const target of MILESTONES) {
    // The most the rest can total and still come in under the number.
    // The lowest number still in reach is the one worth chasing.
    const spare = target - 1 - strokes - parLeft
    if (spare < 0) continue
    return { target, left, spare, line: milestoneLine(target, left, spare) }
  }
  return null
}

export function milestoneLine(target: number, left: number, spare: number): string {
  if (left === 1) {
    if (spare === 0) return `Par the last hole and you break ${target}.`
    if (spare === 1) return `A bogey on the last still breaks ${target}.`
    return `A double on the last still breaks ${target}.`
  }
  const holes = `the last ${left}`
  if (spare >= left * 2) return `Double bogeys the rest of the way still break ${target}.`
  if (spare >= left) {
    const extra = spare - left
    return extra > 0 ? `Bogey golf from here breaks ${target}, with ${extra} to spare.` : `Bogey golf from here breaks ${target}.`
  }
  if (spare === 0) return `Par ${holes} and you break ${target}.`
  return `${spare} ${spare === 1 ? 'bogey' : 'bogeys'} in ${holes} still ${spare === 1 ? 'breaks' : 'break'} ${target}.`
}

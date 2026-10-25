import type { Round, RoundPlayer } from '../types'
import { HOLE_COUNT } from './holes'

// What a save actually changed on a round, so phones sharing a card on the
// course merge instead of overwriting each other (Matt, 2026-10-22). Each
// phone used to write every golfer's whole card from its own copy: a phone
// that lost signal for three holes would come back and blank the holes the
// others had entered meanwhile. Now a save sends only the holes, putts and
// totals it changed, and merge_round_scores (schema.sql) lays them onto
// what the server has, hole by hole. Same rules as BanditCore/ScorePatch.swift.

/** A cleared hole or putt, since the patch maps can't carry null in Swift. */
export const CLEARED = -1

export type PuttsMode = 'unset' | 'off' | 'on'

const puttsMode = (rp?: RoundPlayer): PuttsMode => (rp?.putts == null ? 'unset' : rp.putts.length === 0 ? 'off' : 'on')

export interface ScorePatch {
  playerId: string
  handicapSnapshot: number
  /** Hole index (0-based, as a string) to strokes, or CLEARED. */
  holes?: Record<string, number>
  putts?: Record<string, number>
  /**
   * Putts tracking, when this save changed it: never said (unset), said
   * no (off, an empty list), or tracking (on, 18 entries).
   */
  puttsMode?: PuttsMode
  /** The total, when the save set it (typed in, or cleared). */
  grossSet?: boolean
  gross?: number | null
}

/**
 * The round's own fields a save can change. The backend writes only the
 * ones in `changed`, so a phone that set the green fee doesn't put its
 * stale photos back over the ones another phone added (audit 2026-10-24).
 */
export const ROUND_FIELDS = ['date', 'courseName', 'tee', 'tripId', 'notes', 'saddamOnTheLine', 'ghosts', 'photos', 'nines', 'greenFee', 'teeTime', 'bookedById'] as const
export type RoundField = (typeof ROUND_FIELDS)[number]

export interface RoundPatch {
  round: Round
  /** Anything besides the scores changed: the round row is written too. */
  roundChanged: boolean
  /** Which of the round's own fields changed. Empty with roundChanged set means something unlisted did. */
  changed: RoundField[]
  scores: ScorePatch[]
  /** Golfers taken off the round by this save. */
  removed: string[]
}

function cells(before: (number | null)[] | undefined, after: (number | null)[] | undefined) {
  const out: Record<string, number> = {}
  for (let i = 0; i < HOLE_COUNT; i++) {
    const a = before?.[i] ?? null
    const b = after?.[i] ?? null
    if (a !== b) out[String(i)] = b ?? CLEARED
  }
  return Object.keys(out).length ? out : undefined
}

function playerPatch(before: RoundPlayer | undefined, after: RoundPlayer): ScorePatch | null {
  const holes = cells(before?.holes, after.holes)
  const putts = cells(before?.putts, after.putts)
  const mode = !before || puttsMode(before) !== puttsMode(after) ? puttsMode(after) : undefined
  const grossSet = !before || (before.gross ?? null) !== (after.gross ?? null)
  const hcpChanged = !before || before.handicapSnapshot !== after.handicapSnapshot
  if (!holes && !putts && mode === undefined && !grossSet && !hcpChanged) return null
  return {
    playerId: after.playerId,
    handicapSnapshot: after.handicapSnapshot,
    ...(holes ? { holes } : {}),
    ...(putts ? { putts } : {}),
    ...(mode !== undefined ? { puttsMode: mode } : {}),
    ...(grossSet ? { grossSet: true, gross: after.gross ?? null } : {}),
  }
}

/** The difference between two versions of a round, or null when there's no earlier one to diff against. */
export function roundPatch(before: Round | undefined, after: Round): RoundPatch | null {
  if (!before) return null
  // Top-level keys sorted and unset ones dropped, so key order and an
  // explicit undefined don't read as a change.
  const strip = ({ players: _players, ...rest }: Round) =>
    JSON.stringify(Object.entries(rest).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)))
  const scores = after.players
    .map((rp) => playerPatch(before.players.find((p) => p.playerId === rp.playerId), rp))
    .filter((p): p is ScorePatch => p !== null)
  const removed = before.players.filter((p) => !after.players.some((q) => q.playerId === p.playerId)).map((p) => p.playerId)
  const same = (k: RoundField) => JSON.stringify(before[k] ?? null) === JSON.stringify(after[k] ?? null)
  const changed = ROUND_FIELDS.filter((k) => !same(k))
  return { round: after, roundChanged: strip(before) !== strip(after), changed, scores, removed }
}

/**
 * The patch laid onto a round, the way the server's merge_round_scores
 * does it. Used where the function isn't there yet, and by the tests.
 */
export function applyScorePatch(rp: RoundPlayer | undefined, s: ScorePatch): RoundPlayer {
  const lay = (base: (number | null)[] | undefined, changes: Record<string, number>) => {
    const out = Array.from({ length: HOLE_COUNT }, (_, i) => base?.[i] ?? null)
    for (const [k, v] of Object.entries(changes)) out[Number(k)] = v === CLEARED ? null : v
    return out
  }
  let holes = rp?.holes
  if (s.holes) {
    const laid = lay(holes, s.holes)
    holes = laid.some((h) => h != null) ? laid : undefined
  }
  let putts = rp?.putts
  if (s.puttsMode === 'unset') putts = undefined
  if (s.puttsMode === 'off') putts = []
  if (s.puttsMode === 'on' && (putts?.length ?? 0) < HOLE_COUNT) putts = lay(putts, {})
  if (s.putts) putts = lay(putts, s.putts)
  let gross = rp?.gross ?? null
  if (s.grossSet) gross = s.gross ?? null
  const card = Array.from({ length: HOLE_COUNT }, (_, i) => holes?.[i] ?? null)
  if (card.every((h) => h != null)) gross = card.reduce<number>((a, h) => a + (h ?? 0), 0)
  // A card with holes in it that isn't finished has no total yet, whatever
  // the saving phone's copy added up to (audit 2026-10-24).
  else if (s.holes && card.some((h) => h != null)) gross = null
  return { playerId: s.playerId, handicapSnapshot: s.handicapSnapshot, gross, holes, putts }
}

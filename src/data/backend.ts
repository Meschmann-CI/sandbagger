import type { RoundPatch } from '../lib/scorePatch'
import type { AppData, Bet, Chirp, Course, CourseRanking, CourseRating, Expense, Group, Payment, Player, Round, Trip } from '../types'

// Every mutation the app can make. The store applies the change to its
// own state optimistically and hands the same descriptor to the backend,
// so localStorage and Supabase share one code path in the UI.
export type Change =
  | { kind: 'round.upsert'; round: Round }
  // A save of a round that already exists: only what changed, merged hole
  // by hole on the server, so phones sharing a card don't overwrite each
  // other (src/lib/scorePatch.ts).
  | { kind: 'round.patch'; patch: RoundPatch }
  | { kind: 'round.delete'; id: string }
  | { kind: 'course.upsert'; course: Course }
  | { kind: 'course.delete'; id: string }
  // Renames the course and every round, rating and list that names it,
  // in one transaction on the server (rename_course in schema.sql).
  | { kind: 'course.rename'; oldSlug: string; name: string }
  | { kind: 'courseRating.upsert'; rating: CourseRating }
  | { kind: 'courseRating.delete'; id: string }
  // One row per golfer, rewritten whole: a ranking is edited as a unit
  // and only ever by its owner, so there's nothing to clobber.
  | { kind: 'courseRanking.upsert'; ranking: CourseRanking }
  | { kind: 'bet.upsert'; bet: Bet }
  | { kind: 'bet.delete'; id: string }
  | { kind: 'trip.upsert'; trip: Trip }
  | { kind: 'trip.delete'; id: string }
  // Votes get their own change because several people cast them at once.
  // Writing the whole trip back would drop whichever vote landed first.
  | { kind: 'trip.vote'; tripId: string; optionId: string }
  | { kind: 'player.upsert'; player: Player }
  | { kind: 'player.delete'; id: string }
  | { kind: 'expense.upsert'; expense: Expense }
  | { kind: 'expense.delete'; id: string }
  | { kind: 'payment.upsert'; payment: Payment }
  // A reaction from someone watching a live round. Insert-only: nothing edits a chirp.
  | { kind: 'chirp.add'; chirp: Chirp }
  | { kind: 'payment.delete'; id: string }
  | { kind: 'group.upsert'; group: Group }
  | { kind: 'session.currentUser'; playerId: string }
  | { kind: 'reset' }

export interface Backend {
  readonly cloud: boolean
  load(): Promise<AppData>
  apply(change: Change, next: AppData): Promise<void>
  /** Fires when another device changes something. Cloud only. */
  subscribe?(onRemoteChange: () => void): () => void
}

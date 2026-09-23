import type { AppData, Bet, Course, CourseRanking, CourseRating, Expense, Group, Payment, Player, Round, Trip } from '../types'

// Every mutation the app can make. The store applies the change to its
// own state optimistically and hands the same descriptor to the backend,
// so localStorage and Supabase share one code path in the UI.
export type Change =
  | { kind: 'round.upsert'; round: Round }
  | { kind: 'round.delete'; id: string }
  | { kind: 'course.upsert'; course: Course }
  | { kind: 'course.delete'; id: string }
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

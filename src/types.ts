// Core data model. Mirrors the eventual Supabase schema so the storage
// adapter can be swapped without touching UI code.

export interface Player {
  id: string
  name: string
  initials: string
  homeCourse?: string
  handicap: number // GHIN-style index, one decimal (e.g. 16.9)
  color: string // avatar hue, assigned at join time
  // Set when someone is added before they've signed in — their first
  // magic-link login claims the profile with this address.
  email?: string
  // Their Venmo username, so settling up is one tap. Nothing is linked
  // and no account is connected: a handle is public, and it only goes
  // into building a link.
  venmo?: string
}

// Handing the Saddam over by hand. The trophy predates the app and can
// change hands over things the app never sees, so this sets the starting
// point and logged group rounds after that date take over again.
export interface SaddamAward {
  playerId: string
  date: string
  note?: string
}

export interface Group {
  id: string
  name: string
  inviteCode: string
  adminId: string
  memberIds: string[]
  saddamAward?: SaddamAward
}

export interface RoundPlayer {
  playerId: string
  // null means "played, score not in yet" — whoever logged the round
  // didn't know it. The player fills it in themselves later.
  gross: number | null
  handicapSnapshot: number
  holes?: (number | null)[] // 18 entries when per-hole entry was used
}

export interface ScoredRoundPlayer extends RoundPlayer {
  gross: number
}

export const hasScore = (rp: RoundPlayer): rp is ScoredRoundPlayer => rp.gross != null

// ---------- Courses ----------

// Par and the stroke index come off the physical scorecard, entered once
// per course and reused by every round played there. There's no reliable
// free source to look them up from: the authoritative database isn't
// public, and a wrong par silently poisons every score-to-par in the app.
//
// Rounds still record the course as free text, the way they always have.
// A round is matched to its course by `slug`, so filling this in reaches
// backwards through history without touching a single existing round.
export interface Course {
  id: string
  groupId: string
  name: string
  /** The course name, normalised. How a round's free text finds this record. */
  slug: string
  /** 18 entries. Nulls while it's still being filled in. */
  pars: (number | null)[]
  /** 18 entries, each hole's 1-18 difficulty ranking. Optional: only the bets need it. */
  strokeIndex?: (number | null)[]
}

export interface Round {
  id: string
  groupId: string
  date: string // ISO yyyy-mm-dd
  courseName: string
  tee?: string
  tripId?: string
  players: RoundPlayer[]
  notes?: string
}

// ---------- Itinerary ----------

export type ItineraryKind = 'tee' | 'meal' | 'lodging' | 'flight' | 'other'

// Flights and housing span the trip rather than sitting in one day's
// schedule, so they render in their own section.
export const SPANNING_KINDS: ItineraryKind[] = ['lodging', 'flight']

export interface Review {
  playerId: string
  rating: number // 1-5
  comment?: string
}

export interface ItineraryItem {
  id: string
  date: string
  endDate?: string // lodging check-out, or a return flight date
  time?: string
  title: string
  kind: ItineraryKind
  note?: string
  url?: string
  confirmation?: string
  cost?: number // total dollars, optional
  photos?: string[] // data URLs, added by hand
  previewImage?: string // pulled from the booking link when available
  siteName?: string
  reviews?: Review[]
}

// ---------- Trips ----------

// A candidate destination while a trip is still in the planning stage.
export interface TripOption {
  id: string
  title: string // e.g. "Scottsdale, AZ"
  note?: string
  pros: string[]
  cons: string[]
  votes: string[] // playerIds; one vote per player per trip
}

export type TripStatus = 'planning' | 'booked'

export interface Trip {
  id: string
  groupId: string
  name: string
  status: TripStatus
  location?: string // set once a destination is locked in
  startDate?: string
  endDate?: string
  note?: string
  // Only these golfers can see the trip, vote on it, or appear in its
  // cost splits. The creator manages the list.
  attendeeIds: string[]
  createdById: string
  options: TripOption[]
  chosenOptionId?: string
  itinerary: ItineraryItem[]
}

export const canSeeTrip = (trip: Trip, playerId: string) =>
  trip.attendeeIds.includes(playerId) || trip.createdById === playerId

// ---------- Money ----------

export type ExpenseCategory = 'lodging' | 'golf' | 'travel' | 'food' | 'other'

export interface Expense {
  id: string
  tripId: string
  description: string
  amount: number
  category: ExpenseCategory
  paidById: string
  sharedByIds: string[] // split evenly among these golfers
  date?: string
}

// A payback between two golfers, so settled debts stop showing up. It
// belongs to whichever it settled: a trip's costs, or the bets on a
// single round. Exactly one of these is set.
export interface Payment {
  id: string
  tripId?: string
  roundId?: string
  fromId: string
  toId: string
  amount: number
  date?: string
}

// ---------- Bets ----------

export type BetType = 'nassau' | 'skins' | 'match' | 'custom'

export interface BetResult {
  playerId: string
  amount: number // positive = won money, negative = lost
}

export interface Bet {
  id: string
  roundId: string
  type: BetType
  name: string
  stake: number
  results: BetResult[]
}

export interface AppData {
  players: Player[]
  group: Group
  courses: Course[]
  rounds: Round[]
  trips: Trip[]
  bets: Bet[]
  expenses: Expense[]
  payments: Payment[]
  currentUserId: string
}

// Rounded to one decimal so binary float noise can't turn a genuine
// tie into a 0.0000001 margin.
export const round1 = (n: number) => Math.round(n * 10) / 10

export const net = (rp: ScoredRoundPlayer) => round1(rp.gross - rp.handicapSnapshot)

// Everything downstream ignores players whose score isn't in yet, so a
// round quietly becomes competitive the moment the second card lands.
export const scored = (r: Round): ScoredRoundPlayer[] => r.players.filter(hasScore)
export const pending = (r: Round) => r.players.filter((rp) => !hasScore(rp))

// Group rounds (2+ posted scores) are the only ones that count for wins,
// streaks, head-to-head, and the Saddam. Solo rounds still count for
// personal stats and averages.
export const isGroupRound = (r: Round) => scored(r).length >= 2

// Whether it was played alone, which is about who teed off — not about
// whose card has come in yet. Keep these apart: a foursome with one score
// posted is not a solo round.
export const isSoloRound = (r: Round) => r.players.length === 1

// Handicaps and net scores carry one decimal, GHIN-style.
export const fmt1 = (n: number) => n.toFixed(1)

// First and last initial where there's a surname, otherwise the first two
// letters. Always overridable — a nickname beats a derivation.
export function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  const base = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)
  return base.toUpperCase()
}

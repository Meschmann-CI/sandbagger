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
}

export interface Group {
  id: string
  name: string
  inviteCode: string
  adminId: string
  memberIds: string[]
}

export interface RoundPlayer {
  playerId: string
  gross: number
  handicapSnapshot: number
  holes?: (number | null)[] // 18 entries when per-hole entry was used
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

// A payback between two golfers, so settled debts stop showing up.
export interface Payment {
  id: string
  tripId: string
  fromId: string
  toId: string
  amount: number
  date?: string
}

// ---------- Bets ----------

export type BetType = 'nassau' | 'skins' | 'custom'

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

export const net = (rp: RoundPlayer) => round1(rp.gross - rp.handicapSnapshot)

// Group rounds (2+ players) are the only ones that count for wins,
// streaks, head-to-head, and the Saddam. Solo rounds still count for
// personal stats and averages.
export const isGroupRound = (r: Round) => r.players.length >= 2

// Handicaps and net scores carry one decimal, GHIN-style.
export const fmt1 = (n: number) => n.toFixed(1)

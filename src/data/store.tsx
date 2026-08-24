import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { deriveInitials, round1, type AppData, type Bet, type Course, type Expense, type Payment, type Player, type Round, type Trip } from '../types'
import { todayISO } from '../lib/dates'
import { courseSlug } from '../lib/courses'
import { onOutboxChange, outboxSnapshot, outboxStatus } from './outbox'
import type { Backend, Change } from './backend'

// One store, two backends. The UI never learns which one is behind it:
// every action updates local state immediately and forwards a change
// descriptor to the backend (localStorage blob, or Supabase rows).

// Assigned in order as golfers join, so avatars stay distinguishable.
export const AVATAR_COLORS = ['#1c7c4a', '#2f6fa8', '#b8702f', '#7a5195', '#0f7c8a', '#a8443a', '#5c7a1e', '#8a5b2b']

interface StoreApi {
  data: AppData
  cloud: boolean
  syncError: string | null
  /** Writes sitting on this device, waiting for signal. */
  pendingWrites: number
  addRound: (round: Omit<Round, 'id' | 'groupId'>) => Round
  updateRound: (round: Round) => void
  deleteRound: (roundId: string) => void
  /** Creates the course record on first use, keyed on the normalised name. */
  saveCourse: (name: string, pars: (number | null)[], strokeIndex?: (number | null)[]) => void
  deleteCourse: (courseId: string) => void
  addBet: (bet: Omit<Bet, 'id'>) => void
  deleteBet: (betId: string) => void
  addTrip: (trip: Omit<Trip, 'id' | 'groupId'>) => Trip
  updateTrip: (trip: Trip) => void
  deleteTrip: (tripId: string) => void
  voteTripOption: (tripId: string, optionId: string) => void
  addPlayer: (input: { name: string; handicap: number; homeCourse?: string; email?: string }) => Player
  updatePlayer: (player: Player) => void
  removePlayer: (playerId: string) => void
  setCurrentUser: (playerId: string) => void
  addExpense: (expense: Omit<Expense, 'id'>) => void
  deleteExpense: (expenseId: string) => void
  addPayment: (payment: Omit<Payment, 'id'>) => void
  deletePayment: (paymentId: string) => void
  renameGroup: (name: string) => void
  awardSaddam: (playerId: string, note?: string) => void
  resetToSample: () => void
  newId: (prefix?: string) => string
}

const StoreContext = createContext<StoreApi | null>(null)

// UUIDs so ids are valid in Postgres as well as localStorage.
const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.floor(Math.random() * 1e12).toString(16)}`

// Same derivation the edit form uses, plus a nudge when two golfers would
// otherwise share the same avatar letters.
function initialsFor(name: string, existing: Player[]): string {
  const upper = deriveInitials(name)
  if (!existing.some((p) => p.initials === upper)) return upper
  const alt = name.trim().slice(0, 2).toUpperCase()
  return existing.some((p) => p.initials === alt) ? `${upper[0]}${existing.length + 1}` : alt
}

export function StoreProvider({ backend, initial, children }: { backend: Backend; initial: AppData; children: ReactNode }) {
  const [data, setData] = useState<AppData>(initial)
  const [syncError, setSyncError] = useState<string | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  // The outbox lives outside React — it has to keep working while the app
  // is backgrounded — so read it as an external store.
  useSyncExternalStore(onOutboxChange, outboxSnapshot, () => '0:')
  const { pending: pendingWrites, error: outboxError } = outboxStatus()

  // Applies the change locally first so the UI never waits on the network,
  // then pushes it. A failed write surfaces rather than silently vanishing.
  const commit = useCallback(
    (change: Change, update: (current: AppData) => AppData) => {
      const next = update(dataRef.current)
      dataRef.current = next
      setData(next)
      backend.apply(change, next).catch((err: unknown) => {
        setSyncError(err instanceof Error ? err.message : String(err))
      })
      return next
    },
    [backend],
  )

  // Someone else logging a round on the course should show up here.
  useEffect(() => {
    if (!backend.subscribe) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = backend.subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        backend
          .load()
          .then((fresh) => {
            dataRef.current = fresh
            setData(fresh)
          })
          .catch(() => {
            /* a failed refresh just means we keep showing what we have */
          })
      }, 400)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [backend])

  const api: StoreApi = {
    data,
    cloud: backend.cloud,
    // A write the server actually refused matters more than one that
    // simply hasn't gone out yet.
    syncError: syncError ?? outboxError,
    pendingWrites,
    newId: makeId,

    addRound(round) {
      const full: Round = { ...round, id: makeId(), groupId: data.group.id }
      commit({ kind: 'round.upsert', round: full }, (d) => ({ ...d, rounds: [...d.rounds, full] }))
      return full
    },
    updateRound(round) {
      commit({ kind: 'round.upsert', round }, (d) => ({ ...d, rounds: d.rounds.map((r) => (r.id === round.id ? round : r)) }))
    },
    deleteRound(roundId) {
      commit({ kind: 'round.delete', id: roundId }, (d) => ({
        ...d,
        rounds: d.rounds.filter((r) => r.id !== roundId),
        bets: d.bets.filter((b) => b.roundId !== roundId),
      }))
    },
    // Keyed on the slug rather than an id, so entering par from a round
    // updates the course the group already has rather than making a
    // second one with the same name.
    saveCourse(name, pars, strokeIndex) {
      const slug = courseSlug(name)
      const existing = dataRef.current.courses.find((c) => c.slug === slug)
      const anyIndex = strokeIndex?.some((n) => n != null)
      const course: Course = {
        id: existing?.id ?? makeId(),
        groupId: dataRef.current.group.id,
        name: existing?.name ?? name.trim(),
        slug,
        pars,
        strokeIndex: anyIndex ? strokeIndex : undefined,
      }
      commit({ kind: 'course.upsert', course }, (d) => ({
        ...d,
        courses: existing ? d.courses.map((c) => (c.id === course.id ? course : c)) : [...d.courses, course],
      }))
    },
    deleteCourse(courseId) {
      commit({ kind: 'course.delete', id: courseId }, (d) => ({
        ...d,
        courses: d.courses.filter((c) => c.id !== courseId),
      }))
    },
    addBet(bet) {
      const full: Bet = { ...bet, id: makeId() }
      commit({ kind: 'bet.upsert', bet: full }, (d) => ({ ...d, bets: [...d.bets, full] }))
    },
    deleteBet(betId) {
      commit({ kind: 'bet.delete', id: betId }, (d) => ({ ...d, bets: d.bets.filter((b) => b.id !== betId) }))
    },
    addTrip(trip) {
      const full: Trip = { ...trip, id: makeId(), groupId: data.group.id }
      commit({ kind: 'trip.upsert', trip: full }, (d) => ({ ...d, trips: [...d.trips, full] }))
      return full
    },
    updateTrip(trip) {
      commit({ kind: 'trip.upsert', trip }, (d) => ({ ...d, trips: d.trips.map((t) => (t.id === trip.id ? trip : t)) }))
    },
    // Mirrors toggle_trip_vote in schema.sql so the screen updates
    // straight away; the database redoes it authoritatively.
    voteTripOption(tripId, optionId) {
      const me = dataRef.current.currentUserId
      const trip = dataRef.current.trips.find((t) => t.id === tripId)
      if (!trip) return
      const alreadyMine = trip.options.find((o) => o.id === optionId)?.votes.includes(me) ?? false
      const options = trip.options.map((option) => {
        const withoutMe = option.votes.filter((v) => v !== me)
        // One vote per golfer per trip, and tapping your pick again undoes it.
        return { ...option, votes: option.id === optionId && !alreadyMine ? [...withoutMe, me] : withoutMe }
      })
      commit({ kind: 'trip.vote', tripId, optionId }, (d) => ({
        ...d,
        trips: d.trips.map((t) => (t.id === tripId ? { ...t, options } : t)),
      }))
    },
    deleteTrip(tripId) {
      commit({ kind: 'trip.delete', id: tripId }, (d) => ({
        ...d,
        trips: d.trips.filter((t) => t.id !== tripId),
        rounds: d.rounds.map((r) => (r.tripId === tripId ? { ...r, tripId: undefined } : r)),
        expenses: d.expenses.filter((e) => e.tripId !== tripId),
        payments: d.payments.filter((p) => p.tripId !== tripId),
      }))
    },
    addPlayer({ name, handicap, homeCourse, email }) {
      const player: Player = {
        id: makeId(),
        name: name.trim(),
        initials: initialsFor(name, data.players),
        handicap: round1(handicap),
        homeCourse: homeCourse?.trim() || undefined,
        email: email?.trim() || undefined,
        color: AVATAR_COLORS[data.players.length % AVATAR_COLORS.length],
      }
      commit({ kind: 'player.upsert', player }, (d) => ({
        ...d,
        players: [...d.players, player],
        group: { ...d.group, memberIds: [...d.group.memberIds, player.id] },
      }))
      return player
    },
    updatePlayer(player) {
      commit({ kind: 'player.upsert', player }, (d) => ({
        ...d,
        players: d.players.map((p) => (p.id === player.id ? player : p)),
      }))
    },
    // Removing a member keeps their rounds and money history intact —
    // deleting that would rewrite the record.
    removePlayer(playerId) {
      commit({ kind: 'player.delete', id: playerId }, (d) => ({
        ...d,
        group: { ...d.group, memberIds: d.group.memberIds.filter((id) => id !== playerId) },
        currentUserId:
          d.currentUserId === playerId ? (d.group.memberIds.find((id) => id !== playerId) ?? d.currentUserId) : d.currentUserId,
      }))
    },
    setCurrentUser(playerId) {
      commit({ kind: 'session.currentUser', playerId }, (d) => ({ ...d, currentUserId: playerId }))
    },
    addExpense(expense) {
      const full: Expense = { ...expense, id: makeId() }
      commit({ kind: 'expense.upsert', expense: full }, (d) => ({ ...d, expenses: [...d.expenses, full] }))
    },
    deleteExpense(expenseId) {
      commit({ kind: 'expense.delete', id: expenseId }, (d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== expenseId) }))
    },
    addPayment(payment) {
      const full: Payment = { ...payment, id: makeId() }
      commit({ kind: 'payment.upsert', payment: full }, (d) => ({ ...d, payments: [...d.payments, full] }))
    },
    deletePayment(paymentId) {
      commit({ kind: 'payment.delete', id: paymentId }, (d) => ({ ...d, payments: d.payments.filter((p) => p.id !== paymentId) }))
    },
    renameGroup(name) {
      const group = { ...dataRef.current.group, name: name.trim() }
      commit({ kind: 'group.upsert', group }, (d) => ({ ...d, group }))
    },
    // Dated today so any group round logged from here on can take it back.
    awardSaddam(playerId, note) {
      const group = {
        ...dataRef.current.group,
        saddamAward: { playerId, date: todayISO(), note: note?.trim() || undefined },
      }
      commit({ kind: 'group.upsert', group }, (d) => ({ ...d, group }))
    },
    resetToSample() {
      // Sample data belongs to local mode; in the cloud this would wipe
      // everyone's real history.
      if (backend.cloud) return
      commit({ kind: 'reset' }, () => initial)
      window.location.reload()
    },
  }

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

// Members of the group, in join order. Players who were removed still
// exist for history but drop out of this list.
export function useMembers(): Player[] {
  const { data } = useStore()
  return data.group.memberIds.map((id) => data.players.find((p) => p.id === id)).filter((p): p is Player => !!p)
}

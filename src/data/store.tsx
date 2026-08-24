import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { deriveInitials, round1, type AppData, type Bet, type Expense, type Payment, type Player, type Round, type Trip } from '../types'
import { todayISO } from '../lib/dates'
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
  addRound: (round: Omit<Round, 'id' | 'groupId'>) => Round
  updateRound: (round: Round) => void
  deleteRound: (roundId: string) => void
  addBet: (bet: Omit<Bet, 'id'>) => void
  deleteBet: (betId: string) => void
  addTrip: (trip: Omit<Trip, 'id' | 'groupId'>) => Trip
  updateTrip: (trip: Trip) => void
  deleteTrip: (tripId: string) => void
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
    syncError,
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

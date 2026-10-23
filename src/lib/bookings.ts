import type { AppData, Round } from '../types'
import { timeToMinutes } from './stats'

// Rounds booked ahead (Matt, 2026-10-22). A booking is a round with a tee
// time and no scores. It lives in `AppData.bookings`, out of `rounds`, so
// nothing that counts rounds (stats, streaks, trophies, recent rounds)
// sees it, and it moves across on its own once the first score is in.
// Same rules as BanditCore/Bookings.swift in the iPhone app.

export const isBooked = (r: Round) =>
  !!r.teeTime && !r.players.some((p) => p.gross != null || (p.holes?.some((h) => h != null) ?? false))

/** Every round in its right list: booked ones out of `rounds`, started ones out of `bookings`. */
export function sortBookings(data: AppData): AppData {
  const booked = data.bookings ?? []
  if (!data.rounds.some(isBooked) && !booked.some((r) => !isBooked(r))) return data
  const all = [...data.rounds, ...booked]
  return { ...data, rounds: all.filter((r) => !isBooked(r)), bookings: all.filter(isBooked) }
}

/** A round by id, played or booked. */
export const findRound = (data: AppData, id: string | undefined) =>
  data.rounds.find((r) => r.id === id) ?? data.bookings?.find((r) => r.id === id)

/** The group's bookings, soonest first. */
export const bookedRounds = (data: AppData) =>
  [...(data.bookings ?? [])].sort((a, b) => a.date.localeCompare(b.date) || timeToMinutes(a.teeTime) - timeToMinutes(b.teeTime))

/** "8:10 AM" from an <input type="time"> value, "08:10". */
export function teeTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m ?? 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** "08:10" for an <input type="time">, from "8:10 AM". */
export function teeTimeInput(label?: string): string {
  const mins = timeToMinutes(label)
  if (mins > 24 * 60) return '08:00'
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

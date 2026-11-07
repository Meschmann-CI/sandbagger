import type { AppData, Round, RoundTrack } from '../types'
import { commissionerId } from './commissioner'
import { shortDay } from './dates'
import { shortCourse } from './trophyMoments'

// The round's playlist (Matt, 2026-11-07): songs anyone on the round adds,
// in the order added, except that the commissioner's first pick goes on
// top (one of the three powers). Same rules as BanditCore/Playlist.swift.

/** The round's tracks, in play order. */
export function playlistFor(data: AppData, roundId: string): RoundTrack[] {
  const tracks = (data.tracks ?? []).filter((t) => t.roundId === roundId).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
  const commissioner = commissionerId(data)
  const first = commissioner ? tracks.find((t) => t.addedById === commissioner) : undefined
  return first ? [first, ...tracks.filter((t) => t !== first)] : tracks
}

/** "Bandit · Split Rock · Nov 9", the playlist's name in either service. */
export const playlistName = (round: Round) => `Bandit · ${shortCourse(round.courseName)} · ${shortDay(round.date)}`

/** "3 songs · 11 min". */
export function playlistLength(tracks: RoundTrack[]): string {
  const ms = tracks.reduce((s, t) => s + (t.durationMs ?? 0), 0)
  const songs = `${tracks.length} song${tracks.length === 1 ? '' : 's'}`
  return ms > 0 ? `${songs} · ${Math.round(ms / 60_000)} min` : songs
}

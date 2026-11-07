import type { Round, RoundTrack } from '../types'
import { musicToken, resolveMusic } from './music'
import { playlistName } from './playlist'

// Taking the round's playlist to Spotify, on the web: the golfer signs in
// to Spotify once (the PKCE flow, no secret on the phone, back to the site
// root with a code), a private playlist named for the round is made in
// their account with every track, and later taps add what is new and open
// it. The iPhone app runs the same flow in a sign-in sheet (SpotifyExport.swift).

const TOKEN_KEY = 'sandbagger-spotify-token'
const MADE_KEY = 'sandbagger-spotify-playlists'
const PENDING_KEY = 'sandbagger-spotify-pending'
const SCOPES = 'playlist-modify-private playlist-modify-public'
const redirectUri = () => `${window.location.origin}/`

interface Token {
  access: string
  refresh: string
  until: number
  clientId: string
}
interface Made {
  [roundId: string]: { id: string; uris: string[] }
}

const read = <T>(key: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T | null) ?? fallback
  } catch {
    return fallback
  }
}
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // no storage: the next tap signs in again
  }
}

function random(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** True when the page was opened by Spotify sending the golfer back. */
export const spotifyReturning = () => new URLSearchParams(window.location.search).has('code') && !!sessionStorage.getItem(PENDING_KEY)

/** Starts the sign-in; the page leaves and comes back to the root with a code. */
export async function connectSpotify(roundId: string): Promise<void> {
  const { spotifyClientId } = await musicToken()
  if (!spotifyClientId) throw new Error('Spotify isn’t set up yet')
  const verifier = random(48)
  const state = random(12)
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state, roundId, clientId: spotifyClientId }))
  const params = new URLSearchParams({
    client_id: spotifyClientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
    code_challenge_method: 'S256',
    code_challenge: await challenge(verifier),
  })
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`)
}

/** Finishes the sign-in on the way back. Resolves to the round to return to. */
export async function finishSpotifyLogin(): Promise<string | null> {
  const pending = read<{ verifier: string; state: string; roundId: string; clientId: string } | null>(PENDING_KEY, null)
  const query = new URLSearchParams(window.location.search)
  sessionStorage.removeItem(PENDING_KEY)
  const code = query.get('code')
  if (!pending || !code || query.get('state') !== pending.state) return pending?.roundId ?? null
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: pending.clientId, grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: pending.verifier }),
  })
  if (res.ok) {
    const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number }
    write(TOKEN_KEY, { access: data.access_token, refresh: data.refresh_token, until: Date.now() + data.expires_in * 1000, clientId: pending.clientId } satisfies Token)
  }
  return pending.roundId
}

export const spotifyConnected = () => !!read<Token | null>(TOKEN_KEY, null)

async function accessToken(): Promise<string | null> {
  const token = read<Token | null>(TOKEN_KEY, null)
  if (!token) return null
  if (Date.now() < token.until - 60_000) return token.access
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: token.clientId, grant_type: 'refresh_token', refresh_token: token.refresh }),
  })
  if (!res.ok) {
    localStorage.removeItem(TOKEN_KEY)
    return null
  }
  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
  write(TOKEN_KEY, { ...token, access: data.access_token, refresh: data.refresh_token ?? token.refresh, until: Date.now() + data.expires_in * 1000 } satisfies Token)
  return data.access_token
}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  if (!res.ok) throw new Error(`Spotify answered ${res.status}`)
  return (await res.json().catch(() => ({}))) as T
}

/**
 * Makes or updates the golfer's playlist for the round. Resolves to its
 * link, or to null when a sign-in is needed first (then call connectSpotify).
 */
export async function exportToSpotify(round: Round, tracks: RoundTrack[]): Promise<{ url: string; added: number } | null> {
  const token = await accessToken()
  if (!token) return null
  const missing = tracks.filter((t) => !t.spotifyId && t.isrc).map((t) => t.isrc!)
  const resolved = new Map((await resolveMusic(missing)).map((t) => [t.isrc, t.spotifyId]))
  const uris = tracks
    .map((t) => t.spotifyId ?? (t.isrc ? resolved.get(t.isrc) : null) ?? null)
    .filter((id): id is string => !!id)
    .map((id) => `spotify:track:${id}`)
  if (!uris.length) throw new Error('None of these are on Spotify')

  const made = read<Made>(MADE_KEY, {})
  const have = made[round.id]
  let added = 0
  let playlistId = have?.id
  if (!playlistId) {
    const me = await api<{ id: string }>(token, '/me')
    const created = await api<{ id: string }>(token, `/users/${encodeURIComponent(me.id)}/playlists`, {
      method: 'POST',
      body: JSON.stringify({ name: playlistName(round), public: false, description: `The ${round.courseName} round, from Bandit.` }),
    })
    playlistId = created.id
    await api(token, `/playlists/${playlistId}/tracks`, { method: 'POST', body: JSON.stringify({ uris }) })
    made[round.id] = { id: playlistId, uris }
    added = uris.length
  } else {
    const fresh = uris.filter((u) => !have!.uris.includes(u))
    if (fresh.length) {
      await api(token, `/playlists/${playlistId}/tracks`, { method: 'POST', body: JSON.stringify({ uris: fresh }) })
      made[round.id] = { id: playlistId, uris: [...have!.uris, ...fresh] }
      added = fresh.length
    }
  }
  write(MADE_KEY, made)
  return { url: `https://open.spotify.com/playlist/${playlistId}`, added }
}

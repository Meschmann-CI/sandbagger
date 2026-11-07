// The round playlist's catalog half (Matt, 2026-11-07): half the group is
// on Apple Music and half on Spotify, so the playlist lives in Bandit and
// each golfer takes it to their own service. Every track carries its
// ISRC (the recording's international id, the same in both catalogs) and
// both services' ids, so a list built by anyone opens anywhere.
//
// Modes (POST, JSON):
//   search  {q}        Apple Music catalog search, ten songs, each with its
//                      ISRC and, when the Spotify secrets are set, the
//                      matching Spotify id too.
//   resolve {isrcs}    Both services' ids for a list of ISRCs (for tracks
//                      added before a service's secrets existed).
//   token              A short-lived Apple developer token for MusicKit JS
//                      on the web, and the Spotify client id (public) for
//                      its sign-in. Signed-in members only.
//   ping               Whether each service's credentials work. No user
//                      needed, nothing returned but ok or the error.
//
// Secrets: APPLE_MUSIC_KEY (the MusicKit .p8), APPLE_MUSIC_KEY_ID,
// APPLE_TEAM_ID; SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET (optional until
// Matt registers the Spotify app).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { importPKCS8, SignJWT } from 'npm:jose@5.9.6'

const STOREFRONT = 'us'
const LIMIT = 10

// A key pasted into the dashboard can arrive with its line breaks as
// literal \n; PEM parsing ignores real whitespace but not those.
const APPLE_KEY = Deno.env.get('APPLE_MUSIC_KEY')?.replaceAll('\\n', '\n').trim()
const APPLE_KEY_ID = Deno.env.get('APPLE_MUSIC_KEY_ID')?.trim()
const APPLE_TEAM_ID = Deno.env.get('APPLE_TEAM_ID')?.trim()
const SPOTIFY_ID = Deno.env.get('SPOTIFY_CLIENT_ID')?.trim()
const SPOTIFY_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET')?.trim()
const appleReady = !!(APPLE_KEY && APPLE_KEY_ID && APPLE_TEAM_ID)
const spotifyReady = !!(SPOTIFY_ID && SPOTIFY_SECRET)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: BodyInit | null, init: ResponseInit = {}) =>
  new Response(body, { ...init, headers: { ...CORS, ...(init.headers ?? {}) } })
const json = (data: unknown, status = 200) =>
  reply(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

export interface Track {
  isrc: string | null
  title: string
  artist: string
  album: string | null
  /** A square cover, 120 px. */
  artwork: string | null
  durationMs: number | null
  appleId: string | null
  appleUrl: string | null
  spotifyId: string | null
  spotifyUrl: string | null
  previewUrl: string | null
}

// ---------- Apple Music ----------

// Apple's developer token: an ES256 JWT, good for up to six months. One
// per warm instance, kept for a day, is plenty.
let appleToken: { jwt: string; at: number } | null = null
async function appleJwt(ttlSeconds = 24 * 3600): Promise<string> {
  if (appleToken && Date.now() - appleToken.at < 23 * 3600_000 && ttlSeconds >= 24 * 3600) return appleToken.jwt
  const key = await importPKCS8(APPLE_KEY!, 'ES256')
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: APPLE_KEY_ID! })
    .setIssuer(APPLE_TEAM_ID!)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(key)
  if (ttlSeconds >= 24 * 3600) appleToken = { jwt, at: Date.now() }
  return jwt
}

async function appleGet(path: string): Promise<Response> {
  return fetch(`https://api.music.apple.com/v1${path}`, { headers: { Authorization: `Bearer ${await appleJwt()}` } })
}

interface AppleSong {
  id: string
  attributes?: {
    name?: string
    artistName?: string
    albumName?: string
    isrc?: string
    url?: string
    durationInMillis?: number
    artwork?: { url?: string }
    previews?: { url?: string }[]
  }
}

const fromApple = (s: AppleSong): Track => ({
  isrc: s.attributes?.isrc ?? null,
  title: s.attributes?.name ?? '',
  artist: s.attributes?.artistName ?? '',
  album: s.attributes?.albumName ?? null,
  artwork: s.attributes?.artwork?.url?.replace('{w}', '120').replace('{h}', '120') ?? null,
  durationMs: s.attributes?.durationInMillis ?? null,
  appleId: s.id,
  appleUrl: s.attributes?.url ?? null,
  spotifyId: null,
  spotifyUrl: null,
  previewUrl: s.attributes?.previews?.[0]?.url ?? null,
})

async function appleSearch(q: string): Promise<Track[]> {
  const res = await appleGet(`/catalog/${STOREFRONT}/search?types=songs&limit=${LIMIT}&term=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`Apple Music search ${res.status}`)
  const data = (await res.json()) as { results?: { songs?: { data?: AppleSong[] } } }
  return (data.results?.songs?.data ?? []).map(fromApple).filter((t) => t.title)
}

async function appleByIsrc(isrcs: string[]): Promise<Map<string, Track>> {
  const out = new Map<string, Track>()
  if (!isrcs.length) return out
  const res = await appleGet(`/catalog/${STOREFRONT}/songs?filter[isrc]=${encodeURIComponent(isrcs.join(','))}`)
  if (!res.ok) return out
  const data = (await res.json()) as { data?: AppleSong[] }
  for (const s of data.data ?? []) {
    const t = fromApple(s)
    if (t.isrc && !out.has(t.isrc)) out.set(t.isrc, t)
  }
  return out
}

// ---------- Spotify ----------

// Client credentials: the app's own token, enough for the catalog. A
// golfer's own account only comes in when they take the list across,
// and that happens on their phone, not here.
let spotifyToken: { token: string; until: number } | null = null
async function spotifyAppToken(): Promise<string> {
  if (spotifyToken && Date.now() < spotifyToken.until - 60_000) return spotifyToken.token
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${btoa(`${SPOTIFY_ID}:${SPOTIFY_SECRET}`)}` },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`Spotify token ${res.status}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  spotifyToken = { token: data.access_token, until: Date.now() + data.expires_in * 1000 }
  return spotifyToken.token
}

async function spotifyByIsrc(isrc: string): Promise<{ id: string; url: string } | null> {
  const token = await spotifyAppToken()
  const res = await fetch(`https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(`isrc:${isrc}`)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { tracks?: { items?: { id: string; external_urls?: { spotify?: string } }[] } }
  const hit = data.tracks?.items?.[0]
  return hit ? { id: hit.id, url: hit.external_urls?.spotify ?? `https://open.spotify.com/track/${hit.id}` } : null
}

async function withSpotify(tracks: Track[]): Promise<Track[]> {
  if (!spotifyReady) return tracks
  return Promise.all(
    tracks.map(async (t) => {
      if (!t.isrc) return t
      try {
        const hit = await spotifyByIsrc(t.isrc)
        return hit ? { ...t, spotifyId: hit.id, spotifyUrl: hit.url } : t
      } catch {
        return t
      }
    }),
  )
}

// ---------- The function ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply('ok')
  if (req.method !== 'POST') return reply('POST only', { status: 405 })

  let body: { mode?: string; q?: string; isrcs?: unknown }
  try {
    body = await req.json()
  } catch {
    return reply('Bad JSON', { status: 400 })
  }
  const mode = body.mode ?? 'search'

  if (mode === 'ping') {
    const out: Record<string, string> = {}
    if (!appleReady) out.apple = 'missing secrets'
    else {
      try {
        const res = await appleGet(`/storefronts/${STOREFRONT}`)
        out.apple = res.ok ? 'ok' : `Apple answered ${res.status}`
      } catch (err) {
        out.apple = `error: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`
      }
    }
    if (!spotifyReady) out.spotify = 'missing secrets'
    else {
      try {
        await spotifyAppToken()
        out.spotify = 'ok'
      } catch (err) {
        out.spotify = `error: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`
      }
    }
    return json(out)
  }

  // Everything else is for a signed-in member of a group.
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await asCaller.auth.getUser()
  if (!auth?.user) return reply('Sign in first', { status: 401 })
  const { data: callerPlayerId } = await asCaller.rpc('claim_my_player')
  if (!callerPlayerId) return reply('Join a group first', { status: 403 })
  if (!appleReady) return json({ error: 'The music catalog is not set up yet (Apple secrets).' }, 503)

  try {
    if (mode === 'search') {
      const q = typeof body.q === 'string' ? body.q.trim().slice(0, 120) : ''
      if (q.length < 2) return json({ tracks: [] })
      return json({ tracks: await withSpotify(await appleSearch(q)), spotify: spotifyReady })
    }
    if (mode === 'resolve') {
      const isrcs = Array.isArray(body.isrcs) ? (body.isrcs as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 50) : []
      const apple = await appleByIsrc(isrcs)
      const tracks = await withSpotify(isrcs.map((isrc) => apple.get(isrc) ?? { ...emptyTrack, isrc }))
      return json({ tracks, spotify: spotifyReady })
    }
    if (mode === 'token') {
      return json({ appleDeveloperToken: await appleJwt(3600), spotifyClientId: SPOTIFY_ID ?? null })
    }
    return reply('Unknown mode', { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: `The catalog is down right now (${message.slice(0, 120)}). Try again in a minute.` }, 502)
  }
})

const emptyTrack: Track = {
  isrc: null,
  title: '',
  artist: '',
  album: null,
  artwork: null,
  durationMs: null,
  appleId: null,
  appleUrl: null,
  spotifyId: null,
  spotifyUrl: null,
  previewUrl: null,
}

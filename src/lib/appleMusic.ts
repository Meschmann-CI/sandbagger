import type { Round, RoundTrack } from '../types'
import { musicToken, resolveMusic } from './music'
import { playlistName } from './playlist'

// Taking the round's playlist to Apple Music, on the web, through
// MusicKit JS: the golfer authorises their own account once, a playlist
// named for the round is made in their library with every track, and later
// taps add whatever is new and open it. The iPhone app does the same with
// the native MusicKit (AppleMusicExport.swift).

const SCRIPT = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js'
const MADE_KEY = 'sandbagger-apple-playlists'

interface Made {
  [roundId: string]: { id: string; trackIds: string[] }
}

// MusicKit JS has no types shipped; the handful of calls used here.
interface MusicKitInstance {
  authorize(): Promise<string>
  api: { music(path: string, params?: Record<string, unknown>, options?: { fetchOptions?: RequestInit }): Promise<{ data: { data?: { id: string }[] } }> }
}
declare global {
  interface Window {
    MusicKit?: { configure(config: { developerToken: string; app: { name: string; build: string } }): Promise<MusicKitInstance> }
  }
}

function readMade(): Made {
  try {
    return JSON.parse(localStorage.getItem(MADE_KEY) ?? '{}') as Made
  } catch {
    return {}
  }
}
function writeMade(made: Made) {
  try {
    localStorage.setItem(MADE_KEY, JSON.stringify(made))
  } catch {
    // Then the next tap makes a second playlist; a nuisance, not a loss.
  }
}

let loading: Promise<void> | null = null
function loadMusicKit(): Promise<void> {
  if (window.MusicKit) return Promise.resolve()
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const tag = document.createElement('script')
    tag.src = SCRIPT
    tag.async = true
    tag.onload = () => (window.MusicKit ? resolve() : document.addEventListener('musickitloaded', () => resolve(), { once: true }))
    tag.onerror = () => reject(new Error('Apple Music’s script didn’t load'))
    document.head.appendChild(tag)
  })
  return loading
}

/** Returns the playlist's link in Apple Music, and how many tracks went across this time. */
export async function exportToAppleMusic(round: Round, tracks: RoundTrack[]): Promise<{ url: string; added: number }> {
  const { appleDeveloperToken } = await musicToken()
  await loadMusicKit()
  const music = await window.MusicKit!.configure({ developerToken: appleDeveloperToken, app: { name: 'Bandit', build: '1' } })
  await music.authorize()

  // Tracks added before the catalog knew their Apple id get resolved now.
  const missing = tracks.filter((t) => !t.appleId && t.isrc).map((t) => t.isrc!)
  const resolved = new Map((await resolveMusic(missing)).map((t) => [t.isrc, t.appleId]))
  const ids = tracks.map((t) => t.appleId ?? (t.isrc ? resolved.get(t.isrc) : null) ?? null).filter((id): id is string => !!id)
  if (!ids.length) throw new Error('None of these are on Apple Music')

  const made = readMade()
  const have = made[round.id]
  const songs = (list: string[]) => list.map((id) => ({ id, type: 'songs' }))
  let playlistId: string
  let added = 0
  if (!have) {
    const res = await music.api.music('/v1/me/library/playlists', undefined, {
      fetchOptions: {
        method: 'POST',
        body: JSON.stringify({
          attributes: { name: playlistName(round), description: `The ${round.courseName} round, from Bandit.` },
          relationships: { tracks: { data: songs(ids) } },
        }),
      },
    })
    const id = res.data.data?.[0]?.id
    if (!id) throw new Error('Apple Music didn’t make the playlist')
    playlistId = id
    added = ids.length
    made[round.id] = { id, trackIds: ids }
  } else {
    playlistId = have.id
    const fresh = ids.filter((id) => !have.trackIds.includes(id))
    if (fresh.length) {
      await music.api.music(`/v1/me/library/playlists/${playlistId}/tracks`, undefined, {
        fetchOptions: { method: 'POST', body: JSON.stringify({ data: songs(fresh) }) },
      })
      made[round.id] = { id: playlistId, trackIds: [...have.trackIds, ...fresh] }
      added = fresh.length
    }
  }
  writeMade(made)
  return { url: `https://music.apple.com/library/playlist/${playlistId}`, added }
}

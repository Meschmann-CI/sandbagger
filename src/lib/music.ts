import { supabase } from './supabase'

// The catalog, through the `music` Edge Function (which holds the Apple
// and Spotify credentials). Search answers with each song's ISRC and both
// services' ids, so a track added by anyone opens for everyone.

export interface CatalogTrack {
  isrc: string | null
  title: string
  artist: string
  album: string | null
  artwork: string | null
  durationMs: number | null
  appleId: string | null
  appleUrl: string | null
  spotifyId: string | null
  spotifyUrl: string | null
  previewUrl: string | null
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('The playlist needs the online app')
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>('music', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const text = ctx && typeof ctx.text === 'function' ? await ctx.text().catch(() => '') : ''
    let reason = ''
    try {
      reason = (JSON.parse(text) as { error?: string }).error ?? ''
    } catch {
      reason = ''
    }
    throw new Error(reason || error.message || 'The catalog didn’t answer')
  }
  if (!data) throw new Error('The catalog didn’t answer')
  if (data.error) throw new Error(data.error)
  return data
}

/** Ten songs for a few words of title or artist. */
export async function searchMusic(q: string): Promise<CatalogTrack[]> {
  const { tracks } = await invoke<{ tracks: CatalogTrack[] }>({ mode: 'search', q })
  return tracks
}

/** Both services' ids for tracks added before a service was set up. */
export async function resolveMusic(isrcs: string[]): Promise<CatalogTrack[]> {
  if (!isrcs.length) return []
  const { tracks } = await invoke<{ tracks: CatalogTrack[] }>({ mode: 'resolve', isrcs })
  return tracks
}

/** What the web needs to talk to each service as the golfer: Apple's developer token, Spotify's client id. */
export async function musicToken(): Promise<{ appleDeveloperToken: string; spotifyClientId: string | null }> {
  return invoke({ mode: 'token' })
}

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../data/store'
import { playlistFor, playlistLength } from '../lib/playlist'
import { searchMusic, type CatalogTrack } from '../lib/music'
import { exportToAppleMusic } from '../lib/appleMusic'
import { connectSpotify, exportToSpotify } from '../lib/spotify'
import { commissionerId } from '../lib/commissioner'
import { useHoldUpdates } from '../lib/holdUpdates'
import { Avatar, Card, SectionLabel } from './ui'
import type { Round, RoundTrack } from '../types'

// The round's playlist (Matt, 2026-11-07): anyone on the round adds songs
// from one catalog search, the list lives here with each song's ISRC and
// both services' ids, and every golfer takes it to their own Apple Music
// or Spotify with one button (lib/appleMusic.ts, lib/spotify.ts). The
// commissioner's first pick goes on top. Same as Playlist.swift.

type Service = 'apple' | 'spotify'

export default function Playlist({ round }: { round: Round }) {
  const { data, cloud, removeTrack } = useStore()
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<Service | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [link, setLink] = useState<{ service: Service; url: string } | null>(null)
  const tracks = playlistFor(data, round.id)
  const me = data.currentUserId
  const imIn = round.players.some((rp) => rp.playerId === me)
  const commissioner = commissionerId(data)
  const name = (id: string) => data.players.find((p) => p.id === id)

  const take = async (service: Service) => {
    setBusy(service)
    setNote(null)
    setLink(null)
    try {
      const result = service === 'apple' ? await exportToAppleMusic(round, tracks) : await exportToSpotify(round, tracks)
      if (!result) {
        // Spotify needs a sign-in first; the page leaves and comes back here.
        await connectSpotify(round.id)
        return
      }
      setLink({ service, url: result.url })
      setNote(result.added === 0 ? 'Already up to date.' : `${result.added} song${result.added === 1 ? '' : 's'} added.`)
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <SectionLabel
        action={
          imIn && cloud ? (
            <button type="button" onClick={() => setAdding(true)} className="text-footnote font-bold text-green">
              Add a song
            </button>
          ) : tracks.length > 0 ? (
            <span className="text-caption text-ink-faint tabular-nums">{playlistLength(tracks)}</span>
          ) : null
        }
      >
        Playlist
      </SectionLabel>
      <Card tile className="overflow-hidden">
        {tracks.length === 0 ? (
          <p className="px-4 py-3.5 text-footnote text-ink-dim">
            {cloud
              ? imIn
                ? `Nobody’s added a song yet. ${commissioner === me ? 'Your' : 'The commissioner’s'} first pick goes on top.`
                : 'Nothing on it yet.'
              : 'The playlist needs the online app.'}
          </p>
        ) : (
          <ul>
            {tracks.map((t, i) => {
              const by = name(t.addedById)
              const pinned = i === 0 && commissioner != null && t.addedById === commissioner
              return (
                <li key={t.id} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-line' : ''}`}>
                  {t.artwork ? (
                    <img src={t.artwork} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-md bg-cream object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-cream text-ink-faint">♪</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-footnote font-bold text-ink">{t.title}</p>
                    <p className="truncate text-caption text-ink-dim">
                      {t.artist}
                      {pinned && <span className="ml-1.5 rounded-full bg-gold-soft px-1.5 py-px text-[10px] font-bold text-[#7A5A12]">Commissioner’s pick</span>}
                    </p>
                  </div>
                  {by && <Avatar player={by} size={22} />}
                  {t.addedById === me && (
                    <button type="button" onClick={() => removeTrack(t.id)} aria-label={`Remove ${t.title}`} className="-mr-1 px-1 text-headline leading-none text-ink-faint">
                      ×
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {tracks.length > 0 && cloud && (
          <div className="border-t border-line px-4 py-3">
            <div className="flex gap-2">
              <button type="button" disabled={busy != null} onClick={() => void take('apple')} className="flex-1 rounded-xl bg-ink/[0.06] py-2.5 text-footnote font-bold text-ink disabled:opacity-60">
                {busy === 'apple' ? 'Taking it across…' : 'Apple Music'}
              </button>
              <button type="button" disabled={busy != null} onClick={() => void take('spotify')} className="flex-1 rounded-xl bg-ink/[0.06] py-2.5 text-footnote font-bold text-ink disabled:opacity-60">
                {busy === 'spotify' ? 'Taking it across…' : 'Spotify'}
              </button>
            </div>
            <p className="mt-2 text-caption text-ink-faint">Makes the playlist in your own account the first time, then keeps it up to date.</p>
            {note && <p className="mt-1.5 text-footnote text-ink-dim">{note}</p>}
            {link && (
              <a href={link.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-footnote font-bold text-green">
                Open in {link.service === 'apple' ? 'Apple Music' : 'Spotify'} ↗
              </a>
            )}
          </div>
        )}
      </Card>
      {adding && <SongSearch round={round} existing={tracks} onClose={() => setAdding(false)} />}
    </>
  )
}

/** The catalog search, as a sheet: type, tap Add, add a few more, Done. */
function SongSearch({ round, existing, onClose }: { round: Round; existing: RoundTrack[]; onClose: () => void }) {
  useHoldUpdates()
  const { addTrack } = useStore()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CatalogTrack[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(() => new Set(existing.map((t) => t.isrc ?? t.id)))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    timer.current = setTimeout(() => {
      setSearching(true)
      setError(null)
      searchMusic(term)
        .then(setResults)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setSearching(false))
    }, 350)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q])

  const add = (t: CatalogTrack) => {
    addTrack(round.id, t)
    setAdded((s) => new Set(s).add(t.isrc ?? t.appleId ?? t.title))
  }

  return createPortal(
    <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true" aria-label="Add a song">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 animate-[fade_0.2s_ease-out]" />
      <div className="sheet-up absolute inset-x-0 bottom-0 mx-auto flex max-h-[85vh] max-w-md flex-col rounded-t-3xl bg-paper px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2.5 shadow-[0_-12px_40px_rgba(0,0,0,0.2)]">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-line-strong" />
        <div className="mt-4 flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Song or artist"
            autoFocus
            className="flex-1 rounded-xl border border-line-strong bg-card px-4 py-3 text-body text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
          />
          <button type="button" onClick={onClose} className="text-footnote font-bold text-green">
            Done
          </button>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {error && <p className="px-1 py-2 text-footnote text-flag">{error}</p>}
          {!error && q.trim().length >= 2 && !searching && results.length === 0 && <p className="px-1 py-2 text-footnote text-ink-faint">Nothing by that name.</p>}
          {searching && results.length === 0 && <p className="px-1 py-2 text-footnote text-ink-faint">Looking…</p>}
          <ul>
            {results.map((t) => {
              const key = t.isrc ?? t.appleId ?? t.title
              const done = added.has(key)
              return (
                <li key={key} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                  {t.artwork ? <img src={t.artwork} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-md bg-cream object-cover" /> : <span className="h-10 w-10 shrink-0 rounded-md bg-cream" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-footnote font-bold text-ink">{t.title}</p>
                    <p className="truncate text-caption text-ink-dim">
                      {t.artist}
                      {t.album ? ` · ${t.album}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={done}
                    onClick={() => add(t)}
                    className={`rounded-lg px-3 py-1.5 text-footnote font-bold ${done ? 'text-ink-faint' : 'bg-green-soft text-green active:scale-95'}`}
                  >
                    {done ? 'Added' : 'Add'}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  )
}

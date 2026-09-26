import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../data/store'
import { looksLikeConnectivity } from '../data/outbox'
import { enqueuePhoto, usePendingPhotos } from '../data/photoOutbox'
import type { Round, RoundPhoto } from '../types'
import { blobToDataUrl, newPhotoId, removeRoundPhotoFile, shrinkPhoto, uploadRoundPhoto } from '../lib/photos'
import { shortDate } from '../lib/stats'
import { useConfirm } from './Confirm'
import { Avatar, Card, SectionLabel } from './ui'

// Pictures from the day, on the round they belong to. A grid of
// thumbnails, a picker that offers the camera or the library, and a
// full-screen viewer with who took it and a way to take it down.
//
// No signal on the course is normal, so a photo that can't upload waits
// on the phone (photoOutbox.ts) and shows here greyed as "waiting for
// signal" until it goes.
//
// The viewer is portalled to the body: the page wrapper animates in
// with a transform, and a fixed overlay inside a transformed box is
// fixed to the box, not the screen.

export default function RoundPhotos({ round }: { round: Round }) {
  const { data, updateRound } = useStore()
  const confirm = useConfirm()
  const me = data.currentUserId
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(0) // photos still being shrunk/uploaded
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<RoundPhoto | null>(null)
  const pending = usePendingPhotos(round.id)

  const photos = round.photos ?? []

  // One at a time, each landing on the round as it finishes, so a
  // handful picked from the library shows up progressively rather than
  // all at once at the end — and a failure mid-way keeps the ones done.
  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    const files = [...list]
    setBusy(files.length)
    setError(null)
    let current = round
    for (const file of files) {
      const id = newPhotoId()
      const takenAt = new Date(file.lastModified || Date.now()).toISOString()
      try {
        const blob = await shrinkPhoto(file)
        try {
          const photo = await uploadRoundPhoto(blob, current, id, me, takenAt)
          current = { ...current, photos: [...(current.photos ?? []), photo] }
          updateRound(current)
        } catch (err) {
          // No signal: park it on the phone and let the outbox send it.
          if (!looksLikeConnectivity(err)) throw err
          enqueuePhoto({ id, roundId: round.id, byId: me, takenAt, dataUrl: await blobToDataUrl(blob) })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy((n) => n - 1)
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const remove = async (photo: RoundPhoto) => {
    const ok = await confirm({
      title: 'Take this photo down?',
      body: 'It comes off the round for everyone.',
      confirmLabel: 'Remove it',
      danger: true,
    })
    if (!ok) return
    try {
      await removeRoundPhotoFile(photo)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return
    }
    updateRound({ ...round, photos: photos.filter((p) => p.id !== photo.id) })
    setOpen(null)
  }

  const who = (id: string) => data.players.find((p) => p.id === id)
  const count = photos.length + pending.length

  return (
    <>
      <SectionLabel
        action={
          <button onClick={() => fileRef.current?.click()} disabled={busy > 0} className="text-[12.5px] font-bold text-green disabled:opacity-40">
            {busy > 0 ? `Adding ${busy}…` : '+ Add photo'}
          </button>
        }
      >
        Photos{count > 0 && ` · ${count}`}
      </SectionLabel>
      {/* No `capture` attribute on purpose: iOS then offers Take Photo
          or Photo Library, which is the right question after a round. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label="Add photos"
        onChange={(e) => void onFiles(e.target.files)}
      />

      {count === 0 ? (
        <Card onClick={() => fileRef.current?.click()} className="p-4 flex items-center gap-3.5">
          <span className="text-[22px]">📸</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-bold text-ink">No photos yet</p>
            <p className="text-[12px] text-ink-dim mt-0.5">The scenery, the beers, the shank into the pond. Add a few.</p>
          </div>
          <span className="text-[12.5px] font-bold text-green shrink-0">Add →</span>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((photo) => (
            <button
              key={photo.id}
              onClick={() => setOpen(photo)}
              className="aspect-square overflow-hidden rounded-xl bg-paper border border-line active:scale-[0.98] transition"
              aria-label={`Photo by ${who(photo.byId)?.name ?? 'someone'}`}
            >
              <img src={photo.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
          {pending.map((p) => (
            <div
              key={p.id}
              className="relative aspect-square overflow-hidden rounded-xl bg-paper border border-dashed border-gold/50"
              aria-label="Photo waiting for signal"
            >
              <img src={p.dataUrl} alt="" className="h-full w-full object-cover opacity-50" />
              <span className="absolute inset-x-0 bottom-0 bg-gold-soft/95 px-1.5 py-1 text-center text-[9.5px] font-bold uppercase tracking-wider text-gold">
                Waiting for signal
              </span>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-2 px-1 text-[12.5px] font-semibold text-flag">{error}</p>}

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col" onClick={() => setOpen(null)}>
            <div className="flex-1 flex items-center justify-center p-3 min-h-0">
              <img src={open.url} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
            </div>
            <div
              className="flex items-center gap-3 px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)] bg-black/60 text-white"
              onClick={(e) => e.stopPropagation()}
            >
              {who(open.byId) && <Avatar player={who(open.byId)!} size={26} />}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold truncate">{who(open.byId)?.name ?? 'Someone'}</p>
                <p className="text-[11px] text-white/70 tabular-nums">{shortDate(open.takenAt.slice(0, 10))}</p>
              </div>
              <button onClick={() => void remove(open)} className="text-[12.5px] font-bold text-red-300 px-2">
                Remove
              </button>
              <button onClick={() => setOpen(null)} className="text-[13px] font-bold text-white px-2">
                Close
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

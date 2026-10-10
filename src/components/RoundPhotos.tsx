import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../data/store'
import { looksLikeConnectivity } from '../data/outbox'
import { enqueuePhoto, usePendingPhotos } from '../data/photoOutbox'
import type { Player, Round, RoundPhoto } from '../types'
import { blobToDataUrl, newPhotoId, removeRoundPhotoFile, shrinkPhoto, uploadRoundPhoto } from '../lib/photos'
import { shortDate } from '../lib/stats'
import { useConfirm } from './Confirm'
import { Avatar, Card, SectionLabel } from './ui'
import { IconTile } from './icons'

// Pictures from the day, on the round they belong to. A grid of
// thumbnails, a picker that offers the camera or the library, and a
// full-screen viewer you swipe through, with who took each one and a
// way to take it down.
//
// No signal on the course is normal, so a photo that can't upload waits
// on the phone (photoOutbox.ts) and shows here greyed as "waiting for
// signal" until it goes.
//
// The viewer is portalled to the body: the page wrapper animates in
// with a transform, and a fixed overlay inside a transformed box is
// fixed to the box, not the screen.

// With an `openerRef`, the round page's "Add photos" chip opens the
// picker, and an empty round renders no section at all, so the page
// doesn't ask for photos twice. The opener runs inside the chip's tap,
// which iOS requires before it will show a file picker.
export default function RoundPhotos({ round, openerRef }: { round: Round; openerRef?: MutableRefObject<(() => void) | null> }) {
  const { data, updateRound } = useStore()
  const confirm = useConfirm()
  const me = data.currentUserId
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(0) // photos still being shrunk/uploaded
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null) // index into photos
  const pending = usePendingPhotos(round.id)

  const photos = round.photos ?? []

  useEffect(() => {
    if (!openerRef) return
    openerRef.current = () => fileRef.current?.click()
    return () => {
      openerRef.current = null
    }
  }, [openerRef])

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
    const left = photos.filter((p) => p.id !== photo.id)
    updateRound({ ...round, photos: left })
    // Stay in the viewer on the next photo unless that was the last one.
    if (left.length === 0) setOpen(null)
  }

  const who = (id: string) => data.players.find((p) => p.id === id)
  const count = photos.length + pending.length

  const input = (
    // No `capture` attribute on purpose: iOS then offers Take Photo
    // or Photo Library, which is the right question after a round.
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      multiple
      className="hidden"
      aria-label="Add photos"
      onChange={(e) => void onFiles(e.target.files)}
    />
  )

  if (openerRef && count === 0 && busy === 0) {
    return (
      <>
        {input}
        {error && <p className="mt-2 px-1 text-footnote font-semibold text-flag">{error}</p>}
      </>
    )
  }

  return (
    <>
      <SectionLabel
        action={
          <button onClick={() => fileRef.current?.click()} disabled={busy > 0} className="text-footnote font-bold text-green disabled:opacity-40">
            {busy > 0 ? `Adding ${busy}…` : '+ Add photo'}
          </button>
        }
      >
        Photos{count > 0 && ` · ${count}`}
      </SectionLabel>
      {input}

      {count === 0 ? (
        <Card onClick={() => fileRef.current?.click()} className="p-4 flex items-center gap-3.5">
          <IconTile name="camera" tone="sky" />
          <div className="flex-1 min-w-0">
            <p className="text-footnote font-bold text-ink">No photos yet</p>
            <p className="text-footnote text-ink-dim mt-0.5">The scenery, the beers, the shank into the pond. Add a few.</p>
          </div>
          <span className="text-footnote font-bold text-green shrink-0">Add →</span>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              onClick={() => setOpen(i)}
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
              <span className="absolute inset-x-0 bottom-0 bg-gold-soft/95 px-1.5 py-1 text-center text-caption font-semibold text-gold">
                Waiting for signal
              </span>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-2 px-1 text-footnote font-semibold text-flag">{error}</p>}

      {open !== null &&
        photos.length > 0 &&
        createPortal(
          <PhotoViewer photos={photos} start={open} who={who} onRemove={(p) => void remove(p)} onClose={() => setOpen(null)} />,
          document.body,
        )}
    </>
  )
}

// Every photo on the round in one horizontal strip, so a swipe moves to
// the next one instead of closing and reopening. Native scroll-snap does
// the swiping: it follows the finger, and `snap-always` stops a hard
// flick at the next photo rather than skipping several.
function PhotoViewer({
  photos,
  start,
  who,
  onRemove,
  onClose,
}: {
  photos: RoundPhoto[]
  start: number
  who: (id: string) => Player | undefined
  onRemove: (photo: RoundPhoto) => void
  onClose: () => void
}) {
  const stripRef = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(start)

  // Land on the tapped photo before the first paint, with no slide-in.
  useLayoutEffect(() => {
    const el = stripRef.current
    if (el) el.scrollLeft = start * el.clientWidth
  }, [start])

  const step = (dir: 1 | -1) => {
    const el = stripRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The remove confirmation has its own Escape; leave it to that.
      if (document.querySelector('[role="alertdialog"]')) return
      if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // After a removal the strip is shorter; clamp so the caption follows
  // whichever photo slid into place.
  const current = photos[Math.min(at, photos.length - 1)]
  const by = who(current.byId)

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col" onClick={onClose}>
      <div
        ref={stripRef}
        onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((photo) => (
          <div key={photo.id} className="w-full h-full shrink-0 snap-center snap-always flex items-center justify-center p-3">
            <img src={photo.url} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
        ))}
      </div>
      <div
        className="flex items-center gap-3 px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)] bg-black/60 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {by && <Avatar player={by} size={26} />}
        <div className="flex-1 min-w-0">
          <p className="text-footnote font-bold truncate">{by?.name ?? 'Someone'}</p>
          <p className="text-caption text-white/70 tabular-nums">
            {shortDate(current.takenAt.slice(0, 10))}
            {photos.length > 1 && ` · ${Math.min(at, photos.length - 1) + 1} of ${photos.length}`}
          </p>
        </div>
        <button onClick={() => onRemove(current)} className="text-footnote font-bold text-red-300 px-2">
          Remove
        </button>
        <button onClick={onClose} className="text-footnote font-bold text-white px-2">
          Close
        </button>
      </div>
    </div>
  )
}

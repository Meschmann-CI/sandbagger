import { useEffect, useRef, useState } from 'react'
import type { ItineraryItem, ItineraryKind } from '../types'
import { SPANNING_KINDS } from '../types'
import { fetchLinkPreview, faviconFor, normalizeUrl } from '../lib/links'
import { fileToDataUrl, imageFromClipboard } from '../lib/images'
import { PrimaryButton } from './ui'

export const KIND_META: Record<ItineraryKind, { icon: string; label: string; placeholder: string }> = {
  tee: { icon: '⛳', label: 'Tee time', placeholder: 'Course name' },
  meal: { icon: '🍽️', label: 'Food', placeholder: 'Where are we eating?' },
  lodging: { icon: '🏠', label: 'Housing', placeholder: 'House, hotel, or resort' },
  flight: { icon: '✈️', label: 'Flight', placeholder: 'e.g. JFK → MYR' },
  other: { icon: '📍', label: 'Other', placeholder: 'What is it?' },
}

const KIND_ORDER: ItineraryKind[] = ['tee', 'meal', 'lodging', 'flight', 'other']

interface Props {
  initial?: ItineraryItem
  defaultDate: string
  onSave: (item: Omit<ItineraryItem, 'id'>) => void
  onCancel: () => void
}

export default function ItineraryEditor({ initial, defaultDate, onSave, onCancel }: Props) {
  const [kind, setKind] = useState<ItineraryKind>(initial?.kind ?? 'tee')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [date, setDate] = useState(initial?.date ?? defaultDate)
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [time, setTime] = useState(initial?.time ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [confirmation, setConfirmation] = useState(initial?.confirmation ?? '')
  const [cost, setCost] = useState(initial?.cost != null ? String(initial.cost) : '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? [])
  const [previewImage, setPreviewImage] = useState(initial?.previewImage ?? '')
  const [siteName, setSiteName] = useState(initial?.siteName ?? '')
  const [linkState, setLinkState] = useState<'idle' | 'loading' | 'found' | 'unavailable'>('idle')
  const fileRef = useRef<HTMLInputElement>(null)
  const spanning = SPANNING_KINDS.includes(kind)
  const favicon = faviconFor(url)

  // Pull the listing photo when a link is added. Only reachable once
  // deployed; locally the photo picker covers it.
  const lookupLink = async () => {
    if (!url.trim()) return
    setLinkState('loading')
    const preview = await fetchLinkPreview(url)
    if (preview) {
      if (preview.image) setPreviewImage(preview.image)
      if (preview.siteName) setSiteName(preview.siteName)
      if (!title.trim() && preview.title) setTitle(preview.title)
      setLinkState('found')
    } else {
      setLinkState('unavailable')
    }
  }

  const addFiles = async (files: FileList | File[]) => {
    const added: string[] = []
    for (const file of Array.from(files).slice(0, 4)) {
      try {
        added.push(await fileToDataUrl(file))
      } catch {
        // skip anything that isn't a readable image
      }
    }
    if (added.length) setPhotos((p) => [...p, ...added].slice(0, 6))
  }

  // Paste a screenshot straight in.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromClipboard(e)
      if (file) {
        e.preventDefault()
        void addFiles([file])
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const save = () => {
    if (!title.trim() || !date) return
    onSave({
      kind,
      title: title.trim(),
      date,
      endDate: spanning && endDate ? endDate : undefined,
      time: time.trim() || undefined,
      url: url.trim() ? normalizeUrl(url) : undefined,
      confirmation: confirmation.trim() || undefined,
      cost: cost.trim() ? Number(cost) : undefined,
      note: note.trim() || undefined,
      photos: photos.length ? photos : undefined,
      previewImage: previewImage || undefined,
      siteName: siteName || undefined,
      reviews: initial?.reviews,
    })
  }

  const field = 'w-full rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none'
  const label = 'block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5'

  return (
    <div className="rounded-2xl border border-green/30 bg-card p-4 space-y-3.5">
      {/* Kind */}
      <div className="grid grid-cols-5 gap-1.5">
        {KIND_ORDER.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-lg py-2 text-[11px] font-bold border transition ${
              kind === k ? 'bg-green text-white border-green' : 'border-line-strong text-ink-dim'
            }`}
          >
            <span className="block text-[15px] leading-tight">{KIND_META[k].icon}</span>
            {KIND_META[k].label}
          </button>
        ))}
      </div>

      <div>
        <label className={label}>{kind === 'flight' ? 'Route' : 'Name'}</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={KIND_META[kind].placeholder} className={field} autoFocus />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={label}>{spanning ? (kind === 'lodging' ? 'Check in' : 'Depart') : 'Date'}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </div>
        {spanning ? (
          <div>
            <label className={label}>{kind === 'lodging' ? 'Check out' : 'Return'}</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={field} />
          </div>
        ) : (
          <div>
            <label className={label}>Time</label>
            <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="9:40 AM" className={field} />
          </div>
        )}
      </div>

      {spanning && (
        <div>
          <label className={label}>Time (optional)</label>
          <input value={time} onChange={(e) => setTime(e.target.value)} placeholder={kind === 'flight' ? '6:15 AM' : '4:00 PM check-in'} className={field} />
        </div>
      )}

      {/* Link + confirmation */}
      <div>
        <label className={label}>Link</label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            {favicon && (
              <img src={favicon} alt="" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 rounded" onError={(e) => (e.currentTarget.style.display = 'none')} />
            )}
            <input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setLinkState('idle')
              }}
              onBlur={() => url.trim() && linkState === 'idle' && void lookupLink()}
              placeholder="Booking or tee time URL"
              className={`${field} ${favicon ? 'pl-9' : ''}`}
            />
          </div>
          {url.trim() && (
            <button onClick={() => void lookupLink()} className="rounded-lg border border-line-strong px-3 text-[12.5px] font-bold text-ink-dim shrink-0">
              {linkState === 'loading' ? '…' : 'Get photo'}
            </button>
          )}
        </div>
        {linkState === 'found' && previewImage && <p className="text-[11.5px] text-green font-bold mt-1.5">Photo pulled from the listing ✓</p>}
        {linkState === 'unavailable' && (
          <p className="text-[11.5px] text-ink-faint mt-1.5">
            Couldn't read that page's photo (works once the app is on Netlify). Add one below instead.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={label}>Confirmation #</label>
          <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="ABC123" className={field} />
        </div>
        <div>
          <label className={label}>Cost (optional)</label>
          <input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="$" className={field} />
        </div>
      </div>

      <div>
        <label className={label}>Notes</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the group should know" className={field} />
      </div>

      {/* Photos */}
      <div>
        <label className={label}>Photos</label>
        <div className="flex flex-wrap gap-2">
          {previewImage && (
            <div className="relative">
              <img src={previewImage} alt="" className="h-20 w-28 rounded-lg object-cover border border-line" />
              <button
                onClick={() => setPreviewImage('')}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-ink text-white text-[11px] font-bold"
                aria-label="Remove listing photo"
              >
                ✕
              </button>
              <span className="absolute bottom-1 left-1 rounded bg-ink/75 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">From link</span>
            </div>
          )}
          {photos.map((src, i) => (
            <div key={i} className="relative">
              <img src={src} alt="" className="h-20 w-28 rounded-lg object-cover border border-line" />
              <button
                onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-ink text-white text-[11px] font-bold"
                aria-label="Remove photo"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => fileRef.current?.click()}
            className="h-20 w-28 rounded-lg border-2 border-dashed border-line-strong text-[12px] font-bold text-ink-faint active:bg-paper"
          >
            + Add photo
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && void addFiles(e.target.files)}
        />
        <p className="text-[11px] text-ink-faint mt-1.5">Pick a file, or just paste a screenshot.</p>
      </div>

      <div className="flex gap-2 pt-1">
        <PrimaryButton onClick={save} disabled={!title.trim() || !date} className="flex-1 !py-2.5">
          {initial ? 'Save changes' : 'Add to trip'}
        </PrimaryButton>
        <button onClick={onCancel} className="px-4 text-[13px] font-bold text-ink-faint">
          Cancel
        </button>
      </div>
    </div>
  )
}

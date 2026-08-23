import { useState } from 'react'
import type { ItineraryItem, Player, Review } from '../types'
import { faviconFor, hostOf } from '../lib/links'
import { shortDate } from '../lib/stats'
import { KIND_META } from './ItineraryEditor'
import { StarPicker, StarRating } from './Stars'
import { Avatar } from './ui'

interface Props {
  item: ItineraryItem
  players: Player[]
  currentUserId: string
  editable: boolean
  isPast: boolean
  onReview: (review: Review) => void
  onEdit: () => void
  onRemove: () => void
}

export default function ItineraryCard({ item, players, currentUserId, editable, isPast, onReview, onEdit, onRemove }: Props) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [iconFailed, setIconFailed] = useState(false)

  const meta = KIND_META[item.kind]
  const favicon = faviconFor(item.url)
  const host = hostOf(item.url)
  const photo = item.previewImage || item.photos?.[0]
  const reviews = item.reviews ?? []
  const myReview = reviews.find((r) => r.playerId === currentUserId)
  const avg = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null
  const hasDetail = !!(item.url || item.confirmation || item.note || item.cost != null || photo || reviews.length)
  // Rating only makes sense for places you've been.
  const canReview = isPast && ['tee', 'meal', 'lodging'].includes(item.kind)

  const submitReview = () => {
    if (!rating) return
    onReview({ playerId: currentUserId, rating, comment: comment.trim() || undefined })
    setReviewing(false)
    setComment('')
    setRating(0)
  }

  const copyConfirmation = async () => {
    if (!item.confirmation) return
    try {
      await navigator.clipboard.writeText(item.confirmation)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // clipboard blocked; the number is on screen anyway
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        {/* Course/venue icon from the link, falling back to the kind emoji */}
        <div className="shrink-0 mt-0.5">
          {favicon && !iconFailed ? (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-paper overflow-hidden">
              <img src={favicon} alt="" style={{ height: 18, width: 18 }} onError={() => setIconFailed(true)} />
            </span>
          ) : (
            <span className="flex h-7 w-7 items-center justify-center text-[16px]">{meta.icon}</span>
          )}
        </div>

        <button onClick={() => hasDetail && setOpen((o) => !o)} className="flex-1 min-w-0 text-left">
          <p className="text-[14px] font-bold text-ink leading-snug">{item.title}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
            {item.endDate && (
              <span className="text-[11.5px] text-ink-dim tabular-nums">
                {shortDate(item.date)} – {shortDate(item.endDate)}
              </span>
            )}
            {host && <span className="text-[11.5px] text-ink-faint truncate">{item.siteName || host}</span>}
            {avg != null && (
              <span className="inline-flex items-center gap-1">
                <StarRating value={avg} size={11} />
                <span className="text-[11px] font-bold text-ink-dim tabular-nums">{avg.toFixed(1)}</span>
              </span>
            )}
            {item.cost != null && <span className="text-[11.5px] font-bold text-ink-dim tabular-nums">${item.cost}</span>}
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {item.time && <span className="text-[12px] font-bold text-ink-dim tabular-nums">{item.time}</span>}
          {hasDetail && (
            <button onClick={() => setOpen((o) => !o)} className="text-ink-faint text-[11px] px-0.5" aria-label={open ? 'Collapse' : 'Expand'}>
              {open ? '▲' : '▼'}
            </button>
          )}
        </div>
      </div>

      {/* Collapsed photo strip hint */}
      {!open && photo && (
        <button onClick={() => setOpen(true)} className="mt-2.5 block w-full">
          <img src={photo} alt="" className="h-28 w-full rounded-xl object-cover border border-line" />
        </button>
      )}

      {open && (
        <div className="mt-3 space-y-3 pl-10">
          {(item.photos?.length || item.previewImage) && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {[item.previewImage, ...(item.photos ?? [])].filter(Boolean).map((src, i) => (
                <img key={i} src={src as string} alt="" className="h-32 w-44 shrink-0 rounded-xl object-cover border border-line" />
              ))}
            </div>
          )}

          {item.note && <p className="text-[13px] text-ink-dim">{item.note}</p>}

          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 text-[13px] font-bold text-green break-all"
            >
              {favicon && <img src={favicon} alt="" style={{ height: 14, width: 14 }} />}
              Open {item.siteName || host} ↗
            </a>
          )}

          {item.confirmation && (
            <button onClick={copyConfirmation} className="flex items-center gap-2 rounded-lg bg-paper border border-line px-3 py-2 w-full">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">Conf #</span>
              <span className="text-[13.5px] font-bold text-ink tabular-nums flex-1 text-left">{item.confirmation}</span>
              <span className="text-[11.5px] font-bold text-green">{copied ? 'Copied ✓' : 'Copy'}</span>
            </button>
          )}

          {/* Reviews */}
          {reviews.length > 0 && (
            <div className="space-y-2">
              {reviews.map((r) => {
                const p = players.find((pl) => pl.id === r.playerId)
                if (!p) return null
                return (
                  <div key={r.playerId} className="flex items-start gap-2.5">
                    <Avatar player={p} size={24} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12.5px] font-bold text-ink">{p.name}</span>
                        <StarRating value={r.rating} size={11} />
                      </div>
                      {r.comment && <p className="text-[12.5px] text-ink-dim mt-0.5">{r.comment}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {canReview && !reviewing && (
            <button onClick={() => { setReviewing(true); setRating(myReview?.rating ?? 0); setComment(myReview?.comment ?? '') }} className="text-[12.5px] font-bold text-green">
              {myReview ? 'Edit your rating' : `How was it? Rate ${item.kind === 'tee' ? 'the course' : item.kind === 'meal' ? 'the food' : 'the place'} →`}
            </button>
          )}

          {reviewing && (
            <div className="rounded-xl border border-line bg-paper p-3">
              <StarPicker value={rating} onChange={setRating} />
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Worth it? Skip it? Say why."
                className="w-full mt-2.5 rounded-lg border border-line-strong bg-card px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
              />
              <div className="flex gap-2 mt-2">
                <button onClick={submitReview} disabled={!rating} className="flex-1 rounded-lg bg-green py-2 text-[13px] font-bold text-white disabled:opacity-30">
                  Post rating
                </button>
                <button onClick={() => setReviewing(false)} className="px-3 text-[13px] font-bold text-ink-faint">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {editable && (
            <div className="flex gap-3 pt-1">
              <button onClick={onEdit} className="text-[12px] font-bold text-ink-dim">Edit details</button>
              <button onClick={onRemove} className="text-[12px] font-bold text-flag/80">Remove</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

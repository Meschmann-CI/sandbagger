import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { KIND_LABEL, type Badge } from '../lib/badges'
import { shortDate } from '../lib/stats'
import { Medal } from './Medal'

// A trophy up close. There's no hovering on a phone, so every medal is a
// button, and tapping one slides this up: the medal large, what it
// takes, and your record with it (how many times, since when, the round
// it happened in). Tap outside, swipe it away with Cancel, or press Esc.

export function TrophySheet({ badge, onClose, onRound }: { badge: Badge; onClose: () => void; onRound?: (roundId: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true" aria-label={badge.label}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 animate-[fade_0.2s_ease-out]" />
      <div className="sheet-up absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl bg-paper px-6 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-2.5 text-center shadow-[0_-12px_40px_rgba(0,0,0,0.2)]">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-line-strong" />
        <div className="mt-6 flex justify-center">
          <span className={badge.earned ? 'trophy-drop' : ''}>
            <Medal badge={badge} size={96} />
          </span>
        </div>
        <p className="mt-4 text-caption font-semibold uppercase tracking-[0.16em] text-ink-faint">{KIND_LABEL[badge.kind]}</p>
        <h2 className="mt-1 text-title font-bold tracking-tight text-ink">{badge.label}</h2>
        <p className="mx-auto mt-2 max-w-[300px] text-body text-ink-dim">{badge.how}</p>

        <div className="mx-auto mt-5 max-w-[320px] rounded-2xl bg-card px-4 py-3 ring-1 ring-line">
          {badge.earned ? (
            <p className="text-footnote font-semibold text-ink">
              {badge.count > 1 ? `Earned ${badge.count} times` : 'Earned'}
              {badge.firstDate && `, first on ${shortDate(badge.firstDate)}`}
              {badge.note && <span className="block font-normal text-ink-dim">{badge.note}</span>}
            </p>
          ) : (
            <p className="text-footnote font-semibold text-ink-faint">{badge.note ?? 'Not yet. Maybe next round.'}</p>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {badge.roundId && onRound && (
            <button
              onClick={() => onRound(badge.roundId!)}
              className="w-full rounded-xl bg-green-soft py-3 text-body font-bold text-green-deep active:bg-green/15"
            >
              {badge.count > 1 ? 'See the latest round' : 'See the round'}
            </button>
          )}
          <button onClick={onClose} className="w-full rounded-xl bg-ink/[0.06] py-3 text-body font-bold text-ink-dim active:bg-ink/10">
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

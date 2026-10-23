import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore, type TrophyMoment as TrophyMomentData } from '../data/store'
import { trophyWhy } from '../lib/trophyMoments'
import { Medal } from './Medal'
import { Confetti } from './Delight'
import { PrimaryButton } from './ui'
import { play } from '../lib/sound'

// Trophy unlocked (Matt, 2026-10-22, option A): the trophies a round just
// earned you, one at a time, over whatever's on screen when the last score
// goes in. Shame trophies too; they're the funny ones. Same moment as
// TrophyMomentView.swift.

export default function TrophyMoment() {
  const { trophyMoment: moment, dismissTrophyMoment } = useStore()
  // Keyed on the moment, so each one starts on its first trophy.
  return moment ? <MomentSheet key={moment.id} moment={moment} onClose={dismissTrophyMoment} /> : null
}

function MomentSheet({ moment, onClose: dismissTrophyMoment }: { moment: TrophyMomentData; onClose: () => void }) {
  const [page, setPage] = useState(0)

  useEffect(() => play('trophy'), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismissTrophyMoment()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismissTrophyMoment])

  const t = moment.trophies[Math.min(page, moment.trophies.length - 1)]
  const last = page >= moment.trophies.length - 1

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Trophy unlocked">
      <button type="button" aria-label="Close" onClick={dismissTrophyMoment} className="absolute inset-0 bg-ink/40 animate-[fade_0.2s_ease-out]" />
      <div className="sheet-up absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl bg-paper px-6 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-2.5 text-center shadow-[0_-12px_40px_rgba(0,0,0,0.2)]">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-line-strong" />
        <p className="mt-5 text-footnote font-extrabold text-gold">
          Trophy unlocked{moment.trophies.length > 1 && ` · ${page + 1} of ${moment.trophies.length}`}
        </p>
        <div key={t.badge.key} className="mt-4 flex justify-center">
          <span className="trophy-drop">
            <Medal badge={t.badge} size={140} />
          </span>
        </div>
        <h2 className="mt-4 text-title font-bold tracking-tight text-ink">{t.badge.label}</h2>
        <p className="mx-auto mt-1.5 max-w-[300px] text-body text-ink-dim">{trophyWhy(t)}</p>
        <p className="mt-1 text-footnote text-ink-faint">{moment.course}</p>
        {moment.trophies.length > 1 && (
          <div className="mt-4 flex justify-center gap-1.5">
            {moment.trophies.map((x, i) => (
              <span key={x.badge.key} className={`h-1.5 w-1.5 rounded-full ${i === page ? 'bg-ink' : 'bg-line-strong'}`} />
            ))}
          </div>
        )}
        <PrimaryButton onClick={() => (last ? dismissTrophyMoment() : setPage((p) => p + 1))} className="mt-5 w-full !py-3.5">
          {last ? 'Nice' : 'Next'}
        </PrimaryButton>
        <p className="mt-2.5 text-caption text-ink-faint">The group hears about {moment.trophies.length === 1 ? 'this one' : 'these'}.</p>
      </div>
      <Confetti fire={1} originY={0.45} />
    </div>,
    document.body,
  )
}

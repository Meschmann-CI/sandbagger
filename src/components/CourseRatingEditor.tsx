import { useState } from 'react'
import { useStore } from '../data/store'
import type { RatingAspect } from '../types'
import { courseSlug } from '../lib/courses'
import { RATING_ASPECTS, courseDisplayName, insertAt, myRanking, ratingFor } from '../lib/ratings'
import { StarPicker } from './Stars'
import { PrimaryButton } from './ui'

// Rating a course, in two beats.
//
// First the stars: one overall out of five, which is the rating, and a
// folded-away set of sub-scores for anyone with more to say. Five
// aspects is the ceiling — past that, people stop filling them in and a
// blank sub-score is worse than none.
//
// Then, once, the question the stars can't answer: where does it sit
// among the courses you've already ranked? One tap on a slot number.
// Four courses can all be four stars; your list has an order.

export default function CourseRatingEditor({
  courseName,
  onDone,
}: {
  courseName: string
  onDone: () => void
}) {
  const { data, rateCourse, setMyRanking } = useStore()
  const slug = courseSlug(courseName)
  const existing = ratingFor(data, slug)

  const [overall, setOverall] = useState(existing?.overall ?? 0)
  const [aspects, setAspects] = useState<Partial<Record<RatingAspect, number>>>(existing?.aspects ?? {})
  const [note, setNote] = useState(existing?.note ?? '')
  const [showDetails, setShowDetails] = useState(!!existing?.aspects && Object.keys(existing.aspects).length > 0)
  const [step, setStep] = useState<'rate' | 'place'>('rate')

  const ranking = myRanking(data)
  const detailsIn = RATING_ASPECTS.filter((a) => (aspects[a.key] ?? 0) > 0).length

  const post = () => {
    if (!overall) return
    rateCourse({ courseName, overall, aspects, note })
    // Already placed, or nothing to place it against: done. Otherwise
    // ask the one question that gives the ranking its order.
    if (ranking.includes(slug)) return onDone()
    if (ranking.length === 0) {
      setMyRanking([slug])
      return onDone()
    }
    setStep('place')
  }

  const place = (index: number) => {
    setMyRanking(insertAt(ranking, slug, index))
    onDone()
  }

  if (step === 'place') {
    return (
      <div className="rounded-2xl border border-green/30 bg-card p-4">
        <p className="text-[14.5px] font-extrabold text-ink">Where does {courseDisplayName(data, slug)} land?</p>
        <p className="text-[12.5px] text-ink-dim mt-1">
          Tap the slot. 1 is your favourite. Stars can tie; your list can’t, and that’s what sorts the group’s order.
        </p>
        <div className="grid grid-cols-6 gap-2 mt-3">
          {Array.from({ length: ranking.length + 1 }, (_, i) => (
            <button
              key={i}
              onClick={() => place(i)}
              aria-label={`Slot ${i + 1}`}
              className="h-11 rounded-xl border border-line-strong bg-card text-[16px] font-extrabold text-ink tabular-nums active:scale-95 active:bg-green-soft transition"
            >
              {i + 1}
            </button>
          ))}
        </div>
        <ol className="mt-3 space-y-1">
          {ranking.map((s, i) => (
            <li key={s} className="flex items-baseline gap-2 text-[12.5px] text-ink-dim">
              <span className="w-5 text-right font-bold tabular-nums text-ink-faint">{i + 1}</span>
              <span className="truncate">{courseDisplayName(data, s)}</span>
            </li>
          ))}
        </ol>
        <button onClick={onDone} className="mt-3 text-[12.5px] font-bold text-ink-faint">
          Skip for now
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-green/30 bg-card p-4 space-y-3.5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">Overall</p>
        <StarPicker value={overall} onChange={setOverall} size={36} />
      </div>

      {/* The details stay folded until asked for. Most days one number
          is the honest amount to say. */}
      {!showDetails ? (
        <button onClick={() => setShowDetails(true)} className="text-[12.5px] font-bold text-green">
          + Rate the details
        </button>
      ) : (
        <div className="rounded-xl border border-line bg-paper p-3 space-y-2.5">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">The details</p>
            <span className="text-[11px] text-ink-faint">{detailsIn ? `${detailsIn} of ${RATING_ASPECTS.length}` : 'optional'}</span>
          </div>
          {RATING_ASPECTS.map((a) => (
            <div key={a.key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-ink leading-tight">{a.label}</p>
                <p className="text-[11px] text-ink-faint leading-tight">{a.hint}</p>
              </div>
              <StarPicker
                value={aspects[a.key] ?? 0}
                onChange={(v) => setAspects((all) => ({ ...all, [a.key]: v }))}
                size={22}
              />
            </div>
          ))}
        </div>
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="One line. Play it again? Skip it? Why."
        className="w-full rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
      />

      <div className="flex gap-2">
        <PrimaryButton onClick={post} disabled={!overall} className="flex-1 !py-2.5">
          {existing ? 'Update rating' : 'Post rating'}
        </PrimaryButton>
        <button onClick={onDone} className="px-4 text-[13px] font-bold text-ink-faint">
          Cancel
        </button>
      </div>
    </div>
  )
}

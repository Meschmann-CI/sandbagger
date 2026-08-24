import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { HOLE_COUNT } from '../lib/holes'
import { courseSlug, emptyPars, padded } from '../lib/courses'
import { useGoBack } from '../lib/nav'
import { Card, PrimaryButton, SectionLabel } from '../components/ui'
import { useConfirm } from '../components/Confirm'

// Par and stroke index for one course, off the physical scorecard.
//
// No template to correct. There's no standard order for where a course
// puts its par-3s and par-5s, so a pre-filled layout would be wrong on
// most holes — and you'd have to check all eighteen anyway to find out
// which, then fix them. Worse than starting empty.
//
// Instead: par is only ever 3, 4 or 5, so it's three buttons a hole and
// no keyboard at all.

const PAR_CHOICES = [3, 4, 5]

export default function CourseEdit() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const goBack = useGoBack('/courses')
  const { data, saveCourse, deleteCourse } = useStore()
  const confirm = useConfirm()

  // A course reached from a round it hasn't got a record for yet.
  const existing = data.courses.find((c) => c.slug === slug)
  const nameFromRounds = data.rounds.find((r) => courseSlug(r.courseName) === slug)?.courseName
  const name = existing?.name ?? nameFromRounds ?? ''

  const [pars, setPars] = useState<(number | null)[]>(() => padded(existing?.pars ?? emptyPars()))
  const [index, setIndex] = useState<(number | null)[]>(() => padded(existing?.strokeIndex))
  const [showIndex, setShowIndex] = useState(() => (existing?.strokeIndex ?? []).some((n) => n != null))

  if (!name) {
    return (
      <div className="pt-16 text-center text-ink-dim">
        Course not found.{' '}
        <button onClick={() => navigate('/courses')} className="text-green font-bold">
          Back to courses
        </button>
      </div>
    )
  }

  const setPar = (hole: number, value: number) =>
    setPars((all) => all.map((p, i) => (i === hole ? (p === value ? null : value) : p)))

  const setIndexAt = (hole: number, raw: string) => {
    const n = parseInt(raw, 10)
    setIndex((all) => all.map((v, i) => (i === hole ? (Number.isNaN(n) ? null : Math.max(1, Math.min(18, n))) : v)))
  }

  const parsIn = pars.filter((p) => p != null).length
  const total = pars.reduce<number>((sum, p) => sum + (p ?? 0), 0)
  const complete = parsIn === HOLE_COUNT

  // The stroke index is a ranking, so each of 1-18 is used exactly once.
  // Getting one wrong is easy and silent, so say which.
  const indexIn = index.filter((n) => n != null).length
  const duplicates = new Set(
    index.filter((n, i) => n != null && index.findIndex((m) => m === n) !== i).map((n) => n as number),
  )
  const indexComplete = indexIn === HOLE_COUNT && duplicates.size === 0

  const save = () => {
    saveCourse(name, pars, indexIn > 0 ? index : undefined)
    goBack()
  }

  const sum = (list: (number | null)[]) => list.reduce<number>((s, p) => s + (p ?? 0), 0)
  const frontPar = sum(pars.slice(0, 9))
  const backPar = sum(pars.slice(9))

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <button onClick={() => goBack()} className="text-[13px] font-bold text-ink-faint mb-2">
          ← Back
        </button>
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink leading-tight">{name}</h1>
        <p className="text-[13px] text-ink-dim mt-1">
          Straight off the scorecard. Every round here, past and future, picks it up.
        </p>
      </header>

      {/* Running totals, so a typo in the composition is obvious */}
      <Card className={`mt-2 p-4 ${complete ? 'border-green/30 bg-green-soft/40' : ''}`}>
        <div className="flex items-baseline justify-between">
          <p className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">
            {complete ? 'Par' : `${parsIn} of ${HOLE_COUNT} holes`}
          </p>
          <p className="text-[24px] font-extrabold text-ink tabular-nums">{total || '—'}</p>
        </div>
        {complete && (
          <p className="text-[12.5px] text-ink-dim mt-1 tabular-nums">
            Out {frontPar} · In {backPar} ·{' '}
            {PAR_CHOICES.map((p) => `${pars.filter((v) => v === p).length}×${p}`).join(', ')}
          </p>
        )}
      </Card>

      <SectionLabel>Par</SectionLabel>
      <Card className="divide-y divide-line">
        {Array.from({ length: HOLE_COUNT }, (_, hole) => (
          <div key={hole} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-6 text-[13px] font-bold text-ink-faint tabular-nums">{hole + 1}</span>
            <div className="flex-1 flex gap-2">
              {PAR_CHOICES.map((choice) => {
                const on = pars[hole] === choice
                return (
                  <button
                    key={choice}
                    onClick={() => setPar(hole, choice)}
                    aria-label={`Hole ${hole + 1}, par ${choice}`}
                    aria-pressed={on}
                    className={`flex-1 h-11 rounded-xl border text-[16px] font-extrabold tabular-nums transition active:scale-95 ${
                      on ? 'bg-green text-white border-green' : 'bg-card text-ink-dim border-line-strong'
                    }`}
                  >
                    {choice}
                  </button>
                )
              })}
            </div>
            {/* The turn is worth marking; it's how a card is read. */}
            {hole === 8 && <span className="w-9 text-right text-[11px] font-bold text-ink-faint">OUT</span>}
            {hole === 17 && <span className="w-9 text-right text-[11px] font-bold text-ink-faint">IN</span>}
            {hole !== 8 && hole !== 17 && <span className="w-9" />}
          </div>
        ))}
      </Card>

      {/* Stroke index: only the bets need it, so it stays out of the way */}
      <SectionLabel
        action={
          !showIndex ? (
            <button onClick={() => setShowIndex(true)} className="text-[12.5px] font-bold text-green">
              + Add it
            </button>
          ) : undefined
        }
      >
        Stroke Index
      </SectionLabel>

      {!showIndex ? (
        <Card className="p-4">
          <p className="text-[13px] text-ink-dim">
            The 1–18 difficulty ranking. Optional — it only changes how strokes are handed out in nassau and skins. Without
            it the bets split your handicap evenly over the nines, which is the usual casual shortcut.
          </p>
        </Card>
      ) : (
        <>
          <Card className="p-3">
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: HOLE_COUNT }, (_, hole) => {
                const value = index[hole]
                const clash = value != null && duplicates.has(value)
                return (
                  <div key={hole}>
                    <label className="block text-[10px] font-bold text-ink-faint text-center mb-0.5 tabular-nums">
                      {hole + 1}
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={value ?? ''}
                      onChange={(e) => setIndexAt(hole, e.target.value)}
                      placeholder="–"
                      aria-label={`Stroke index for hole ${hole + 1}`}
                      className={`w-full h-10 rounded-lg border bg-card text-center text-[15px] font-bold text-ink tabular-nums focus:outline-none ${
                        clash ? 'border-flag bg-flag-soft' : 'border-line-strong focus:border-green'
                      }`}
                    />
                  </div>
                )
              })}
            </div>
          </Card>
          <p className={`text-[12px] px-2 mt-2 font-semibold ${duplicates.size ? 'text-flag' : 'text-ink-faint'}`}>
            {duplicates.size > 0
              ? `Each hole gets its own rank — ${[...duplicates].sort((a, b) => a - b).join(' and ')} used more than once.`
              : indexComplete
                ? 'All eighteen ranked.'
                : `${indexIn} of ${HOLE_COUNT}. Partly filled in is fine; the bets use it once it's complete.`}
          </p>
        </>
      )}

      <div className="flex gap-3 mt-5">
        <PrimaryButton onClick={save} disabled={parsIn === 0} className="flex-1 !py-4">
          {complete ? 'Save scorecard' : `Save ${parsIn} of ${HOLE_COUNT}`}
        </PrimaryButton>
        <button onClick={() => goBack()} className="px-5 text-[13px] font-bold text-ink-faint">
          Cancel
        </button>
      </div>
      {!complete && parsIn > 0 && (
        <p className="text-[11.5px] text-ink-faint px-2 mt-2">
          Scores against par only appear once all eighteen are in — "+4" would be a lie with holes missing.
        </p>
      )}

      {existing && (
        <div className="mt-8 mb-4 text-center">
          <button
            onClick={async () => {
              const ok = await confirm({
                title: `Clear the scorecard for ${existing.name}?`,
                body: 'Rounds played here stay exactly as they are. They just stop showing scores against par.',
                confirmLabel: 'Clear it',
                danger: true,
              })
              if (ok) {
                deleteCourse(existing.id)
                goBack()
              }
            }}
            className="text-[12.5px] font-bold text-flag/80"
          >
            Clear this scorecard
          </button>
        </div>
      )}
      <div className="h-4" />
    </div>
  )
}

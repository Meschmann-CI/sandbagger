import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { currentSlug } from '../lib/courses'
import { emptyCourseMap, fetchCourseMap, mapHoleFor, saveCourseMap } from '../lib/courseMap'
import { useCourseMap } from '../lib/useCourseMap'
import { useGoBack, useNavigate } from '../lib/nav'
import { BackButton } from '../components/Nav'
import HoleMapSheet from '../components/HoleMapSheet'
import { Card, PrimaryButton } from '../components/ui'

// A course's hole map: get it from OpenStreetMap, then look the holes
// over, the target and distances working from each tee.

export default function CourseMap() {
  const slug = currentSlug(useParams().slug ?? '')
  const navigate = useNavigate()
  const goBack = useGoBack(`/courses/${encodeURIComponent(slug)}`)
  const { data } = useStore()
  const course = data.courses.find((c) => c.slug === slug)
  const { map, reload } = useCourseMap(course?.id)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [index, setIndex] = useState(0)

  if (!course) {
    return (
      <div className="pt-16 text-center text-ink-dim">
        Add the course’s scorecard first.{' '}
        <button onClick={() => navigate(`/courses/${encodeURIComponent(slug)}/card`)} className="font-bold text-green">
          Add it
        </button>
      </div>
    )
  }

  const get = async () => {
    setBusy(true)
    setProblem(null)
    try {
      const r = await fetchCourseMap(course)
      if (r.map) {
        // Greens the group marked by hand survive a fresh fetch.
        await saveCourseMap(course, { ...r.map, marked: map?.marked })
        reload()
      } else setProblem(r.problem ?? 'Nothing came back.')
    } catch (err) {
      setProblem((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Look-over uses the course's own 18 (on a 27-hole course, its first two nines).
  const nines = course.nines && course.nines.length >= 2 ? ([course.nines[0].name, course.nines[1].name] as [string, string]) : null
  const holeAt = (i: number) => (map ? mapHoleFor(map, i, nines) : undefined)
  const found = map ? Array.from({ length: 18 }, (_, i) => holeAt(i)).filter(Boolean).length : 0

  return (
    <div className="rise">
      <header className="px-1 pb-2 pt-4">
        <BackButton fallback={`/courses/${encodeURIComponent(slug)}`} onBack={goBack} />
        <h1 className="text-large font-bold leading-tight tracking-tight text-ink">{course.name}</h1>
        {map && (
          <p className="mt-1 text-footnote text-ink-dim">
            {found} of 18 holes drawn.{' '}
            <button onClick={() => void get()} disabled={busy} className="font-bold text-green disabled:opacity-50">
              {busy ? 'Fetching…' : 'Fetch again'}
            </button>
          </p>
        )}
        {problem && <p className="mt-1.5 text-footnote font-semibold text-flag">{problem}</p>}
      </header>

      {map === undefined ? (
        <p className="px-1 text-footnote text-ink-dim">Checking for a map…</p>
      ) : map ? (
        <div className="-mx-4">
          <HoleMapSheet map={map} holeAt={holeAt} index={index} onIndex={setIndex} par={nines ? undefined : course.pars?.[index]} overlay={false} />
        </div>
      ) : (
        <Card tile className="mt-2 p-4">
          <p className="text-body font-bold text-ink">Get the hole map</p>
          <p className="mt-1 text-footnote text-ink-dim">
            Drawn holes and GPS distances on the card, from OpenStreetMap. It takes a few seconds, once, for the whole group.
          </p>
          <PrimaryButton onClick={() => void get()} disabled={busy} className="mt-3 w-full">
            {busy ? 'Fetching from OpenStreetMap…' : 'Get it'}
          </PrimaryButton>
          {problem && (
            <>
              <p className="mt-4 text-footnote text-ink-dim">
                Or mark the greens as you play: on each green, tap “I’m on the green” and that hole has distances for everyone after.
              </p>
              <button
                onClick={async () => {
                  await saveCourseMap(course, emptyCourseMap())
                  reload()
                }}
                className="mt-2 w-full rounded-xl bg-green-soft py-3 text-footnote font-bold text-green-deep active:scale-[0.98] transition"
              >
                Mark greens as we play
              </button>
            </>
          )}
        </Card>
      )}
    </div>
  )
}

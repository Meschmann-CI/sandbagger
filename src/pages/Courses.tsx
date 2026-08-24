import { useNavigate } from 'react-router-dom'
import { useStore } from '../data/store'
import { HOLE_COUNT } from '../lib/holes'
import { courseSlug, coursePar, hasStrokeIndex, parsEntered } from '../lib/courses'
import { useGoBack } from '../lib/nav'
import { Card, EmptyState, Pill, SectionLabel } from '../components/ui'

// Every course the group has played, and whether its card is filled in.
// Built from the rounds themselves, so nothing has to be added by hand
// before it shows up here.
export default function Courses() {
  const { data } = useStore()
  const navigate = useNavigate()
  const goBack = useGoBack('/profile')

  // Most played first — that's the order they're worth filling in.
  const played = new Map<string, { name: string; rounds: number }>()
  for (const round of data.rounds) {
    const slug = courseSlug(round.courseName)
    const entry = played.get(slug)
    if (entry) entry.rounds++
    else played.set(slug, { name: round.courseName, rounds: 1 })
  }
  // A course can exist without a round yet if someone added its card first.
  for (const course of data.courses) {
    if (!played.has(course.slug)) played.set(course.slug, { name: course.name, rounds: 0 })
  }

  const rows = [...played.entries()]
    .map(([slug, { name, rounds }]) => {
      const course = data.courses.find((c) => c.slug === slug)
      return { slug, name, rounds, course, par: coursePar(course), entered: parsEntered(course) }
    })
    .sort((a, b) => b.rounds - a.rounds || a.name.localeCompare(b.name))

  const withPar = rows.filter((r) => r.par != null).length

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <button onClick={() => goBack()} className="text-[13px] font-bold text-ink-faint mb-2">
          ← Back
        </button>
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink">Courses</h1>
        <p className="text-[13px] text-ink-dim">
          {rows.length === 0
            ? 'Every course you log a round at turns up here.'
            : `${withPar} of ${rows.length} with a scorecard filled in`}
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState title="No courses yet" sub="Log a round and the course you played turns up here, ready for its scorecard." />
      ) : (
        <>
          <Card className="mt-2 p-4 bg-green-soft/50 border-green/20">
            <p className="text-[13px] text-ink">
              <span className="font-extrabold">Add par once, keep it forever.</span> It's eighteen taps off the scorecard,
              and it applies to every round played there — including the ones already on the books.
            </p>
          </Card>

          <SectionLabel>Played</SectionLabel>
          <Card className="divide-y divide-line">
            {rows.map((row) => (
              <button
                key={row.slug}
                onClick={() => navigate(`/courses/${encodeURIComponent(row.slug)}`)}
                className="w-full text-left flex items-center gap-3 px-4 py-3.5 active:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] font-bold text-ink truncate">{row.name}</p>
                  <p className="text-[11.5px] text-ink-faint tabular-nums">
                    {row.rounds > 0 ? `${row.rounds} round${row.rounds === 1 ? '' : 's'}` : 'no rounds yet'}
                    {row.par != null && ` · par ${row.par}`}
                    {hasStrokeIndex(row.course) && ' · ranked'}
                  </p>
                </div>
                {row.par != null ? (
                  <Pill tone="green">Card in</Pill>
                ) : row.entered > 0 ? (
                  <Pill tone="gold">
                    {row.entered}/{HOLE_COUNT}
                  </Pill>
                ) : (
                  <span className="text-[12.5px] font-bold text-green shrink-0">Add par →</span>
                )}
              </button>
            ))}
          </Card>
          <p className="text-[11.5px] text-ink-faint px-2 mt-2">
            The stroke index is the optional extra. It only changes how strokes get handed out in nassau and skins.
          </p>
        </>
      )}
      <div className="h-4" />
    </div>
  )
}

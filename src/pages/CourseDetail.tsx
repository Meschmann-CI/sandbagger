import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMembers, useStore } from '../data/store'
import { courseSlug, coursePar, currentSlug, hasSlopeRating, hasStrokeIndex, parsEntered } from '../lib/courses'
import { HOLE_COUNT } from '../lib/holes'
import { RATING_ASPECTS, courseSummaries, fmtStars, ordinal } from '../lib/ratings'
import { roundStandings, shortDate } from '../lib/stats'
import { useGoBack, useNavigate } from '../lib/nav'
import { BackButton } from '../components/Nav'
import CourseScene from '../components/CourseScene'
import { CourseLogo } from '../components/CourseLogo'
import { courseBrand } from '../lib/courseBrands'
import { useConfirm } from '../components/Confirm'
import CourseRatingEditor from '../components/CourseRatingEditor'
import { StarRating } from '../components/Stars'
import { Avatar, Card, Pill, SectionLabel } from '../components/ui'
import { IconTile } from '../components/icons'
import { useCourseMap } from '../lib/useCourseMap'

// One course: what the group thinks of it (the verdict, then each detail
// with your score beside the average, then everyone's take with yours
// first), and the reference data (scorecard, tees, rounds) underneath.

export default function CourseDetail() {
  const slug = currentSlug(useParams().slug ?? '')
  const navigate = useNavigate()
  const goBack = useGoBack('/courses')
  const { data, deleteCourseRating } = useStore()
  const members = useMembers()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const { map: courseMap } = useCourseMap(data.courses.find((c) => c.slug === slug)?.id)

  const summary = courseSummaries(data).find((r) => r.slug === slug)
  if (!summary) {
    return (
      <div className="pt-16 text-center text-ink-dim">
        Course not found.{' '}
        <button onClick={() => navigate('/courses')} className="text-green font-bold">
          Back to courses
        </button>
      </div>
    )
  }

  const course = data.courses.find((c) => c.slug === slug)
  const par = coursePar(course)
  const brand = courseBrand(summary.name)
  const parsIn = parsEntered(course)
  const rounds = data.rounds
    .filter((r) => courseSlug(r.courseName) === slug)
    .sort((a, b) => b.date.localeCompare(a.date))
  const detailed = RATING_ASPECTS.filter((a) => summary.aspectAvg[a.key] != null)
  const myAspects = !!summary.mine?.aspects && Object.keys(summary.mine.aspects).length > 0
  const others = summary.ratings
    .filter((r) => r.playerId !== data.currentUserId)
    .sort((a, b) => b.overall - a.overall || b.date.localeCompare(a.date))

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <BackButton fallback="/courses" onBack={goBack} />
        {/* A long wordmark gets its own line; a square mark sits beside the name. */}
        {brand?.wide && (
          <div className="mb-2">
            <CourseLogo brand={brand} name={summary.name} size={40} />
          </div>
        )}
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-large font-bold tracking-tight text-ink leading-tight">{summary.name}</h1>
          {brand && !brand.wide && <CourseLogo brand={brand} name={summary.name} size={brand.tall ? 64 : 52} className="mt-1" />}
        </div>
        <p className="text-footnote text-ink-dim mt-1 tabular-nums">
          {course?.town && `${course.town} · `}
          {summary.rounds > 0 ? `${summary.rounds} round${summary.rounds === 1 ? '' : 's'}` : 'No rounds logged'}
          {summary.lastPlayed && ` · last ${shortDate(summary.lastPlayed)}`}
          {par != null && ` · par ${par}`}
          {hasSlopeRating(course) && ` · ${course.rating}/${course.slope}`}
        </p>
      </header>

      {/* The course's scene: the same one its rounds carry everywhere */}
      <div data-shared={`course:${summary.slug}`} data-shared-hero className="mt-2 h-28 overflow-hidden rounded-2xl">
        <CourseScene course={summary.name} className="h-full w-full" />
      </div>

      {/* The verdict */}
      <Card className="mt-3 p-4">
        {summary.avg != null ? (
          <div className="flex items-center gap-4">
            <div>
              <p className="text-hero font-extrabold text-ink tabular-nums leading-none">{fmtStars(summary.avg)}</p>
              <StarRating value={summary.avg} size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-footnote text-ink-dim">
                from {summary.ratings.length} of {members.length} golfers
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {summary.groupRank != null && (
                  <Pill tone={summary.groupRank === 1 ? 'gold' : 'default'}>
                    Group’s {ordinal(summary.groupRank)}
                  </Pill>
                )}
                {summary.myRank != null && <Pill tone="green">Your {ordinal(summary.myRank)}</Pill>}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-footnote text-ink-dim">Nobody's rated it yet.</p>
        )}
      </Card>

      {/* The details: the group's average on each, with your own score
          beside it, so you can see where you part ways with everyone. */}
      {detailed.length > 0 && (
        <>
          <SectionLabel>The details</SectionLabel>
          <Card className="divide-y divide-line">
            {myAspects && (
              <div className="flex items-center gap-3 px-4 py-2 text-caption font-bold text-ink-faint">
                <span className="flex-1" />
                <span className="w-[92px] text-right">Group</span>
                <span className="w-9 text-right">You</span>
              </div>
            )}
            {detailed.map((a) => {
              const v = summary.aspectAvg[a.key]!
              const mineHere = summary.mine?.aspects?.[a.key]
              return (
                <div key={a.key} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-footnote font-bold text-ink">{a.label}</p>
                    <p className="text-caption text-ink-faint">{a.hint}</p>
                  </div>
                  <StarRating value={v} size={12} />
                  <span className="w-8 text-right text-footnote font-extrabold text-ink tabular-nums">{fmtStars(v)}</span>
                  {myAspects && (
                    <span className="w-9 text-right text-footnote font-bold text-ink-dim tabular-nums">{mineHere != null ? `${mineHere}★` : '–'}</span>
                  )}
                </div>
              )
            })}
          </Card>
        </>
      )}

      {/* Everyone's take, yours first: one list, so your review sits with
          the rest rather than off on its own. */}
      <SectionLabel
        action={
          summary.mine && !editing ? (
            <button onClick={() => setEditing(true)} className="text-footnote font-bold text-green">
              Edit yours
            </button>
          ) : undefined
        }
      >
        Everyone’s take
      </SectionLabel>
      {editing && (
        <div className="mb-3">
          <CourseRatingEditor courseName={summary.name} onDone={() => setEditing(false)} />
          {summary.mine && (
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: `Remove your rating of ${summary.name}?`,
                  body: 'It comes off the group average. Your spot on your own list stays.',
                  confirmLabel: 'Remove it',
                  danger: true,
                })
                if (ok && summary.mine) {
                  deleteCourseRating(summary.mine.id)
                  setEditing(false)
                }
              }}
              className="mt-2 px-1 text-footnote font-bold text-flag"
            >
              Remove my rating
            </button>
          )}
        </div>
      )}
      <Card className="divide-y divide-line">
        {!summary.mine && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="flex w-full items-center gap-3 bg-green-soft/40 px-4 py-3 text-left active:bg-green-soft">
            <IconTile name="star" tone="gold" size={28} />
            <span className="flex-1 text-footnote font-bold text-ink">Rate {summary.name}</span>
            <span className="shrink-0 text-footnote font-bold text-green">Rate →</span>
          </button>
        )}
        {[...(summary.mine ? [summary.mine] : []), ...others].map((r) => {
          const p = data.players.find((pl) => pl.id === r.playerId)
          if (!p) return null
          const isMe = r.playerId === data.currentUserId
          return (
            <div key={r.id} className={`flex items-start gap-3 px-4 py-3 ${isMe ? 'bg-green-soft/30' : ''}`}>
              <Avatar player={p} size={28} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-footnote font-bold text-ink">{isMe ? 'You' : p.name}</span>
                  <StarRating value={r.overall} size={11} />
                  <span className="text-caption text-ink-faint ml-auto tabular-nums">{shortDate(r.date)}</span>
                </div>
                {r.note && <p className="text-footnote text-ink-dim mt-0.5">{r.note}</p>}
                {r.aspects && Object.keys(r.aspects).length > 0 && (
                  <p className="text-caption text-ink-faint mt-1 tabular-nums">
                    {RATING_ASPECTS.filter((a) => r.aspects?.[a.key] != null)
                      .map((a) => `${a.label} ${r.aspects![a.key]}★`)
                      .join(' · ')}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </Card>

      {/* Reference data */}
      <SectionLabel>Scorecard</SectionLabel>
      <Card
        onClick={() => navigate(`/courses/${encodeURIComponent(slug)}/card`)}
        className="p-4 flex items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <p className="text-body font-bold text-ink">
            {course?.nines
              ? `27 holes: ${course.nines.map((n) => n.name).join(', ')}`
              : par != null
                ? `Par ${par}`
                : parsIn > 0
                  ? `${parsIn} of ${HOLE_COUNT} holes`
                  : 'No par yet'}
          </p>
          {course?.nines && (
            <p className="text-footnote text-ink-dim mt-0.5">
              Any two make a round, picked when it's logged. The par and index here are {course.nines[0].name} then {course.nines[1].name}.
            </p>
          )}
          <p className="text-footnote text-ink-dim mt-0.5">
            {par == null
              ? 'Eighteen taps off the card, and every round here shows scores against par.'
              : [
                  hasStrokeIndex(course) ? 'stroke index in' : 'no stroke index',
                  hasSlopeRating(course) ? `${course.rating}/${course.slope}` : 'no rating/slope',
                ].join(' · ')}
          </p>
        </div>
        {par == null ? <Pill tone="gold">Add par</Pill> : <span className="text-footnote font-bold text-green shrink-0">Edit →</span>}
      </Card>

      {/* The drawn holes and GPS distances, once the map is in. */}
      {course && (
        <Card onClick={() => navigate(`/courses/${encodeURIComponent(slug)}/map`)} className="p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-body font-bold text-ink">Hole map</p>
            <p className="text-footnote text-ink-dim mt-0.5">
              {courseMap === undefined
                ? 'Checking…'
                : courseMap
                  ? `${courseMap.holes.length} holes drawn, with GPS distances on the card`
                  : 'Not yet. Get it from OpenStreetMap for drawn holes and GPS distances.'}
            </p>
          </div>
          <span className="text-footnote font-bold text-green shrink-0">{courseMap ? 'See it →' : 'Get it →'}</span>
        </Card>
      )}

      {/* Every tee box, so "which tees are we playing" has an answer on
          the first one. Men's sets only; the women's ratings are stored
          but this group doesn't play off them. */}
      {course?.tees && course.tees.some((t) => (t.gender ?? 'M') === 'M') && (
        <>
          <SectionLabel>Tees</SectionLabel>
          <Card>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-2 border-b border-line text-footnote font-semibold text-ink-dim">
              <span>Tee</span>
              <span className="text-right">Yards</span>
              <span className="text-right">Rating / slope</span>
            </div>
            {course.tees
              .filter((t) => (t.gender ?? 'M') === 'M')
              .map((t) => {
                const isDefault = course.rating === t.rating && course.slope === t.slope
                return (
                  <div
                    key={t.name}
                    className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-4 py-2.5 border-b border-line last:border-0 text-footnote"
                  >
                    <span className={`truncate ${isDefault ? 'font-bold text-ink' : 'font-bold text-ink-dim'}`}>
                      {t.name}
                      {isDefault && <span className="ml-1.5 text-caption font-semibold text-green">default</span>}
                    </span>
                    <span className="text-right tabular-nums text-ink-dim">{t.yards ?? '—'}</span>
                    <span className="text-right tabular-nums font-bold text-ink">
                      {t.rating} / {t.slope}
                    </span>
                  </div>
                )
              })}
          </Card>
          <p className="text-caption text-ink-faint px-2 mt-2">
            A round that names its tee plays off that tee’s numbers. Rounds that don’t use the default.
          </p>
        </>
      )}

      {rounds.length > 0 && (
        <>
          <SectionLabel>Rounds here</SectionLabel>
          <Card className="divide-y divide-line">
            {rounds.slice(0, 6).map((r) => {
              const standings = roundStandings(r)
              const winner = standings.length ? data.players.find((p) => p.id === standings[0].playerId) : undefined
              return (
                <button
                  key={r.id}
                  onClick={() => navigate(`/rounds/${r.id}`)}
                  className="w-full text-left flex items-center gap-3 px-4 py-3 active:bg-paper"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-footnote font-bold text-ink tabular-nums">{shortDate(r.date)}</p>
                    <p className="text-caption text-ink-faint">
                      {r.players.length} golfer{r.players.length === 1 ? '' : 's'}
                      {winner && standings.length > 1 && ` · ${winner.name} took it`}
                    </p>
                  </div>
                  <span className="text-footnote font-bold text-green shrink-0">Open →</span>
                </button>
              )
            })}
          </Card>
          {rounds.length > 6 && (
            <p className="text-caption text-ink-faint px-2 mt-2">Showing the latest six of {rounds.length}.</p>
          )}
        </>
      )}
      <div className="h-4" />
    </div>
  )
}

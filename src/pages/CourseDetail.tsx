import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMembers, useStore } from '../data/store'
import { courseSlug, coursePar, hasSlopeRating, hasStrokeIndex, parsEntered } from '../lib/courses'
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

// One course: what the group thinks of it, what you think of it, and
// the reference data (scorecard, rounds played) underneath.

export default function CourseDetail() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const goBack = useGoBack('/courses')
  const { data, deleteCourseRating } = useStore()
  const members = useMembers()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)

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

      {/* Yours */}
      <SectionLabel
        action={
          summary.mine && !editing ? (
            <button onClick={() => setEditing(true)} className="text-footnote font-bold text-green">
              Edit
            </button>
          ) : undefined
        }
      >
        Your take
      </SectionLabel>
      {editing ? (
        <>
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
        </>
      ) : summary.mine ? (
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <StarRating value={summary.mine.overall} size={16} />
            <span className="text-body font-extrabold text-ink tabular-nums">{summary.mine.overall}</span>
            <span className="text-caption text-ink-faint ml-auto">{shortDate(summary.mine.date)}</span>
          </div>
          {summary.mine.note && <p className="text-footnote text-ink-dim mt-2">{summary.mine.note}</p>}
          {summary.mine.aspects && Object.keys(summary.mine.aspects).length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {RATING_ASPECTS.filter((a) => summary.mine!.aspects?.[a.key] != null).map((a) => (
                <div key={a.key} className="flex items-center justify-between text-footnote">
                  <span className="text-ink-dim">{a.label}</span>
                  <span className="font-bold text-ink tabular-nums">{summary.mine!.aspects![a.key]}★</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <Card onClick={() => setEditing(true)} className="p-4 border-green/30 bg-green-soft/40 flex items-center gap-3">
          <IconTile name="star" tone="gold" />
          <div className="flex-1 min-w-0">
            <p className="text-body font-bold text-ink">Rate {summary.name}</p>
          </div>
          <span className="text-footnote font-bold text-green shrink-0">Rate →</span>
        </Card>
      )}

      {/* The details, averaged, only where anyone said anything */}
      {detailed.length > 0 && (
        <>
          <SectionLabel>The details</SectionLabel>
          <Card className="divide-y divide-line">
            {detailed.map((a) => {
              const v = summary.aspectAvg[a.key]!
              return (
                <div key={a.key} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-footnote font-bold text-ink">{a.label}</p>
                    <p className="text-caption text-ink-faint">{a.hint}</p>
                  </div>
                  <StarRating value={v} size={12} />
                  <span className="w-8 text-right text-footnote font-extrabold text-ink tabular-nums">{fmtStars(v)}</span>
                </div>
              )
            })}
          </Card>
        </>
      )}

      {/* Everyone else */}
      {others.length > 0 && (
        <>
          <SectionLabel>Everyone’s take</SectionLabel>
          <Card className="divide-y divide-line">
            {others.map((r) => {
              const p = data.players.find((pl) => pl.id === r.playerId)
              if (!p) return null
              return (
                <div key={r.id} className="flex items-start gap-3 px-4 py-3">
                  <Avatar player={p} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-footnote font-bold text-ink">{p.name}</span>
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
        </>
      )}

      {/* Reference data */}
      <SectionLabel>Scorecard</SectionLabel>
      <Card
        onClick={() => navigate(`/courses/${encodeURIComponent(slug)}/card`)}
        className="p-4 flex items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <p className="text-body font-bold text-ink">
            {par != null ? `Par ${par}` : parsIn > 0 ? `${parsIn} of ${HOLE_COUNT} holes` : 'No par yet'}
          </p>
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

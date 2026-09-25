import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMembers, useStore } from '../data/store'
import { courseSlug, coursePar, hasSlopeRating, hasStrokeIndex, parsEntered } from '../lib/courses'
import { HOLE_COUNT } from '../lib/holes'
import { RATING_ASPECTS, courseSummaries, fmtStars, ordinal } from '../lib/ratings'
import { roundStandings, shortDate } from '../lib/stats'
import { useGoBack } from '../lib/nav'
import { useConfirm } from '../components/Confirm'
import CourseRatingEditor from '../components/CourseRatingEditor'
import { StarRating } from '../components/Stars'
import { Avatar, Card, Pill, SectionLabel } from '../components/ui'

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
        <button onClick={() => goBack()} className="text-[13px] font-bold text-ink-faint mb-2">
          ← Back
        </button>
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink leading-tight">{summary.name}</h1>
        <p className="text-[13px] text-ink-dim mt-1 tabular-nums">
          {course?.town && `${course.town} · `}
          {summary.rounds > 0 ? `${summary.rounds} round${summary.rounds === 1 ? '' : 's'}` : 'No rounds logged'}
          {summary.lastPlayed && ` · last ${shortDate(summary.lastPlayed)}`}
          {par != null && ` · par ${par}`}
          {hasSlopeRating(course) && ` · ${course.rating}/${course.slope}`}
        </p>
      </header>

      {/* The verdict */}
      <Card className="mt-2 p-4">
        {summary.avg != null ? (
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[34px] font-extrabold text-ink tabular-nums leading-none">{fmtStars(summary.avg)}</p>
              <StarRating value={summary.avg} size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-ink-dim">
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
          <p className="text-[13.5px] text-ink-dim">Nobody has rated it yet. Be the first — it takes one tap.</p>
        )}
      </Card>

      {/* Yours */}
      <SectionLabel
        action={
          summary.mine && !editing ? (
            <button onClick={() => setEditing(true)} className="text-[12.5px] font-bold text-green">
              Edit
            </button>
          ) : undefined
        }
      >
        Your take
      </SectionLabel>
      {editing ? (
        <CourseRatingEditor courseName={summary.name} onDone={() => setEditing(false)} />
      ) : summary.mine ? (
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <StarRating value={summary.mine.overall} size={16} />
            <span className="text-[14px] font-extrabold text-ink tabular-nums">{summary.mine.overall}</span>
            <span className="text-[11.5px] text-ink-faint ml-auto">{shortDate(summary.mine.date)}</span>
          </div>
          {summary.mine.note && <p className="text-[13px] text-ink-dim mt-2">{summary.mine.note}</p>}
          {summary.mine.aspects && Object.keys(summary.mine.aspects).length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {RATING_ASPECTS.filter((a) => summary.mine!.aspects?.[a.key] != null).map((a) => (
                <div key={a.key} className="flex items-center justify-between text-[12px]">
                  <span className="text-ink-dim">{a.label}</span>
                  <span className="font-bold text-ink tabular-nums">{summary.mine!.aspects![a.key]}★</span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={async () => {
              const ok = await confirm({
                title: `Remove your rating of ${summary.name}?`,
                body: 'It comes off the group average. Your spot on your own list stays.',
                confirmLabel: 'Remove it',
                danger: true,
              })
              if (ok && summary.mine) deleteCourseRating(summary.mine.id)
            }}
            className="mt-3 text-[11.5px] font-bold text-flag/70"
          >
            Remove rating
          </button>
        </Card>
      ) : (
        <Card onClick={() => setEditing(true)} className="p-4 border-green/30 bg-green-soft/40 flex items-center gap-3">
          <span className="text-[20px]">⭐</span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-extrabold text-ink">Rate {summary.name}</p>
            <p className="text-[12px] text-ink-dim mt-0.5">One overall out of five. The details are optional.</p>
          </div>
          <span className="text-[13px] font-bold text-green shrink-0">Rate →</span>
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
                    <p className="text-[13.5px] font-bold text-ink">{a.label}</p>
                    <p className="text-[11px] text-ink-faint">{a.hint}</p>
                  </div>
                  <StarRating value={v} size={12} />
                  <span className="w-8 text-right text-[13.5px] font-extrabold text-ink tabular-nums">{fmtStars(v)}</span>
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
                      <span className="text-[13.5px] font-bold text-ink">{p.name}</span>
                      <StarRating value={r.overall} size={11} />
                      <span className="text-[11px] text-ink-faint ml-auto tabular-nums">{shortDate(r.date)}</span>
                    </div>
                    {r.note && <p className="text-[12.5px] text-ink-dim mt-0.5">{r.note}</p>}
                    {r.aspects && Object.keys(r.aspects).length > 0 && (
                      <p className="text-[11px] text-ink-faint mt-1 tabular-nums">
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
          <p className="text-[14px] font-bold text-ink">
            {par != null ? `Par ${par}` : parsIn > 0 ? `${parsIn} of ${HOLE_COUNT} holes` : 'No par yet'}
          </p>
          <p className="text-[12px] text-ink-dim mt-0.5">
            {par == null
              ? 'Eighteen taps off the card, and every round here shows scores against par.'
              : [
                  hasStrokeIndex(course) ? 'stroke index in' : 'no stroke index',
                  hasSlopeRating(course) ? `${course.rating}/${course.slope}` : 'no rating/slope',
                ].join(' · ')}
          </p>
        </div>
        {par == null ? <Pill tone="gold">Add par</Pill> : <span className="text-[13px] font-bold text-green shrink-0">Edit →</span>}
      </Card>

      {/* Every tee box, so "which tees are we playing" has an answer on
          the first one. Men's sets only; the women's ratings are stored
          but this group doesn't play off them. */}
      {course?.tees && course.tees.some((t) => (t.gender ?? 'M') === 'M') && (
        <>
          <SectionLabel>Tees</SectionLabel>
          <Card>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-2 border-b border-line text-[9.5px] font-bold uppercase tracking-wider text-ink-faint">
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
                    className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-4 py-2.5 border-b border-line last:border-0 text-[13px]"
                  >
                    <span className={`truncate ${isDefault ? 'font-extrabold text-ink' : 'font-bold text-ink-dim'}`}>
                      {t.name}
                      {isDefault && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-green">default</span>}
                    </span>
                    <span className="text-right tabular-nums text-ink-dim">{t.yards ?? '—'}</span>
                    <span className="text-right tabular-nums font-bold text-ink">
                      {t.rating} / {t.slope}
                    </span>
                  </div>
                )
              })}
          </Card>
          <p className="text-[11px] text-ink-faint px-2 mt-2">
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
                    <p className="text-[13.5px] font-bold text-ink tabular-nums">{shortDate(r.date)}</p>
                    <p className="text-[11.5px] text-ink-faint">
                      {r.players.length} golfer{r.players.length === 1 ? '' : 's'}
                      {winner && standings.length > 1 && ` · ${winner.name} took it`}
                    </p>
                  </div>
                  <span className="text-[12px] font-bold text-green shrink-0">Open →</span>
                </button>
              )
            })}
          </Card>
          {rounds.length > 6 && (
            <p className="text-[11.5px] text-ink-faint px-2 mt-2">Showing the latest six of {rounds.length}.</p>
          )}
        </>
      )}
      <div className="h-4" />
    </div>
  )
}

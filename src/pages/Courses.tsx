import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMembers, useStore } from '../data/store'
import { hasPars } from '../lib/courses'
import { byGroupRank, byRating, courseSummaries, fmtStars, moveBy, myRanking, ordinal } from '../lib/ratings'
import { StarRating } from '../components/Stars'
import { Card, EmptyState, HelpTip, Pill, SectionLabel } from '../components/ui'

// Every course the group has played, two ways: how it rates, and how it
// ranks. Stars are the honest scale but bunch up around four; the
// ranking is where the order actually lives. The scorecard (par, stroke
// index, slope) moved down to each course's own page — it's reference
// data, not an opinion.

type View = 'ratings' | 'rankings'

export default function Courses() {
  const { data, setMyRanking } = useStore()
  const members = useMembers()
  const navigate = useNavigate()
  const [view, setView] = useState<View>('ratings')

  const rows = courseSummaries(data)
  const rated = rows.filter((r) => r.ratings.length > 0).length
  const needCard = rows.filter((r) => r.rounds > 0 && !hasPars(data.courses.find((c) => c.slug === r.slug))).length
  const mine = myRanking(data)
  const unranked = rows.filter((r) => !mine.includes(r.slug) && r.rounds > 0)

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink">Courses</h1>
        <p className="text-[13px] text-ink-dim">
          {rows.length === 0
            ? 'Every course you log a round at turns up here.'
            : `${rows.length} played · ${rated} rated${needCard ? ` · ${needCard} without a scorecard` : ''}`}
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState title="No courses yet" sub="Log a round and the course you played turns up here, ready to be rated." />
      ) : (
        <>
          <div className="flex rounded-xl border border-line-strong overflow-hidden mt-2">
            {(['ratings', 'rankings'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex-1 py-2.5 text-[13px] font-bold capitalize ${view === v ? 'bg-ink text-white' : 'bg-card text-ink-dim'}`}
              >
                {v}
              </button>
            ))}
          </div>

          {view === 'ratings' ? (
            <>
              <SectionLabel>How they rate</SectionLabel>
              <Card className="divide-y divide-line">
                {byRating(rows).map((row) => (
                  <button
                    key={row.slug}
                    onClick={() => navigate(`/courses/${encodeURIComponent(row.slug)}`)}
                    className="w-full text-left flex items-center gap-3 px-4 py-3.5 active:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[14.5px] font-bold text-ink truncate">{row.name}</p>
                      <p className="text-[11.5px] text-ink-faint tabular-nums">
                        {row.rounds > 0 ? `${row.rounds} round${row.rounds === 1 ? '' : 's'}` : 'no rounds yet'}
                        {row.ratings.length > 0 &&
                          ` · ${row.ratings.length} rating${row.ratings.length === 1 ? '' : 's'}`}
                        {row.groupRank != null && ` · group’s ${ordinal(row.groupRank)}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {row.avg != null ? (
                        <div className="flex items-center gap-1.5 justify-end">
                          <StarRating value={row.avg} size={12} />
                          <span className="text-[14px] font-extrabold text-ink tabular-nums">{fmtStars(row.avg)}</span>
                        </div>
                      ) : (
                        <span className="text-[12px] text-ink-faint">no ratings</span>
                      )}
                      <p className="text-[11.5px] mt-0.5">
                        {row.mine ? (
                          <span className="text-ink-faint tabular-nums">You: {row.mine.overall}★</span>
                        ) : (
                          <span className="font-bold text-green">Rate →</span>
                        )}
                      </p>
                    </div>
                  </button>
                ))}
              </Card>
              <p className="text-[11.5px] text-ink-faint px-2 mt-2">
                Tap a course for everyone’s take, the details, and its scorecard.
              </p>
            </>
          ) : (
            <>
              <SectionLabel
                action={<HelpTip title="the group’s order" lines={GROUP_ORDER_RULES} />}
              >
                The group’s order
              </SectionLabel>
              {rows.every((r) => r.groupRank == null) ? (
                <Card className="p-4 text-[13px] text-ink-dim">
                  Nobody has ranked a course yet. Rate one and you’ll be asked where it lands on your list.
                </Card>
              ) : (
                <Card className="divide-y divide-line">
                  {byGroupRank(rows)
                    .filter((r) => r.groupRank != null)
                    .map((row) => (
                      <button
                        key={row.slug}
                        onClick={() => navigate(`/courses/${encodeURIComponent(row.slug)}`)}
                        className="w-full text-left flex items-center gap-3 px-4 py-3 active:bg-paper"
                      >
                        <span
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-extrabold tabular-nums shrink-0 ${
                            row.groupRank === 1 ? 'bg-gold-soft text-gold border border-gold/40' : 'bg-paper text-ink-dim border border-line'
                          }`}
                        >
                          {row.groupRank}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-bold text-ink truncate">{row.name}</p>
                          <p className="text-[11.5px] text-ink-faint">
                            ranked by {row.rankedBy} of {members.length}
                            {row.myRank != null && ` · your ${ordinal(row.myRank)}`}
                          </p>
                        </div>
                        {row.avg != null && (
                          <span className="text-[12.5px] font-bold text-ink-dim tabular-nums shrink-0">{fmtStars(row.avg)}★</span>
                        )}
                      </button>
                    ))}
                </Card>
              )}

              <SectionLabel>Your order</SectionLabel>
              {mine.length === 0 ? (
                <Card className="p-4 text-[13px] text-ink-dim">
                  Nothing on your list yet. Rate a course, or add one from below and sort it with the arrows.
                </Card>
              ) : (
                <Card className="divide-y divide-line">
                  {mine.map((slug, i) => {
                    const row = rows.find((r) => r.slug === slug)
                    if (!row) return null
                    return (
                      <div key={slug} className="flex items-center gap-2.5 px-3 py-2.5">
                        <span className="w-6 text-right text-[13px] font-extrabold tabular-nums text-ink-faint">{i + 1}</span>
                        <button
                          onClick={() => navigate(`/courses/${encodeURIComponent(slug)}`)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <p className="text-[14px] font-bold text-ink truncate">{row.name}</p>
                          {row.mine && <p className="text-[11px] text-ink-faint tabular-nums">you gave it {row.mine.overall}★</p>}
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setMyRanking(moveBy(mine, slug, -1))}
                            disabled={i === 0}
                            aria-label={`Move ${row.name} up`}
                            className="h-9 w-9 rounded-lg border border-line-strong bg-card text-[15px] font-bold text-ink disabled:opacity-25 active:bg-paper"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => setMyRanking(moveBy(mine, slug, 1))}
                            disabled={i === mine.length - 1}
                            aria-label={`Move ${row.name} down`}
                            className="h-9 w-9 rounded-lg border border-line-strong bg-card text-[15px] font-bold text-ink disabled:opacity-25 active:bg-paper"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => setMyRanking(mine.filter((s) => s !== slug))}
                            aria-label={`Take ${row.name} off your list`}
                            className="h-9 w-9 rounded-lg text-[15px] font-bold text-ink-faint active:bg-paper"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </Card>
              )}

              {unranked.length > 0 && (
                <>
                  <SectionLabel>Not on your list</SectionLabel>
                  <Card className="divide-y divide-line">
                    {unranked.map((row) => (
                      <div key={row.slug} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-bold text-ink truncate">{row.name}</p>
                          <p className="text-[11.5px] text-ink-faint">
                            {row.rounds} round{row.rounds === 1 ? '' : 's'}
                            {!row.mine && ' · not rated'}
                          </p>
                        </div>
                        <button
                          onClick={() => setMyRanking([...mine, row.slug])}
                          className="text-[12.5px] font-bold text-green shrink-0"
                        >
                          + Add to the bottom
                        </button>
                      </div>
                    ))}
                  </Card>
                  <p className="text-[11.5px] text-ink-faint px-2 mt-2">Then use the arrows to move it up to where it belongs.</p>
                </>
              )}
            </>
          )}

          {needCard > 0 && view === 'ratings' && (
            <div className="mt-4 px-1 flex items-center gap-2">
              <Pill tone="gold">{needCard}</Pill>
              <p className="text-[12px] text-ink-dim">
                course{needCard === 1 ? '' : 's'} without par yet. Open one and add its scorecard.
              </p>
            </div>
          )}
        </>
      )}
      <div className="h-4" />
    </div>
  )
}

const GROUP_ORDER_RULES = [
  'Everyone keeps their own list of courses, favourite first. This is the group’s lists combined.',
  'Each list hands out points by position — top of your list scores full marks, bottom scores least — so a long list and a short one carry the same weight.',
  'A course’s score is the average across the people who ranked it, pulled slightly toward the middle for every member who hasn’t. One person’s lone favourite doesn’t leapfrog a course three people put near the top.',
  'Ties break on the star rating, then on how often the group actually plays there.',
]

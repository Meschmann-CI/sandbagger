import { useState } from 'react'
import { useNavigate } from '../lib/nav'
import { useLogSheet } from '../components/logSheet'
import { useStore } from '../data/store'
import { byDate, roundStandings, shortDate } from '../lib/stats'
import { fmt1, isSoloRound, pending } from '../types'
import { chip, AvatarStack, Card, EmptyState, Pill, PrimaryButton, RowBadge } from '../components/ui'
import { Icon } from '../components/icons'
import RoundScene from '../components/RoundScene'
import { CourseTile, squareLogo } from '../components/CourseLogo'
import { RoundsCoursesSwitch } from '../components/RoundsCoursesSwitch'

type Filter = 'all' | 'mine' | 'group'

// "September 2026", from the yyyy-mm of a round's date. Built from the
// parts rather than parsed, so the timezone can't shift it a month.
function monthLabel(yyyymm: string) {
  const [y, m] = yyyymm.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default function Rounds() {
  const { data } = useStore()
  const navigate = useNavigate()
  const { open: openLog } = useLogSheet()
  const [filter, setFilter] = useState<Filter>('all')

  const all = byDate(data.rounds).reverse()
  const rounds = all.filter((r) =>
    filter === 'mine' ? r.players.some((p) => p.playerId === data.currentUserId) : filter === 'group' ? !isSoloRound(r) : true,
  )



  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'mine', label: 'Mine' },
    { key: 'group', label: 'Group only' },
  ]

  return (
    <div className="rise">
      {/* One row of controls, not two: the filter is a small pill in the
          title row (the phone's own picker opens from it). */}
      <header className="flex items-center justify-between gap-3 px-1 pb-3 pt-4">
        <h1 className="text-large font-bold tracking-tight text-ink">Rounds</h1>
        <label className={`relative flex items-center gap-1 rounded-full border px-3 py-1.5 text-footnote font-bold ${chip(filter !== 'all')}`}>
          {filters.find((f) => f.key === filter)?.label}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M3 4.5l3 3 3-3" />
          </svg>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="Which rounds"
            className="absolute inset-0 cursor-pointer appearance-none opacity-0"
          >
            {filters.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="mb-2">
        <RoundsCoursesSwitch />
      </div>

      {rounds.length === 0 && (
        <EmptyState
          title={filter === 'mine' ? 'Nothing logged yet' : 'No rounds here'}
          sub="Solo grinds count too."
          cta={<PrimaryButton onClick={() => openLog()}>Log a round</PrimaryButton>}
        />
      )}

      <div>
        {rounds.map((r, i) => {
          const standings = roundStandings(r)
          const top = standings.length ? data.players.find((p) => p.id === standings[0].playerId) : undefined
          const solo = isSoloRound(r)
          const waiting = pending(r)
          const trip = r.tripId ? data.trips.find((t) => t.id === r.tripId) : undefined
          const hasBets = data.bets.some((b) => b.roundId === r.id)
          // A month header wherever the month changes, so a long list
          // reads like a calendar rather than a pile.
          const month = r.date.slice(0, 7)
          const newMonth = i === 0 || rounds[i - 1].date.slice(0, 7) !== month
          return (
            <div key={r.id}>
              {newMonth && (
                <p className={`px-1 text-footnote font-bold text-ink-dim ${i === 0 ? 'mt-3' : 'mt-6'} mb-2`}>
                  {monthLabel(month)}
                </p>
              )}
              <Card onClick={() => navigate(`/rounds/${r.id}`, { shared: r.id })} className={`p-3.5 flex items-center gap-3.5 ${newMonth ? '' : 'border-t-0'}`}>
                {/* The course's logo when it has one that fits a square, else
                    the round's first photo, else the course's scene. The
                    photo or scene grows into the round's header; a logo
                    doesn't, since the header is the scene. */}
                <div
                  data-shared={squareLogo(r.courseName) ? undefined : r.id}
                  className="h-[60px] w-[60px] shrink-0 overflow-hidden rounded-xl bg-paper"
                >
                  {squareLogo(r.courseName) ? (
                    <CourseTile name={r.courseName} className="h-full w-full rounded-xl" />
                  ) : r.photos?.[0] ? (
                    <img src={r.photos[0].url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <RoundScene round={r} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-bold text-body text-ink truncate">{r.courseName}</p>
                    <p className="text-caption text-ink-faint shrink-0 tabular-nums">{shortDate(r.date)}</p>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <AvatarStack players={r.players.map((rp) => data.players.find((pl) => pl.id === rp.playerId))} />
                    <p className="flex-1 text-footnote text-ink-dim truncate">
                      {!top ? (
                        'No scores in yet'
                      ) : waiting.length > 0 ? (
                        <>
                          {top.name} posted <span className="font-bold text-ink tabular-nums">{standings[0].gross}</span> · waiting on{' '}
                          {waiting.length === 1 ? data.players.find((p) => p.id === waiting[0].playerId)?.name : `${waiting.length} more`}
                        </>
                      ) : solo ? (
                        <>
                          {top.name} shot <span className="font-bold text-ink tabular-nums">{standings[0].gross}</span>
                        </>
                      ) : (
                        <>
                          <span className="font-bold text-ink">{top.name}</span> took it · net{' '}
                          <span className="font-bold tabular-nums">{fmt1(standings[0].netScore)}</span>
                        </>
                      )}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      {waiting.length > 0 && <Pill tone="flag">Pending</Pill>}
                      {trip && (
                        <RowBadge tone="sand" label="Trip round">
                          <Icon name="suitcase" size={11} strokeWidth={2.3} />
                        </RowBadge>
                      )}
                      {hasBets && (
                        <RowBadge tone="gold" label="Money on it">
                          $
                        </RowBadge>
                      )}
                      {(r.photos?.length ?? 0) > 0 && (
                        <RowBadge tone="sky" label={`${r.photos!.length} photo${r.photos!.length === 1 ? '' : 's'}`}>
                          <Icon name="camera" size={11} strokeWidth={2.3} />
                          {r.photos!.length > 1 && r.photos!.length}
                        </RowBadge>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )
        })}
      </div>
      <div className="h-4" />
    </div>
  )
}

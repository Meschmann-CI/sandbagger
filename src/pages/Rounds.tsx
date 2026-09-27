import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useNavigate } from '../lib/nav'
import { useLogSheet } from '../components/logSheet'
import { useStore } from '../data/store'
import { byDate, leaderboard, roundStandings, shortDate } from '../lib/stats'
import { todayISO } from '../lib/dates'
import { fmt1, isSoloRound, pending } from '../types'
import { AvatarStack, Card, EmptyState, Meta, Pill, PrimaryButton, RowBadge } from '../components/ui'
import { Icon } from '../components/icons'
import RoundScene from '../components/RoundScene'

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
  const YEAR = todayISO().slice(0, 4)

  const all = byDate(data.rounds).reverse()
  const rounds = all.filter((r) =>
    filter === 'mine' ? r.players.some((p) => p.playerId === data.currentUserId) : filter === 'group' ? !isSoloRound(r) : true,
  )


  // One line on the season, so the list has a headline.
  const season = all.filter((r) => r.date.startsWith(YEAR))
  const leader = leaderboard(data, season).find((row) => row.wins > 0)

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'mine', label: 'Mine' },
    { key: 'group', label: 'Group only' },
  ]

  return (
    <div className="rise">
      <header className="pt-4 pb-3 px-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-large font-bold tracking-tight text-ink">Rounds</h1>
          <Meta
            className="text-footnote text-ink-dim"
            parts={[
              season.length > 0 && `${season.length} this year`,
              `${all.length} on the books`,
              leader && `${leader.player.name} leads with ${leader.wins} win${leader.wins === 1 ? '' : 's'}`,
            ]}
          />
        </div>
        <Link to="/h2h" className="text-footnote font-bold text-green shrink-0 mt-2">
          Standings →
        </Link>
      </header>

      <div className="flex gap-2 mb-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-2 text-footnote font-bold border transition ${
              filter === f.key ? 'bg-forest text-on-forest border-forest' : 'bg-card text-ink-dim border-line-strong'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rounds.length === 0 && (
        <EmptyState
          title={filter === 'mine' ? 'Nothing logged yet' : 'No rounds here'}
          sub="Log one — solo grinds count too."
          cta={<PrimaryButton onClick={() => openLog()}>Log a round</PrimaryButton>}
        />
      )}

      <div className="space-y-3">
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
                <p className={`px-1 text-caption font-bold uppercase tracking-[0.12em] text-ink-faint ${i === 0 ? 'mt-3' : 'mt-6'} mb-2`}>
                  {monthLabel(month)}
                </p>
              )}
              <Card onClick={() => navigate(`/rounds/${r.id}`, { shared: r.id })} className="p-3.5 flex items-center gap-3.5">
                {/* The round's first photo, or its course's scene */}
                <div data-shared={r.id} className="h-[60px] w-[60px] shrink-0 overflow-hidden rounded-xl bg-paper">
                  {r.photos?.[0] ? (
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

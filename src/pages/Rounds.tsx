import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../data/store'
import { byDate, leaderboard, roundStandings, shortDate } from '../lib/stats'
import { todayISO } from '../lib/dates'
import { fmt1, isSoloRound, pending } from '../types'
import { Avatar, Card, EmptyState, Pill, PrimaryButton } from '../components/ui'

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
          <h1 className="text-[26px] font-extrabold tracking-tight text-ink">Rounds</h1>
          <p className="text-[13px] text-ink-dim">
            {season.length} this year · {all.length} on the books
            {leader && ` · ${leader.player.name} leads with ${leader.wins}`}
          </p>
        </div>
        <Link to="/h2h" className="text-[12.5px] font-bold text-green shrink-0 mt-2">
          Standings →
        </Link>
      </header>

      <div className="flex gap-2 mb-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-2 text-[13px] font-bold border transition ${
              filter === f.key ? 'bg-ink text-white border-ink' : 'bg-card text-ink-dim border-line-strong'
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
          cta={<PrimaryButton onClick={() => navigate('/log')}>Log a round</PrimaryButton>}
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
                <p className={`px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint ${i === 0 ? 'mt-3' : 'mt-6'} mb-2`}>
                  {monthLabel(month)}
                </p>
              )}
              <Card onClick={() => navigate(`/rounds/${r.id}`)} className="p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-bold text-[14.5px] text-ink truncate">{r.courseName}</p>
                  <p className="text-[11.5px] text-ink-faint shrink-0 tabular-nums">{shortDate(r.date)}</p>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="flex -space-x-1.5">
                    {r.players.map((rp) => {
                      const p = data.players.find((pl) => pl.id === rp.playerId)!
                      return (
                        <span key={rp.playerId} className="rounded-full ring-2 ring-card">
                          <Avatar player={p} size={24} />
                        </span>
                      )
                    })}
                  </div>
                  <p className="flex-1 text-[12.5px] text-ink-dim truncate">
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
                        <span className="font-extrabold text-ink">{top.name}</span> took it · net{' '}
                        <span className="font-bold tabular-nums">{fmt1(standings[0].netScore)}</span>
                      </>
                    )}
                  </p>
                  <div className="flex gap-1.5 shrink-0">
                    {waiting.length > 0 && <Pill tone="flag">Pending</Pill>}
                    {solo && waiting.length === 0 && <Pill>Solo</Pill>}
                    {trip && <Pill tone="green">Trip</Pill>}
                    {hasBets && <Pill tone="gold">$</Pill>}
                    {(r.photos?.length ?? 0) > 0 && <Pill>📷 {r.photos!.length}</Pill>}
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

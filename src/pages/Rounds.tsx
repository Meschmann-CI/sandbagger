import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../data/store'
import { byDate, roundStandings, shortDate } from '../lib/stats'
import { fmt1, isGroupRound } from '../types'
import { Avatar, Card, EmptyState, Pill, PrimaryButton } from '../components/ui'

type Filter = 'all' | 'mine' | 'group'

export default function Rounds() {
  const { data } = useStore()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')

  const all = byDate(data.rounds).reverse()
  const rounds = all.filter((r) =>
    filter === 'mine' ? r.players.some((p) => p.playerId === data.currentUserId) : filter === 'group' ? isGroupRound(r) : true,
  )

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'mine', label: 'Mine' },
    { key: 'group', label: 'Group only' },
  ]

  return (
    <div className="rise">
      <header className="pt-4 pb-3 px-1">
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink">Rounds</h1>
        <p className="text-[13px] text-ink-dim">{all.length} on the books</p>
      </header>

      <div className="flex gap-2 mb-4">
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
        {rounds.map((r) => {
          const standings = roundStandings(r)
          const top = data.players.find((p) => p.id === standings[0].playerId)!
          const solo = !isGroupRound(r)
          const trip = r.tripId ? data.trips.find((t) => t.id === r.tripId) : undefined
          const hasBets = data.bets.some((b) => b.roundId === r.id)
          return (
            <Card key={r.id} onClick={() => navigate(`/rounds/${r.id}`)} className="p-4">
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
                  {solo ? (
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
                  {solo && <Pill>Solo</Pill>}
                  {trip && <Pill tone="green">Trip</Pill>}
                  {hasBets && <Pill tone="gold">$</Pill>}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

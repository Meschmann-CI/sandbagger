import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { canSeeTrip, fmt1, isGroupRound, net, round1 } from '../types'
import { prettyDate, roundStandings, saddamState } from '../lib/stats'
import { Avatar, Card, MoneyBadge, Pill, SaddamBadge, SectionLabel } from '../components/ui'

export default function RoundDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, deleteRound } = useStore()
  const round = data.rounds.find((r) => r.id === id)

  if (!round) {
    return (
      <div className="pt-16 text-center text-ink-dim">
        Round not found. <Link to="/rounds" className="text-green font-bold">Back to rounds</Link>
      </div>
    )
  }

  const standings = roundStandings(round)
  const top = data.players.find((p) => p.id === standings[0].playerId)!
  // The round itself is group history, but don't name a trip the viewer
  // isn't part of.
  const tripRecord = round.tripId ? data.trips.find((t) => t.id === round.tripId) : undefined
  const trip = tripRecord && canSeeTrip(tripRecord, data.currentUserId) ? tripRecord : undefined
  const bets = data.bets.filter((b) => b.roundId === round.id)
  const solo = !isGroupRound(round)
  const margin = standings.length > 1 ? round1(standings[1].netScore - standings[0].netScore) : 0
  const saddam = saddamState(data)
  const saddamChangedHere = saddam.since === round.date && saddam.holderId === standings[0].playerId && !solo

  const blurb = solo
    ? `${top.name} out on the solo grind. ${standings[0].gross} on the card.`
    : margin === 0
      ? 'Dead heat at the top. Nobody gets bragging rights today.'
      : margin >= 8
        ? `${top.name} won by ${fmt1(margin)}. That's not a win, that's a crime scene.`
        : margin >= 4
          ? `${top.name} won comfortably by ${fmt1(margin)}.`
          : `${top.name} escaped with it by ${fmt1(margin)}.`

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <button onClick={() => navigate(-1)} className="text-[13px] font-bold text-ink-faint mb-2">← Back</button>
        <h1 className="text-[24px] font-extrabold tracking-tight leading-tight text-ink">{round.courseName}</h1>
        <p className="text-[13px] text-ink-dim mt-1">
          {prettyDate(round.date)}
          {round.tee && ` · ${round.tee} tees`}
        </p>
        <div className="flex gap-2 mt-2">
          {solo && <Pill>Solo round</Pill>}
          {trip && (
            <Link to={`/trips/${trip.id}`}>
              <Pill tone="green">⛳ {trip.name}</Pill>
            </Link>
          )}
        </div>
      </header>

      <Card className="mt-2 p-4">
        <p className="text-[14.5px] font-bold text-ink leading-snug">{blurb}</p>
        {saddamChangedHere && (
          <p className="mt-2 flex items-center gap-2 text-[13px] text-ink-dim">
            <SaddamBadge size={16} /> The Saddam changed hands here. {top.name} carries it now.
          </p>
        )}
      </Card>

      <SectionLabel>Scorecard</SectionLabel>
      <Card>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-2.5 border-b border-line text-[10px] font-bold uppercase tracking-wider text-ink-faint">
          <span>Player</span>
          <span className="w-12 text-right">Net</span>
          <span className="w-10 text-right">Gross</span>
          <span className="w-10 text-right">Hcp</span>
        </div>
        {standings.map((s) => {
          const p = data.players.find((pl) => pl.id === s.playerId)!
          const rp = round.players.find((x) => x.playerId === s.playerId)!
          return (
            <div key={s.playerId} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center px-4 py-3 border-b border-line last:border-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {!solo && <span className={`font-extrabold w-4 tabular-nums ${s.rank === 1 ? 'text-gold' : 'text-ink-faint'}`}>{s.rank}</span>}
                <Avatar player={p} size={30} />
                <span className={`truncate text-[14px] ${s.rank === 1 && !solo ? 'font-extrabold text-ink' : 'text-ink-dim'}`}>{p.name}</span>
              </div>
              <span className="w-12 text-right text-[16px] font-extrabold text-ink tabular-nums">{fmt1(net(rp))}</span>
              <span className="w-10 text-right text-[13px] text-ink-dim tabular-nums">{rp.gross}</span>
              <span className="w-10 text-right text-[12px] text-ink-faint tabular-nums">{fmt1(rp.handicapSnapshot)}</span>
            </div>
          )
        })}
      </Card>

      {bets.length > 0 && (
        <>
          <SectionLabel>Money Games</SectionLabel>
          <div className="space-y-3">
            {bets.map((bet) => (
              <Card key={bet.id} className="p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-bold text-[14px] text-ink">{bet.name}</p>
                  <p className="text-[11.5px] text-ink-faint tabular-nums">${bet.stake} stake</p>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  {[...bet.results]
                    .sort((a, b) => b.amount - a.amount)
                    .map((res) => {
                      const p = data.players.find((pl) => pl.id === res.playerId)!
                      return (
                        <div key={res.playerId} className="flex items-center justify-between text-[13.5px]">
                          <span className="text-ink-dim">{p.name}</span>
                          <MoneyBadge amount={res.amount} />
                        </div>
                      )
                    })}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="mt-8 mb-4 text-center">
        <button
          onClick={() => {
            if (confirm('Delete this round? The ledger forgets nothing... except this.')) {
              deleteRound(round.id)
              navigate('/rounds')
            }
          }}
          className="text-[12.5px] font-bold text-flag/80"
        >
          Delete round
        </button>
      </div>
    </div>
  )
}

import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../data/store'
import { byDate, playerStats, roundStandings, saddamState, shortDate } from '../lib/stats'
import { canSeeTrip, fmt1, isSoloRound, pending } from '../types'
import { Avatar, Card, Pill, SaddamIcon, SectionLabel } from '../components/ui'

const TODAY = new Date().toISOString().slice(0, 10)

export default function Home() {
  const { data } = useStore()
  const navigate = useNavigate()
  const me = data.players.find((p) => p.id === data.currentUserId)!
  const saddam = saddamState(data)
  const holder = data.players.find((p) => p.id === saddam.holderId)
  const rounds = byDate(data.rounds)
  const recent = rounds.slice(-3).reverse()
  const awaiting = playerStats(data, me.id).awaitingScore.slice().reverse()

  const visibleTrips = data.trips.filter((t) => canSeeTrip(t, me.id))
  const planning = visibleTrips.filter((t) => t.status === 'planning')
  const upcoming = visibleTrips
    .filter((t) => t.status === 'booked' && t.startDate && t.startDate >= TODAY)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
  const heroTrip = upcoming[0] ?? planning[0]
  const heroIsPlanning = heroTrip?.status === 'planning'
  const votesIn = heroIsPlanning ? new Set(heroTrip.options.flatMap((o) => o.votes)).size : 0
  const myVoteCast = heroIsPlanning && heroTrip.options.some((o) => o.votes.includes(me.id))

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1 flex items-center justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-faint">{data.group.name}</p>
          <h1 className="text-[26px] font-extrabold tracking-tight text-ink">
            Hey, {me.name} <span className="align-middle">👋</span>
          </h1>
        </div>
        <Link to="/profile">
          <Avatar player={me} size={40} />
        </Link>
      </header>

      {/* Rounds someone logged you into without your score */}
      {awaiting.length > 0 && (
        <Card
          onClick={() => navigate(`/rounds/${awaiting[0].id}`)}
          className="mt-2 p-4 border-gold/40 bg-gold-soft/60 flex items-center gap-3.5"
        >
          <span className="text-[22px]">📝</span>
          <div className="flex-1 min-w-0">
            <p className="text-[14.5px] font-extrabold text-ink">
              {awaiting.length === 1 ? 'You owe a score' : `You owe ${awaiting.length} scores`}
            </p>
            <p className="text-[12.5px] text-ink-dim mt-0.5 truncate">
              {awaiting.length === 1
                ? `${awaiting[0].courseName}, ${shortDate(awaiting[0].date)}`
                : `Starting with ${awaiting[0].courseName}, ${shortDate(awaiting[0].date)}`}
            </p>
          </div>
          <span className="text-[13px] font-bold text-green shrink-0">Add it →</span>
        </Card>
      )}

      {/* Next trip — the centerpiece */}
      {heroTrip ? (
        <Card onClick={() => navigate(`/trips/${heroTrip.id}`)} className="mt-2 overflow-hidden">
          <div className="bg-green px-5 pt-5 pb-4 text-white relative overflow-hidden">
            <svg className="absolute right-0 bottom-0 h-full w-40 opacity-15" viewBox="0 0 160 100" preserveAspectRatio="none">
              <path d="M0 100 Q40 55 90 70 T160 45 V100 Z" fill="#fff" />
              <path d="M20 100 Q70 70 120 85 T160 75 V100 Z" fill="#fff" opacity="0.7" />
            </svg>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/75">
              {heroIsPlanning ? 'Trip in the works' : 'Next trip'}
            </p>
            <h2 className="text-[22px] font-extrabold leading-tight mt-0.5">{heroTrip.name}</h2>
            <p className="text-[13px] text-white/85 mt-1">
              {heroIsPlanning
                ? `${heroTrip.options.length} destination${heroTrip.options.length === 1 ? '' : 's'} on the table`
                : `${heroTrip.location}${heroTrip.startDate ? ` · ${shortDate(heroTrip.startDate)}` : ''}`}
            </p>
          </div>
          <div className="px-5 py-3.5 flex items-center justify-between">
            {heroIsPlanning ? (
              <>
                <p className="text-[13px] text-ink-dim">
                  {votesIn} of {heroTrip.attendeeIds.length} votes in
                </p>
                <span className={`text-[13.5px] font-bold ${myVoteCast ? 'text-ink-faint' : 'text-green'}`}>
                  {myVoteCast ? 'Vote cast ✓' : 'Cast your vote →'}
                </span>
              </>
            ) : (
              <>
                <p className="text-[13px] text-ink-dim">Itinerary, tee times, standings</p>
                <span className="text-[13.5px] font-bold text-green">Open →</span>
              </>
            )}
          </div>
        </Card>
      ) : (
        <Card className="mt-2 p-5 text-center">
          <p className="font-extrabold text-[16px] text-ink">No trip on the calendar</p>
          <p className="text-[13px] text-ink-dim mt-1">Start one and get the debate going.</p>
          <button onClick={() => navigate('/trips/new')} className="mt-3 rounded-xl bg-green px-5 py-2.5 font-bold text-[14px] text-white">
            Plan a trip
          </button>
        </Card>
      )}

      {/* The Saddam — always shown, so it's obvious who's carrying it */}
      <Card
        onClick={() => navigate('/saddam')}
        className="mt-3 p-4 flex items-center gap-3.5 border-gold/30 bg-gold-soft/40"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-card border border-gold/30 text-ink shrink-0">
          <SaddamIcon size={32} />
        </span>
        <div className="flex-1 min-w-0">
          {holder ? (
            <>
              <p className="text-[14.5px] text-ink">
                <span className="font-extrabold">{holder.name}</span> holds the Saddam
              </p>
              <p className="text-[12px] text-ink-dim mt-0.5">
                {saddam.byHand ? 'Handed over' : 'Won'} {saddam.since && shortDate(saddam.since)}
                {saddam.courseName && ` at ${saddam.courseName}`}
                {saddam.defenses > 0 && ` · ${saddam.defenses} defense${saddam.defenses === 1 ? '' : 's'}`}
              </p>
            </>
          ) : (
            <>
              <p className="text-[14.5px] font-extrabold text-ink">The Saddam is up for grabs</p>
              <p className="text-[12px] text-ink-dim mt-0.5">Win a group round to take it, or hand it to whoever has it.</p>
            </>
          )}
        </div>
        <span className="text-[12.5px] font-bold text-green shrink-0">{holder ? 'History →' : 'Set it →'}</span>
      </Card>

      {/* Recent rounds */}
      <SectionLabel
        action={
          <Link to="/rounds" className="text-[12.5px] font-bold text-green">
            All rounds →
          </Link>
        }
      >
        Recent Rounds
      </SectionLabel>
      {recent.length === 0 && (
        <Card className="p-5 text-center">
          <p className="text-[14px] font-bold text-ink">No rounds logged yet</p>
          <p className="text-[13px] text-ink-dim mt-1">
            Log one and the records start keeping themselves. Solo rounds count too.
          </p>
          <button onClick={() => navigate('/log')} className="mt-3 rounded-xl bg-green px-5 py-2.5 text-[14px] font-bold text-white">
            Log a round
          </button>
        </Card>
      )}
      <div className="space-y-3">
        {recent.map((r) => {
          const standings = roundStandings(r)
          const top = standings.length ? data.players.find((p) => p.id === standings[0].playerId) : undefined
          const solo = isSoloRound(r)
          const waiting = pending(r)
          return (
            <Card key={r.id} onClick={() => navigate(`/rounds/${r.id}`)} className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-bold text-[14.5px] text-ink truncate">{r.courseName}</p>
                <p className="text-[11.5px] text-ink-faint shrink-0 tabular-nums">{shortDate(r.date)}</p>
              </div>
              <div className="mt-2 flex items-center gap-2.5">
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
                      {top.name} posted <span className="font-bold tabular-nums">{standings[0].gross}</span> · waiting on{' '}
                      {waiting.length === 1 ? data.players.find((p) => p.id === waiting[0].playerId)?.name : `${waiting.length} more`}
                    </>
                  ) : solo ? (
                    <>
                      {top.name} shot <span className="font-bold tabular-nums">{standings[0].gross}</span>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-ink">{top.name}</span> took it · net{' '}
                      <span className="font-bold tabular-nums">{fmt1(standings[0].netScore)}</span>
                    </>
                  )}
                </p>
                {waiting.length > 0 ? <Pill tone="flag">Pending</Pill> : solo ? <Pill>Solo</Pill> : null}
              </div>
            </Card>
          )
        })}
      </div>
      <div className="h-4" />
    </div>
  )
}

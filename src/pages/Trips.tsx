import { useNavigate } from '../lib/nav'
import { useStore } from '../data/store'
import { shortDate, tripBoard } from '../lib/stats'
import { todayISO } from '../lib/dates'
import { canSeeTrip } from '../types'
import { useMembers } from '../data/store'
import { Avatar, AvatarStack, Card, EmptyState, Pill, SectionLabel } from '../components/ui'
import { Icon } from '../components/icons'
import { BackButton } from '../components/Nav'
import CourseScene from '../components/CourseScene'

export default function Trips() {
  const { data } = useStore()
  const navigate = useNavigate()
  const members = useMembers()
  const TODAY = todayISO()

  // A row of who's going, plus a lock when the trip is not group-wide.
  const Attendees = ({ ids }: { ids: string[] }) => {
    const people = ids.map((id) => data.players.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p)
    const isPrivate = ids.length < members.length
    return (
      <div className="flex items-center gap-1.5">
        {isPrivate && <Icon name="lock" size={14} className="text-ink-faint" label="Private trip" />}
        <AvatarStack players={people} size={20} max={4} />
      </div>
    )
  }

  // Private trips simply aren't in the list for anyone who isn't on them.
  const visible = data.trips.filter((t) => canSeeTrip(t, data.currentUserId))
  const planning = visible.filter((t) => t.status === 'planning')
  const upcoming = visible
    .filter((t) => t.status === 'booked' && (!t.endDate || t.endDate >= TODAY))
    .sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999'))
  const past = visible
    .filter((t) => t.status === 'booked' && t.endDate && t.endDate < TODAY)
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <BackButton fallback="/" />
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-large font-bold tracking-tight text-ink">Trips</h1>
          </div>
          <button
            onClick={() => navigate('/trips/new')}
            className="shrink-0 rounded-xl bg-green px-4 py-2.5 text-footnote font-bold text-white active:scale-95 transition"
          >
            + New trip
          </button>
        </div>
      </header>

      {data.trips.length === 0 && (
        <EmptyState title="No trips yet" sub="Start one, throw out a few destinations, and let the group fight it out." />
      )}

      {planning.length > 0 && (
        <>
          <SectionLabel>In the works</SectionLabel>
          <div className="space-y-3">
            {planning.map((trip) => {
              const votesIn = new Set(trip.options.flatMap((o) => o.votes)).size
              const leadingOption = [...trip.options].sort((a, b) => b.votes.length - a.votes.length)[0]
              return (
                <Card key={trip.id} onClick={() => navigate(`/trips/${trip.id}`)} className="p-4 border-green/25">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-headline text-ink">{trip.name}</p>
                    <Pill tone="green">Planning</Pill>
                  </div>
                  <p className="text-footnote text-ink-dim mt-1.5">
                    {trip.options.length === 0
                      ? 'No destinations yet'
                      : `${trip.options.length} destinations · ${votesIn} of ${trip.attendeeIds.length} votes in`}
                  </p>
                  {leadingOption && leadingOption.votes.length > 0 && (
                    <p className="text-footnote mt-1">
                      <span className="text-ink-faint">Front-runner:</span>{' '}
                      <span className="font-bold text-green">{leadingOption.title}</span>
                    </p>
                  )}
                  <div className="mt-2.5">
                    <Attendees ids={trip.attendeeIds} />
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <SectionLabel>Up next</SectionLabel>
          <div className="space-y-3">
            {upcoming.map((trip) => (
              <Card key={trip.id} onClick={() => navigate(`/trips/${trip.id}`)} className="overflow-hidden">
                <div className="bg-green px-4 pt-4 pb-3 text-white relative overflow-hidden">
                  <svg className="absolute right-0 bottom-0 h-full w-36 opacity-15" viewBox="0 0 160 100" preserveAspectRatio="none">
                    <path d="M0 100 Q40 55 90 70 T160 45 V100 Z" fill="#fff" />
                  </svg>
                  <h2 className="text-headline font-bold leading-tight">{trip.name}</h2>
                  <p className="text-footnote text-white/85 mt-0.5">{trip.location ?? 'Destination locked'}</p>
                </div>
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <p className="text-footnote text-ink-dim tabular-nums">
                    {trip.startDate ? `${shortDate(trip.startDate)}${trip.endDate ? ` – ${shortDate(trip.endDate)}` : ''}` : 'Dates TBD'}
                  </p>
                  <Attendees ids={trip.attendeeIds} />
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <SectionLabel>The archive</SectionLabel>
          <div className="space-y-3">
            {past.map((trip) => {
              const rounds = data.rounds.filter((r) => r.tripId === trip.id)
              // Same computation as the trip's Final Standings, so the
              // name on this card is the name at the top in there.
              const champ = tripBoard(data, rounds)[0]?.player
              return (
                <Card key={trip.id} onClick={() => navigate(`/trips/${trip.id}`)} className="p-4 flex items-center gap-3.5">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl">
                    <CourseScene course={trip.location || trip.name} light="golden" className="h-full w-full" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-body text-ink truncate">{trip.name}</p>
                    <p className="text-footnote text-ink-faint mt-0.5 tabular-nums">
                      {trip.location} · {trip.startDate && shortDate(trip.startDate)} · {rounds.length} round{rounds.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  {champ && (
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <div>
                        <p className="text-caption font-semibold text-gold">Champ</p>
                        <p className="text-footnote font-bold text-ink">{champ.name}</p>
                      </div>
                      <Avatar player={champ} size={30} />
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </>
      )}
      <div className="h-4" />
    </div>
  )
}

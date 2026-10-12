import { useNavigate } from '../lib/nav'
import { useStore, useMembers } from '../data/store'
import { timeToMinutes, tripBoard } from '../lib/stats'
import { daysBetween, shortDay, todayISO, tripDateRange, weekdayShort } from '../lib/dates'
import { money } from '../lib/money'
import { canSeeTrip, type Trip } from '../types'
import { Avatar, AvatarStack, Card, EmptyState, SectionLabel } from '../components/ui'
import { Icon } from '../components/icons'

// The Trips tab, drawn without the painted scenes (Matt, 2026-10-12:
// scenes everywhere stop meaning anything; they stay on each trip's own
// page). What's next is a ticket stub, what's being argued about is the
// vote itself, and the archive is a timeline down the years with each
// trip's champ. Same layout as the iPhone app's TripsView.

export default function Trips() {
  const { data } = useStore()
  const navigate = useNavigate()
  const today = todayISO()

  // Private trips simply aren't in the list for anyone who isn't on them.
  const visible = data.trips.filter((t) => canSeeTrip(t, data.currentUserId))
  const planning = visible.filter((t) => t.status === 'planning')
  const upcoming = visible
    .filter((t) => t.status === 'booked' && (!t.endDate || t.endDate >= today))
    .sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999'))
  const past = visible
    .filter((t) => t.status === 'booked' && t.endDate && t.endDate < today)
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))

  return (
    <div className="rise">
      <header className="flex items-center justify-between gap-3 px-1 pb-3 pt-4">
        <h1 className="text-large font-bold tracking-tight text-ink">Trips</h1>
        <button
          onClick={() => navigate('/trips/new')}
          aria-label="New trip"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-green active:scale-95 transition"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5 V19 M5 12 H19" />
          </svg>
        </button>
      </header>

      {visible.length === 0 && (
        <EmptyState title="No trips yet" sub="Start one, throw out a few destinations, and let the group fight it out." />
      )}

      {upcoming.map((trip, i) => (
        <div key={trip.id} className={i === 0 ? 'mt-2' : 'mt-3'}>
          <TripTicket trip={trip} tag={i === 0 ? 'Up next' : 'After that'} today={today} onOpen={() => navigate(`/trips/${trip.id}`)} />
        </div>
      ))}

      {planning.length > 0 && (
        <>
          <SectionLabel>Voting now</SectionLabel>
          {planning.map((trip) => (
            <Card key={trip.id} onClick={() => navigate(`/trips/${trip.id}`)} className="p-4">
              <VoteRace trip={trip} />
            </Card>
          ))}
        </>
      )}

      {past.length > 0 && (
        <>
          <SectionLabel>The archive</SectionLabel>
          {/* One section, the rail running through every row. */}
          <div className="sb-section">
            {past.map((trip, i) => (
              <TimelineRow key={trip.id} trip={trip} first={i === 0} last={i === past.length - 1} onOpen={() => navigate(`/trips/${trip.id}`)} />
            ))}
          </div>
        </>
      )}
      <div className="h-4" />
    </div>
  )
}

/**
 * A booked trip as a ticket stub: where, when, first tee, rounds, then a
 * tear line over who's going and what's sorted. The forest green is the
 * one the season race uses for the thing that matters most on its page.
 */
function TripTicket({ trip, tag, today, onOpen }: { trip: Trip; tag: string; today: string; onOpen: () => void }) {
  const { data } = useStore()
  const tees = trip.itinerary
    .filter((i) => i.kind === 'tee')
    .sort((a, b) => a.date.localeCompare(b.date) || timeToMinutes(a.time) - timeToMinutes(b.time))
  const rounds = Math.max(tees.length, data.rounds.filter((r) => r.tripId === trip.id).length)
  const firstTee = tees[0] && [weekdayShort(tees[0].date), tees[0].time ?? shortDay(tees[0].date)].join(' ')
  const people = trip.attendeeIds.map((id) => data.players.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p)

  // "23 days", "1 day", "Day 2 of 4" while it's on.
  let countdown: [string, string] | null = null
  if (trip.startDate && trip.startDate > today) {
    const n = daysBetween(today, trip.startDate)
    countdown = [String(n), n === 1 ? 'day' : 'days']
  } else if (trip.startDate) {
    countdown = trip.endDate
      ? [`Day ${daysBetween(trip.startDate, today) + 1}`, `of ${daysBetween(trip.startDate, trip.endDate) + 1}`]
      : ['Today', '']
  }

  const field = (label: string, value: string) => (
    <div className="min-w-0">
      <p className="text-caption font-semibold text-on-forest/65">{label}</p>
      <p className="truncate text-body font-bold text-white tabular-nums">{value}</p>
    </div>
  )
  const chip = (label: string, done: boolean) => (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-caption font-bold ${
        done ? 'bg-white/15 text-[#CFE9D6]' : 'bg-[#F6C744]/20 text-[#F6D77E]'
      }`}
      aria-label={`${label}, ${done ? 'sorted' : 'not yet'}`}
    >
      {done && (
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2.5 6.5 5 9l4.5-6" />
        </svg>
      )}
      {label}
    </span>
  )

  return (
    <button
      type="button"
      onClick={onOpen}
      className="press block w-full overflow-hidden rounded-[18px] bg-forest p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-footnote font-bold text-on-forest/70">{tag}</p>
        {countdown && (
          <p className="tabular-nums">
            <span className="text-title font-extrabold text-white">{countdown[0]}</span>
            {countdown[1] && <span className="text-footnote font-semibold text-on-forest/80"> {countdown[1]}</span>}
          </p>
        )}
      </div>
      <h2 className="mt-0.5 text-title font-bold leading-tight text-white">{trip.name}</h2>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {field('Where', trip.location ?? 'Not set')}
        {field('When', tripDateRange(trip.startDate, trip.endDate) ?? 'Dates to come')}
        {field('First tee', firstTee || 'Not booked')}
        {field('Rounds', rounds > 0 ? String(rounds) : 'None yet')}
      </div>
      {/* The tear: a dashed line with a notch bitten out of each edge in
          the page's own colour. */}
      <div className="relative -mx-4 my-3.5 h-[18px]" aria-hidden>
        <span className="absolute left-[-9px] top-0 h-[18px] w-[18px] rounded-full bg-paper" />
        <span className="absolute right-[-9px] top-0 h-[18px] w-[18px] rounded-full bg-paper" />
        <span className="absolute inset-x-[14px] top-1/2 border-t-2 border-dashed border-on-forest/35" />
      </div>
      <div className="flex items-center gap-1.5">
        <AvatarStack players={people} size={22} max={4} ring="var(--color-forest)" />
        <span className="flex-1" />
        {chip('Tee times', tees.length > 0)}
        {chip('House', trip.itinerary.some((i) => i.kind === 'lodging'))}
        {chip('Flights', trip.itinerary.some((i) => i.kind === 'flight'))}
      </div>
    </button>
  )
}

/**
 * A trip still being argued about: the race itself, a bar per destination
 * filled by its share of the people going, and who hasn't voted.
 */
function VoteRace({ trip }: { trip: Trip }) {
  const { data } = useStore()
  const members = useMembers()
  const me = data.currentUserId
  const voters = new Set(trip.options.flatMap((o) => o.votes))
  const going = Math.max(trip.attendeeIds.length, 1)
  // Most votes first; ties keep the order they were added in.
  const options = trip.options.map((o, i) => ({ o, i })).sort((a, b) => b.o.votes.length - a.o.votes.length || a.i - b.i).map((x) => x.o)
  const top = options[0]?.votes.length ?? 0
  const missing = trip.attendeeIds
    .filter((id) => !voters.has(id))
    .map((id) => data.players.find((p) => p.id === id)?.name)
    .filter((n): n is string => !!n)
  const waiting =
    missing.length === 0
      ? "Everyone's in"
      : missing.length === 1
        ? `${missing[0]} hasn't voted`
        : missing.length === 2
          ? `${missing[0]} and ${missing[1]} haven't voted`
          : `${missing.length} haven't voted`

  return (
    <>
      <div className="flex items-center gap-1.5">
        {trip.attendeeIds.length < members.length && <Icon name="lock" size={13} className="text-ink-faint" label="Private trip" />}
        <p className="min-w-0 flex-1 truncate text-headline font-bold text-ink">{trip.name}</p>
        {trip.attendeeIds.includes(me) && !voters.has(me) && options.length > 0 && (
          <span className="shrink-0 rounded-full bg-green-soft px-3 py-1 text-footnote font-bold text-green">Vote</span>
        )}
      </div>
      {options.length === 0 ? (
        <p className="mt-1.5 text-footnote text-ink-dim">No destinations yet. Throw the first one out there.</p>
      ) : (
        <>
          <div className="mt-2.5 space-y-1.5">
            {options.slice(0, 4).map((o) => {
              const lead = top > 0 && o.votes.length === top
              return (
                <div key={o.id} className="flex items-center gap-2.5">
                  <span className={`w-[118px] shrink-0 truncate text-footnote ${o.votes.length === 0 ? 'text-ink-faint' : 'text-ink'} ${lead ? 'font-semibold' : ''}`}>
                    {o.title}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-line/80">
                    <span
                      className={`block h-full rounded-full ${lead ? 'bg-green' : 'bg-green/45'}`}
                      style={{ width: `${Math.min(1, o.votes.length / going) * 100}%` }}
                    />
                  </span>
                  <span className={`w-4 text-right text-footnote font-bold tabular-nums ${o.votes.length === 0 ? 'text-ink-faint' : 'text-ink'}`}>
                    {o.votes.length}
                  </span>
                </div>
              )
            })}
            {options.length > 4 && <p className="text-caption text-ink-faint">and {options.length - 4} more</p>}
          </div>
          <p className="mt-2 text-caption text-ink-faint tabular-nums">
            {voters.size} of {trip.attendeeIds.length} in · {waiting}
          </p>
        </>
      )}
    </>
  )
}

/**
 * One past trip on the rail down the years: the year, the trip, its rounds
 * and what it cost, and who won it.
 */
function TimelineRow({ trip, first, last, onOpen }: { trip: Trip; first: boolean; last: boolean; onOpen: () => void }) {
  const { data } = useStore()
  const rounds = data.rounds.filter((r) => r.tripId === trip.id)
  // Same computation as the trip's final standings, so the name here is
  // the name at the top in there.
  const champ = tripBoard(data, rounds)[0]?.player
  const total = data.expenses.filter((e) => e.tripId === trip.id).reduce((sum, e) => sum + e.amount, 0)
  const year = trip.startDate?.slice(0, 4) ?? ''
  // The year has its own column, so "Sandhills 2025" reads "Sandhills".
  const name = year && trip.name.endsWith(` ${year}`) ? trip.name.slice(0, -(year.length + 1)) : trip.name
  // The town is enough here ("Southern Pines"); the total must fit.
  const town = trip.location?.split(',')[0]
  const meta = [town, rounds.length > 0 && `${rounds.length} round${rounds.length === 1 ? '' : 's'}`, total > 0 && money(total)].filter(Boolean)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-ink/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green"
    >
      {/* The rail runs through the dots, from the newest trip down to the oldest. */}
      <span className="absolute inset-y-0 left-[70px] flex w-0.5 flex-col" aria-hidden>
        <span className={`flex-1 ${first ? '' : 'bg-line'}`} />
        <span className={`flex-1 ${last ? '' : 'bg-line'}`} />
      </span>
      <span className="w-[38px] shrink-0 text-footnote font-extrabold text-gold tabular-nums">{year}</span>
      <span className="relative h-2.5 w-2.5 shrink-0 rounded-full bg-green" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-bold text-ink">{name}</span>
        {meta.length > 0 && <span className="block truncate text-footnote text-ink-faint tabular-nums">{meta.join(' · ')}</span>}
      </span>
      {champ && (
        <>
          <Avatar player={champ} size={26} />
          <Icon name="trophy" size={16} className="text-gold" label={`Champion ${champ.name}`} />
        </>
      )}
    </button>
  )
}

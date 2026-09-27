import { Link, useNavigate, useParams } from 'react-router-dom'
import { useGoBack } from '../lib/nav'
import { BackButton } from '../components/Nav'
import { useStore } from '../data/store'
import { shortDate } from '../lib/stats'
import { todayISO } from '../lib/dates'
import TripPlanning from '../components/TripPlanning'
import TripBooked from '../components/TripBooked'
import TripAttendees from '../components/TripAttendees'
import { Card, Meta } from '../components/ui'
import CourseScene from '../components/CourseScene'
import { useConfirm } from '../components/Confirm'
import { canSeeTrip } from '../types'
import { IconTile } from '../components/icons'

function daysBetween(from: string, to: string) {
  const [a, b] = [from, to].map((d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)))
  return Math.round((b - a) / 86_400_000)
}

export default function TripDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const goBack = useGoBack('/trips')
  const { data, deleteTrip } = useStore()
  const confirm = useConfirm()
  const trip = data.trips.find((t) => t.id === id)

  if (!trip) {
    return (
      <div className="pt-16 text-center text-ink-dim">
        Trip not found. <Link to="/trips" className="text-green font-bold">Back to trips</Link>
      </div>
    )
  }

  // Someone who isn't on the trip shouldn't see its plans, even by URL.
  if (!canSeeTrip(trip, data.currentUserId)) {
    return (
      <div className="rise pt-10">
        <Card className="p-6 text-center">
          <div className="flex justify-center mb-3">
            <IconTile name="lock" tone="plain" size={48} />
          </div>
          <p className="text-headline font-bold text-ink">This trip is private</p>
          <p className="text-footnote text-ink-dim mt-1.5">
            You're not on the list for this one. Ask the organizer if that's a mistake.
          </p>
          <button onClick={() => navigate('/trips')} className="mt-4 text-footnote font-bold text-green">
            Back to trips
          </button>
        </Card>
      </div>
    )
  }

  const today = todayISO()
  const isPast = !!trip.endDate && trip.endDate < today
  // The number the whole group checks: days until the first tee, or which
  // day of the trip it is while you're on it.
  const until = trip.status === 'booked' && trip.startDate && trip.startDate > today ? daysBetween(today, trip.startDate) : null
  const onNow = trip.status === 'booked' && !!trip.startDate && trip.startDate <= today && !!trip.endDate && trip.endDate >= today
  const dayOf = onNow ? daysBetween(trip.startDate!, today) + 1 : null
  const tripDays = onNow ? daysBetween(trip.startDate!, trip.endDate!) + 1 : null
  const votes = new Set(trip.options.flatMap((o) => o.votes)).size

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <BackButton fallback="/trips" onBack={goBack} />
      </header>

      {/* The trip as a place: its scene, its name, and the countdown. */}
      <div className="relative overflow-hidden rounded-3xl bg-forest shadow-[0_10px_30px_rgba(28,70,50,0.2)]">
        <CourseScene course={trip.location || trip.name} light={isPast ? 'twilight' : trip.status === 'planning' ? 'morning' : 'golden'} className="h-52 w-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/0 from-25% via-black/20 to-black/70" />
        {(until != null || dayOf != null) && (
          <div className="absolute right-3 top-3 rounded-2xl bg-cream px-3 py-2 text-center text-forest shadow-[0_6px_16px_rgba(0,0,0,0.2)]">
            <p className="text-title font-extrabold leading-none tabular-nums">{until ?? `${dayOf}/${tripDays}`}</p>
            <p className="mt-1 text-caption font-semibold uppercase tracking-wider">
              {until != null ? (until === 1 ? 'day to go' : 'days to go') : 'day of trip'}
            </p>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 px-5 pb-4 text-white">
          <span className="inline-flex rounded-full bg-white/20 px-2.5 py-0.5 text-caption font-semibold uppercase tracking-wider backdrop-blur-sm">
            {trip.status === 'planning' ? 'Planning' : isPast ? 'Archived' : onNow ? 'Happening now' : 'Booked'}
          </span>
          <h1 className="mt-1.5 text-large font-bold leading-tight tracking-tight [text-shadow:0_1px_12px_rgba(0,0,0,0.25)]">{trip.name}</h1>
          <Meta
            className="mt-0.5 text-footnote text-white/85 tabular-nums"
            parts={
              trip.status === 'planning'
                ? [
                    `${trip.options.length} destination${trip.options.length === 1 ? '' : 's'} on the table`,
                    trip.options.length > 0 && `${votes} of ${trip.attendeeIds.length} votes in`,
                  ]
                : [
                    trip.location,
                    trip.startDate && (trip.endDate ? `${shortDate(trip.startDate)} – ${shortDate(trip.endDate)}` : shortDate(trip.startDate)),
                  ]
            }
          />
        </div>
      </div>
      {trip.note && <p className="mt-2.5 px-1 text-footnote text-ink-dim italic">{trip.note}</p>}

      <div className="mt-2">
        <TripAttendees trip={trip} />
      </div>

      {trip.status === 'planning' ? <TripPlanning trip={trip} /> : <TripBooked trip={trip} />}

      <div className="mt-10 mb-4 text-center">
        <button
          onClick={async () => {
            const ok = await confirm({
              title: `Delete "${trip.name}"?`,
              body: 'The itinerary and the cost split go with it. Rounds played on the trip stay on the books.',
              confirmLabel: 'Delete trip',
              danger: true,
            })
            if (ok) {
              deleteTrip(trip.id)
              navigate('/trips')
            }
          }}
          className="text-footnote font-bold text-flag/80"
        >
          Delete trip
        </button>
      </div>
    </div>
  )
}

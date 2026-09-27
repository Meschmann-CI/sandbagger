import { Link, useNavigate, useParams } from 'react-router-dom'
import { useGoBack } from '../lib/nav'
import { BackButton } from '../components/Nav'
import { useStore } from '../data/store'
import { shortDate } from '../lib/stats'
import { todayISO } from '../lib/dates'
import TripPlanning from '../components/TripPlanning'
import TripBooked from '../components/TripBooked'
import TripAttendees from '../components/TripAttendees'
import { Card, Pill } from '../components/ui'
import { useConfirm } from '../components/Confirm'
import { canSeeTrip } from '../types'
import { IconTile } from '../components/icons'

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

  const isPast = !!trip.endDate && trip.endDate < todayISO()

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <BackButton fallback="/trips" onBack={goBack} />
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-large font-bold tracking-tight text-ink leading-tight">{trip.name}</h1>
          {trip.status === 'planning' ? <Pill tone="green">Planning</Pill> : isPast ? <Pill>Archived</Pill> : <Pill tone="gold">Booked</Pill>}
        </div>
        {trip.status === 'booked' && (
          <p className="text-footnote text-ink-dim mt-1 tabular-nums">
            {trip.location}
            {trip.startDate && ` · ${shortDate(trip.startDate)}`}
            {trip.endDate && ` – ${shortDate(trip.endDate)}`}
          </p>
        )}
        {trip.note && <p className="text-footnote text-ink-dim mt-1.5 italic">{trip.note}</p>}
      </header>

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

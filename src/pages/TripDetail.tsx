import { Link, useNavigate, useParams } from 'react-router-dom'
import { useGoBack } from '../lib/nav'
import { useStore } from '../data/store'
import { shortDate } from '../lib/stats'
import { todayISO } from '../lib/dates'
import TripPlanning from '../components/TripPlanning'
import TripBooked from '../components/TripBooked'
import TripAttendees from '../components/TripAttendees'
import { Card, Pill } from '../components/ui'
import { useConfirm } from '../components/Confirm'
import { canSeeTrip } from '../types'

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
          <p className="text-3xl mb-2">🔒</p>
          <p className="text-[16px] font-extrabold text-ink">This trip is private</p>
          <p className="text-[13px] text-ink-dim mt-1.5">
            You're not on the list for this one. Ask the organizer if that's a mistake.
          </p>
          <button onClick={() => navigate('/trips')} className="mt-4 text-[13px] font-bold text-green">
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
        <button onClick={() => goBack()} className="text-[13px] font-bold text-ink-faint mb-2">← Back</button>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[24px] font-extrabold tracking-tight text-ink leading-tight">{trip.name}</h1>
          {trip.status === 'planning' ? <Pill tone="green">Planning</Pill> : isPast ? <Pill>Archived</Pill> : <Pill tone="gold">Booked</Pill>}
        </div>
        {trip.status === 'booked' && (
          <p className="text-[13px] text-ink-dim mt-1 tabular-nums">
            {trip.location}
            {trip.startDate && ` · ${shortDate(trip.startDate)}`}
            {trip.endDate && ` – ${shortDate(trip.endDate)}`}
          </p>
        )}
        {trip.note && <p className="text-[13px] text-ink-dim mt-1.5 italic">{trip.note}</p>}
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
          className="text-[12.5px] font-bold text-flag/80"
        >
          Delete trip
        </button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useMembers, useStore } from '../data/store'
import type { Trip } from '../types'
import AttendeePicker from './AttendeePicker'
import { Avatar, Card, PrimaryButton } from './ui'

// Shows who's on the trip and, for the organizer, lets them change it.
export default function TripAttendees({ trip }: { trip: Trip }) {
  const { data, updateTrip } = useStore()
  const members = useMembers()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(trip.attendeeIds)

  const attendees = trip.attendeeIds.map((id) => data.players.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p)
  const isOrganizer = trip.createdById === data.currentUserId
  const excluded = members.filter((m) => !trip.attendeeIds.includes(m.id))
  const organizer = data.players.find((p) => p.id === trip.createdById)

  const save = () => {
    // Votes from anyone dropped from the trip go with them.
    updateTrip({
      ...trip,
      attendeeIds: draft,
      options: trip.options.map((o) => ({ ...o, votes: o.votes.filter((v) => draft.includes(v)) })),
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <Card className="p-4 space-y-3">
        <p className="text-[13px] font-bold text-ink">Who's on this trip?</p>
        <AttendeePicker selected={draft} onChange={setDraft} lockedId={trip.createdById} />
        <div className="flex gap-2">
          <PrimaryButton onClick={save} disabled={draft.length === 0} className="flex-1 !py-2.5">Save list</PrimaryButton>
          <button onClick={() => { setDraft(trip.attendeeIds); setEditing(false) }} className="px-4 text-[13px] font-bold text-ink-faint">
            Cancel
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2">
          {attendees.map((p) => (
            <span key={p.id} className="rounded-full ring-2 ring-card">
              <Avatar player={p} size={30} />
            </span>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-bold text-ink truncate">{attendees.map((p) => p.name).join(', ')}</p>
          <p className="text-[11.5px] text-ink-faint">
            {excluded.length === 0
              ? 'Everyone in the group'
              : `Private · hidden from ${excluded.map((p) => p.name).join(', ')}`}
            {organizer && ` · organized by ${organizer.name}`}
          </p>
        </div>
        {isOrganizer && (
          <button onClick={() => { setDraft(trip.attendeeIds); setEditing(true) }} className="text-[12.5px] font-bold text-green shrink-0">
            Edit
          </button>
        )}
      </div>
    </Card>
  )
}

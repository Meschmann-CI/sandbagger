import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoBack } from '../lib/nav'
import { useMembers, useStore } from '../data/store'
import AttendeePicker from '../components/AttendeePicker'
import { PrimaryButton } from '../components/ui'

export default function TripNew() {
  const navigate = useNavigate()
  const goBack = useGoBack('/trips')
  const { data, addTrip } = useStore()
  const members = useMembers()
  const [name, setName] = useState('')
  const [attendeeIds, setAttendeeIds] = useState<string[]>(members.map((m) => m.id))

  const everyone = attendeeIds.length === members.length

  const create = () => {
    if (!name.trim() || attendeeIds.length === 0) return
    const trip = addTrip({
      name: name.trim(),
      status: 'planning',
      attendeeIds,
      createdById: data.currentUserId,
      options: [],
      itinerary: [],
    })
    navigate(`/trips/${trip.id}`, { replace: true })
  }

  return (
    <div className="rise">
      <header className="pt-4 pb-4 px-1">
        <button onClick={() => goBack()} className="text-[13px] font-bold text-ink-faint mb-2">← Back</button>
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink">New Trip</h1>
        <p className="text-[13px] text-ink-dim mt-1">
          Name it, pick who's coming, then throw destinations in the ring. Everybody on the list votes.
        </p>
      </header>

      <label className="block text-[12px] font-bold uppercase tracking-[0.12em] text-ink-faint mb-2 px-1">Trip name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()}
        placeholder='e.g. "Fall Trip 2027"'
        autoFocus
        className="w-full rounded-xl border border-line-strong bg-card px-4 py-4 text-[16px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
      />

      <div className="mt-5">
        <div className="flex items-baseline justify-between px-1 mb-2">
          <label className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-faint">Who's coming</label>
          <button
            onClick={() => setAttendeeIds(everyone ? [data.currentUserId] : members.map((m) => m.id))}
            className="text-[12px] font-bold text-green"
          >
            {everyone ? 'Just me' : 'Everyone'}
          </button>
        </div>
        <AttendeePicker selected={attendeeIds} onChange={setAttendeeIds} lockedId={data.currentUserId} />
        <p className="text-[11.5px] text-ink-faint mt-2.5 px-1">
          {everyone
            ? 'Everyone in the group can see this trip and vote.'
            : `Only these ${attendeeIds.length} can see this trip. The others won't know it exists.`}
        </p>
      </div>

      <PrimaryButton onClick={create} disabled={!name.trim() || attendeeIds.length === 0} className="w-full mt-5">
        Start planning
      </PrimaryButton>
      <div className="h-6" />
    </div>
  )
}

import { useState } from 'react'
import { useStore } from '../data/store'
import type { Trip, TripOption } from '../types'
import { AvatarStack, Card, PrimaryButton, SectionLabel } from './ui'
import { useConfirm } from './Confirm'
import { Icon } from './icons'
import CourseScene from './CourseScene'
import TripPhotoPicker, { TripImage } from './TripPhotoPicker'

// Where are we going: each destination with its photo, the vote as a race
// (a bar for each place, filled by its share of the people going), the
// leader's pros and cons in full and the rest folded. Same as the iPhone
// app's TripPlanningSection.

export default function TripPlanning({ trip }: { trip: Trip }) {
  const { data, updateTrip, voteTripOption, newId } = useStore()
  const confirm = useConfirm()
  const [newDest, setNewDest] = useState('')

  const sorted = trip.options
    .map((o, i) => ({ o, i }))
    .sort((a, b) => b.o.votes.length - a.o.votes.length || a.i - b.i)
    .map((x) => x.o)
  const top = Math.max(0, ...trip.options.map((o) => o.votes.length))
  const voted = new Set(trip.options.flatMap((o) => o.votes))
  const waiting = trip.attendeeIds
    .filter((id) => !voted.has(id))
    .map((id) => data.players.find((p) => p.id === id)?.name)
    .filter((n): n is string => !!n)
  const waitingLine = waiting.length === 0 ? "Everyone's in" : waiting.length === 1 ? `${waiting[0]} hasn't voted` : `${waiting.length} haven't voted`

  const addOption = () => {
    if (!newDest.trim()) return
    updateTrip({
      ...trip,
      options: [...trip.options, { id: newId('o'), title: newDest.trim(), pros: [], cons: [], votes: [] }],
    })
    setNewDest('')
  }

  const lockIn = async (option: TripOption) => {
    const ok = await confirm({
      title: `Lock in ${option.title}?`,
      body: "Voting closes and the trip moves to booked, where the itinerary and cost splitting live. Planning's over, packing begins.",
      confirmLabel: 'Lock it in',
    })
    if (!ok) return
    // The winner's photo becomes the trip's, unless it has its own.
    updateTrip({ ...trip, status: 'booked', location: option.title, chosenOptionId: option.id, cover: trip.cover ?? option.photo })
  }

  return (
    <>
      <SectionLabel
        action={
          trip.options.length > 0 && (
            <span className="text-caption text-ink-faint tabular-nums">
              {voted.size} of {trip.attendeeIds.length} in · {waitingLine}
            </span>
          )
        }
      >
        The vote
      </SectionLabel>
      {sorted.length === 0 && (
        <Card className="p-5 text-center text-footnote text-ink-dim">Nothing on the table yet. Add the first contender below, then everyone votes.</Card>
      )}
      <div className="space-y-3">
        {sorted.map((option) => {
          const leading = option.votes.length > 0 && option.votes.length === top
          return (
            <OptionCard
              key={option.id}
              trip={trip}
              option={option}
              leading={leading}
              expandedByDefault={leading || sorted.length === 1 || top === 0}
              onVote={() => voteTripOption(trip.id, option.id)}
              onLockIn={() => void lockIn(option)}
            />
          )
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={newDest}
          onChange={(e) => setNewDest(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addOption()}
          placeholder="Add a destination…"
          className="flex-1 rounded-xl border border-line-strong bg-card px-4 py-3 text-body text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
        />
        <PrimaryButton onClick={addOption} disabled={!newDest.trim()} className="px-4">
          Add
        </PrimaryButton>
      </div>
    </>
  )
}

function OptionCard({
  trip,
  option,
  leading,
  expandedByDefault,
  onVote,
  onLockIn,
}: {
  trip: Trip
  option: TripOption
  leading: boolean
  expandedByDefault: boolean
  onVote: () => void
  onLockIn: () => void
}) {
  const { data, updateTrip } = useStore()
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<boolean | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const me = data.currentUserId
  const myPick = option.votes.includes(me)
  const share = trip.attendeeIds.length ? option.votes.length / trip.attendeeIds.length : 0
  const expanded = open ?? expandedByDefault

  const addPoint = (kind: 'pros' | 'cons') => {
    if (!draft.trim()) return
    updateTrip({
      ...trip,
      options: trip.options.map((o) => (o.id === option.id ? { ...o, [kind]: [...o[kind], draft.trim()] } : o)),
    })
    setDraft('')
    setAdding(false)
  }

  const column = (items: string[], mark: string, tone: string) => (
    <div className="min-w-0 flex-1 space-y-1.5">
      {items.map((text, i) => (
        <p key={i} className="flex gap-1.5 text-footnote text-ink-dim">
          <span className={`shrink-0 font-extrabold ${tone}`}>{mark}</span>
          {text}
        </p>
      ))}
    </div>
  )

  return (
    <div className="sb-section pb-3.5">
      {/* The place: its photo, its name across the bottom. The camera sits
          outside the clipped band so its menu isn't cut off. */}
      <div className="relative">
        <div className="relative h-[104px] overflow-hidden">
          <TripImage photo={option.photo} className="h-full w-full" fallback={<CourseScene course={option.title} light="morning" className="h-[104px] w-full" />} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/0 from-35% to-black/50" />
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3.5 pb-2.5">
            <p className="min-w-0 flex-1 truncate text-headline font-bold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.3)]">{option.title}</p>
            {leading && <span className="shrink-0 rounded-full bg-gold-soft px-2 py-0.5 text-caption font-bold text-[#7A5A12]">Leading</span>}
          </div>
        </div>
        <div className="absolute right-2.5 top-2.5">
          <TripPhotoPicker
            tripId={trip.id}
            optionId={option.id}
            hasPhoto={!!option.photo}
            label={option.photo ? `Change the photo of ${option.title}` : `Add a photo of ${option.title}`}
            onError={setPhotoError}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white disabled:opacity-70"
          >
            {(busy) => (busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Icon name="camera" size={15} />)}
          </TripPhotoPicker>
        </div>
      </div>

      {/* The race: this place's share of the people going. */}
      <div className="h-1.5 bg-line/70">
        <div className={`h-full transition-[width] duration-300 ${leading ? 'bg-green' : 'bg-green/40'}`} style={{ width: `${share * 100}%` }} />
      </div>

      <div className="flex items-center gap-2 px-3.5 pt-2.5">
        {option.votes.length === 0 ? (
          <span className="text-footnote text-ink-faint">No votes yet</span>
        ) : (
          <>
            <AvatarStack players={option.votes.map((pid) => data.players.find((pl) => pl.id === pid))} size={22} max={4} />
            <span className="text-footnote font-bold text-ink-dim tabular-nums">
              {option.votes.length} vote{option.votes.length === 1 ? '' : 's'}
            </span>
          </>
        )}
        <span className="flex-1" />
        {/* Toggled through its own change rather than by writing the whole
            trip back, so two people voting at once don't clash. */}
        <button
          onClick={onVote}
          className={`rounded-lg px-3.5 py-2 text-footnote font-bold transition ${myPick ? 'bg-green text-white' : 'bg-green-soft text-green active:scale-95'}`}
        >
          {myPick ? 'Your pick ✓' : 'Vote'}
        </button>
        {/* Only the organizer calls it, so nobody books the trip by mistake. */}
        {trip.createdById === me && (
          <button onClick={onLockIn} className="rounded-lg bg-ink/[0.06] px-3.5 py-2 text-footnote font-bold text-ink-dim active:bg-ink/10">
            Lock in
          </button>
        )}
      </div>
      {photoError && <p className="px-3.5 pt-1.5 text-caption font-semibold text-flag">{photoError}</p>}

      {/* Pros and cons: in full for the leader, folded for the rest. */}
      {expanded ? (
        <>
          {(option.pros.length > 0 || option.cons.length > 0) && (
            <div className="flex gap-3 px-3.5 pt-3">
              {column(option.pros, '+', 'text-green')}
              {column(option.cons, '−', 'text-flag')}
            </div>
          )}
          {adding ? (
            <div className="px-3.5 pt-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. 36 holes a day, cheap flights…"
                autoFocus
                className="w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button onClick={() => addPoint('pros')} disabled={!draft.trim()} className="flex-1 rounded-lg bg-green-soft py-2 text-footnote font-bold text-green disabled:opacity-40">
                  + Add as pro
                </button>
                <button onClick={() => addPoint('cons')} disabled={!draft.trim()} className="flex-1 rounded-lg bg-flag-soft py-2 text-footnote font-bold text-flag disabled:opacity-40">
                  − Add as con
                </button>
                <button onClick={() => { setAdding(false); setDraft('') }} aria-label="Cancel" className="rounded-lg px-3 text-footnote font-bold text-ink-faint">
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center px-3.5 pt-3">
              <button onClick={() => setAdding(true)} className="text-footnote font-bold text-ink-faint">
                + Add pro or con
              </button>
              <span className="flex-1" />
              {!expandedByDefault && (
                <button onClick={() => setOpen(false)} className="text-footnote font-bold text-green">
                  Hide
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <button onClick={() => setOpen(true)} className="flex w-full items-center gap-3.5 px-3.5 pt-3 text-left">
          <span className="text-footnote text-ink-dim">
            <span className="font-extrabold text-green">+</span> {option.pros.length} pro{option.pros.length === 1 ? '' : 's'}
          </span>
          <span className="text-footnote text-ink-dim">
            <span className="font-extrabold text-flag">−</span> {option.cons.length} con{option.cons.length === 1 ? '' : 's'}
          </span>
          <span className="flex-1" />
          <span className="text-footnote font-bold text-green">Show</span>
        </button>
      )}
    </div>
  )
}

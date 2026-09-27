import { useState } from 'react'
import { useStore } from '../data/store'
import type { Trip, TripOption } from '../types'
import { AvatarStack, Card, Pill, PrimaryButton, SectionLabel } from './ui'
import { useConfirm } from './Confirm'

export default function TripPlanning({ trip }: { trip: Trip }) {
  const { updateTrip, voteTripOption, newId } = useStore()
  const confirm = useConfirm()
  const [newDest, setNewDest] = useState('')

  const addOption = () => {
    if (!newDest.trim()) return
    updateTrip({
      ...trip,
      options: [...trip.options, { id: newId('o'), title: newDest.trim(), pros: [], cons: [], votes: [] }],
    })
    setNewDest('')
  }

  // Toggled through its own change rather than by writing the whole trip
  // back, so two people voting at once don't overwrite each other.
  const vote = (optionId: string) => voteTripOption(trip.id, optionId)

  const lockIn = async (option: TripOption) => {
    const ok = await confirm({
      title: `Lock in ${option.title}?`,
      body: "Voting closes and the trip moves to booked, where the itinerary and cost splitting live. Planning's over, packing begins.",
      confirmLabel: "Lock it in",
    })
    if (!ok) return
    updateTrip({ ...trip, status: 'booked', location: option.title, chosenOptionId: option.id })
  }

  return (
    <>
      <Card className="p-4 bg-green-soft/60 border-green/20">
        <p className="text-footnote text-ink">
          <span className="font-bold">Where are we going?</span> Add contenders, stack up the pros and cons, and vote.
        </p>
      </Card>

      <SectionLabel>Destinations</SectionLabel>
      <div className="space-y-3">
        {trip.options.length === 0 && (
          <Card className="p-5 text-center text-footnote text-ink-dim">Nothing on the table yet. Add the first contender below.</Card>
        )}
        {[...trip.options]
          .sort((a, b) => b.votes.length - a.votes.length)
          .map((option) => (
            <OptionCard key={option.id} trip={trip} option={option} onVote={() => vote(option.id)} onLockIn={() => void lockIn(option)} />
          ))}
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

function OptionCard({ trip, option, onVote, onLockIn }: { trip: Trip; option: TripOption; onVote: () => void; onLockIn: () => void }) {
  const { data, updateTrip } = useStore()
  const [draft, setDraft] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const me = data.currentUserId
  const myPick = option.votes.includes(me)
  const leading = option.votes.length > 0 && option.votes.length === Math.max(...trip.options.map((o) => o.votes.length))

  const addPoint = (kind: 'pros' | 'cons') => {
    if (!draft.trim()) return
    updateTrip({
      ...trip,
      options: trip.options.map((o) => (o.id === option.id ? { ...o, [kind]: [...o[kind], draft.trim()] } : o)),
    })
    setDraft('')
    setShowAdd(false)
  }

  return (
    <Card className={`p-4 ${leading ? 'border-green/40' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-bold text-headline text-ink">{option.title}</p>
        {leading && <Pill tone="green">Leading</Pill>}
      </div>

      {(option.pros.length > 0 || option.cons.length > 0) && (
        <div className="mt-2.5 space-y-1">
          {option.pros.map((p, i) => (
            <p key={`p${i}`} className="text-footnote text-ink-dim flex gap-2">
              <span className="text-green font-extrabold shrink-0">+</span> {p}
            </p>
          ))}
          {option.cons.map((c, i) => (
            <p key={`c${i}`} className="text-footnote text-ink-dim flex gap-2">
              <span className="text-flag font-extrabold shrink-0">−</span> {c}
            </p>
          ))}
        </div>
      )}

      {showAdd ? (
        <div className="mt-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. 36 holes a day, cheap flights…"
            autoFocus
            className="w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
          />
          <div className="flex gap-2 mt-2">
            <button onClick={() => addPoint('pros')} disabled={!draft.trim()} className="flex-1 rounded-lg bg-green-soft text-green font-bold text-footnote py-2 disabled:opacity-40">
              + Add as pro
            </button>
            <button onClick={() => addPoint('cons')} disabled={!draft.trim()} className="flex-1 rounded-lg bg-flag-soft text-flag font-bold text-footnote py-2 disabled:opacity-40">
              − Add as con
            </button>
            <button onClick={() => { setShowAdd(false); setDraft('') }} className="rounded-lg px-3 text-footnote font-bold text-ink-faint">
              ✕
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="mt-2.5 text-footnote font-bold text-ink-faint">
          + Add pro / con
        </button>
      )}

      <div className="mt-3.5 pt-3 border-t border-line flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {option.votes.length === 0 ? (
            <span className="text-footnote text-ink-faint">No votes yet</span>
          ) : (
            <>
              <AvatarStack players={option.votes.map((pid) => data.players.find((pl) => pl.id === pid))} size={22} max={4} />
              <span className="text-footnote text-ink-dim font-bold tabular-nums">{option.votes.length}</span>
            </>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
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
      </div>
    </Card>
  )
}

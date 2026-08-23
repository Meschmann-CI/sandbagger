import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMembers, useStore } from '../data/store'
import { fmt1, type RoundPlayer } from '../types'
import { courseSuggestions } from '../lib/stats'
import { Avatar, Card, GhostButton, PrimaryButton } from '../components/ui'

// Everything about a logged round on one screen. Scores can be cleared
// back to blank, which puts the round back on that golfer's to-do list.
export default function EditRound() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, updateRound, deleteRound } = useStore()
  const members = useMembers()
  const round = data.rounds.find((r) => r.id === id)

  const [courseName, setCourseName] = useState(round?.courseName ?? '')
  const [date, setDate] = useState(round?.date ?? '')
  const [tee, setTee] = useState(round?.tee ?? '')
  const [tripId, setTripId] = useState(round?.tripId ?? '')
  const [entries, setEntries] = useState<RoundPlayer[]>(round?.players ?? [])

  if (!round) {
    return (
      <div className="pt-16 text-center text-ink-dim">
        Round not found. <Link to="/rounds" className="text-green font-bold">Back to rounds</Link>
      </div>
    )
  }

  const bookedTrips = data.trips.filter((t) => t.status === 'booked')
  const suggestions = courseSuggestions(data).filter((c) => c.toLowerCase() !== courseName.trim().toLowerCase())

  const togglePlayer = (playerId: string) => {
    setEntries((list) => {
      if (list.some((e) => e.playerId === playerId)) return list.filter((e) => e.playerId !== playerId)
      const player = data.players.find((p) => p.id === playerId)
      return [...list, { playerId, gross: null, handicapSnapshot: player?.handicap ?? 18 }]
    })
  }

  const setScore = (playerId: string, raw: string) => {
    const n = parseInt(raw, 10)
    setEntries((list) => list.map((e) => (e.playerId === playerId ? { ...e, gross: Number.isNaN(n) ? null : n } : e)))
  }

  const bump = (playerId: string, delta: number) =>
    setEntries((list) =>
      list.map((e) =>
        e.playerId === playerId ? { ...e, gross: Math.max(50, Math.min(160, (e.gross ?? 90) + delta)) } : e,
      ),
    )

  const save = () => {
    if (!courseName.trim() || !date || entries.length === 0) return
    updateRound({
      ...round,
      courseName: courseName.trim(),
      date,
      tee: tee.trim() || undefined,
      tripId: tripId || undefined,
      players: entries,
    })
    navigate(`/rounds/${round.id}`, { replace: true })
  }

  const field =
    'w-full rounded-xl border border-line-strong bg-card px-4 py-3 text-[15px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none'
  const label = 'block text-[12px] font-bold uppercase tracking-[0.12em] text-ink-faint mb-2 px-1'

  return (
    <div className="rise">
      <header className="pt-4 pb-4 px-1 flex items-center justify-between">
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink">Edit Round</h1>
        <button onClick={() => navigate(-1)} className="text-[13px] font-bold text-ink-faint px-2 py-1">Cancel</button>
      </header>

      <div className="space-y-4">
        <div>
          <label className={label}>Course</label>
          <input value={courseName} onChange={(e) => setCourseName(e.target.value)} className={field} />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2.5 px-1">
              {suggestions.slice(0, 3).map((c) => (
                <button
                  key={c}
                  onClick={() => setCourseName(c)}
                  className="rounded-full border border-line-strong bg-card px-3.5 py-2 text-[13px] font-bold text-ink-dim active:bg-paper"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Tees</label>
            <input value={tee} onChange={(e) => setTee(e.target.value)} placeholder="White" className={field} />
          </div>
        </div>

        {bookedTrips.length > 0 && (
          <div>
            <label className={label}>Part of a trip?</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTripId('')}
                className={`rounded-full px-4 py-2.5 text-[13.5px] font-bold border transition ${!tripId ? 'bg-ink text-white border-ink' : 'border-line-strong bg-card text-ink-dim'}`}
              >
                Just a round
              </button>
              {bookedTrips.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTripId(t.id)}
                  className={`rounded-full px-4 py-2.5 text-[13.5px] font-bold border transition ${tripId === t.id ? 'bg-ink text-white border-ink' : 'border-line-strong bg-card text-ink-dim'}`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className={label}>Who played</label>
          <div className="space-y-2.5">
            {members.map((p) => {
              const entry = entries.find((e) => e.playerId === p.id)
              const on = !!entry
              return (
                <Card key={p.id} className={`p-3.5 ${on ? '' : 'opacity-55'}`}>
                  <div className="flex items-center gap-3">
                    <button onClick={() => togglePlayer(p.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <Avatar player={p} size={36} />
                      <div className="min-w-0">
                        <p className="font-bold text-[14.5px] text-ink truncate">
                          {p.name}
                          {p.id === data.currentUserId && <span className="text-ink-faint font-semibold"> (you)</span>}
                        </p>
                        <p className="text-[11.5px] text-ink-faint tabular-nums">
                          {on ? `hcp ${fmt1(entry.handicapSnapshot)} at the time` : 'not in this round'}
                        </p>
                      </div>
                    </button>
                    {on && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => bump(p.id, -1)}
                          className="h-10 w-10 rounded-lg bg-paper border border-line-strong text-lg font-bold text-ink active:scale-95"
                          aria-label={`decrease ${p.name}`}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={entry.gross ?? ''}
                          placeholder="—"
                          onChange={(e) => setScore(p.id, e.target.value)}
                          className="w-16 h-10 rounded-lg border border-line-strong bg-card text-center text-[18px] font-extrabold text-ink tabular-nums focus:border-green focus:outline-none"
                        />
                        <button
                          onClick={() => bump(p.id, 1)}
                          className="h-10 w-10 rounded-lg bg-paper border border-line-strong text-lg font-bold text-ink active:scale-95"
                          aria-label={`increase ${p.name}`}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
          <p className="text-[11.5px] text-ink-faint px-1 mt-2">
            Clear a score to blank and it goes back on that golfer's list to fill in.
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <PrimaryButton onClick={save} disabled={!courseName.trim() || !date || entries.length === 0} className="flex-1 !py-4">
            Save changes
          </PrimaryButton>
          <GhostButton onClick={() => navigate(-1)}>Cancel</GhostButton>
        </div>

        <button
          onClick={() => {
            if (confirm(`Delete this round at ${round.courseName}? This can't be undone.`)) {
              deleteRound(round.id)
              navigate('/rounds')
            }
          }}
          className="w-full rounded-xl border border-flag/40 bg-flag-soft py-3 text-[14px] font-bold text-flag active:bg-flag/10"
        >
          Delete this round
        </button>
      </div>
      <div className="h-6" />
    </div>
  )
}

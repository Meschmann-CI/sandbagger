import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoBack } from '../lib/nav'
import { useMembers, useStore } from '../data/store'
import { courseSuggestions } from '../lib/stats'
import { todayISO } from '../lib/dates'
import { GROSS_CEILING, GROSS_FLOOR, grossWarning } from '../lib/scores'
import { fmt1 } from '../types'
import { Avatar, Card, GhostButton, PrimaryButton } from '../components/ui'

// The two-minute flow: where → who → scores → done.
// Defaults to just you, since most rounds are solo. Tap the others in
// when the group actually played.

export default function LogRound() {
  const navigate = useNavigate()
  const goBack = useGoBack('/')
  const { data, addRound } = useStore()
  const members = useMembers()

  const [step, setStep] = useState(0)
  const [courseName, setCourseName] = useState('')
  const [date, setDate] = useState(todayISO)
  const [tee, setTee] = useState('')
  const [tripId, setTripId] = useState<string>('')
  const [playerIds, setPlayerIds] = useState<string[]>([data.currentUserId])
  const [scores, setScores] = useState<Record<string, number>>({})

  const suggestions = useMemo(() => courseSuggestions(data), [data])
  const filteredSuggestions = courseName
    ? suggestions.filter((c) => c.toLowerCase().includes(courseName.toLowerCase()) && c.toLowerCase() !== courseName.toLowerCase())
    : suggestions
  const bookedTrips = data.trips.filter((t) => t.status === 'booked')

  const togglePlayer = (id: string) =>
    setPlayerIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const bump = (id: string, delta: number) =>
    setScores((s) => ({ ...s, [id]: Math.max(GROSS_FLOOR, Math.min(GROSS_CEILING, (s[id] ?? 90) + delta)) }))

  const canNext = step === 0 ? courseName.trim().length > 0 : step === 1 ? playerIds.length > 0 : true
  // One score is enough. Anyone left blank gets asked for theirs later.
  const anyScored = playerIds.some((id) => scores[id] !== undefined)
  const missing = playerIds.filter((id) => scores[id] === undefined)

  const save = () => {
    const round = addRound({
      date,
      courseName: courseName.trim(),
      tee: tee.trim() || undefined,
      tripId: tripId || undefined,
      players: playerIds.map((pid) => ({
        playerId: pid,
        gross: scores[pid] ?? null,
        handicapSnapshot: data.players.find((p) => p.id === pid)!.handicap,
      })),
    })
    navigate(`/rounds/${round.id}`, { replace: true })
  }

  return (
    <div className="rise">
      <header className="pt-4 pb-4 px-1 flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-ink">Log a Round</h1>
          <div className="flex gap-1.5 mt-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-8 bg-green' : i < step ? 'w-4 bg-green/40' : 'w-4 bg-line-strong'}`} />
            ))}
          </div>
        </div>
        <button onClick={() => goBack()} className="text-[13px] font-bold text-ink-faint px-2 py-1">Cancel</button>
      </header>

      {/* Step 1: course + date */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-bold uppercase tracking-[0.12em] text-ink-faint mb-2 px-1">Course</label>
            <input
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="Where'd you play?"
              autoFocus
              className="w-full rounded-xl border border-line-strong bg-card px-4 py-4 text-[16px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
            />
            {filteredSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2.5 px-1">
                {filteredSuggestions.slice(0, 4).map((c) => (
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
              <label className="block text-[12px] font-bold uppercase tracking-[0.12em] text-ink-faint mb-2 px-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-line-strong bg-card px-4 py-3.5 text-[15px] text-ink focus:border-green focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[12px] font-bold uppercase tracking-[0.12em] text-ink-faint mb-2 px-1">Tees (optional)</label>
              <input
                value={tee}
                onChange={(e) => setTee(e.target.value)}
                placeholder="White"
                className="w-full rounded-xl border border-line-strong bg-card px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
              />
            </div>
          </div>

          {bookedTrips.length > 0 && (
            <div>
              <label className="block text-[12px] font-bold uppercase tracking-[0.12em] text-ink-faint mb-2 px-1">Part of a trip?</label>
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
        </div>
      )}

      {/* Step 2: players */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-[13.5px] text-ink-dim px-1">Who teed it up? Just you is a fine answer.</p>
          {members.map((p) => {
            const on = playerIds.includes(p.id)
            return (
              <Card
                key={p.id}
                onClick={() => togglePlayer(p.id)}
                className={`p-4 flex items-center gap-3.5 transition ${on ? 'border-green/50 bg-green-soft/40' : 'opacity-60'}`}
              >
                <Avatar player={p} size={44} />
                <div className="flex-1">
                  <p className="font-bold text-[15px] text-ink">
                    {p.name}
                    {p.id === data.currentUserId && <span className="text-ink-faint font-semibold"> (you)</span>}
                  </p>
                  <p className="text-[12px] text-ink-faint tabular-nums">Handicap {fmt1(p.handicap)}</p>
                </div>
                <span className={`h-7 w-7 rounded-full border-2 flex items-center justify-center transition ${on ? 'border-green bg-green' : 'border-line-strong'}`}>
                  {on && (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4.5 12.5 L9.5 17.5 L19.5 6.5" />
                    </svg>
                  )}
                </span>
              </Card>
            )
          })}
        </div>
      )}

      {/* Step 3: scores */}
      {step === 2 && (
        <div className="space-y-3">
          <p className="text-[13.5px] text-ink-dim px-1">Gross scores. Net is handled for you.</p>
          {playerIds.map((pid) => {
            const p = data.players.find((pl) => pl.id === pid)!
            const val = scores[pid]
            const warning = val === undefined ? null : grossWarning(val)
            return (
              <Card key={pid} className="p-4 flex flex-wrap items-center gap-3">
                <Avatar player={p} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[14.5px] text-ink truncate">{p.name}</p>
                  <p className="text-[11.5px] text-ink-faint tabular-nums">
                    {val !== undefined ? `net ${fmt1(val - p.handicap)}` : `hcp ${fmt1(p.handicap)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => bump(pid, -1)}
                    className="h-12 w-12 rounded-xl bg-paper border border-line-strong text-ink text-2xl font-bold active:scale-95 transition"
                    aria-label={`decrease ${p.name}`}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={val ?? ''}
                    placeholder="—"
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10)
                      setScores((s) => {
                        const copy = { ...s }
                        if (Number.isNaN(n)) delete copy[pid]
                        else copy[pid] = n
                        return copy
                      })
                    }}
                    className="w-16 h-12 rounded-xl border border-line-strong bg-card text-center text-[22px] font-extrabold text-ink tabular-nums focus:border-green focus:outline-none"
                  />
                  <button
                    onClick={() => bump(pid, 1)}
                    className="h-12 w-12 rounded-xl bg-paper border border-line-strong text-ink text-2xl font-bold active:scale-95 transition"
                    aria-label={`increase ${p.name}`}
                  >
                    +
                  </button>
                </div>
                {warning && <p className="w-full text-[12px] font-semibold text-flag">{warning}</p>}
              </Card>
            )
          })}
          <p className="text-[11.5px] text-ink-faint px-1 pt-1">
            Tap − / + to nudge from 90, or type it straight in.
          </p>
          {missing.length > 0 && anyScored && (
            <Card className="p-3.5 border-gold/30 bg-gold-soft/40">
              <p className="text-[12.5px] text-ink">
                <span className="font-bold">Don't know everyone's score?</span> Leave it blank —{' '}
                {missing
                  .map((id) => data.players.find((p) => p.id === id)?.name)
                  .filter(Boolean)
                  .join(' and ')}{' '}
                will be asked to fill {missing.length === 1 ? 'theirs' : 'them'} in next time they open the app.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Footer nav */}
      <div className="fixed bottom-0 inset-x-0 z-40">
        <div className="mx-auto max-w-md p-4 pb-[max(env(safe-area-inset-bottom),1rem)] bg-gradient-to-t from-paper via-paper/95 to-transparent">
          <div className="flex gap-3">
            {step > 0 && <GhostButton onClick={() => setStep((s) => s - 1)}>Back</GhostButton>}
            {step < 2 ? (
              <PrimaryButton onClick={() => canNext && setStep((s) => s + 1)} disabled={!canNext} className="flex-1 !py-4">
                Next
              </PrimaryButton>
            ) : (
              <PrimaryButton onClick={() => anyScored && save()} disabled={!anyScored} className="flex-1 !py-4">
                {missing.length > 0 ? `Save with ${missing.length} to come` : 'Save round'}
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>
      <div className="h-24" />
    </div>
  )
}

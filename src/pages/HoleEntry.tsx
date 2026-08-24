import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { HOLE_COUNT, cardOf, cardTotal, holesEntered } from '../lib/holes'
import { findCourse, hasPars, padded, toPar } from '../lib/courses'
import { Avatar, Card, PrimaryButton } from '../components/ui'

// Hole by hole, everyone on one screen — the way you'd actually fill a
// card walking off a green. The grid view is for fixing mistakes after.
export default function HoleEntry() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, updateRound } = useStore()
  const round = data.rounds.find((r) => r.id === id)

  // Only the cells this session actually typed, keyed player → hole.
  // Everything on screen is the live round with these laid over the top,
  // so a score somebody posts from another phone mid-round shows up here
  // rather than being silently overwritten when this card is saved.
  const [edits, setEdits] = useState<Record<string, Record<number, number | null>>>({})
  const [hole, setHole] = useState(() => {
    // Open on the first hole nobody has filled in.
    const filled = (round?.players ?? []).map((rp) => holesEntered(rp))
    const most = filled.length ? Math.max(...filled) : 0
    return Math.min(most, HOLE_COUNT - 1)
  })
  const [view, setView] = useState<'hole' | 'grid'>('hole')
  // The hole the user is actively filling in. Only this one auto-advances,
  // so stepping back to fix the 4th doesn't fling you forward again.
  const [armedHole, setArmedHole] = useState<number | null>(null)

  // The live card for each golfer: what's saved, plus this session's edits.
  const players = round?.players ?? []
  const cards: Record<string, (number | null)[]> = Object.fromEntries(
    players.map((rp) => {
      const merged = cardOf(rp)
      for (const [index, value] of Object.entries(edits[rp.playerId] ?? {})) merged[Number(index)] = value
      return [rp.playerId, merged]
    }),
  )

  const course = findCourse(data, round?.courseName ?? '')
  const pars = hasPars(course) ? padded(course.pars) : null

  const holeComplete = players.length > 0 && players.every((rp) => cards[rp.playerId]?.[hole] != null)

  // Everyone's in — move on. The pause is deliberate: without it, typing
  // the "1" of a 10 completes the hole and the screen jumps before the
  // "0" lands.
  useEffect(() => {
    if (view !== 'hole' || armedHole !== hole || !holeComplete || hole >= HOLE_COUNT - 1) return
    const timer = setTimeout(() => {
      setHole((h) => Math.min(HOLE_COUNT - 1, h + 1))
      setArmedHole(null)
    }, 900)
    return () => clearTimeout(timer)
  }, [armedHole, hole, holeComplete, view])

  if (!round) {
    return (
      <div className="pt-16 text-center text-ink-dim">
        Round not found. <Link to="/rounds" className="text-green font-bold">Back to rounds</Link>
      </div>
    )
  }

  const setScore = (playerId: string, index: number, value: number | null) => {
    setArmedHole(index)
    setEdits((all) => ({
      ...all,
      [playerId]: {
        ...(all[playerId] ?? {}),
        [index]: value == null ? null : Math.max(1, Math.min(20, value)),
      },
    }))
  }

  const bump = (playerId: string, index: number, delta: number) => {
    const current = cards[playerId]?.[index]
    setScore(playerId, index, current == null ? 4 : current + delta)
  }

  const save = () => {
    updateRound({
      ...round,
      players: round.players.map((rp) => {
        const card = cards[rp.playerId]
        const total = cardTotal(card)
        return {
          ...rp,
          holes: card.some((h) => h != null) ? card : undefined,
          // The card is the source of truth once it exists, so the total
          // every other screen reads stays consistent with it.
          gross: total ?? rp.gross,
        }
      }),
    })
    navigate(`/rounds/${round.id}`, { replace: true })
  }

  const runningTotal = (playerId: string) => {
    const card = cards[playerId] ?? []
    return card.slice(0, hole + 1).reduce<number>((sum, h) => sum + (h ?? 0), 0)
  }

  // Against par for the holes they've actually put a score on, which is
  // the number you'd be keeping in your head walking down the fairway.
  const runningToPar = (playerId: string): string | null => {
    if (!pars) return null
    const card = cards[playerId] ?? []
    let strokes = 0
    let par = 0
    for (let i = 0; i <= hole; i++) {
      if (card[i] == null) continue
      strokes += card[i] as number
      par += pars[i] ?? 0
    }
    return par === 0 ? null : toPar(strokes - par)
  }

  const enteredThisHole = round.players.filter((rp) => cards[rp.playerId]?.[hole] != null).length
  const totalEntered = round.players.reduce((sum, rp) => sum + (cards[rp.playerId]?.filter((h) => h != null).length ?? 0), 0)

  return (
    <div className="rise">
      <header className="pt-4 pb-3 px-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={() => navigate(`/rounds/${round.id}`)} className="text-[13px] font-bold text-ink-faint mb-1">
            ← Back
          </button>
          <h1 className="text-[21px] font-extrabold tracking-tight text-ink truncate">{round.courseName}</h1>
          <p className="text-[12.5px] text-ink-dim">{totalEntered} hole scores in</p>
        </div>
        <div className="flex rounded-xl border border-line-strong overflow-hidden shrink-0">
          {(['hole', 'grid'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3.5 py-2 text-[12.5px] font-bold ${view === v ? 'bg-ink text-white' : 'bg-card text-ink-dim'}`}
            >
              {v === 'hole' ? 'Hole' : 'Card'}
            </button>
          ))}
        </div>
      </header>

      {view === 'hole' ? (
        <>
          {/* Hole picker */}
          <Card className="p-3">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => { setArmedHole(null); setHole((h) => Math.max(0, h - 1)) }}
                disabled={hole === 0}
                className="h-11 w-11 rounded-xl bg-paper border border-line-strong text-lg font-bold text-ink disabled:opacity-30 active:scale-95"
              >
                ←
              </button>
              <div className="text-center">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-faint">Hole</p>
                <p className="text-[30px] font-extrabold text-ink leading-none tabular-nums">{hole + 1}</p>
                {pars?.[hole] != null && (
                  <p className="text-[11px] font-bold text-ink-faint tabular-nums mt-0.5">par {pars[hole]}</p>
                )}
              </div>
              <button
                onClick={() => { setArmedHole(null); setHole((h) => Math.min(HOLE_COUNT - 1, h + 1)) }}
                disabled={hole === HOLE_COUNT - 1}
                className="h-11 w-11 rounded-xl bg-paper border border-line-strong text-lg font-bold text-ink disabled:opacity-30 active:scale-95"
              >
                →
              </button>
            </div>
            {/* Dots so you can jump around and see what's filled */}
            <div className="grid grid-cols-9 gap-1.5 mt-3">
              {Array.from({ length: HOLE_COUNT }, (_, i) => {
                const filled = round.players.some((rp) => cards[rp.playerId]?.[i] != null)
                return (
                  <button
                    key={i}
                    onClick={() => { setArmedHole(null); setHole(i) }}
                    className={`h-7 rounded-md text-[11px] font-bold tabular-nums transition ${
                      i === hole
                        ? 'bg-green text-white'
                        : filled
                          ? 'bg-green-soft text-green'
                          : 'bg-paper text-ink-faint border border-line'
                    }`}
                  >
                    {i + 1}
                  </button>
                )
              })}
            </div>
          </Card>

          {/* One row per golfer */}
          <div className="space-y-2.5 mt-3">
            {round.players.map((rp) => {
              const p = data.players.find((pl) => pl.id === rp.playerId)
              if (!p) return null
              const value = cards[rp.playerId]?.[hole] ?? null
              return (
                <Card key={rp.playerId} className="p-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar player={p} size={36} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[14.5px] text-ink truncate">
                        {p.name}
                        {p.id === data.currentUserId && <span className="text-ink-faint font-semibold"> (you)</span>}
                      </p>
                      <p className="text-[11.5px] text-ink-faint tabular-nums">
                        {runningTotal(rp.playerId) > 0 ? (
                          <>
                            {runningTotal(rp.playerId)} thru {hole + 1}
                            {runningToPar(rp.playerId) && (
                              <span className="font-bold text-ink-dim"> · {runningToPar(rp.playerId)}</span>
                            )}
                          </>
                        ) : (
                          'no scores yet'
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => bump(rp.playerId, hole, -1)}
                        className="h-11 w-11 rounded-xl bg-paper border border-line-strong text-xl font-bold text-ink active:scale-95"
                        aria-label={`decrease ${p.name}`}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={value ?? ''}
                        placeholder="—"
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10)
                          setScore(rp.playerId, hole, Number.isNaN(n) ? null : n)
                        }}
                        className="w-14 h-11 rounded-xl border border-line-strong bg-card text-center text-[20px] font-extrabold text-ink tabular-nums focus:border-green focus:outline-none"
                      />
                      <button
                        onClick={() => bump(rp.playerId, hole, 1)}
                        className="h-11 w-11 rounded-xl bg-paper border border-line-strong text-xl font-bold text-ink active:scale-95"
                        aria-label={`increase ${p.name}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>

          {hole < HOLE_COUNT - 1 && (
            <button
              onClick={() => setHole((h) => h + 1)}
              disabled={enteredThisHole === 0}
              className="w-full mt-3 rounded-xl border border-line-strong bg-card py-3 text-[14px] font-bold text-ink-dim disabled:opacity-40 active:bg-paper"
            >
              Next hole →
            </button>
          )}
        </>
      ) : (
        /* Whole card, scrolls sideways */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-[12px] tabular-nums">
              <thead>
                <tr className="border-b border-line">
                  <th className="sticky left-0 bg-card px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                    Hole
                  </th>
                  {Array.from({ length: 9 }, (_, i) => (
                    <th key={i} className="w-11 px-1 py-2 font-bold text-ink-faint">{i + 1}</th>
                  ))}
                  <th className="w-11 px-1 py-2 font-extrabold text-ink">Out</th>
                  {Array.from({ length: 9 }, (_, i) => (
                    <th key={i + 9} className="w-11 px-1 py-2 font-bold text-ink-faint">{i + 10}</th>
                  ))}
                  <th className="w-11 px-1 py-2 font-extrabold text-ink">In</th>
                  <th className="w-12 px-1 py-2 font-extrabold text-ink">Tot</th>
                </tr>
              </thead>
              <tbody>
                {round.players.map((rp) => {
                  const p = data.players.find((pl) => pl.id === rp.playerId)
                  if (!p) return null
                  const card = cards[rp.playerId] ?? []
                  const out = card.slice(0, 9).reduce<number>((s, h) => s + (h ?? 0), 0)
                  const inn = card.slice(9).reduce<number>((s, h) => s + (h ?? 0), 0)
                  const cell = (i: number) => (
                    <td key={i} className="px-0.5 py-1.5 text-center">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={card[i] ?? ''}
                        placeholder="–"
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10)
                          setScore(rp.playerId, i, Number.isNaN(n) ? null : n)
                        }}
                        className="w-9 h-9 rounded-md border border-line bg-card text-center text-[13px] font-bold text-ink tabular-nums focus:border-green focus:outline-none"
                      />
                    </td>
                  )
                  return (
                    <tr key={rp.playerId} className="border-b border-line last:border-0">
                      <td className="sticky left-0 bg-card px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <Avatar player={p} size={22} />
                          <span className="text-[12.5px] font-bold text-ink whitespace-nowrap">{p.name}</span>
                        </div>
                      </td>
                      {Array.from({ length: 9 }, (_, i) => cell(i))}
                      <td className="px-1 text-center font-extrabold text-ink">{out || '–'}</td>
                      {Array.from({ length: 9 }, (_, i) => cell(i + 9))}
                      <td className="px-1 text-center font-extrabold text-ink">{inn || '–'}</td>
                      <td className="px-1 text-center font-extrabold text-ink">{out + inn || '–'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex gap-3 mt-4">
        <PrimaryButton onClick={save} disabled={totalEntered === 0} className="flex-1 !py-4">
          Save card
        </PrimaryButton>
        <button onClick={() => navigate(`/rounds/${round.id}`)} className="px-5 text-[13px] font-bold text-ink-faint">
          Cancel
        </button>
      </div>
      <p className="text-[11.5px] text-ink-faint px-1 mt-2">
        Saving the card sets each golfer's total from their holes. Partial cards are fine — totals count what's entered.
      </p>
      <div className="h-4" />
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoBack } from '../lib/nav'
import { useMembers, useStore } from '../data/store'
import { prettyDate, saddamHistory, saddamState, shortDate } from '../lib/stats'
import { Avatar, Card, PrimaryButton, RowButton, SaddamIcon, SectionLabel } from '../components/ui'

// Who holds the trophy, how it got there, and a way to hand it over when
// it changed hands somewhere the app never saw.
export default function Saddam() {
  const navigate = useNavigate()
  const goBack = useGoBack('/h2h')
  const { data, awardSaddam } = useStore()
  const members = useMembers()
  const [handingOver, setHandingOver] = useState(false)
  const [pick, setPick] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const state = saddamState(data)
  const holder = data.players.find((p) => p.id === state.holderId)
  const history = saddamHistory(data).slice().reverse()

  const reignCount = new Map<string, number>()
  for (const change of history) reignCount.set(change.playerId, (reignCount.get(change.playerId) ?? 0) + 1)
  const mostReigns = [...reignCount.entries()].sort((a, b) => b[1] - a[1])

  const handOver = () => {
    if (!pick) return
    awardSaddam(pick, note)
    setHandingOver(false)
    setPick(null)
    setNote('')
  }

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <button onClick={() => goBack()} className="text-[13px] font-bold text-ink-faint mb-2">← Back</button>
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink">The Saddam</h1>
        <p className="text-[13px] text-ink-dim">Held by whoever won the last group round.</p>
      </header>

      {/* Current holder */}
      {holder ? (
        <Card className="mt-2 overflow-hidden">
          <div className="bg-gold-soft border-b border-gold/25 px-5 py-6 flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card border border-gold/30 text-ink shrink-0">
              <SaddamIcon size={44} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold">Current holder</p>
              <p className="text-[24px] font-extrabold text-ink leading-tight truncate">{holder.name}</p>
              <p className="text-[12.5px] text-ink-dim mt-0.5">
                Since {state.since && prettyDate(state.since)}
              </p>
            </div>
            <Avatar player={holder} size={44} />
          </div>
          <div className="px-5 py-3.5">
            <p className="text-[13px] text-ink-dim">
              {state.byHand
                ? state.note
                  ? `Handed over: ${state.note}`
                  : 'Handed over by the group.'
                : `Won at ${state.courseName}.`}
              {state.defenses > 0 &&
                ` Defended ${state.defenses} group round${state.defenses === 1 ? '' : 's'} since.`}
            </p>
          </div>
        </Card>
      ) : (
        <Card className="mt-2 px-5 py-7 text-center">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-paper border border-line text-ink-faint">
            <SaddamIcon size={44} />
          </span>
          <p className="text-[17px] font-extrabold text-ink mt-3">Up for grabs</p>
          <p className="text-[13px] text-ink-dim mt-1.5 max-w-[280px] mx-auto">
            Nobody holds it. Win a round with at least one other golfer and it's yours, or hand it to whoever has it in real
            life.
          </p>
        </Card>
      )}

      {/* Hand it over */}
      {handingOver ? (
        <Card className="mt-3 p-4 space-y-3">
          <p className="text-[14px] font-extrabold text-ink">Who has it?</p>
          <p className="text-[12.5px] text-ink-dim">
            Use this when it changed hands outside the app. From today on, whoever wins the next group round takes it back.
          </p>
          <div className="space-y-2">
            {members.map((p) => (
              <button
                key={p.id}
                onClick={() => setPick(p.id)}
                className={`w-full flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition ${
                  pick === p.id ? 'border-green bg-green-soft' : 'border-line'
                }`}
              >
                <Avatar player={p} size={30} />
                <span className="flex-1 text-left text-[14px] font-bold text-ink">{p.name}</span>
                {pick === p.id && <span className="text-[12px] font-bold text-green">Selected</span>}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">Why (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Won it at the 2018 trip"
              className="w-full rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <PrimaryButton onClick={handOver} disabled={!pick} className="flex-1 !py-2.5">
              Hand it over
            </PrimaryButton>
            <button onClick={() => { setHandingOver(false); setPick(null) }} className="px-4 text-[13px] font-bold text-ink-faint">
              Cancel
            </button>
          </div>
        </Card>
      ) : (
        <button
          onClick={() => { setHandingOver(true); setPick(state.holderId) }}
          className="w-full mt-3 rounded-xl border border-line-strong bg-card py-3 text-[13.5px] font-bold text-ink-dim active:bg-paper"
        >
          {holder ? 'Hand it to someone else' : 'Give it to someone'}
        </button>
      )}

      {/* Chain of custody */}
      <SectionLabel>How it's moved</SectionLabel>
      {history.length === 0 ? (
        <Card className="p-5 text-center text-[13.5px] text-ink-dim">
          No handovers yet. The first group round with two scores in it starts the record.
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {history.map((change, i) => {
            const p = data.players.find((pl) => pl.id === change.playerId)
            if (!p) return null
            const current = i === 0
            const key = `${change.date}-${change.playerId}-${i}`
            const row = 'flex items-center gap-3 px-4 py-3'
            // A handover has no round to open, so only the ones won on the
            // course are tappable.
            const body = (
              <>
                <Avatar player={p} size={30} />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-ink truncate">
                    {p.name}
                    {current && <span className="text-gold"> · holds it now</span>}
                  </p>
                  <p className="text-[11.5px] text-ink-faint truncate tabular-nums">
                    {shortDate(change.date)}
                    {change.byHand ? ` · handed over${change.note ? `: ${change.note}` : ''}` : ` · ${change.courseName}`}
                  </p>
                </div>
                {current && (
                  <span className="text-ink shrink-0">
                    <SaddamIcon size={20} />
                  </span>
                )}
              </>
            )
            return change.roundId ? (
              <RowButton key={key} onClick={() => navigate(`/rounds/${change.roundId}`)} className={row}>
                {body}
              </RowButton>
            ) : (
              <div key={key} className={row}>
                {body}
              </div>
            )
          })}
        </Card>
      )}

      {mostReigns.length > 1 && (
        <>
          <SectionLabel>Times held</SectionLabel>
          <Card className="divide-y divide-line">
            {mostReigns.map(([playerId, count]) => {
              const p = data.players.find((pl) => pl.id === playerId)
              if (!p) return null
              return (
                <div key={playerId} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar player={p} size={26} />
                  <span className="flex-1 text-[13.5px] font-bold text-ink">{p.name}</span>
                  <span className="text-[13.5px] font-extrabold text-ink tabular-nums">{count}</span>
                </div>
              )
            })}
          </Card>
        </>
      )}

      <p className="text-[11.5px] text-ink-faint px-2 mt-3">
        It only moves on a group round with at least two scores posted, and only on an outright win — a tie leaves it where it
        is.
      </p>
      <div className="h-4" />
    </div>
  )
}

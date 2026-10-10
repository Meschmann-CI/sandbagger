import { useState } from 'react'
import { useGoBack, useNavigate } from '../lib/nav'
import { BackButton } from '../components/Nav'
import { useMembers, useStore } from '../data/store'
import { saddamDays, saddamHistory, saddamReigns, saddamState, shortDate } from '../lib/stats'
import { todayISO } from '../lib/dates'
import { CountUp } from '../components/Delight'
import { Avatar, Card, PrimaryButton, RowButton, SaddamIcon, SectionLabel } from '../components/ui'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const monthYear = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

// The trophy room: the Saddam on a spotlit stage, every reign as one
// ribbon, and the chain of custody underneath. The manual handover is a
// fix-up tool for when it changed hands somewhere the app never saw, so
// it lives behind the ••• button instead of being the biggest thing here.
export default function Saddam() {
  const navigate = useNavigate()
  const goBack = useGoBack('/h2h')
  const { data, awardSaddam } = useStore()
  const members = useMembers()
  const [handingOver, setHandingOver] = useState(false)
  const [pick, setPick] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const today = todayISO()
  const state = saddamState(data)
  const holder = data.players.find((p) => p.id === state.holderId)
  const history = saddamHistory(data).slice().reverse()
  const reigns = saddamReigns(data, today)
  const current = reigns[reigns.length - 1]
  const totals = saddamDays(data, today)
  const longest = reigns.length > 1 ? reigns.reduce((a, b) => (b.days > a.days ? b : a)) : undefined
  const shortest = reigns.filter((r) => !r.current).reduce<(typeof reigns)[number] | undefined>((a, b) => (!a || b.days < a.days ? b : a), undefined)
  const span = reigns.reduce((sum, r) => sum + r.days, 0)
  const standings = members
    .map((p) => ({ player: p, ...(totals.get(p.id) ?? { days: 0, reigns: 0 }) }))
    .sort((a, b) => b.days - a.days || b.reigns - a.reigns)
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? 'Someone'

  const handOver = () => {
    if (!pick) return
    awardSaddam(pick, note)
    setHandingOver(false)
    setPick(null)
    setNote('')
  }

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <BackButton fallback="/h2h" onBack={goBack} />
          <h1 className="text-large font-bold tracking-tight text-ink">The Saddam</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            setHandingOver((h) => !h)
            setPick(state.holderId)
          }}
          aria-expanded={handingOver}
          aria-label={holder ? 'Hand it to someone else' : 'Give it to someone'}
          className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink-dim active:bg-ink/10"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
      </header>

      {handingOver && (
        <Card className="mt-2 mb-3 p-4 space-y-3">
          <p className="text-body font-bold text-ink">Who has it?</p>
          <p className="text-footnote text-ink-dim">
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
                <span className="flex-1 text-left text-body font-bold text-ink">{p.name}</span>
                {pick === p.id && <span className="text-footnote font-bold text-green">Selected</span>}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-footnote font-semibold text-ink-dim mb-1.5">Why (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Won it at the 2018 trip"
              className="w-full rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <PrimaryButton onClick={handOver} disabled={!pick} className="flex-1 !py-2.5">
              Hand it over
            </PrimaryButton>
            <button onClick={() => { setHandingOver(false); setPick(null) }} className="px-4 text-footnote font-bold text-ink-faint">
              Cancel
            </button>
          </div>
        </Card>
      )}

      {/* The stage */}
      <div className="saddam-stage relative mt-2 overflow-hidden rounded-3xl px-6 pb-6 pt-7 text-center text-on-forest">
        <span className="relative inline-flex rounded-[30px] bg-cream p-1.5 shadow-[0_0_0_6px_rgba(239,227,200,0.14),0_18px_40px_rgba(0,0,0,0.35)]">
          <span className={holder ? '' : 'opacity-60 grayscale'}>
            <SaddamIcon size={104} />
          </span>
        </span>
        {holder && current ? (
          <>
            <p className="relative mt-5 text-footnote font-semibold text-on-forest/75">Current holder</p>
            <p className="relative mt-1 text-hero font-bold leading-none tracking-tight">{holder.name}</p>
            <p className="relative mt-2.5 text-body text-on-forest/85">
              <CountUp id="saddam-days" value={current.days} format={(n) => plural(Math.round(n), 'day')} className="font-extrabold" />
              {state.byHand ? ' · handed over' : state.courseName ? ` · won at ${state.courseName}` : ''}
            </p>
            {(state.defenses > 0 || (state.byHand && state.note)) && (
              <p className="relative mt-1 text-footnote text-on-forest/70">
                {state.byHand && state.note ? state.note : `Defended ${plural(state.defenses, 'group round')} since.`}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="relative mt-5 text-title font-bold">Up for grabs</p>
            <p className="relative mx-auto mt-1.5 max-w-[280px] text-footnote text-on-forest/75">
              Nobody holds it. Win a round with at least one other golfer and it's yours, or hand it to whoever has it in real
              life with the ••• button.
            </p>
          </>
        )}
      </div>

      {/* Every reign as one ribbon, each as wide as it lasted */}
      {reigns.length > 0 && span > 0 && (
        <>
          <SectionLabel>Every reign</SectionLabel>
          <Card className="p-4">
            <div className="flex h-7 gap-[2px] overflow-hidden rounded-lg">
              {reigns.map((r, i) => {
                const p = data.players.find((pl) => pl.id === r.playerId)
                const share = r.days / span
                return (
                  <span
                    key={`${r.date}-${i}`}
                    title={`${p?.name ?? 'Someone'}: ${plural(r.days, 'day')}`}
                    className="flex min-w-[4px] items-center justify-center overflow-hidden whitespace-nowrap text-caption font-extrabold text-white tabular-nums"
                    style={{
                      flexGrow: Math.max(r.days, 1),
                      flexBasis: 0,
                      background: p?.color ?? 'var(--color-ink-faint)',
                      boxShadow: r.current ? 'inset 0 0 0 2px var(--color-cream)' : undefined,
                    }}
                  >
                    {share > 0.2 ? `${p?.name.split(' ')[0]} ${r.days}` : share > 0.08 ? r.days : ''}
                  </span>
                )
              })}
            </div>
            <div className="mt-1.5 flex justify-between text-caption font-semibold text-ink-faint tabular-nums">
              <span>{monthYear(reigns[0].date)}</span>
              <span>Now</span>
            </div>
            {longest && (
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
                <div>
                  <p className="text-headline font-extrabold text-ink tabular-nums">{plural(longest.days, 'day')}</p>
                  <p className="text-caption text-ink-dim">
                    Longest reign · {name(longest.playerId)}
                    {longest.current && ', still going'}
                  </p>
                </div>
                {shortest && shortest !== longest && (
                  <div>
                    <p className="text-headline font-extrabold text-ink tabular-nums">{plural(shortest.days, 'day')}</p>
                    <p className="text-caption text-ink-dim">
                      Shortest · {name(shortest.playerId)}
                      {shortest.courseName && `, ${shortest.courseName}`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>

          <SectionLabel>Days held</SectionLabel>
          <Card className="divide-y divide-line">
            {standings.map(({ player: p, days, reigns: count }) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar player={p} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-footnote font-bold text-ink">{p.name}</p>
                  <p className="text-caption text-ink-faint">{count ? plural(count, 'reign') : 'Never held it'}</p>
                </div>
                <span className={`text-body font-extrabold tabular-nums ${days ? 'text-ink' : 'text-ink-faint'}`}>{days}</span>
              </div>
            ))}
          </Card>
        </>
      )}

      {/* Chain of custody */}
      <SectionLabel>How it's moved</SectionLabel>
      {history.length === 0 ? (
        <Card className="p-5 text-center text-footnote text-ink-dim">
          No handovers yet. The first group round with two scores in it starts the record.
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {history.map((change, i) => {
            const p = data.players.find((pl) => pl.id === change.playerId)
            if (!p) return null
            const isCurrent = i === 0
            const key = `${change.date}-${change.playerId}-${i}`
            const row = 'flex items-center gap-3 px-4 py-3'
            // A handover has no round to open, so only the ones won on the
            // course are tappable.
            const body = (
              <>
                <Avatar player={p} size={30} />
                <div className="flex-1 min-w-0">
                  <p className="text-body font-bold text-ink truncate">
                    {p.name}
                    {isCurrent && <span className="text-gold"> · holds it now</span>}
                  </p>
                  <p className="text-caption text-ink-faint truncate tabular-nums">
                    {shortDate(change.date)}
                    {change.byHand ? ` · handed over${change.note ? `: ${change.note}` : ''}` : ` · ${change.courseName}`}
                  </p>
                </div>
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

      <p className="text-caption text-ink-faint px-2 mt-3">
        It only moves on a group round with at least two scores posted, and only on an outright win. A tie leaves it where it
        is.
      </p>
      <div className="h-4" />
    </div>
  )
}

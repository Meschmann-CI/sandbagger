import { useMemo, useState } from 'react'
import { useStore } from '../data/store'
import type { Bet, BetResult, BetType, Round } from '../types'
import { hasScore } from '../types'
import { calcCustom, calcNassau, calcSkins } from '../lib/bets'
import { anyCards } from '../lib/holes'
import { findCourse } from '../lib/courses'
import { money } from '../lib/money'
import { Avatar, Card, PrimaryButton } from '../components/ui'

const TYPES: { key: BetType; label: string; blurb: string }[] = [
  { key: 'skins', label: 'Skins', blurb: 'Low score on a hole wins it. Ties carry nothing.' },
  { key: 'nassau', label: 'Nassau', blurb: 'Three bets: front nine, back nine, and the eighteen.' },
  { key: 'custom', label: 'Custom', blurb: 'One-off — closest to the pin, longest drive, whatever.' },
]

export default function BetEditor({ round, onSave, onCancel }: { round: Round; onSave: (bet: Omit<Bet, 'id'>) => void; onCancel: () => void }) {
  const { data } = useStore()
  const scoredIds = round.players.filter(hasScore).map((rp) => rp.playerId)
  const course = findCourse(data, round.courseName)

  const [type, setType] = useState<BetType>('skins')
  const [name, setName] = useState('')
  const [stake, setStake] = useState('5')
  const [inIds, setInIds] = useState<string[]>(scoredIds)
  const [useNet, setUseNet] = useState(true)
  const [customWinner, setCustomWinner] = useState<string | null>(null)
  const [manual, setManual] = useState<Record<string, string>>({})
  const [manualMode, setManualMode] = useState(false)

  const stakeNum = Number(stake) || 0
  const cardsExist = anyCards(round)

  const outcome = useMemo(() => {
    if (type === 'skins') return calcSkins(round, inIds, stakeNum)
    if (type === 'nassau') return calcNassau(round, inIds, stakeNum, useNet, course)
    return calcCustom(inIds, customWinner, stakeNum)
  }, [type, round, inIds, stakeNum, useNet, customWinner, course])

  // Fall back to typing amounts when the card can't decide it.
  const showManual = manualMode || (!outcome.computable && type !== 'custom')

  const manualResults: BetResult[] = inIds.map((playerId) => ({
    playerId,
    amount: Math.round((Number(manual[playerId]) || 0) * 100) / 100,
  }))
  const manualSum = manualResults.reduce((s, r) => s + r.amount, 0)

  const results = showManual ? manualResults : outcome.results
  const balanced = Math.abs(manualSum) < 0.005
  const canSave =
    inIds.length >= 2 && stakeNum >= 0 && (showManual ? balanced && manualResults.some((r) => r.amount !== 0) : outcome.computable)

  const label = 'block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5'
  const field =
    'w-full rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none'

  const nameFor = (id: string) => data.players.find((p) => p.id === id)?.name ?? 'Someone'

  return (
    <div className="rounded-2xl border border-green/30 bg-card p-4 space-y-3.5">
      {/* Game */}
      <div className="grid grid-cols-3 gap-1.5">
        {TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => { setType(t.key); setManualMode(false) }}
            className={`rounded-lg py-2 text-[12.5px] font-bold border transition ${
              type === t.key ? 'bg-green text-white border-green' : 'border-line-strong text-ink-dim'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-ink-dim">{TYPES.find((t) => t.key === type)!.blurb}</p>

      <div className="grid grid-cols-[1fr_auto] gap-2.5">
        <div>
          <label className={label}>{type === 'custom' ? 'What was the bet' : 'Name (optional)'}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === 'custom' ? 'Closest to the pin, 17th' : TYPES.find((t) => t.key === type)!.label}
            className={field}
          />
        </div>
        <div className="w-24">
          <label className={label}>Stake</label>
          <input
            value={stake}
            onChange={(e) => setStake(e.target.value.replace(/[^\d.]/g, ''))}
            inputMode="decimal"
            className={`${field} tabular-nums text-center`}
          />
        </div>
      </div>
      {type !== 'custom' && (
        <p className="text-[11.5px] text-ink-faint">
          {type === 'skins'
            ? `${money(stakeNum)} per hole, paid by everyone else to whoever wins it.`
            : `${money(stakeNum)} on each of the three, paid by everyone else to whoever wins it.`}
        </p>
      )}

      {/* Who's in */}
      <div>
        <label className={label}>Who's in ({inIds.length})</label>
        <div className="flex flex-wrap gap-2">
          {round.players.map((rp) => {
            const p = data.players.find((pl) => pl.id === rp.playerId)
            if (!p) return null
            const on = inIds.includes(p.id)
            const noScore = !hasScore(rp)
            return (
              <button
                key={p.id}
                onClick={() => setInIds((ids) => (on ? ids.filter((x) => x !== p.id) : [...ids, p.id]))}
                className={`flex items-center gap-1.5 rounded-full border pl-1 pr-3 py-1 text-[13px] font-bold transition ${
                  on ? 'bg-green-soft text-green border-green/40' : 'border-line-strong text-ink-faint opacity-60'
                }`}
              >
                <Avatar player={p} size={22} />
                {p.name}
                {noScore && <span className="text-[10px] font-semibold">(no score)</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Nassau gross/net */}
      {type === 'nassau' && (
        <div>
          <label className={label}>Decided on</label>
          <div className="flex gap-2">
            {[
              { v: true, l: 'Net' },
              { v: false, l: 'Gross' },
            ].map((o) => (
              <button
                key={o.l}
                onClick={() => setUseNet(o.v)}
                className={`flex-1 rounded-lg py-2 text-[13px] font-bold border transition ${
                  useNet === o.v ? 'bg-ink text-white border-ink' : 'border-line-strong text-ink-dim'
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-faint mt-1.5">
            Net takes off the full handicap over eighteen and half of it on each nine. Without a stroke index the app can't
            allocate shots hole by hole, so that's the approximation.
          </p>
        </div>
      )}

      {/* Custom winner */}
      {type === 'custom' && (
        <div>
          <label className={label}>Who won it</label>
          <div className="flex flex-wrap gap-2">
            {inIds.map((id) => {
              const p = data.players.find((pl) => pl.id === id)
              if (!p) return null
              return (
                <button
                  key={id}
                  onClick={() => setCustomWinner(id)}
                  className={`flex items-center gap-1.5 rounded-full border pl-1 pr-3 py-1 text-[13px] font-bold transition ${
                    customWinner === id ? 'bg-green text-white border-green' : 'border-line-strong text-ink-dim'
                  }`}
                >
                  <Avatar player={p} size={22} />
                  {p.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Result */}
      {!showManual ? (
        <Card className="p-3.5 bg-paper">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">Works out to</p>
            {type !== 'custom' && (
              <button onClick={() => setManualMode(true)} className="text-[11.5px] font-bold text-green">
                Enter by hand
              </button>
            )}
          </div>
          {outcome.detail.map((line, i) => {
            const [text, playerId] = line.split('|')
            return (
              <p key={i} className="text-[12px] text-ink-dim">
                {playerId ? `${text.replace(/^won$/, 'won')} — ${nameFor(playerId)}` : text}
              </p>
            )
          })}
          <div className="mt-2.5 pt-2.5 border-t border-line space-y-1.5">
            {results
              .slice()
              .sort((a, b) => b.amount - a.amount)
              .map((r) => {
                const p = data.players.find((pl) => pl.id === r.playerId)
                if (!p) return null
                return (
                  <div key={r.playerId} className="flex items-center gap-2.5">
                    <Avatar player={p} size={22} />
                    <span className="flex-1 text-[13px] font-bold text-ink">{p.name}</span>
                    <span
                      className={`text-[13.5px] font-extrabold tabular-nums ${
                        r.amount > 0 ? 'text-green' : r.amount < 0 ? 'text-flag' : 'text-ink-faint'
                      }`}
                    >
                      {r.amount > 0 ? '+' : r.amount < 0 ? '−' : ''}
                      {money(Math.abs(r.amount))}
                    </span>
                  </div>
                )
              })}
          </div>
        </Card>
      ) : (
        <Card className="p-3.5 bg-paper">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">Amounts</p>
            {outcome.computable && (
              <button onClick={() => setManualMode(false)} className="text-[11.5px] font-bold text-green">
                Work it out for me
              </button>
            )}
          </div>
          {!outcome.computable && (
            <p className="text-[12px] text-ink-dim mb-2">
              {cardsExist
                ? outcome.detail[0]
                : 'No hole scores on this round, so enter what changed hands. Fill in the card and the app can do the maths.'}
            </p>
          )}
          <div className="space-y-2">
            {inIds.map((id) => {
              const p = data.players.find((pl) => pl.id === id)
              if (!p) return null
              return (
                <div key={id} className="flex items-center gap-2.5">
                  <Avatar player={p} size={24} />
                  <span className="flex-1 text-[13px] font-bold text-ink">{p.name}</span>
                  <input
                    value={manual[id] ?? ''}
                    onChange={(e) => setManual((m) => ({ ...m, [id]: e.target.value.replace(/[^\d.-]/g, '') }))}
                    inputMode="decimal"
                    placeholder="0"
                    className="w-24 rounded-lg border border-line-strong bg-card px-2 py-2 text-center text-[14px] font-bold text-ink tabular-nums focus:border-green focus:outline-none"
                  />
                </div>
              )
            })}
          </div>
          <p className={`text-[11.5px] mt-2 font-semibold ${balanced ? 'text-ink-faint' : 'text-flag'}`}>
            {balanced
              ? 'Winnings and losses cancel out. Use a minus sign for money lost.'
              : `Off by ${money(Math.abs(Math.round(manualSum * 100) / 100))} — winnings and losses have to cancel out.`}
          </p>
        </Card>
      )}

      <div className="flex gap-2">
        <PrimaryButton
          onClick={() =>
            canSave &&
            onSave({
              roundId: round.id,
              type,
              name: name.trim() || TYPES.find((t) => t.key === type)!.label,
              stake: stakeNum,
              results: results.filter((r) => inIds.includes(r.playerId)),
            })
          }
          disabled={!canSave}
          className="flex-1 !py-2.5"
        >
          Save bet
        </PrimaryButton>
        <button onClick={onCancel} className="px-4 text-[13px] font-bold text-ink-faint">Cancel</button>
      </div>
    </div>
  )
}

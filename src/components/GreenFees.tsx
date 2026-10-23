import { useState } from 'react'
import { useStore } from '../data/store'
import type { GreenFee, Round } from '../types'
import { isBooked } from '../lib/bookings'
import { money } from '../lib/money'
import { useHoldUpdates } from '../lib/holdUpdates'
import { Card, SectionLabel } from './ui'
import { roundBetSettlements } from '../lib/settlements'
import SettleUp from './SettleUp'
import { todayISO } from '../lib/dates'

// Green fees one golfer covered for the tee time (Matt, 2026-10-22). Set on
// a booked round by whoever booked it, or on any round by whoever paid at
// the counter. Everyone else on it then owes the payer a head, in the same
// Settle up as the bets (roundBetSettlements), so it's one Venmo each.
// Same section as GreenFees.swift.

export function GreenFeeSection({ round }: { round: Round }) {
  const { data, updateRound } = useStore()
  const me = data.currentUserId
  const fee = round.greenFee
  const booked = isBooked(round)
  const canEdit = booked ? !round.bookedById || round.bookedById === me : !fee || fee.payerId === me
  const [opened, setOpened] = useState(false)

  const save = (next: GreenFee | undefined) => {
    if (JSON.stringify(next) === JSON.stringify(fee)) return
    updateRound({ ...round, greenFee: next })
  }

  // A played round shows a one-line link until someone uses it.
  if (!booked && !fee && !opened) {
    if (!canEdit) return null
    return (
      <button type="button" onClick={() => setOpened(true)} className="mt-6 px-1 text-footnote font-bold text-green">
        Covered everyone's green fees?
      </button>
    )
  }
  if (!canEdit && !fee) return null

  return (
    <>
      <SectionLabel>Green fees</SectionLabel>
      <Card className="p-4">
        {canEdit && <FeeEditor fee={fee} startOpen={opened} onSave={(amount) => save(amount == null ? undefined : { payerId: me, amount })} />}
        {fee && <p className={`text-footnote text-ink-dim ${canEdit ? 'mt-2.5' : ''}`}>{owesLine(round, fee, data.currentUserId, (id) => data.players.find((p) => p.id === id)?.name.split(' ')[0])}</p>}
      </Card>
    </>
  )
}

function FeeEditor({ fee, startOpen, onSave }: { fee?: GreenFee; startOpen: boolean; onSave: (amount: number | null) => void }) {
  useHoldUpdates()
  const [prepaid, setPrepaid] = useState(!!fee || startOpen)
  const [amount, setAmount] = useState(fee ? String(fee.amount) : '')
  const seg = (on: boolean) => `flex-1 rounded-[7px] py-1.5 text-footnote font-bold ${on ? 'bg-card text-ink shadow-sm' : 'text-ink-dim'}`
  const commit = () => {
    const n = Number(amount.replace(',', '.'))
    if (n > 0) onSave(n)
  }
  return (
    <div>
      <div className="flex rounded-[9px] bg-ink/[0.06] p-0.5">
        <button type="button" className={seg(prepaid)} onClick={() => setPrepaid(true)}>
          I prepaid
        </button>
        <button
          type="button"
          className={seg(!prepaid)}
          onClick={() => {
            setPrepaid(false)
            setAmount('')
            onSave(null)
          }}
        >
          At the course
        </button>
      </div>
      {prepaid && (
        <label className="mt-3 flex items-center gap-2">
          <span className="text-headline text-ink-faint">$</span>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            placeholder="85"
            autoFocus={!fee}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-24 rounded-[9px] border border-line-strong bg-card px-2.5 py-1.5 text-headline font-bold tabular-nums text-ink focus:border-green focus:outline-none"
          />
          <span className="text-footnote text-ink-dim">a head</span>
        </label>
      )}
    </div>
  )
}

/** "Barry and Pat owe you $85 each." / "Matt prepaid $85 a head, so you owe $85." */
function owesLine(round: Round, fee: GreenFee, me: string, name: (id: string) => string | undefined) {
  const others = round.players.map((p) => p.playerId).filter((id) => id !== fee.payerId)
  if (!others.length) return null
  if (fee.payerId === me) {
    const names = others.map((id) => name(id) ?? 'Someone')
    const list = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
    return `${list} owe${names.length === 1 ? 's' : ''} you ${money(fee.amount)}${names.length === 1 ? '' : ' each'}.`
  }
  return `${name(fee.payerId) ?? 'Someone'} prepaid ${money(fee.amount)} a head${others.includes(me) ? `, so you owe ${money(fee.amount)}` : ''}.`
}

/** Settle up on a booked round: green fees are owed before anyone tees off. */
export function BookedSettleUp({ round }: { round: Round }) {
  const { data, addPayment } = useStore()
  const owed = roundBetSettlements(data, round)
  if (!round.greenFee && !data.payments.some((p) => p.roundId === round.id)) return null
  return (
    <>
      <SectionLabel>Settle up</SectionLabel>
      <Card className={`p-4 ${owed.length === 0 ? 'bg-green-soft/50 border-green/25' : 'bg-gold-soft/40 border-gold/30'}`}>
        <SettleUp
          url={`/rounds/${round.id}`}
          owed={owed}
          note={`${round.courseName} green fees (Bandit)`}
          squareLabel="All settled. Nobody owes anybody for this one."
          onMarkPaid={(s) => addPayment({ roundId: round.id, fromId: s.fromId, toId: s.toId, amount: s.amount, date: todayISO() })}
        />
      </Card>
    </>
  )
}

import { useState } from 'react'
import { useStore } from '../data/store'
import type { ExpenseCategory, Trip } from '../types'
import { money, settleUp, tripBalances } from '../lib/money'
import { shortDate } from '../lib/stats'
import { Avatar, Card, PrimaryButton, SectionLabel } from './ui'

const CATEGORIES: { key: ExpenseCategory; icon: string; label: string }[] = [
  { key: 'lodging', icon: '🏠', label: 'Housing' },
  { key: 'golf', icon: '⛳', label: 'Golf' },
  { key: 'travel', icon: '✈️', label: 'Travel' },
  { key: 'food', icon: '🍽️', label: 'Food' },
  { key: 'other', icon: '📍', label: 'Other' },
]

const ICON = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.icon])) as Record<ExpenseCategory, string>

export default function TripCosts({ trip }: { trip: Trip }) {
  const { data, addExpense, deleteExpense, addPayment, deletePayment } = useStore()
  const [adding, setAdding] = useState(false)

  const attendees = trip.attendeeIds.map((id) => data.players.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p)
  const expenses = data.expenses.filter((e) => e.tripId === trip.id)
  const payments = data.payments.filter((p) => p.tripId === trip.id)
  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  const balances = tripBalances(expenses, payments, trip.attendeeIds)
  const owed = settleUp(balances)
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? 'Someone'

  return (
    <>
      <SectionLabel
        action={
          !adding ? (
            <button onClick={() => setAdding(true)} className="text-[12.5px] font-bold text-green">+ Add cost</button>
          ) : undefined
        }
      >
        Costs
      </SectionLabel>

      {adding && (
        <div className="mb-3">
          <ExpenseForm
            trip={trip}
            onSave={(e) => {
              addExpense(e)
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {expenses.length === 0 && !adding ? (
        <Card className="p-5 text-center text-[13.5px] text-ink-dim">
          Nothing logged yet. Add what people paid and the app works out who owes who.
        </Card>
      ) : (
        <>
          {/* Totals */}
          <Card className="p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">Trip total</p>
              <p className="text-[24px] font-extrabold text-ink tabular-nums">{money(total)}</p>
            </div>
            <div className="mt-3 pt-3 border-t border-line space-y-2">
              {balances
                .slice()
                .sort((a, b) => b.paid - a.paid)
                .map((b) => {
                  const p = data.players.find((pl) => pl.id === b.playerId)
                  if (!p) return null
                  return (
                    <div key={b.playerId} className="flex items-center gap-2.5">
                      <Avatar player={p} size={26} />
                      <span className="flex-1 text-[13.5px] font-bold text-ink">{p.name}</span>
                      <span className="text-[12px] text-ink-faint tabular-nums">
                        paid {money(b.paid)} · owes {money(b.share)}
                      </span>
                    </div>
                  )
                })}
            </div>
          </Card>

          {/* Settle up */}
          <Card className={`mt-3 p-4 ${owed.length === 0 ? 'bg-green-soft/50 border-green/25' : 'bg-gold-soft/40 border-gold/30'}`}>
            <p className="text-[12px] font-bold uppercase tracking-wider text-ink-faint mb-2.5">Settle up</p>
            {owed.length === 0 ? (
              <p className="text-[14px] font-bold text-green">All square. Nobody owes anybody. 🎉</p>
            ) : (
              <div className="space-y-2.5">
                {owed.map((s, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <Avatar player={data.players.find((p) => p.id === s.fromId)!} size={24} />
                    <p className="flex-1 text-[13.5px] text-ink min-w-0">
                      <span className="font-extrabold">{name(s.fromId)}</span> owes{' '}
                      <span className="font-extrabold">{name(s.toId)}</span>{' '}
                      <span className="font-extrabold tabular-nums text-flag">{money(s.amount)}</span>
                    </p>
                    <button
                      onClick={() => addPayment({ tripId: trip.id, fromId: s.fromId, toId: s.toId, amount: s.amount, date: new Date().toISOString().slice(0, 10) })}
                      className="rounded-lg bg-green px-3 py-1.5 text-[12px] font-bold text-white shrink-0 active:scale-95"
                    >
                      Mark paid
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Expense list */}
          <div className="mt-3 space-y-2.5">
            {expenses
              .slice()
              .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
              .map((e) => {
                const payer = data.players.find((p) => p.id === e.paidById)
                const each = e.amount / Math.max(1, e.sharedByIds.length)
                return (
                  <Card key={e.id} className="p-3.5">
                    <div className="flex items-start gap-3">
                      <span className="text-[16px] mt-0.5">{ICON[e.category]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold text-ink">{e.description}</p>
                        <p className="text-[12px] text-ink-dim mt-0.5">
                          {payer?.name ?? 'Someone'} paid · split {e.sharedByIds.length} ways ·{' '}
                          <span className="tabular-nums">{money(Math.round(each * 100) / 100)} each</span>
                        </p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <div className="flex -space-x-1.5">
                            {e.sharedByIds.map((pid) => {
                              const p = data.players.find((pl) => pl.id === pid)
                              if (!p) return null
                              return (
                                <span key={pid} className="rounded-full ring-2 ring-card">
                                  <Avatar player={p} size={19} />
                                </span>
                              )
                            })}
                          </div>
                          {e.date && <span className="text-[11px] text-ink-faint tabular-nums ml-1">{shortDate(e.date)}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[15px] font-extrabold text-ink tabular-nums">{money(e.amount)}</p>
                        <button onClick={() => deleteExpense(e.id)} className="text-[11px] font-bold text-flag/70 mt-1">
                          Remove
                        </button>
                      </div>
                    </div>
                  </Card>
                )
              })}
          </div>

          {/* Paybacks already recorded */}
          {payments.length > 0 && (
            <Card className="mt-3 divide-y divide-line">
              <p className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">Paybacks recorded</p>
              {payments.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <span className="text-[13px] text-ink-dim flex-1">
                    <span className="font-bold text-ink">{name(p.fromId)}</span> paid{' '}
                    <span className="font-bold text-ink">{name(p.toId)}</span>{' '}
                    <span className="font-bold tabular-nums text-green">{money(p.amount)}</span>
                    {p.date && <span className="text-ink-faint"> · {shortDate(p.date)}</span>}
                  </span>
                  <button onClick={() => deletePayment(p.id)} className="text-[11px] font-bold text-flag/70 shrink-0">
                    Undo
                  </button>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {attendees.length < 2 && (
        <p className="text-[11.5px] text-ink-faint px-2 mt-2">Add more golfers to this trip to split costs between them.</p>
      )}
    </>
  )
}

function ExpenseForm({ trip, onSave, onCancel }: { trip: Trip; onSave: (e: Omit<import('../types').Expense, 'id'>) => void; onCancel: () => void }) {
  const { data } = useStore()
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('lodging')
  const [paidById, setPaidById] = useState(data.currentUserId)
  const [sharedByIds, setSharedByIds] = useState<string[]>(trip.attendeeIds)
  const [date, setDate] = useState(trip.startDate ?? new Date().toISOString().slice(0, 10))

  const attendees = trip.attendeeIds.map((id) => data.players.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p)
  const value = Number(amount)
  const valid = description.trim() && value > 0 && sharedByIds.length > 0

  const field = 'w-full rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none'
  const label = 'block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5'

  return (
    <div className="rounded-2xl border border-green/30 bg-card p-4 space-y-3.5">
      <div className="grid grid-cols-5 gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`rounded-lg py-2 text-[11px] font-bold border transition ${category === c.key ? 'bg-green text-white border-green' : 'border-line-strong text-ink-dim'}`}
          >
            <span className="block text-[15px] leading-tight">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2.5">
        <div>
          <label className={label}>What was it</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Airbnb, tee times, groceries…" className={field} autoFocus />
        </div>
        <div className="w-28">
          <label className={label}>Amount</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            inputMode="decimal"
            placeholder="0.00"
            className={`${field} tabular-nums`}
          />
        </div>
      </div>

      <div>
        <label className={label}>Who paid</label>
        <div className="flex flex-wrap gap-2">
          {attendees.map((p) => (
            <button
              key={p.id}
              onClick={() => setPaidById(p.id)}
              className={`flex items-center gap-1.5 rounded-full border pl-1 pr-3 py-1 text-[13px] font-bold transition ${
                paidById === p.id ? 'bg-green text-white border-green' : 'border-line-strong text-ink-dim'
              }`}
            >
              <Avatar player={p} size={22} />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={label}>Split between ({sharedByIds.length})</label>
        <div className="flex flex-wrap gap-2">
          {attendees.map((p) => {
            const on = sharedByIds.includes(p.id)
            return (
              <button
                key={p.id}
                onClick={() => setSharedByIds((ids) => (on ? ids.filter((x) => x !== p.id) : [...ids, p.id]))}
                className={`flex items-center gap-1.5 rounded-full border pl-1 pr-3 py-1 text-[13px] font-bold transition ${
                  on ? 'bg-green-soft text-green border-green/40' : 'border-line-strong text-ink-faint opacity-60'
                }`}
              >
                <Avatar player={p} size={22} />
                {p.name} {on && '✓'}
              </button>
            )
          })}
        </div>
        {value > 0 && sharedByIds.length > 0 && (
          <p className="text-[12px] text-ink-dim mt-2 tabular-nums">
            {money(Math.round((value / sharedByIds.length) * 100) / 100)} each
          </p>
        )}
      </div>

      <div>
        <label className={label}>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
      </div>

      <div className="flex gap-2 pt-1">
        <PrimaryButton
          onClick={() =>
            valid &&
            onSave({
              tripId: trip.id,
              description: description.trim(),
              amount: Math.round(value * 100) / 100,
              category,
              paidById,
              sharedByIds,
              date: date || undefined,
            })
          }
          disabled={!valid}
          className="flex-1 !py-2.5"
        >
          Add cost
        </PrimaryButton>
        <button onClick={onCancel} className="px-4 text-[13px] font-bold text-ink-faint">Cancel</button>
      </div>
    </div>
  )
}

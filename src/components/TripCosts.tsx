import { useState } from 'react'
import { useStore } from '../data/store'
import type { ExpenseCategory, Trip } from '../types'
import { money, settleUp, tripBalances } from '../lib/money'
import { shortDate } from '../lib/stats'
import { todayISO } from '../lib/dates'
import SettleUp from './SettleUp'
import { Icon, type IconName } from './icons'
import { Avatar, AvatarStack, Card, PrimaryButton, SectionLabel } from './ui'
import { useHoldUpdates } from '../lib/holdUpdates'

const CATEGORIES: { key: ExpenseCategory; icon: IconName; label: string }[] = [
  { key: 'lodging', icon: 'house', label: 'Housing' },
  { key: 'golf', icon: 'flag', label: 'Golf' },
  { key: 'travel', icon: 'plane', label: 'Travel' },
  { key: 'food', icon: 'meal', label: 'Food' },
  { key: 'other', icon: 'pin', label: 'Other' },
]

const ICON = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.icon])) as Record<ExpenseCategory, IconName>

export default function TripCosts({ trip }: { trip: Trip }) {
  const { data, addExpense, deleteExpense, addPayment, deletePayment } = useStore()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)

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
            <span className="flex items-baseline gap-4">
              {expenses.length > 0 && (
                <button onClick={() => setEditing((e) => !e)} className="text-footnote font-bold text-ink-dim">
                  {editing ? 'Done' : 'Edit'}
                </button>
              )}
              {!editing && (
                <button onClick={() => setAdding(true)} className="text-footnote font-bold text-green">Add cost</button>
              )}
            </span>
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
        <Card className="p-5 text-center text-footnote text-ink-dim">
          Nothing logged yet. Add what people paid and the app works out who owes who.
        </Card>
      ) : (
        <>
          {/* Totals */}
          <Card className="p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-footnote font-semibold uppercase tracking-wider text-ink-faint">Trip total</p>
              <p className="text-large font-extrabold text-ink tabular-nums">{money(total)}</p>
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
                      <span className="flex-1 text-footnote font-bold text-ink">{p.name}</span>
                      <span className="text-footnote text-ink-faint tabular-nums">
                        paid {money(b.paid)} · owes {money(b.share)}
                      </span>
                    </div>
                  )
                })}
            </div>
          </Card>

          {/* Settle up */}
          <Card className={`mt-3 p-4 ${owed.length === 0 ? 'bg-green-soft/50 border-green/25' : 'bg-gold-soft/40 border-gold/30'}`}>
            <p className="text-footnote font-semibold uppercase tracking-wider text-ink-faint mb-2.5">Settle up</p>
            <SettleUp
              url={`/trips/${trip.id}`}
              owed={owed}
              note={`${trip.name} (Sandbagger)`}
              onMarkPaid={(s) =>
                addPayment({ tripId: trip.id, fromId: s.fromId, toId: s.toId, amount: s.amount, date: todayISO() })
              }
            />
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
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-soft text-green">
                        <Icon name={ICON[e.category]} size={17} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-body font-bold text-ink">{e.description}</p>
                        <p className="text-footnote text-ink-dim mt-0.5">
                          {payer?.name ?? 'Someone'} paid · split {e.sharedByIds.length} ways ·{' '}
                          <span className="tabular-nums">{money(Math.round(each * 100) / 100)} each</span>
                        </p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <AvatarStack players={e.sharedByIds.map((pid) => data.players.find((pl) => pl.id === pid))} size={19} max={4} />
                          {e.date && <span className="text-caption text-ink-faint tabular-nums ml-1">{shortDate(e.date)}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-body font-extrabold text-ink tabular-nums">{money(e.amount)}</p>
                        {editing && (
                          <button onClick={() => deleteExpense(e.id)} className="text-caption font-bold text-flag mt-1">
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>
                )
              })}
          </div>

          {/* Paybacks already recorded */}
          {payments.length > 0 && (
            <Card className="mt-3 divide-y divide-line">
              <p className="px-4 py-2 text-caption font-semibold uppercase tracking-wider text-ink-faint">Paybacks recorded</p>
              {payments.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <span className="text-footnote text-ink-dim flex-1">
                    <span className="font-bold text-ink">{name(p.fromId)}</span> paid{' '}
                    <span className="font-bold text-ink">{name(p.toId)}</span>{' '}
                    <span className="font-bold tabular-nums text-green">{money(p.amount)}</span>
                    {p.date && <span className="text-ink-faint"> · {shortDate(p.date)}</span>}
                  </span>
                  {editing && (
                    <button onClick={() => deletePayment(p.id)} className="text-caption font-bold text-ink-faint shrink-0">
                      Undo
                    </button>
                  )}
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {attendees.length < 2 && (
        <p className="text-caption text-ink-faint px-2 mt-2">Add more golfers to this trip to split costs between them.</p>
      )}
    </>
  )
}

function ExpenseForm({ trip, onSave, onCancel }: { trip: Trip; onSave: (e: Omit<import('../types').Expense, 'id'>) => void; onCancel: () => void }) {
  useHoldUpdates()
  const { data } = useStore()
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('lodging')
  const [paidById, setPaidById] = useState(data.currentUserId)
  const [sharedByIds, setSharedByIds] = useState<string[]>(trip.attendeeIds)
  const [date, setDate] = useState(trip.startDate ?? todayISO())

  const attendees = trip.attendeeIds.map((id) => data.players.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p)
  const value = Number(amount)
  const valid = description.trim() && value > 0 && sharedByIds.length > 0

  const field = 'w-full rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-green focus:outline-none'
  const label = 'block text-caption font-semibold uppercase tracking-wider text-ink-faint mb-1.5'

  return (
    <div className="rounded-2xl border border-green/30 bg-card p-4 space-y-3.5">
      <div className="grid grid-cols-5 gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`rounded-lg py-2 text-caption font-bold border transition ${category === c.key ? 'bg-green text-white border-green' : 'border-line-strong text-ink-dim'}`}
          >
            <Icon name={c.icon} size={18} className="mx-auto mb-0.5" />
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
              className={`flex items-center gap-1.5 rounded-full border pl-1 pr-3 py-1 text-footnote font-bold transition ${
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
                className={`flex items-center gap-1.5 rounded-full border pl-1 pr-3 py-1 text-footnote font-bold transition ${
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
          <p className="text-footnote text-ink-dim mt-2 tabular-nums">
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
        <button onClick={onCancel} className="px-4 text-footnote font-bold text-ink-faint">Cancel</button>
      </div>
    </div>
  )
}

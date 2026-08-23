import type { Expense, Payment } from '../types'

// All arithmetic runs in integer cents. Splitting $6,751.76 three ways
// leaves a remainder cent, and rounding each share on its own makes the
// shares and the credits disagree — which shows up as a stray penny in
// the settle-up line.
const toCents = (dollars: number) => Math.round(dollars * 100)
const toDollars = (cents: number) => cents / 100

export interface Balance {
  playerId: string
  paid: number // what they fronted
  share: number // what they owe of the total
  net: number // positive = owed money back, negative = owes money
}

export function tripBalances(expenses: Expense[], payments: Payment[], playerIds: string[]): Balance[] {
  const paid = new Map<string, number>()
  const share = new Map<string, number>()
  const settled = new Map<string, number>()
  const touch = (map: Map<string, number>, id: string, cents: number) => map.set(id, (map.get(id) ?? 0) + cents)

  for (const id of playerIds) {
    paid.set(id, 0)
    share.set(id, 0)
  }

  for (const e of expenses) {
    const n = e.sharedByIds.length
    if (!n) continue
    const total = toCents(e.amount)
    touch(paid, e.paidById, total)
    // Spread the leftover cents across the first few sharers so the
    // shares add up to the expense exactly.
    const base = Math.floor(total / n)
    const remainder = total - base * n
    e.sharedByIds.forEach((id, i) => touch(share, id, base + (i < remainder ? 1 : 0)))
  }

  // A payback moves the balance without changing what the trip cost.
  for (const p of payments) {
    const amount = toCents(p.amount)
    touch(settled, p.fromId, amount)
    touch(settled, p.toId, -amount)
  }

  const ids = new Set([...playerIds, ...paid.keys(), ...share.keys()])
  return [...ids].map((playerId) => ({
    playerId,
    paid: toDollars(paid.get(playerId) ?? 0),
    share: toDollars(share.get(playerId) ?? 0),
    net: toDollars((paid.get(playerId) ?? 0) - (share.get(playerId) ?? 0) + (settled.get(playerId) ?? 0)),
  }))
}

export interface Settlement {
  fromId: string
  toId: string
  amount: number
}

// Greedily match the biggest debtor to the biggest creditor, which keeps
// the number of paybacks to a minimum.
export function settleUp(balances: Balance[]): Settlement[] {
  const debtors = balances
    .map((b) => ({ id: b.playerId, cents: -toCents(b.net) }))
    .filter((d) => d.cents > 0)
    .sort((a, b) => b.cents - a.cents)
  const creditors = balances
    .map((b) => ({ id: b.playerId, cents: toCents(b.net) }))
    .filter((c) => c.cents > 0)
    .sort((a, b) => b.cents - a.cents)

  const out: Settlement[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].cents, creditors[j].cents)
    if (pay > 0) out.push({ fromId: debtors[i].id, toId: creditors[j].id, amount: toDollars(pay) })
    debtors[i].cents -= pay
    creditors[j].cents -= pay
    if (debtors[i].cents === 0) i++
    if (creditors[j].cents === 0) j++
  }
  return out
}

export const money = (n: number) =>
  n % 1 === 0 ? `$${n.toLocaleString()}` : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

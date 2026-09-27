import { useState } from 'react'
import { useStore } from '../data/store'
import type { Settlement } from '../lib/money'
import { money } from '../lib/money'
import { venmoLink } from '../lib/venmo'
import { notifyGroup } from '../lib/push'
import { Avatar, SECONDARY_BTN } from './ui'
import { Icon, VENMO_BLUE, VenmoMark } from './icons'
import { RollDown, buzz, reducedMotion } from './Delight'

// Who owes who, and the fastest way to make it stop being true.
//
// Shared by a trip's costs and a round's bets, because settling five
// dollars on a Nassau and settling six hundred on a rental house are the
// same act with a different number in it.

interface Props {
  /** Already reduced to the fewest payments, by settleUp(). */
  owed: Settlement[]
  /** What shows up in the Venmo feed, e.g. the trip or the course. */
  note: string
  /** In-app path this settle-up lives at, for the notification tap. */
  url: string
  onMarkPaid: (settlement: Settlement) => void
  /** Shown when nobody owes anybody. */
  squareLabel?: string
}

export default function SettleUp({ owed, note, url, onMarkPaid, squareLabel }: Props) {
  const { data } = useStore()
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? 'Someone'
  // Marking paid is a little ceremony: the amount rolls down to $0, a
  // check replaces the buttons, and the row slides off before it clears.
  const [paying, setPaying] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<string | null>(null)
  const keyOf = (s: Settlement) => `${s.fromId}>${s.toId}`

  const finish = (s: Settlement) => {
    setPaying(null)
    setLeaving(null)
    onMarkPaid(s)
    // Money moving is exactly what a phone should buzz about. Both sides
    // of the debt, minus whoever tapped.
    notifyGroup({
      toPlayerIds: [s.fromId, s.toId].filter((id) => id !== data.currentUserId),
      title: `${name(s.fromId)} paid ${name(s.toId)} ${money(s.amount)}`,
      body: note,
      url,
    })
  }

  if (owed.length === 0) {
    return (
      <p className="flex items-center gap-2 text-body font-bold text-green">
        <Icon name="check" size={20} />
        {squareLabel ?? 'All square. Nobody owes anybody.'}
      </p>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {owed.map((s) => {
          const k = keyOf(s)
          const from = data.players.find((p) => p.id === s.fromId)
          const to = data.players.find((p) => p.id === s.toId)
          const iOwe = s.fromId === data.currentUserId
          const owedToMe = s.toId === data.currentUserId
          // Pay the person you owe, ask the person who owes you, and stay
          // out of a debt between two other people.
          const other = iOwe ? to : owedToMe ? from : undefined
          return (
            <div
              key={k}
              className={`flex items-center gap-2.5 ${leaving === k ? 'paid-out' : ''}`}
              onAnimationEnd={() => leaving === k && finish(s)}
            >
              {from && <Avatar player={from} size={24} />}
              <p className="flex-1 text-footnote text-ink min-w-0">
                <span className="font-bold">{name(s.fromId)}</span> owes{' '}
                <span className="font-bold">{name(s.toId)}</span>{' '}
                <RollDown
                  amount={s.amount}
                  run={paying === k}
                  className={`font-extrabold ${paying === k ? 'text-green' : 'text-flag'}`}
                  onDone={() => {
                    buzz(20)
                    if (reducedMotion()) finish(s)
                    else setLeaving(k)
                  }}
                />
                {other && !other.venmo && (
                  <span className="block text-caption text-ink-faint mt-0.5">
                    Add {other.name}'s Venmo on the roster to settle it here
                  </span>
                )}
              </p>
              {paying === k ? (
                <span className="flex shrink-0 items-center gap-1 text-footnote font-bold text-green">
                  <Icon name="check" size={18} /> Paid
                </span>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  {other?.venmo && (
                    <a
                      href={venmoLink(other.venmo, s.amount, note, iOwe ? 'pay' : 'charge')}
                      target="_blank"
                      rel="noreferrer"
                      style={{ background: VENMO_BLUE }}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-footnote font-bold text-white active:scale-95 transition"
                    >
                      <VenmoMark size={13} />
                      {iOwe ? 'Pay' : 'Request'}
                    </a>
                  )}
                  <button
                    onClick={() => setPaying(k)}
                    disabled={paying != null}
                    className={`rounded-lg px-3 py-1.5 text-footnote ${SECONDARY_BTN}`}
                  >
                    Mark paid
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-caption text-ink-faint mt-3">
        Venmo opens with the amount and note already filled in. You still send it yourself, and "Mark paid" is what clears
        it here.
      </p>
    </>
  )
}

import { useStore } from '../data/store'
import type { Settlement } from '../lib/money'
import { money } from '../lib/money'
import { venmoLink } from '../lib/venmo'
import { Avatar } from './ui'

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
  onMarkPaid: (settlement: Settlement) => void
  /** Shown when nobody owes anybody. */
  squareLabel?: string
}

export default function SettleUp({ owed, note, onMarkPaid, squareLabel }: Props) {
  const { data } = useStore()
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? 'Someone'

  if (owed.length === 0) {
    return <p className="text-[14px] font-bold text-green">{squareLabel ?? 'All square. Nobody owes anybody. 🎉'}</p>
  }

  return (
    <>
      <div className="space-y-3">
        {owed.map((s, i) => {
          const from = data.players.find((p) => p.id === s.fromId)
          const to = data.players.find((p) => p.id === s.toId)
          const iOwe = s.fromId === data.currentUserId
          const owedToMe = s.toId === data.currentUserId
          // Pay the person you owe, ask the person who owes you, and stay
          // out of a debt between two other people.
          const other = iOwe ? to : owedToMe ? from : undefined
          return (
            <div key={i} className="flex items-center gap-2.5">
              {from && <Avatar player={from} size={24} />}
              <p className="flex-1 text-[13.5px] text-ink min-w-0">
                <span className="font-extrabold">{name(s.fromId)}</span> owes{' '}
                <span className="font-extrabold">{name(s.toId)}</span>{' '}
                <span className="font-extrabold tabular-nums text-flag">{money(s.amount)}</span>
                {other && !other.venmo && (
                  <span className="block text-[11px] text-ink-faint mt-0.5">
                    Add {other.name}'s Venmo on the roster to settle it here
                  </span>
                )}
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                {other?.venmo && (
                  <a
                    href={venmoLink(other.venmo, s.amount, note, iOwe ? 'pay' : 'charge')}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-[#008CFF] px-3 py-1.5 text-[12px] font-bold text-white active:scale-95"
                  >
                    {iOwe ? 'Pay' : 'Request'}
                  </a>
                )}
                <button
                  onClick={() => onMarkPaid(s)}
                  className="rounded-lg border border-line-strong bg-card px-3 py-1.5 text-[12px] font-bold text-ink-dim active:bg-paper"
                >
                  Mark paid
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-ink-faint mt-3">
        Venmo opens with the amount and note already filled in. You still send it yourself, and "Mark paid" is what clears
        it here.
      </p>
    </>
  )
}

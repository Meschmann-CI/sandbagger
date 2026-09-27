import { useMemo, useState } from 'react'
import { useGoBack, useNavigate } from '../lib/nav'
import { BackButton } from '../components/Nav'
import { useStore } from '../data/store'
import { badgesFor, type Badge, type BadgeKind } from '../lib/badges'
import { todayISO } from '../lib/dates'
import { shortDate } from '../lib/stats'
import { Card } from '../components/ui'
import { Medal } from '../components/Medal'

// The whole trophy case: every trophy, earned or not, in three shelves.
// Tap one for what it takes, how many times you've done it, and the
// round it happened in.

const SHELVES: { kind: BadgeKind; title: string; sub: string }[] = [
  { kind: 'brag', title: 'The ones people brag about', sub: 'Gold, and hard to come by.' },
  { kind: 'odd', title: 'The odd ones', sub: "Nobody plans for these. That's the fun." },
  { kind: 'shame', title: 'The ones nobody wants', sub: 'Earned all the same.' },
]

export default function Trophies() {
  const goBack = useGoBack('/profile')
  const navigate = useNavigate()
  const { data } = useStore()
  const badges = useMemo(() => badgesFor(data, data.currentUserId, todayISO()), [data])
  const [open, setOpen] = useState<string | null>(null)
  const earned = badges.filter((b) => b.earned).length

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <BackButton fallback="/profile" onBack={goBack} />
        <h1 className="text-large font-bold tracking-tight text-ink">Trophy case</h1>
        <p className="text-footnote text-ink-dim">
          {earned} of {badges.length} earned. Every round you've logged counts.
        </p>
      </header>

      {SHELVES.map((shelf) => {
        const row = badges.filter((b) => b.kind === shelf.kind)
        const got = row.filter((b) => b.earned).length
        const picked = row.find((b) => b.key === open)
        return (
          <section key={shelf.kind} className="mt-7">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 className="text-headline font-bold text-ink">{shelf.title}</h2>
              <span className="text-footnote font-bold text-ink-faint tabular-nums">
                {got}/{row.length}
              </span>
            </div>
            <p className="px-1 text-footnote text-ink-dim">{shelf.sub}</p>
            <div className="mt-3 grid grid-cols-4 gap-x-2 gap-y-4">
              {row.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setOpen(open === b.key ? null : b.key)}
                  aria-expanded={open === b.key}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl py-1 text-center transition active:scale-95 ${open === b.key ? 'bg-ink/[0.05]' : ''}`}
                >
                  <Medal badge={b} />
                  <span className={`px-0.5 text-caption font-bold leading-tight ${b.earned ? 'text-ink' : 'text-ink-faint'}`}>{b.label}</span>
                </button>
              ))}
            </div>
            {picked && <Detail badge={picked} onRound={(id) => navigate(`/rounds/${id}`)} />}
          </section>
        )
      })}

      <p className="mt-8 px-2 text-caption text-ink-faint">
        Putts, penalty strokes and tee times aren't tracked yet, so trophies like Flatstick, Four-Jack, Splash Zone and Early
        Bird will join the case when they are.
      </p>
      <div className="h-4" />
    </div>
  )
}

function Detail({ badge, onRound }: { badge: Badge; onRound: (id: string) => void }) {
  return (
    <Card className="mt-3 flex items-start gap-3.5 p-4">
      <Medal badge={badge} size={44} />
      <div className="min-w-0 flex-1">
        <p className="text-body font-bold text-ink">{badge.label}</p>
        <p className="text-footnote text-ink-dim">{badge.how}</p>
        {badge.earned ? (
          <p className="mt-1.5 text-footnote font-semibold text-ink">
            {badge.count > 1 ? `${badge.count} times` : 'Earned'}
            {badge.firstDate && `, first on ${shortDate(badge.firstDate)}`}
            {badge.note && ` · ${badge.note}`}
          </p>
        ) : (
          <p className="mt-1.5 text-footnote font-semibold text-ink-faint">{badge.note ?? 'Not yet.'}</p>
        )}
        {badge.roundId && (
          <button onClick={() => onRound(badge.roundId!)} className="mt-1.5 text-footnote font-bold text-green">
            {badge.count > 1 ? 'See the latest round' : 'See the round'}
          </button>
        )}
      </div>
    </Card>
  )
}

import { useMemo, useState } from 'react'
import { useGoBack, useNavigate } from '../lib/nav'
import { BackButton } from '../components/Nav'
import { useStore } from '../data/store'
import { badgesFor, type BadgeKind } from '../lib/badges'
import { todayISO } from '../lib/dates'
import { Medal } from '../components/Medal'
import { TrophySheet } from '../components/TrophySheet'

// The whole trophy case: every trophy, earned or not, on six shelves.
// Tap any medal for what it takes and your record with it.

const SHELVES: { kind: BadgeKind; title: string; sub: string }[] = [
  { kind: 'legend', title: 'Legendary', sub: 'You may never see this one. Nobody would blame you.' },
  { kind: 'brag', title: 'The ones people brag about', sub: 'Gold, and hard to come by.' },
  { kind: 'group', title: 'Group trophies', sub: 'Only possible with company.' },
  { kind: 'odd', title: 'The odd ones', sub: "Nobody plans for these. That's the fun." },
  { kind: 'locker', title: 'Locker room', sub: 'Say them out loud at your own risk.' },
  { kind: 'shame', title: 'The ones nobody wants', sub: 'Earned all the same.' },
]

export default function Trophies() {
  const goBack = useGoBack('/profile')
  const navigate = useNavigate()
  const { data } = useStore()
  const badges = useMemo(() => badgesFor(data, data.currentUserId, todayISO()), [data])
  const [open, setOpen] = useState<string | null>(null)
  const earned = badges.filter((b) => b.earned).length
  const picked = badges.find((b) => b.key === open)

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <BackButton fallback="/profile" onBack={goBack} />
        <h1 className="text-large font-bold tracking-tight text-ink">Trophy case</h1>
        <p className="text-footnote text-ink-dim">
          {earned} of {badges.length} earned. Tap any medal to see what it takes.
        </p>
      </header>

      {SHELVES.map((shelf) => {
        const row = badges.filter((b) => b.kind === shelf.kind)
        if (!row.length) return null
        const got = row.filter((b) => b.earned).length
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
                  onClick={() => setOpen(b.key)}
                  aria-label={`${b.label}${b.earned ? ', earned' : ', not earned yet'}`}
                  className="flex flex-col items-center gap-1.5 rounded-2xl py-1 text-center transition active:scale-95"
                >
                  <Medal badge={b} />
                  <span className={`px-0.5 text-caption font-bold leading-tight ${b.earned ? 'text-ink' : 'text-ink-faint'}`}>{b.label}</span>
                </button>
              ))}
            </div>
          </section>
        )
      })}

      <p className="mt-8 px-2 text-caption text-ink-faint">
        Putts, penalty strokes, tee times and birthdays aren't tracked yet, so Flatstick, Four-Jack, Splash Zone, Early Bird,
        Morning Wood and Age Shooter will join the case when they are.
      </p>
      <div className="h-4" />

      {picked && (
        <TrophySheet
          badge={picked}
          onClose={() => setOpen(null)}
          onRound={(id) => {
            setOpen(null)
            navigate(`/rounds/${id}`)
          }}
        />
      )}
    </div>
  )
}

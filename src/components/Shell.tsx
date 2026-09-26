import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useStore } from '../data/store'
import { usePhotoOutboxFlush } from '../data/photoOutbox'
import { useNewVersion } from '../lib/useNewVersion'
import { Avatar } from './ui'
import { CompactTitleBar, useNavRecorder } from './Nav'
import { useMemo } from 'react'
import { streakStates } from '../lib/delight'
import { StreakContext } from './streakContext'
import SaddamHandover from './SaddamHandover'
import PullToRefresh from './PullToRefresh'

// The tab order is the app's opinion about what matters most often.
// Logging rounds, arguing about courses, and settling bets happen every
// weekend; a trip happens twice a year. So Trips has no tab: it lives on
// Home (up top when one is being planned or is close) and under You, and
// the middle of the bar goes to the thing done most, logging a round.

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const tabs = [
  {
    to: '/',
    label: 'Home',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
        <path d="M3 11.5 L12 4 L21 11.5" />
        <path d="M5.5 10 V20 H18.5 V10" />
        <path d="M10 20 V14.5 H14 V20" />
      </svg>
    ),
  },
  {
    to: '/rounds',
    label: 'Rounds',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
        <path d="M8 3 V16" />
        <path d="M8 3 L15.5 5.75 L8 8.5" fill="currentColor" stroke="none" />
        <circle cx="8" cy="19" r="2.4" />
      </svg>
    ),
  },
  {
    to: '/courses',
    label: 'Courses',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
        <path d="M12 21 C12 21 5 14.5 5 9.5 A7 7 0 0 1 19 9.5 C19 14.5 12 21 12 21 Z" />
        <circle cx="12" cy="9.5" r="2.4" />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'You',
    icon: null, // avatar rendered inline
  },
]

// Which tab a screen belongs to, for the highlight. Trips hang off Home.
function tabFor(pathname: string) {
  if (pathname.startsWith('/rounds') || pathname.startsWith('/h2h') || pathname.startsWith('/saddam')) return '/rounds'
  if (pathname.startsWith('/courses')) return '/courses'
  if (pathname.startsWith('/profile') || pathname.startsWith('/group')) return '/profile'
  if (pathname.startsWith('/log')) return '/log'
  return '/'
}

export default function Shell() {
  const { pathname } = useLocation()
  useNavRecorder()
  const current = tabFor(pathname)
  const { data, syncError, pendingWrites, updateRound } = useStore()
  // Hot and cold runs, for the rings on every avatar. Worked out once
  // per change to the rounds rather than by each of dozens of avatars.
  const streaks = useMemo(() => streakStates(data), [data.rounds, data.players])
  const me = data.players.find((p) => p.id === data.currentUserId) ?? data.players[0]
  // Photos parked while there was no signal go out from here, whatever
  // screen is showing. And a build that's newer than the one running
  // gets a banner rather than a close-and-reopen ritual.
  usePhotoOutboxFlush(data.rounds, updateRound)
  const newVersion = useNewVersion()

  const tabLink = (t: (typeof tabs)[number]) => (
    <NavLink
      key={t.to}
      to={t.to}
      className={`flex flex-col items-center gap-1 py-2.5 text-caption font-bold tracking-wide transition-colors ${
        current === t.to ? 'text-green' : 'text-ink-faint hover:text-ink-dim'
      }`}
    >
      {t.icon ?? (
        <span className={`rounded-full ${current === '/profile' ? 'ring-2 ring-green ring-offset-1' : ''}`}>
          <Avatar player={me} size={22} />
        </span>
      )}
      {t.label}
    </NavLink>
  )

  return (
    <StreakContext.Provider value={streaks}>
      <div className="mx-auto max-w-md min-h-dvh flex flex-col relative">
        <PullToRefresh />
        <SaddamHandover />
        {/* Queued writes are fine, not broken — the app is doing what it
            should on a course with no signal. Say so calmly. */}
        {newVersion && (
          <div className="sticky top-0 z-50 mx-4 mt-3 rounded-xl border border-green/40 bg-green-soft px-4 py-2.5 flex items-center gap-3">
            <p className="flex-1 text-footnote font-bold text-ink">A newer version of the app is ready.</p>
            <button onClick={() => window.location.reload()} className="rounded-lg bg-green px-3 py-1.5 text-footnote font-bold text-white">
              Reload
            </button>
          </div>
        )}

        {pendingWrites > 0 && (
          <div className="sticky top-0 z-50 mx-4 mt-3 rounded-xl border border-gold/40 bg-gold-soft px-4 py-2.5 flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-gold shrink-0" />
            <p className="text-footnote font-bold text-ink">
              {pendingWrites} change{pendingWrites === 1 ? '' : 's'} saved on this phone
            </p>
            <p className="text-footnote text-ink-dim">· sends when you're back online</p>
          </div>
        )}

        {/* A write that failed has already been applied on screen, so say so
            rather than letting it quietly reappear on the next refresh. */}
        {syncError && (
          <div className="sticky top-0 z-50 mx-4 mt-3 rounded-xl border border-flag/40 bg-flag-soft px-4 py-3">
            <p className="text-footnote font-bold text-flag">That didn't save to the group</p>
            <p className="text-footnote text-ink-dim mt-0.5">
              {syncError}. What you see may not have stuck — reload to check.
            </p>
            <button onClick={() => window.location.reload()} className="mt-1.5 text-footnote font-bold text-green">
              Reload
            </button>
          </div>
        )}
        <main className="flex-1 px-4 pb-32 pt-3">
          <Outlet />
        </main>

        <CompactTitleBar />

        <nav className="fixed bottom-0 inset-x-0 z-40">
          <div className="mx-auto max-w-md border-t border-line bg-card/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]">
            <div className="grid grid-cols-5">
              {tabs.slice(0, 2).map((t) => tabLink(t))}
              {/* The middle of the bar: logging a round, raised above the rest. */}
              <NavLink
                to="/log"
                aria-label="Log a round"
                className={`flex flex-col items-center gap-1 pb-2.5 text-caption font-bold tracking-wide ${
                  current === '/log' ? 'text-green' : 'text-ink-faint'
                }`}
              >
                <span className="-mt-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-forest text-on-forest shadow-[0_6px_16px_rgba(28,70,50,0.35)] ring-4 ring-card transition-transform active:scale-90">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M12 5 V19 M5 12 H19" />
                  </svg>
                </span>
                Log
              </NavLink>
              {tabs.slice(2).map((t) => tabLink(t))}
            </div>
          </div>
        </nav>
      </div>
    </StreakContext.Provider>
  )
}

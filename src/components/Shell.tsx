import { NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { useNavigate } from '../lib/nav'
import { useStore } from '../data/store'
import { hasPendingPhotos, usePhotoOutboxFlush } from '../data/photoOutbox'
import { resumeMaps } from '../lib/mapJobs'
import { useNewVersion } from '../lib/useNewVersion'
import { updatesHeld } from '../lib/holdUpdates'
import { Avatar } from './ui'
import { CompactTitleBar, useNavRecorder } from './Nav'
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { announceRouted } from '../lib/viewTransition'
import { unlockAudio } from '../lib/sound'
import LogRound from '../pages/LogRound'
import { LogSheetContext, useLogSheet } from './logSheet'
import { streakStates } from '../lib/delight'
import { StreakContext } from './streakContext'
import SaddamHandover from './SaddamHandover'
import TrophyMoment from './TrophyMoment'
import PullToRefresh from './PullToRefresh'
import ErrorBoundary from './ErrorBoundary'

// The tab order is the app's opinion about what matters most often:
// Home, Rounds, Log (centre), Trips, You, on a floating pill (Matt,
// 2026-10-12, picked from flat, floating with Log beside, and this).
// Only the bar is rounded; pages keep their flat sections. Standings has
// no tab: it's one tap from Home's season card and a row under You. On a
// trip, the trip is where the group lives. Courses sit beside rounds
// under the Rounds tab.

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

// Each tab icon has two states, the iOS way: an outline when it's not
// where you are, a filled shape when it is.
const tabs: { to: string; label: string; icon: ((on: boolean) => ReactNode) | null }[] = [
  {
    to: '/',
    label: 'Home',
    icon: (on) =>
      on ? (
        <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
          <path d="M3 11.5 L12 4 L21 11.5 V20 H14 V14.5 H10 V20 H3 Z" fill="currentColor" strokeWidth={1.6} />
        </svg>
      ) : (
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
    icon: (on) => (
      <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} strokeWidth={on ? 2.2 : 1.9}>
        <path d="M8 3 V16" />
        <path d="M8 3 L15.5 5.75 L8 8.5" fill="currentColor" stroke="none" />
        <circle cx="8" cy="19" r="2.4" fill={on ? 'currentColor' : 'none'} />
      </svg>
    ),
  },
  {
    to: '/trips',
    label: 'Trips',
    icon: (on) => (
      <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} strokeWidth={1.6}>
        <path
          transform="rotate(90 12 12)"
          d="M12 2.8c.9 0 1.5.8 1.5 1.8v4.6l7.5 4.3v2l-7.5-2.2v4.4l2.2 1.6v1.6L12 20l-3.7.9v-1.6l2.2-1.6v-4.4L3 15.5v-2l7.5-4.3V4.6c0-1 .6-1.8 1.5-1.8z"
          fill={on ? 'currentColor' : 'none'}
        />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'You',
    icon: null, // avatar rendered inline
  },
]

// Which tab a screen belongs to, for the highlight. Standings hangs off Home.
function tabFor(pathname: string) {
  if (pathname.startsWith('/rounds') || pathname.startsWith('/courses')) return '/rounds'
  if (pathname.startsWith('/trips')) return '/trips'
  if (pathname.startsWith('/profile') || pathname.startsWith('/group') || pathname.startsWith('/trophies') || pathname.startsWith('/bag')) return '/profile'
  return '/'
}

/** An old /log link: open the sheet over Home. */
export function LogRedirect() {
  const { open } = useLogSheet()
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/', { replace: true })
    open()
  }, [navigate, open])
  return null
}

export default function Shell() {
  const location = useLocation()
  const { pathname } = location
  // Tell a running screen transition the new screen is on the page.
  // A new screen starts at the top (Back keeps where you were), then
  // tells a running screen transition it's on the page.
  const navType = useNavigationType()
  useLayoutEffect(() => {
    if (navType !== 'POP') window.scrollTo(0, 0)
    announceRouted()
  }, [location.key, navType])
  const [logOpen, setLogOpen] = useState(false)
  // The first tap anywhere wakes the audio, so cues can play later.
  useEffect(() => unlockAudio(), [])
  const openLog = useCallback(() => setLogOpen(true), [])
  const closeLog = useCallback(() => setLogOpen(false), [])
  const logSheet = useMemo(() => ({ open: openLog }), [openLog])
  useNavRecorder()
  const current = tabFor(pathname)
  const { data, syncError, pendingWrites, updateRound } = useStore()
  // Hot and cold runs, for the rings on every avatar. Worked out once
  // per change to the rounds rather than by each of dozens of avatars.
  const streaks = useMemo(() => streakStates(data), [data.rounds, data.players])
  const me = data.players.find((p) => p.id === data.currentUserId) ?? data.players[0]
  // Photos parked while there was no signal go out from here, whatever
  // screen is showing. And a build that's newer than the one running
  // loads itself as the app comes back to the front, unless someone is
  // mid-way through something; then it waits behind a banner.
  usePhotoOutboxFlush(data.rounds, updateRound)
  // A hole-map run the app was closed in the middle of carries on.
  useEffect(() => resumeMaps(), [])
  const newVersion = useNewVersion(() => {
    if (logOpen || pendingWrites > 0 || hasPendingPhotos() || updatesHeld()) return true
    // The live card and every screen that is one big form.
    if (/^\/rounds\/[^/]+\/(card|edit)$|^\/trips\/new$|^\/courses\/(new|[^/]+\/card)$/.test(pathname)) return true
    // A sheet or dialog open over a page (bet editor, itinerary item,
    // Wrapped), or the keyboard up in a field.
    if (document.querySelector('[aria-modal="true"]')) return true
    const focused = document.activeElement
    return !!focused && focused.matches('input:not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable="true"]')
  })

  const tabLink = (t: (typeof tabs)[number]) => (
    <NavLink
      key={t.to}
      to={t.to}
      className={`mx-0.5 flex flex-col items-center gap-0.5 rounded-[20px] py-1.5 text-caption font-bold transition-colors ${
        current === t.to ? 'bg-green/12 text-green' : 'text-ink-faint hover:text-ink-dim'
      }`}
    >
      <span className="flex h-[30px] items-center">
        {t.icon?.(current === t.to) ?? (
          <span className={`rounded-full ${current === '/profile' ? 'ring-2 ring-green ring-offset-1' : ''}`}>
            <Avatar player={me} size={24} />
          </span>
        )}
      </span>
      {t.label}
    </NavLink>
  )

  return (
    <StreakContext.Provider value={streaks}>
      <LogSheetContext.Provider value={logSheet}>
      <div className="mx-auto max-w-md min-h-dvh flex flex-col relative">
        <PullToRefresh />
        <SaddamHandover />
        <TrophyMoment />
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
              {syncError}. What you see may not have stuck. Reload to check.
            </p>
            <button onClick={() => window.location.reload()} className="mt-1.5 text-footnote font-bold text-green">
              Reload
            </button>
          </div>
        )}
        <main className="flex-1 px-4 pb-32 pt-3">
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>

        <CompactTitleBar />

        {/* A pill floating over the page. The shadow and blur sit on the
            pill alone; the strip around it lets taps through to the page. */}
        <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(calc(env(safe-area-inset-bottom)+4px),12px)] [view-transition-name:tabbar]">
          <div className="pointer-events-auto mx-auto grid h-[62px] max-w-[424px] grid-cols-5 items-center rounded-full border border-white/80 bg-card/[0.92] px-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.12)] backdrop-blur-xl backdrop-saturate-150">
            {tabs.slice(0, 2).map((t) => tabLink(t))}
            {/* The middle of the bar: logging a round. */}
            <button
              type="button"
              onClick={openLog}
              aria-label="Play a round"
              aria-haspopup="dialog"
              className={`flex flex-col items-center gap-0.5 py-1.5 text-caption font-bold ${logOpen ? 'text-green' : 'text-ink-faint'}`}
            >
              <span className="flex h-[30px] items-center">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-forest text-on-forest shadow-[0_2px_8px_rgba(28,70,50,0.3)] transition-transform active:scale-90">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M12 5 V19 M5 12 H19" />
                  </svg>
                </span>
              </span>
              Play
            </button>
            {tabs.slice(2).map((t) => tabLink(t))}
          </div>
        </nav>
      </div>
      {logOpen && <LogRound onClose={closeLog} />}
      </LogSheetContext.Provider>
    </StreakContext.Provider>
  )
}

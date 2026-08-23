import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../data/store'
import { Avatar } from './ui'

const tabs = [
  {
    to: '/',
    label: 'Home',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11.5 L12 4 L21 11.5" />
        <path d="M5.5 10 V20 H18.5 V10" />
        <path d="M10 20 V14.5 H14 V20" />
      </svg>
    ),
  },
  {
    to: '/trips',
    label: 'Trips',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="8" width="16" height="12" rx="2.5" />
        <path d="M9 8 V6 a2 2 0 0 1 2-2 h2 a2 2 0 0 1 2 2 V8" />
        <path d="M4 13 H20" />
      </svg>
    ),
  },
  {
    to: '/rounds',
    label: 'Rounds',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3 V16" />
        <path d="M8 3 L15.5 5.75 L8 8.5" fill="currentColor" stroke="none" />
        <circle cx="8" cy="19" r="2.4" />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: null, // avatar rendered inline
  },
]

export default function Shell() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { data } = useStore()
  const me = data.players.find((p) => p.id === data.currentUserId) ?? data.players[0]
  const hideFab = pathname.startsWith('/log') || pathname.startsWith('/rounds/') || pathname.startsWith('/trips/new')

  return (
    <div className="mx-auto max-w-md min-h-dvh flex flex-col relative">
      <main className="flex-1 px-4 pb-32 pt-3">
        <Outlet />
      </main>

      {!hideFab && (
        <button
          onClick={() => navigate('/log')}
          aria-label="Log a round"
          className="fixed bottom-24 right-1/2 translate-x-[calc(min(28rem,100vw)/2-1.25rem)] z-40 h-14 w-14 rounded-full bg-green text-white shadow-[0_6px_20px_rgba(28,124,74,0.4)] flex items-center justify-center active:scale-90 transition-transform"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5 V19 M5 12 H19" />
          </svg>
        </button>
      )}

      <nav className="fixed bottom-0 inset-x-0 z-40">
        <div className="mx-auto max-w-md border-t border-line bg-card/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-4">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-bold tracking-wide transition-colors ${
                    isActive ? 'text-green' : 'text-ink-faint hover:text-ink-dim'
                  }`
                }
              >
                {t.icon ?? (
                  <span className={`rounded-full ${pathname.startsWith('/profile') ? 'ring-2 ring-green ring-offset-1' : ''}`}>
                    <Avatar player={me} size={22} />
                  </span>
                )}
                {t.label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
    </div>
  )
}

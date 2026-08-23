import { useCallback, useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { StoreProvider } from './data/store'
import type { Backend } from './data/backend'
import { localBackend } from './data/localBackend'
import { NoPlayerError, makeSupabaseBackend, resolveMyPlayer } from './data/supabaseBackend'
import { isCloudMode, supabase } from './lib/supabase'
import type { AppData } from './types'
import Shell from './components/Shell'
import Home from './pages/Home'
import Rounds from './pages/Rounds'
import RoundDetail from './pages/RoundDetail'
import LogRound from './pages/LogRound'
import EditRound from './pages/EditRound'
import Ledger from './pages/Ledger'
import RivalryDetail from './pages/RivalryDetail'
import Trips from './pages/Trips'
import TripNew from './pages/TripNew'
import TripDetail from './pages/TripDetail'
import Profile from './pages/Profile'
import SignIn from './pages/SignIn'
import Setup from './pages/Setup'
import { Card } from './components/ui'

// HashRouter keeps deep links working on static hosting (Netlify) with zero config.
function AppRoutes() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/rounds" element={<Rounds />} />
          <Route path="/rounds/:id" element={<RoundDetail />} />
          <Route path="/rounds/:id/edit" element={<EditRound />} />
          <Route path="/log" element={<LogRound />} />
          <Route path="/h2h" element={<Ledger />} />
          <Route path="/h2h/:aId/:bId" element={<RivalryDetail />} />
          <Route path="/trips" element={<Trips />} />
          <Route path="/trips/new" element={<TripNew />} />
          <Route path="/trips/:id" element={<TripDetail />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/ledger" element={<Navigate to="/h2h" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

function Splash({ message, error }: { message: string; error?: boolean }) {
  return (
    <div className="mx-auto max-w-md min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="text-4xl mb-3">⛳</div>
      {error ? (
        <Card className="p-5">
          <p className="text-[15px] font-extrabold text-ink">Something went wrong</p>
          <p className="text-[13px] text-ink-dim mt-1.5 break-words">{message}</p>
          <button onClick={() => window.location.reload()} className="mt-4 text-[13px] font-bold text-green">
            Try again
          </button>
        </Card>
      ) : (
        <p className="text-[14px] font-bold text-ink-dim">{message}</p>
      )}
    </div>
  )
}

export default function App() {
  // Local mode: no accounts, everything in this browser.
  if (!isCloudMode || !supabase) return <LocalApp />
  return <CloudApp />
}

function LocalApp() {
  const [initial, setInitial] = useState<AppData | null>(null)

  useEffect(() => {
    void localBackend.load().then(setInitial)
  }, [])

  if (!initial) return <Splash message="Loading…" />
  return (
    <StoreProvider backend={localBackend} initial={initial}>
      <AppRoutes />
    </StoreProvider>
  )
}

type CloudState =
  | { phase: 'booting' }
  | { phase: 'signedOut' }
  | { phase: 'needsProfile'; email: string | null; groupExists: boolean }
  | { phase: 'ready'; backend: Backend; initial: AppData }
  | { phase: 'error'; message: string }

function CloudApp() {
  const client = supabase!
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [state, setState] = useState<CloudState>({ phase: 'booting' })

  useEffect(() => {
    void client.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = client.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => sub.subscription.unsubscribe()
  }, [client])

  const boot = useCallback(async () => {
    setState({ phase: 'booting' })
    try {
      const { playerId, groupId } = await resolveMyPlayer(client)
      const backend = makeSupabaseBackend(client, playerId, groupId)
      const initial = await backend.load()
      setState({ phase: 'ready', backend, initial })
    } catch (err) {
      if (err instanceof NoPlayerError) {
        setState({ phase: 'needsProfile', email: err.email, groupExists: err.groupExists })
      } else {
        setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    }
  }, [client])

  useEffect(() => {
    if (session === undefined) return
    if (session === null) {
      setState({ phase: 'signedOut' })
      return
    }
    void boot()
  }, [session, boot])

  if (session === undefined || state.phase === 'booting') return <Splash message="Loading your group…" />
  if (state.phase === 'signedOut') return <SignIn />
  if (state.phase === 'needsProfile')
    return <Setup email={state.email} groupExists={state.groupExists} onReady={() => void boot()} />
  if (state.phase === 'error') return <Splash message={state.message} error />

  return (
    <StoreProvider backend={state.backend} initial={state.initial}>
      <AppRoutes />
    </StoreProvider>
  )
}

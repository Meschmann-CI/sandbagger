import { lazy, useState, type ComponentType, type LazyExoticComponent } from 'react'
import { Card } from '../components/ui'

// The screens a Sunday never opens (Wrapped, the trophies, the trips, the
// course editors) load on their first tap rather than with the app, so the
// first paint on a phone at the first tee is a third smaller (2026-11-06,
// the review). Each is fetched in the background a few seconds after the
// app settles, so by the time it is tapped it is already here, and in the
// service worker's cache for the back nine. Vite also keeps React and
// Supabase in their own file, which a deploy that only touches the app's
// code leaves exactly as cached.

type Loader<P> = () => Promise<{ default: ComponentType<P> }>

const loaders: (() => Promise<unknown>)[] = []

/** A page that loads on first use. A load that fails shows a retry rather than a crash. */
export function lazyPage<P extends object>(load: Loader<P>): LazyExoticComponent<ComponentType<P>> {
  loaders.push(load)
  const fallback = () => <Unavailable load={load as Loader<object>} />
  return lazy(() => load().catch(() => ({ default: fallback as unknown as ComponentType<P> })))
}

/** Fetches every lazy screen once, when the app has nothing better to do. */
export function warmPages() {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
  if (nav.connection?.saveData) return
  for (const load of loaders) {
    void load().catch(() => {
      /* it loads on its first tap instead */
    })
  }
}

function Unavailable({ load }: { load: Loader<object> }) {
  const [Loaded, setLoaded] = useState<ComponentType<object> | null>(null)
  const [busy, setBusy] = useState(false)
  if (Loaded) return <Loaded />
  const retry = async () => {
    setBusy(true)
    try {
      const mod = await load()
      setLoaded(() => mod.default)
    } catch {
      setBusy(false)
    }
  }
  return (
    <div className="pt-10">
      <Card tile className="p-5 text-center">
        <p className="text-body font-bold text-ink">This screen needs a signal the first time</p>
        <p className="text-footnote text-ink-dim mt-1.5">It couldn't load just now. Try again with a bar or two.</p>
        <div className="mt-4 flex justify-center gap-5">
          <button onClick={() => void retry()} disabled={busy} className="text-footnote font-bold text-green">
            {busy ? 'Loading…' : 'Try again'}
          </button>
          <button onClick={() => window.location.reload()} className="text-footnote font-bold text-ink-dim">
            Reload the app
          </button>
        </div>
      </Card>
    </div>
  )
}

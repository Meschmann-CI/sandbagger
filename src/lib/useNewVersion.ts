import { useEffect, useState } from 'react'

// "There's a newer build" — so a phone that's had the app open since
// last weekend doesn't have to be closed and reopened to get it.
//
// The service worker serves navigations network-first, so a fresh open
// always gets the current build. The stale case is the app that never
// closed: iOS keeps a home-screen app alive for days, running whatever
// JS it loaded last time. Vite fingerprints the bundle, so comparing the
// script name in the live index.html against the one running here is
// an exact test. Checked when the app comes forward and every so often.

const INTERVAL_MS = 10 * 60 * 1000

function runningBundle(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
  return script?.src.match(/assets\/index-[^/]+\.js/)?.[0] ?? null
}

async function liveBundle(): Promise<string | null> {
  const res = await fetch(`/index.html?check=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return null
  const html = await res.text()
  return html.match(/assets\/index-[^/"']+\.js/)?.[0] ?? null
}

export function useNewVersion(): boolean {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return
    const mine = runningBundle()
    if (!mine) return
    let cancelled = false
    const check = async () => {
      try {
        const live = await liveBundle()
        if (!cancelled && live && live !== mine) setStale(true)
      } catch {
        // Offline, or the host is having a moment. Ask again later.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const timer = setInterval(check, INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
    // Not on the very first paint — let the app settle first.
    const first = setTimeout(check, 8000)
    return () => {
      cancelled = true
      clearInterval(timer)
      clearTimeout(first)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return stale
}

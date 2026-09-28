import { useEffect, useRef, useState } from 'react'

// "There's a newer build" — so a phone that's had the app open since
// last weekend doesn't have to be closed and reopened to get it.
//
// The service worker serves navigations network-first, so a fresh open
// always gets the current build. The stale case is the app that never
// closed: iOS keeps a home-screen app alive for days, running whatever
// JS it loaded last time, and "opening" it just brings that copy back.
// Vite fingerprints the bundle, so comparing the script name in the live
// index.html against the one running here is an exact test.
//
// When the app comes back to the front and a newer build is out, it
// reloads itself on the spot, before anyone has started doing anything.
// It doesn't when the Shell says it's busy (a card being filled in, a
// form or sheet open, changes waiting for signal); then, and for the
// check that runs every so often while the app is in use, a banner
// offers the reload instead.

const INTERVAL_MS = 10 * 60 * 1000
// The bundle this phone last reloaded itself to reach. If it comes back
// still running the old one (the network dropped mid-reload and the
// cached copy loaded), it shows the banner rather than trying again.
const TRIED_KEY = 'sandbagger-auto-reload-for'

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

function alreadyTried(live: string): boolean {
  try {
    return sessionStorage.getItem(TRIED_KEY) === live
  } catch {
    return true // no storage, no way to stop a loop: stick to the banner
  }
}

function markTried(live: string) {
  try {
    sessionStorage.setItem(TRIED_KEY, live)
  } catch {
    // alreadyTried() reads this as tried, so it won't loop
  }
}

/** Whether a newer build is out and waiting on a manual reload. `isBusy` is asked at the moment of resuming. */
export function useNewVersion(isBusy: () => boolean): boolean {
  const [stale, setStale] = useState(false)
  const busyRef = useRef(isBusy)
  busyRef.current = isBusy

  useEffect(() => {
    if (!import.meta.env.PROD) return
    const mine = runningBundle()
    if (!mine) return
    let cancelled = false
    const check = async (resuming: boolean) => {
      try {
        const live = await liveBundle()
        if (cancelled || !live || live === mine) return
        if (resuming && document.visibilityState === 'visible' && !busyRef.current() && !alreadyTried(live)) {
          markTried(live)
          window.location.reload()
          return
        }
        setStale(true)
      } catch {
        // Offline, or the host is having a moment. Ask again later.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check(true)
    }
    const timer = setInterval(() => void check(false), INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
    // Not on the very first paint — let the app settle first.
    const first = setTimeout(() => void check(false), 8000)
    return () => {
      cancelled = true
      clearInterval(timer)
      clearTimeout(first)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return stale
}

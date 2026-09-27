// Screen changes that move the way an iPhone's do: a pushed screen
// slides in from the right over the old one, Back slides it away, and a
// round's picture grows into the next screen's banner.
//
// HashRouter can't use React Router's own view transitions (those need a
// data router), so this wraps the navigation in the browser's
// document.startViewTransition. The browser snapshots the old screen,
// the navigation runs, and the snapshot of the new screen is taken once
// the Shell announces the route has rendered (a layout effect, so before
// paint). Safari 18 and Chrome have it; anything else just navigates.
//
// Shared pictures: any element with data-shared="<key>" can be the
// moving picture. Only the one matching the key gets the transition
// name, on each side, so there's never a duplicate on screen.

const ROUTED = 'sandbagger:routed'
const SHARED = 'shared-scene'

export type Direction = 'forward' | 'back' | 'fade'

type VTDocument = Document & {
  startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void>; ready: Promise<void> }
}

/** Called by the Shell once a new route has rendered. */
export function announceRouted() {
  window.dispatchEvent(new Event(ROUTED))
}

function tag(key: string | null) {
  let named = false
  document.querySelectorAll<HTMLElement>('[data-shared]').forEach((el) => {
    const match = !named && key != null && el.dataset.shared === key
    el.style.viewTransitionName = match ? SHARED : ''
    if (match) named = true
  })
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function runTransition(go: () => void, dir: Direction, sharedKey?: string | null) {
  const doc = document as VTDocument
  if (!doc.startViewTransition || reduced()) {
    go()
    return
  }
  // Going back from a screen with a hero picture sends that picture home.
  const key = sharedKey ?? (dir === 'back' ? (document.querySelector<HTMLElement>('[data-shared-hero]')?.dataset.shared ?? null) : null)
  tag(key)
  document.documentElement.dataset.nav = dir
  const t = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        let done = false
        const finish = () => {
          if (done) return
          done = true
          window.removeEventListener(ROUTED, finish)
          tag(key)
          resolve()
        }
        window.addEventListener(ROUTED, finish)
        // A navigation that goes nowhere never announces itself.
        setTimeout(finish, 400)
        go()
      }),
  )
  t.ready.catch(() => {})
  t.finished
    .catch(() => {})
    .finally(() => {
      delete document.documentElement.dataset.nav
      tag(null)
    })
}

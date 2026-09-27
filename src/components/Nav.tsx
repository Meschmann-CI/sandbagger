import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useGoBack } from '../lib/nav'
import { Icon } from './icons'

// iOS-style navigation: a back button that says where it goes ("‹ Rounds",
// "‹ Rancho Park"), and a slim bar that fades in with the page's title
// once the big title has scrolled away.
//
// To name the screen behind this one, the app remembers the path and the
// title of each entry in this tab's history, by history index. It lives
// in sessionStorage so a reload mid-stack still labels Back correctly.

const KEY = 'sandbagger-nav'
type Entry = { path: string; title?: string }

function readStack(): Entry[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as Entry[]
  } catch {
    return []
  }
}
function writeStack(stack: Entry[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack))
  } catch {
    // Private mode or storage off: Back falls back to section names.
  }
}
const historyIdx = () => (window.history.state as { idx?: number } | null)?.idx ?? 0

// Tab roots and fixed screens are named by section, since their big
// titles ("Morning, Alex") make poor back labels.
function sectionLabel(path: string): string | null {
  if (path === '/') return 'Home'
  if (path === '/rounds') return 'Rounds'
  if (path === '/courses') return 'Courses'
  if (path === '/trips') return 'Trips'
  if (path === '/profile') return 'You'
  if (path === '/h2h') return 'Head-to-Head'
  if (path === '/saddam') return 'The Saddam'
  if (path === '/group') return 'Group'
  if (path === '/log') return 'Log'
  return null
}
function fallbackLabel(path: string): string {
  if (path.startsWith('/rounds/')) return 'Round'
  if (path.startsWith('/courses/')) return 'Course'
  if (path.startsWith('/trips/')) return 'Trip'
  if (path.startsWith('/h2h/')) return 'Rivalry'
  return 'Back'
}
function labelFor(entry: Entry | undefined, path: string) {
  const section = sectionLabel(path)
  if (section) return section
  const t = entry?.title?.trim()
  if (t) return t.length > 18 ? `${t.slice(0, 17)}…` : t
  return fallbackLabel(path)
}

/** Called once, from the Shell: records each screen as history reaches it. */
export function useNavRecorder() {
  const { pathname } = useLocation()
  useEffect(() => {
    const idx = historyIdx()
    const stack = readStack().slice(0, idx + 1)
    stack[idx] = { path: pathname }
    writeStack(stack)
    // The title shows up once the page has its data; read it a beat later.
    const t = setTimeout(() => {
      const title = document.querySelector('main h1')?.textContent ?? undefined
      const s = readStack()
      if (s[idx]?.path === pathname) {
        s[idx] = { path: pathname, title }
        writeStack(s)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [pathname])
}

/** "‹ Where you came from". `fallback` is where it goes on a fresh tab. */
export function BackButton({ fallback, onBack, label }: { fallback: string; onBack?: () => void; label?: string }) {
  const goBack = useGoBack(fallback)
  const idx = historyIdx()
  const prev = idx > 0 ? readStack()[idx - 1] : undefined
  const text = label ?? (prev ? labelFor(prev, prev.path) : labelFor(undefined, fallback))
  return (
    <button
      type="button"
      data-back
      data-back-label={text}
      onClick={() => (onBack ? onBack() : goBack())}
      className="-ml-1.5 mb-1.5 inline-flex items-center gap-0.5 py-1 pr-2 text-body font-semibold text-green active:opacity-60"
    >
      <Icon name="chevronLeft" size={20} strokeWidth={2.2} />
      <span className="max-w-[60vw] truncate">{text}</span>
    </button>
  )
}

/**
 * The slim bar that takes over from a screen's big title as it scrolls
 * off, the way iOS collapses a large title. Reads the page's own h1 and
 * Back button, so screens don't have to opt in.
 */
export function CompactTitleBar() {
  const { pathname } = useLocation()
  const [title, setTitle] = useState('')
  const [back, setBack] = useState<string | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    let raf = 0
    const check = () => {
      raf = 0
      const h1 = document.querySelector('main h1')
      if (!h1) {
        setShown(false)
        return
      }
      setTitle(h1.textContent ?? '')
      setBack(document.querySelector('main [data-back]')?.getAttribute('data-back-label') ?? null)
      setShown(h1.getBoundingClientRect().bottom < 6)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check)
    }
    setShown(false)
    const t = setTimeout(check, 350)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      clearTimeout(t)
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
    }
  }, [pathname])

  return (
    <div
      aria-hidden={!shown}
      className={`fixed inset-x-0 top-0 z-40 transition-opacity duration-200 ${shown ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <div className="mx-auto max-w-md border-b border-line bg-paper/85 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
        <div className="grid h-11 grid-cols-[1fr_auto_1fr] items-center px-2">
          <div className="min-w-0">
            {back && (
              <button
                type="button"
                tabIndex={shown ? 0 : -1}
                onClick={() => (document.querySelector('main [data-back]') as HTMLButtonElement | null)?.click()}
                className="inline-flex max-w-full items-center gap-0.5 py-1 text-body font-semibold text-green active:opacity-60"
              >
                <Icon name="chevronLeft" size={20} strokeWidth={2.2} />
                <span className="truncate">{back}</span>
              </button>
            )}
          </div>
          <p className="max-w-[52vw] truncate text-body font-bold text-ink">{title}</p>
          <div />
        </div>
      </div>
    </div>
  )
}

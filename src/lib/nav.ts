import { useCallback } from 'react'
import { useNavigate as useRouterNavigate, type NavigateOptions, type To } from 'react-router-dom'
import { runTransition, type Direction } from './viewTransition'

export interface NavOptions extends NavigateOptions {
  /** How the screen change moves. Pushes slide forward, replaces fade. */
  transition?: Direction | 'none'
  /** data-shared key of the picture that should grow into the next screen. */
  shared?: string
}

/**
 * The app's navigate: React Router's, wrapped in a screen transition.
 * Import this one, not react-router-dom's, so every push slides in and
 * every Back slides out.
 */
export function useNavigate() {
  const navigate = useRouterNavigate()
  return useCallback(
    (to: To | number, opts: NavOptions = {}) => {
      const { transition, shared, ...rest } = opts
      if (typeof to === 'number') {
        runTransition(() => void navigate(to), transition === 'none' ? 'fade' : (transition ?? (to < 0 ? 'back' : 'forward')), shared)
        return
      }
      if (transition === 'none') {
        void navigate(to, rest)
        return
      }
      runTransition(() => void navigate(to, rest), transition ?? (rest.replace ? 'fade' : 'forward'), shared)
    },
    [navigate],
  )
}

/**
 * Back, with somewhere to land.
 *
 * Everyone arrives by magic link or a shared link, which opens a fresh
 * tab with no history behind it — so a plain `navigate(-1)` on a detail
 * screen does nothing at all and the Back button looks broken. Fall back
 * to the section the screen belongs to.
 */
export function useGoBack(fallback: string) {
  const navigate = useNavigate()
  return useCallback(() => {
    // idx is null on the first entry of a fresh history stack.
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (idx == null || idx <= 0) navigate(fallback, { replace: true, transition: 'back' })
    else navigate(-1)
  }, [navigate, fallback])
}

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

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
    if (idx == null || idx <= 0) navigate(fallback, { replace: true })
    else navigate(-1)
  }, [navigate, fallback])
}

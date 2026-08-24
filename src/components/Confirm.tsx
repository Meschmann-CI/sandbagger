import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

// Replaces window.confirm. The native dialog is the one unstyled moment
// in the app, and once Sandbagger is on a phone's home screen it renders
// with the raw URL above the question — which reads like a scam prompt
// right before someone deletes a round.
//
// Same shape as window.confirm at the call site: `await confirm({...})`.

interface ConfirmOptions {
  title: string
  body?: string
  /** Defaults to "Confirm". */
  confirmLabel?: string
  cancelLabel?: string
  /** Red button for anything that destroys something. */
  danger?: boolean
}

type Ask = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Ask | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const ask = useCallback<Ask>(
    (options) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve
        setPending(options)
      }),
    [],
  )

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setPending(null)
  }, [])

  // Escape backs out, and the hardware/browser back button dismisses the
  // sheet rather than leaving the page underneath it.
  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, settle])

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          <button
            aria-label="Cancel"
            onClick={() => settle(false)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] animate-[fade_0.15s_ease-out]"
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={pending.title}
            className="relative w-full max-w-md rounded-t-3xl border-t border-line bg-card px-5 pt-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-[0_-8px_30px_rgba(24,32,25,0.18)] sheet-up"
          >
            <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-line-strong" />
            <p className="text-[17px] font-extrabold text-ink leading-snug">{pending.title}</p>
            {pending.body && <p className="text-[13.5px] text-ink-dim mt-1.5 leading-relaxed">{pending.body}</p>}
            <div className="mt-5 space-y-2.5">
              <button
                onClick={() => settle(true)}
                autoFocus
                className={`w-full rounded-xl py-3.5 text-[15px] font-bold text-white active:scale-[0.98] transition ${
                  pending.danger ? 'bg-flag' : 'bg-green'
                }`}
              >
                {pending.confirmLabel ?? 'Confirm'}
              </button>
              <button
                onClick={() => settle(false)}
                className="w-full rounded-xl border border-line-strong bg-card py-3.5 text-[15px] font-bold text-ink-dim active:bg-paper transition"
              >
                {pending.cancelLabel ?? 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext)
  if (!ask) throw new Error('useConfirm must be used within ConfirmProvider')
  return ask
}

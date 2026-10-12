import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../data/store'

// Add, change or take down a trip's cover or a destination's photo.
// With no photo yet the button opens the picker straight away; with one,
// a small menu asks Change or Remove. No `capture` attribute, so iOS
// offers Take Photo or Photo Library itself.

export default function TripPhotoPicker({
  tripId,
  optionId,
  hasPhoto,
  label,
  className,
  children,
  onError,
}: {
  tripId: string
  optionId?: string
  hasPhoto: boolean
  label: string
  className: string
  children: (busy: boolean) => ReactNode
  onError: (message: string | null) => void
}) {
  const { setTripPhoto } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLSpanElement>(null)
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState(false)

  // A tap anywhere else closes the menu.
  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])

  const set = async (file: File | null) => {
    setMenu(false)
    setBusy(true)
    onError(null)
    onError(await setTripPhoto(tripId, file, optionId))
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <span ref={boxRef} className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void set(file)
        }}
      />
      <button
        type="button"
        disabled={busy}
        aria-label={label}
        aria-haspopup={hasPhoto ? 'menu' : undefined}
        onClick={() => (hasPhoto ? setMenu((m) => !m) : fileRef.current?.click())}
        className={className}
      >
        {children(busy)}
      </button>
      {menu && (
        <span role="menu" className="absolute right-0 top-full z-30 mt-1.5 w-44 overflow-hidden rounded-xl border border-line bg-card text-left shadow-[0_8px_24px_rgba(24,32,25,0.18)]">
          <button role="menuitem" type="button" onClick={() => fileRef.current?.click()} className="block w-full px-4 py-3 text-left text-body text-ink active:bg-paper">
            Change photo
          </button>
          <button role="menuitem" type="button" onClick={() => void set(null)} className="block w-full border-t border-line px-4 py-3 text-left text-body text-flag active:bg-paper">
            Remove photo
          </button>
        </span>
      )}
    </span>
  )
}

/** A trip or destination photo filling its box, or what's given when there's none. */
export function TripImage({ photo, fallback, className = '' }: { photo?: string; fallback: ReactNode; className?: string }) {
  if (!photo) return <>{fallback}</>
  return <img src={photo} alt="" loading="lazy" className={`object-cover ${className}`} />
}

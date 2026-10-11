import { useEffect, useRef, useState } from 'react'
import { whenSettled } from '../data/outbox'
import { useStore } from '../data/store'
import { builtInBrand, courseBrand, inkOn } from '../lib/courseBrands'
import { prepareLogo, readClipboardImage, removeCourseLogoFile, uploadCourseLogo, type Box, type PreparedLogo } from '../lib/courseLogo'
import { useHoldUpdates } from '../lib/holdUpdates'
import type { Course, CourseBrand } from '../types'
import { CourseLogo } from './CourseLogo'
import { Card, SECONDARY_BTN, SectionLabel } from './ui'

// A course's logo and hole-row colour, set by whoever's holding the card.
// Saved on the course for the whole group, so nobody waits on a deploy.

/** A logo found on a scanned card: the photo, where on it, and the card's colour. */
export interface BrandProposal {
  photo: Blob
  box?: Box | null
  color?: string | null
}

interface Draft {
  logo: PreparedLogo | 'keep' | 'none'
  color: string
  dark: boolean
  colours: string[]
}

const FALLBACK = '#1F4D3A'

// The old logo file goes only after the course row has stopped pointing
// at it on the server. The store call returns before the write lands (it
// may sit in the outbox until there's signal, or be refused), and deleting
// first left every other phone with a dead URL. If the write is refused,
// or the removal itself fails, the file stays: an orphan is cheaper than
// a dead link.
function retireLogo(old: string | undefined) {
  if (!old) return
  void whenSettled()
    .then((landed) => (landed ? removeCourseLogoFile(old) : undefined))
    .catch(() => {})
}

export default function CourseBrandEditor({ course, proposal }: { course: Course; proposal?: BrandProposal | null }) {
  const { setCourseBrand } = useStore()
  const current = courseBrand(course.name)
  const builtIn = builtInBrand(course.name)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const start = async (source: Blob, box?: Box | null, hint?: string | null) => {
    setBusy('Cleaning it up…')
    setError(null)
    try {
      const logo = await prepareLogo(source, box ?? undefined)
      const colours = [...new Set([hint, ...logo.colours, current?.color].filter((c): c is string => !!c).map((c) => c.toUpperCase()))]
      setDraft({ logo, color: colours[0] ?? FALLBACK, dark: logo.dark, colours })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // A scanned card's logo opens straight into review.
  const seen = useRef<BrandProposal | null>(null)
  useEffect(() => {
    if (!proposal || seen.current === proposal) return
    seen.current = proposal
    if (proposal.box) void start(proposal.photo, proposal.box, proposal.color)
    else if (proposal.color) setDraft({ logo: 'keep', color: proposal.color.toUpperCase(), dark: !!current?.dark, colours: [proposal.color.toUpperCase()] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal])

  const paste = async () => {
    setError(null)
    try {
      await start(await readClipboardImage())
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const recolour = () =>
    setDraft({
      logo: 'keep',
      color: current?.color ?? FALLBACK,
      dark: !!current?.dark,
      colours: [...new Set([current?.color, builtIn?.color].filter((c): c is string => !!c).map((c) => c.toUpperCase()))],
    })

  const shown: CourseBrand | null = draft
    ? {
        logo: draft.logo === 'keep' ? current?.logo : draft.logo === 'none' ? undefined : draft.logo.dataUrl,
        color: draft.color,
        dark: draft.dark,
        wide: draft.logo === 'keep' ? current?.wide : draft.logo === 'none' ? false : draft.logo.wide,
        tall: draft.logo === 'keep' ? current?.tall : draft.logo === 'none' ? false : draft.logo.tall,
      }
    : current

  const save = async () => {
    if (!draft || !shown) return
    setBusy('Saving…')
    setError(null)
    try {
      const logo = typeof draft.logo === 'object' ? await uploadCourseLogo(draft.logo, course) : shown.logo
      const brand: CourseBrand = { logo, color: draft.color, dark: draft.dark || undefined, wide: shown.wide || undefined, tall: shown.tall || undefined }
      const old = course.brand?.logo
      setCourseBrand(course.id, brand)
      if (old && old !== logo) retireLogo(old)
      setDraft(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const reset = () => {
    const old = course.brand?.logo
    setCourseBrand(course.id, null)
    retireLogo(old)
    setDraft(null)
  }

  const ink = shown ? (shown.ink ?? inkOn(shown.color)) : undefined

  return (
    <>
      {draft && <HoldWhileEditing />}
      <SectionLabel>Logo and colour</SectionLabel>
      <Card className="p-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Choose a logo image"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void start(f)
            e.target.value = ''
          }}
        />

        {/* How the card will look: the logo over the hole row. */}
        <div className="overflow-hidden rounded-xl ring-1 ring-line">
          <div className="flex min-h-14 items-center gap-3 bg-card px-3 py-2.5">
            {shown?.logo ? (
              <CourseLogo key={shown.logo} brand={shown} name={course.name} size={shown.tall ? 56 : shown.wide ? 34 : 44} />
            ) : (
              <span className="text-footnote text-ink-faint">{shown ? 'Colour only, no logo' : 'No logo yet'}</span>
            )}
          </div>
          <div
            className={`flex gap-3 px-3 py-1.5 text-caption font-bold tabular-nums ${shown ? '' : 'bg-forest text-on-forest'}`}
            style={shown ? { backgroundColor: shown.color, color: ink } : undefined}
          >
            <span>HOLE</span>
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="w-4 text-center">
                {i + 1}
              </span>
            ))}
          </div>
        </div>

        {busy && <p className="mt-3 text-footnote font-semibold text-ink-dim">{busy}</p>}
        {error && <p className="mt-3 text-footnote font-semibold text-flag">{error}</p>}

        {draft ? (
          <div className="mt-3">
            <p className="mb-1.5 text-footnote font-semibold text-ink-dim">Hole row colour</p>
            <div className="flex flex-wrap items-center gap-2">
              {draft.colours.map((c) => (
                <button
                  key={c}
                  onClick={() => setDraft({ ...draft, color: c })}
                  aria-label={`Use ${c}`}
                  aria-pressed={draft.color === c}
                  className={`h-9 w-9 rounded-full ring-1 ring-line-strong transition active:scale-95 ${draft.color === c ? 'outline-2 outline-offset-2 outline-ink' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <label className="relative flex h-9 items-center rounded-full px-3 text-footnote font-bold text-ink-dim ring-1 ring-line-strong">
                Other
                <input
                  type="color"
                  value={draft.color.toLowerCase()}
                  onChange={(e) => setDraft({ ...draft, color: e.target.value.toUpperCase(), colours: draft.colours })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Pick any colour"
                />
              </label>
            </div>
            {shown?.logo && (
              <label className="mt-3 flex items-center gap-2 text-footnote font-semibold text-ink-dim">
                <input type="checkbox" checked={draft.dark} onChange={(e) => setDraft({ ...draft, dark: e.target.checked })} className="h-4 w-4 accent-green" />
                White logo, show it on the colour
              </label>
            )}
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => void save()}
                disabled={!!busy}
                className="rounded-xl bg-green px-4 py-2.5 text-footnote font-bold text-white disabled:opacity-40 active:scale-95 transition"
              >
                Use this
              </button>
              {typeof draft.logo === 'object' || draft.logo === 'keep' ? (
                current?.logo && (
                  <button onClick={() => setDraft({ ...draft, logo: 'none' })} className="px-2 text-footnote font-bold text-ink-faint">
                    No logo
                  </button>
                )
              ) : null}
              <button onClick={() => setDraft(null)} className="ml-auto px-2 text-footnote font-bold text-ink-faint">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => fileRef.current?.click()} disabled={!!busy} className={`rounded-xl px-3.5 py-2.5 text-footnote ${SECONDARY_BTN}`}>
                Choose image
              </button>
              <button onClick={() => void paste()} disabled={!!busy} className={`rounded-xl px-3.5 py-2.5 text-footnote ${SECONDARY_BTN}`}>
                Paste
              </button>
              <button onClick={recolour} disabled={!!busy} className={`rounded-xl px-3.5 py-2.5 text-footnote ${SECONDARY_BTN}`}>
                Colour
              </button>
            </div>
            {course.brand && (
              <button onClick={reset} className="mt-3 text-footnote font-bold text-flag/80">
                {builtIn ? 'Go back to the built-in logo' : 'Remove logo and colour'}
              </button>
            )}
          </>
        )}
      </Card>
    </>
  )
}

/** Holds updates while a draft is open, so a new version can't reload over it. */
function HoldWhileEditing() {
  useHoldUpdates()
  return null
}

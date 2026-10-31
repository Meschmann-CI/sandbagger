import { useState } from 'react'
import type { BagClub, Player } from '../types'
import { CLUBS, TYPICAL_YARDS, bagHeadlines, brandLogoSrc, brandOf, clubLabel, clubShort, newClubId, sortBag, type Brand } from '../lib/bag'
import { useStore } from '../data/store'
import { useHoldUpdates } from '../lib/holdUpdates'
import { useNavigate } from '../lib/nav'
import { Card, SECONDARY_BTN, SectionLabel, chip } from './ui'

// Your bag on the You page (Matt, 2026-10-30): one card, the bag drawn
// beside how many clubs are in it and the three numbers worth a glance
// (longest club, a mid iron, the shortest full swing), each with its
// make under it. Tap the card for every club (the /bag page); "+ Add a
// club" opens the editor right here.

export default function YourBag({ me }: { me: Player }) {
  const { updatePlayer } = useStore()
  const navigate = useNavigate()
  const bag = sortBag(me.bag ?? [])
  const [adding, setAdding] = useState<BagClub | null>(null)

  const save = (next: BagClub[]) => {
    const sorted = sortBag(next)
    updatePlayer({ ...me, bag: sorted.length ? sorted : undefined })
    setAdding(null)
  }
  const startAdding = () => setAdding({ id: newClubId(), club: '' })

  return (
    <>
      <SectionLabel
        action={
          !adding && (
            <button onClick={startAdding} className="text-footnote font-bold text-green">
              + Add a club
            </button>
          )
        }
      >
        Your bag
      </SectionLabel>
      {bag.length === 0 && !adding ? (
        <Card className="p-5 text-footnote text-ink-dim">
          Your clubs, how far each one goes, and what they are.{' '}
          <button onClick={startAdding} className="font-bold text-green">
            Add the first
          </button>
        </Card>
      ) : (
        bag.length > 0 && <BagCard bag={bag} onOpen={() => navigate('/bag')} />
      )}
      {adding && (
        <ClubEditor
          club={adding}
          taken={bag.map((c) => c.club)}
          onSave={(c) => save([...bag, c])}
          onRemove={() => setAdding(null)}
          onCancel={() => setAdding(null)}
        />
      )}
    </>
  )
}

/** The bag drawn, the count, and the three headline clubs with their makes. */
export function BagCard({ bag, onOpen }: { bag: BagClub[]; onOpen: () => void }) {
  const heads = bagHeadlines(bag)
  return (
    <Card onClick={onOpen} className="p-4">
      <div className="flex items-center gap-4">
        <img src="/brands/bag-glyph.svg" alt="" className="h-[116px] w-auto shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-large font-extrabold leading-none text-ink">
            {bag.length} {bag.length === 1 ? 'club' : 'clubs'}
          </p>
          {heads.length > 0 && (
            <div className="mt-3 flex gap-2">
              {heads.map((c) => (
                <div key={c.id} className="flex min-w-0 flex-1 flex-col items-center">
                  <p className="text-headline font-extrabold leading-tight text-ink tabular-nums">{c.yards}</p>
                  <p className="text-caption font-semibold text-ink-dim">{clubShort(c.club)}</p>
                  <BrandMark brand={brandOf(c.brand)} className="mt-1.5" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-footnote font-bold text-green">See every club</p>
    </Card>
  )
}

/**
 * A make on a light pill: its logo when we have one, its name otherwise,
 * and a quiet dash for a club with no make yet so the columns line up.
 */
export function BrandMark({ brand, className = '' }: { brand: Brand | undefined; className?: string }) {
  const src = brand && brandLogoSrc(brand)
  return (
    <span className={`inline-flex h-7 max-w-full items-center rounded-full border border-line bg-card px-2.5 ${className}`}>
      {src ? (
        <img src={src} alt={brand.name} className="h-4 w-auto max-w-[64px] object-contain" />
      ) : (
        <span className="truncate text-caption font-bold text-ink-dim">{brand ? brand.name : '–'}</span>
      )}
    </span>
  )
}

export function ClubEditor({
  club,
  taken,
  onSave,
  onRemove,
  onCancel,
}: {
  club: BagClub
  taken: string[]
  onSave: (c: BagClub) => void
  onRemove: () => void
  onCancel: () => void
}) {
  // An update landing mid-edit would lose the draft.
  useHoldUpdates()
  const [code, setCode] = useState(club.club)
  const [brand, setBrand] = useState(club.brand ?? '')
  const [yards, setYards] = useState(club.yards != null ? String(club.yards) : code ? String(TYPICAL_YARDS[code] ?? '') : '')
  const isNew = !club.club
  const putter = code === 'P'

  const pick = (c: string) => {
    setCode(c)
    // A fresh club starts at a typical number; a typed one stays.
    if (!yards || (club.club !== c && yards === String(TYPICAL_YARDS[code] ?? ''))) setYards(String(TYPICAL_YARDS[c] ?? ''))
  }
  const bump = (d: number) => setYards(String(Math.max(0, Math.min(400, (Number(yards) || TYPICAL_YARDS[code] || 100) + d))))

  const field = 'rounded-xl border border-line-strong bg-card px-3 py-2 text-body text-ink focus:border-green focus:outline-none'
  const known = brandOf(brand)

  return (
    <Card className="mt-3 p-4 space-y-3">
      <div>
        <p className="text-footnote font-bold text-ink">{isNew ? 'Which club?' : clubLabel(code)}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CLUBS.filter((c) => c === code || !taken.includes(c)).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => pick(c)}
              aria-pressed={code === c}
              className={`rounded-full border px-3 py-1.5 text-footnote font-bold transition active:scale-95 ${chip(code === c)}`}
            >
              {clubShort(c)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-footnote font-bold text-ink">Make and model</p>
        <div className="mt-1 flex items-center gap-2">
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder={putter ? 'Scotty Cameron Newport' : 'Titleist TSR3'}
            aria-label="Make and model"
            className={`min-w-0 flex-1 ${field}`}
          />
          {known && <BrandMark brand={known} />}
        </div>
      </div>
      {!putter && (
        <div>
          <p className="text-footnote font-bold text-ink">How far, a full swing</p>
          <div className="mt-1 flex items-center gap-2">
            <button onClick={() => bump(-5)} aria-label="Five yards shorter" className="h-11 w-11 rounded-xl bg-ink/[0.06] text-headline font-bold text-ink active:scale-95">
              −
            </button>
            <input
              value={yards}
              onChange={(e) => setYards(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              aria-label="Yards"
              className={`w-24 text-center text-large font-extrabold tabular-nums ${field}`}
            />
            <span className="text-footnote font-semibold text-ink-dim">yds</span>
            <button onClick={() => bump(5)} aria-label="Five yards longer" className="h-11 w-11 rounded-xl bg-ink/[0.06] text-headline font-bold text-ink active:scale-95">
              +
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() =>
            onSave({
              id: club.id,
              club: code,
              brand: brand.trim() || undefined,
              yards: putter ? undefined : Number(yards) > 0 ? Number(yards) : undefined,
            })
          }
          disabled={!code}
          className="rounded-xl bg-green px-4 py-2.5 text-body font-bold text-white disabled:opacity-30"
        >
          {isNew ? 'Add it' : 'Save'}
        </button>
        {!isNew && (
          <button onClick={onRemove} className={`rounded-xl px-4 py-2.5 text-body ${SECONDARY_BTN}`}>
            Take it out
          </button>
        )}
        <button onClick={onCancel} className="ml-auto px-2 text-footnote font-bold text-ink-faint">
          Cancel
        </button>
      </div>
    </Card>
  )
}

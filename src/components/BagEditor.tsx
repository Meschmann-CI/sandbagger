import { useState } from 'react'
import type { BagClub, Player } from '../types'
import { CLUBS, TYPICAL_YARDS, clubLabel, clubShort, sortBag } from '../lib/bag'
import { useStore } from '../data/store'
import { useHoldUpdates } from '../lib/holdUpdates'
import { Card, RowButton, SECONDARY_BTN, SectionLabel, chip } from './ui'

// Your bag on the You page (Matt, 2026-10-30): each club with how far it
// goes and what it is. Tap a row to change it, "+ Add a club" for a new
// one. The editor is a card under the list, like the handicap editor.

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.floor(Math.random() * 1e12).toString(16)}`

export default function YourBag({ me }: { me: Player }) {
  const { updatePlayer } = useStore()
  const bag = sortBag(me.bag ?? [])
  // The club being edited, or a blank one being added.
  const [editing, setEditing] = useState<BagClub | null>(null)

  const save = (next: BagClub[]) => {
    const sorted = sortBag(next)
    updatePlayer({ ...me, bag: sorted.length ? sorted : undefined })
    setEditing(null)
  }

  return (
    <>
      <SectionLabel
        action={
          !editing && (
            <button onClick={() => setEditing({ id: makeId(), club: '' })} className="text-footnote font-bold text-green">
              + Add a club
            </button>
          )
        }
      >
        Your bag
      </SectionLabel>
      {bag.length === 0 && !editing ? (
        <Card className="p-5 text-footnote text-ink-dim">
          Your clubs, how far each one goes, and what they are.{' '}
          <button onClick={() => setEditing({ id: makeId(), club: '' })} className="font-bold text-green">
            Add the first
          </button>
        </Card>
      ) : (
        bag.length > 0 && (
          <Card className="divide-y divide-line">
            {bag.map((c) => (
              <RowButton key={c.id} onClick={() => setEditing(c)} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-body font-bold text-ink">{clubLabel(c.club)}</p>
                  {c.brand && <p className="truncate text-footnote text-ink-dim">{c.brand}</p>}
                </div>
                {c.club !== 'P' && (
                  <p className="text-headline font-extrabold text-ink tabular-nums">
                    {c.yards ?? '–'} <span className="text-footnote font-semibold text-ink-dim">yds</span>
                  </p>
                )}
              </RowButton>
            ))}
          </Card>
        )
      )}
      {editing && (
        <ClubEditor
          club={editing}
          taken={bag.filter((c) => c.id !== editing.id).map((c) => c.club)}
          onSave={(c) => save([...bag.filter((x) => x.id !== c.id), c])}
          onRemove={() => save(bag.filter((x) => x.id !== editing.id))}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  )
}

function ClubEditor({
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
        <input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder={putter ? 'Scotty Cameron Newport' : 'Titleist TSR3'}
          aria-label="Make and model"
          className={`mt-1 w-full ${field}`}
        />
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

import { useState } from 'react'
import type { BagClub } from '../types'
import { useGoBack } from '../lib/nav'
import { BackButton } from '../components/Nav'
import { useStore } from '../data/store'
import { brandOf, clubLabel, clubShort, newClubId, sortBag } from '../lib/bag'
import { BrandMark, ClubEditor } from '../components/BagEditor'
import { Card, RowButton } from '../components/ui'

// Every club in the bag (Matt, 2026-10-30), driver to putter, each with
// its make's logo, what it is, and how far it goes. Tap a row to change
// it; the editor opens under the list, like the handicap editor.

export default function Bag() {
  const goBack = useGoBack('/profile')
  const { data, updatePlayer } = useStore()
  const me = data.players.find((p) => p.id === data.currentUserId)
  const bag = sortBag(me?.bag ?? [])
  const [editing, setEditing] = useState<BagClub | null>(null)

  const save = (next: BagClub[]) => {
    if (!me) return
    const sorted = sortBag(next)
    updatePlayer({ ...me, bag: sorted.length ? sorted : undefined })
    setEditing(null)
  }

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <BackButton fallback="/profile" onBack={goBack} />
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-large font-bold tracking-tight text-ink">Your bag</h1>
            <p className="text-footnote text-ink-dim">
              {bag.length} {bag.length === 1 ? 'club' : 'clubs'}, driver to putter.
            </p>
          </div>
          {!editing && (
            <button onClick={() => setEditing({ id: newClubId(), club: '' })} className="pb-1 text-footnote font-bold text-green">
              + Add a club
            </button>
          )}
        </div>
      </header>

      {bag.length === 0 && !editing ? (
        <Card className="p-5 text-footnote text-ink-dim">
          Nothing in the bag yet.{' '}
          <button onClick={() => setEditing({ id: newClubId(), club: '' })} className="font-bold text-green">
            Add the first
          </button>
        </Card>
      ) : (
        bag.length > 0 && (
          <Card className="divide-y divide-line">
            {bag.map((c) => {
              const brand = brandOf(c.brand)
              return (
                <RowButton key={c.id} onClick={() => setEditing(c)} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-20 shrink-0">
                    {brand ? (
                      <BrandMark brand={brand} />
                    ) : (
                      <span className="inline-flex h-7 items-center rounded-full bg-ink/[0.06] px-2.5 text-caption font-bold text-ink-dim">{clubShort(c.club)}</span>
                    )}
                  </span>
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
              )
            })}
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
    </div>
  )
}

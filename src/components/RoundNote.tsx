import { useState } from 'react'
import { useStore } from '../data/store'
import { useHoldUpdates } from '../lib/holdUpdates'
import type { Round } from '../types'

// The round's own line: "Pat's cart died on 14. Walked it in." Anyone on
// the round writes it, and it stays on the round page under the verdict.
// `rounds.notes` has been on the row since the first schema; nothing
// showed or edited it until 2026-10-31. Same as RoundNote.swift.

export const NOTE_MAX = 280

export default function RoundNote({ round }: { round: Round }) {
  const { data } = useStore()
  const [editing, setEditing] = useState(false)
  const imIn = round.players.some((rp) => rp.playerId === data.currentUserId)
  const note = round.notes?.trim()
  if (editing) return <NoteEditor round={round} onDone={() => setEditing(false)} />
  if (note) {
    return (
      <div className="mt-2 px-1">
        <p className="text-body leading-snug text-ink">{note}</p>
        {imIn && (
          <button type="button" onClick={() => setEditing(true)} className="mt-1 text-footnote font-bold text-green">
            Edit
          </button>
        )}
      </div>
    )
  }
  if (!imIn) return null
  return (
    <button type="button" onClick={() => setEditing(true)} className="mt-2 px-1 text-footnote font-bold text-green">
      Add a line about the day
    </button>
  )
}

function NoteEditor({ round, onDone }: { round: Round; onDone: () => void }) {
  useHoldUpdates()
  const { data, updateRound } = useStore()
  const [text, setText] = useState(round.notes ?? '')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        // Re-read the round so a score landing meanwhile isn't undone.
        const current = data.rounds.find((r) => r.id === round.id) ?? round
        const clean = text.trim()
        updateRound({ ...current, notes: clean ? clean.slice(0, NOTE_MAX) : undefined })
        onDone()
      }}
      className="mt-2 px-1"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={NOTE_MAX}
        rows={2}
        autoFocus
        placeholder="Pat’s cart died on 14. Walked it in."
        className="w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <button type="submit" className="rounded-xl bg-green px-4 py-2 text-footnote font-bold text-white">
          Save
        </button>
        <button type="button" onClick={onDone} className="px-3 py-2 text-footnote font-bold text-ink-dim">
          Cancel
        </button>
      </div>
    </form>
  )
}

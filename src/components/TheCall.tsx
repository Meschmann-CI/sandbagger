import { useState } from 'react'
import { useStore } from '../data/store'
import { roundIsFinal } from '../lib/trophyMoments'
import { Card, SectionLabel } from './ui'
import type { Round } from '../types'

// The call: a reverent broadcaster's account of the round, written once
// when the last score lands (supabase/functions/recap, lib/recapFacts.ts)
// and kept on the round for everyone. A finished round the booth missed
// (no signal at the time, or one from before the booth opened) gets a
// button. Same as TheCall.swift.

export default function TheCall({ round }: { round: Round }) {
  const { cloud, writeRecap, recapBusy } = useStore()
  const [error, setError] = useState<string | null>(null)
  const recap = round.recap
  const busy = recapBusy === round.id
  if (!recap && (!cloud || round.players.length < 2 || !roundIsFinal(round))) return null
  return (
    <>
      <SectionLabel>The call</SectionLabel>
      <Card tile className="px-4 py-3.5">
        {recap ? (
          <p className="text-body leading-relaxed text-ink whitespace-pre-line">{recap.text}</p>
        ) : (
          <>
            <p className="text-footnote text-ink-dim">The booth hasn’t called this one yet.</p>
            {error && <p className="mt-1 text-footnote text-flag">{error}</p>}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null)
                void writeRecap(round.id).then(setError)
              }}
              className="mt-2 text-footnote font-bold text-green disabled:opacity-60"
            >
              {busy ? 'Calling it…' : 'Hear the call'}
            </button>
          </>
        )}
      </Card>
    </>
  )
}

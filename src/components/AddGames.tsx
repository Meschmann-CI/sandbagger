import { useState } from 'react'
import { useStore } from '../data/store'
import type { BetType, Round } from '../types'
import BetEditor from './BetEditor'
import { GamesMenu } from './GamesMenu'

// Adding bets to a round: the games menu first, then each game picked
// set up in the bet editor in turn. Cancel on one skips to the next.

export function AddGames({ round, onDone }: { round: Round; onDone: () => void }) {
  const { addBet } = useStore()
  const [queue, setQueue] = useState<BetType[] | null>(null)
  const [done, setDone] = useState(0)

  if (!queue) return <GamesMenu round={round} onClose={onDone} onPick={setQueue} />

  const next = () => {
    if (done + 1 >= queue.length) onDone()
    else setDone(done + 1)
  }
  return (
    <div className="mb-3">
      <BetEditor
        key={`${queue[done]}-${done}`}
        round={round}
        type={queue[done]}
        step={queue.length > 1 ? `${done + 1} of ${queue.length}` : undefined}
        onSave={(bet) => {
          addBet(bet)
          next()
        }}
        onCancel={next}
      />
    </div>
  )
}

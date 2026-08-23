import { useStore } from '../data/store'
import type { Round } from '../types'
import { HOLE_COUNT, cardOf, inTotal, outTotal } from '../lib/holes'
import { Avatar, Card } from './ui'

// Read-only card. Scrolls sideways rather than squeezing eighteen holes
// into a phone's width, with the golfer column pinned so you can tell
// whose row you're reading.
export default function Scorecard({ round }: { round: Round }) {
  const { data } = useStore()

  // Best score on each hole, so the low number stands out.
  const bestByHole = Array.from({ length: HOLE_COUNT }, (_, i) => {
    const scores = round.players.map((rp) => cardOf(rp)[i]).filter((h): h is number => h != null)
    return scores.length > 1 ? Math.min(...scores) : null
  })

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="text-[12px] tabular-nums">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                Hole
              </th>
              {Array.from({ length: 9 }, (_, i) => (
                <th key={i} className="w-8 px-1 py-2 font-bold text-ink-faint">{i + 1}</th>
              ))}
              <th className="w-9 px-1 py-2 font-extrabold text-ink">Out</th>
              {Array.from({ length: 9 }, (_, i) => (
                <th key={i + 9} className="w-8 px-1 py-2 font-bold text-ink-faint">{i + 10}</th>
              ))}
              <th className="w-9 px-1 py-2 font-extrabold text-ink">In</th>
              <th className="w-10 px-1 py-2 font-extrabold text-ink">Tot</th>
            </tr>
          </thead>
          <tbody>
            {round.players.map((rp) => {
              const p = data.players.find((pl) => pl.id === rp.playerId)
              if (!p) return null
              const card = cardOf(rp)
              const out = outTotal(rp)
              const inn = inTotal(rp)
              const cell = (i: number) => {
                const v = card[i]
                const best = bestByHole[i] != null && v === bestByHole[i]
                return (
                  <td key={i} className="px-1 py-2 text-center">
                    {v == null ? (
                      <span className="text-ink-faint">–</span>
                    ) : (
                      <span className={best ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-soft font-extrabold text-green' : 'text-ink'}>
                        {v}
                      </span>
                    )}
                  </td>
                )
              }
              return (
                <tr key={rp.playerId} className="border-b border-line last:border-0">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar player={p} size={22} />
                      <span className="text-[12.5px] font-bold text-ink whitespace-nowrap">{p.name}</span>
                    </div>
                  </td>
                  {Array.from({ length: 9 }, (_, i) => cell(i))}
                  <td className="px-1 text-center font-extrabold text-ink">{out || '–'}</td>
                  {Array.from({ length: 9 }, (_, i) => cell(i + 9))}
                  <td className="px-1 text-center font-extrabold text-ink">{inn || '–'}</td>
                  <td className="px-1 text-center font-extrabold text-ink">{out + inn || '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

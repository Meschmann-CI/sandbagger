import { useStore } from '../data/store'
import type { Round } from '../types'
import { HOLE_COUNT, cardOf, inTotal, outTotal } from '../lib/holes'
import { findCourse, hasPars, padded, scoreKind, toPar, type ScoreKind } from '../lib/courses'
import { Avatar, Card } from './ui'

// Read-only card. Scrolls sideways rather than squeezing eighteen holes
// into a phone's width, with the golfer column pinned so you can tell
// whose row you're reading.

// A real card marks the good and bad holes rather than leaving you to do
// the arithmetic: circles under par, squares over. Two rings for an
// eagle, two boxes for a double, which is how they're drawn on paper.
const MARK: Record<ScoreKind, string> = {
  albatross: 'ring-2 ring-gold ring-offset-1 rounded-full bg-gold-soft font-extrabold text-gold',
  eagle: 'ring-2 ring-gold ring-offset-1 rounded-full bg-gold-soft font-extrabold text-gold',
  birdie: 'rounded-full bg-green-soft font-extrabold text-green',
  par: 'text-ink',
  bogey: 'rounded-md bg-paper border border-line-strong text-ink',
  double: 'rounded-md bg-flag-soft border border-flag/40 font-bold text-flag',
  worse: 'rounded-md bg-flag-soft border-2 border-flag/60 font-extrabold text-flag',
}

export default function Scorecard({ round }: { round: Round }) {
  const { data } = useStore()
  const course = findCourse(data, round.courseName)
  const pars = hasPars(course) ? padded(course.pars) : null
  const sumPars = (from: number, to: number) => (pars ?? []).slice(from, to).reduce<number>((s, p) => s + (p ?? 0), 0)

  // Best score on each hole, so the low number stands out. Only used when
  // there's no par to mark against — par is the better signal.
  const bestByHole = Array.from({ length: HOLE_COUNT }, (_, i) => {
    const scores = round.players.map((rp) => cardOf(rp)[i]).filter((h): h is number => h != null)
    return scores.length > 1 ? Math.min(...scores) : null
  })

  const headerCell = (i: number) => (
    <th key={i} className="w-8 px-1 py-2 font-bold text-ink-faint">
      {i + 1}
    </th>
  )

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="text-[12px] tabular-nums">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                Hole
              </th>
              {Array.from({ length: 9 }, (_, i) => headerCell(i))}
              <th className="w-9 px-1 py-2 font-extrabold text-ink">Out</th>
              {Array.from({ length: 9 }, (_, i) => headerCell(i + 9))}
              <th className="w-9 px-1 py-2 font-extrabold text-ink">In</th>
              <th className="w-10 px-1 py-2 font-extrabold text-ink">Tot</th>
            </tr>
            {pars && (
              <tr className="border-b border-line bg-paper/60">
                <td className="sticky left-0 z-10 bg-paper px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                  Par
                </td>
                {pars.slice(0, 9).map((p, i) => (
                  <td key={i} className="px-1 py-1.5 text-center text-[11px] font-bold text-ink-dim">
                    {p}
                  </td>
                ))}
                <td className="px-1 text-center text-[11px] font-extrabold text-ink-dim">{sumPars(0, 9)}</td>
                {pars.slice(9).map((p, i) => (
                  <td key={i + 9} className="px-1 py-1.5 text-center text-[11px] font-bold text-ink-dim">
                    {p}
                  </td>
                ))}
                <td className="px-1 text-center text-[11px] font-extrabold text-ink-dim">{sumPars(9, 18)}</td>
                <td className="px-1 text-center text-[11px] font-extrabold text-ink-dim">
                  {sumPars(0, HOLE_COUNT)}
                </td>
              </tr>
            )}
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
                const par = pars?.[i]
                // With par known, mark against par. Without it, fall back
                // to highlighting the low score on the hole.
                const style = v != null && par != null ? MARK[scoreKind(v, par)] : null
                const best = !pars && bestByHole[i] != null && v === bestByHole[i]
                return (
                  <td key={i} className="px-1 py-2 text-center">
                    {v == null ? (
                      <span className="text-ink-faint">–</span>
                    ) : style ? (
                      <span className={`inline-flex h-6 w-6 items-center justify-center ${style}`}>{v}</span>
                    ) : (
                      <span
                        className={
                          best ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-soft font-extrabold text-green' : 'text-ink'
                        }
                      >
                        {v}
                      </span>
                    )}
                  </td>
                )
              }
              // Only compare against the holes that actually have a score.
              const scoredPar = pars ? pars.reduce<number>((s, par, i) => s + (card[i] != null ? (par ?? 0) : 0), 0) : null
              const total = out + inn
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
                  <td className="px-1 text-center font-extrabold text-ink">
                    {total || '–'}
                    {scoredPar != null && total > 0 && (
                      <span className="block text-[10px] font-bold text-ink-faint">{toPar(total - scoredPar)}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {pars && (
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-line px-3 py-2 text-[10.5px] text-ink-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-full bg-green-soft" /> birdie
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-full bg-gold-soft ring-1 ring-gold" /> eagle
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-md border border-line-strong bg-paper" /> bogey
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-md border border-flag/40 bg-flag-soft" /> double or worse
          </span>
        </div>
      )}
    </Card>
  )
}

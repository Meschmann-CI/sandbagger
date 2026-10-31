import { useMembers, useStore } from '../data/store'
import { HOLE_COUNT } from '../lib/holes'
import { holeHistory, nemesisLine, type HoleHistory } from '../lib/holeHistory'
import { Avatar, Card, SectionLabel } from '../components/ui'
import type { Course } from '../types'

// The course page's hole-by-hole table: every golfer who has two cards
// here, you first, with their average on each hole against par, and the
// hole that has each of them. Same as HoleHistoryView.swift.

/** The colour of an average against par: under, around, a stroke over, worse. */
export function avgClass(avg: number | null, par: number | null): string {
  if (avg == null || par == null) return 'text-ink-faint'
  const over = avg - par
  if (over < 0) return 'text-green font-bold'
  if (over < 1) return 'text-ink'
  if (over < 2) return 'text-sand font-semibold'
  return 'text-flag font-bold'
}

export default function HoleHistoryTable({ course }: { course: Course }) {
  const { data } = useStore()
  const members = useMembers()
  const me = data.currentUserId
  const rows = members
    .map((p) => ({ player: p, history: holeHistory(data, course, p.id) }))
    .filter((r) => r.history.rounds >= 2)
    .sort((a, b) => (a.player.id === me ? -1 : b.player.id === me ? 1 : b.history.rounds - a.history.rounds))
  if (rows.length === 0) return null
  const pars = rows[0].history.holes.map((h) => h.par)
  const lines = rows.map((r) => nemesisLine(r.player.id === me ? 'You' : r.player.name.split(' ')[0], r.history)).filter((x): x is string => !!x)
  return (
    <>
      <SectionLabel>Hole by hole</SectionLabel>
      <Card className="overflow-x-auto">
        <table className="min-w-full border-collapse text-caption tabular-nums">
          <thead>
            <tr className="bg-forest text-on-forest">
              <th className="sticky left-0 z-10 bg-forest px-3 py-1.5 text-left font-bold uppercase tracking-wide">Hole</th>
              {Array.from({ length: HOLE_COUNT }, (_, h) => (
                <th key={h} className="min-w-[34px] px-1 py-1.5 text-center font-bold">
                  {h + 1}
                </th>
              ))}
            </tr>
            {pars.some((p) => p != null) && (
              <tr className="border-b border-line text-ink-faint">
                <th className="sticky left-0 z-10 bg-paper px-3 py-1 text-left font-semibold">Par</th>
                {pars.map((p, h) => (
                  <td key={h} className="px-1 py-1 text-center">
                    {p ?? '–'}
                  </td>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map(({ player, history }) => (
              <HistoryRow key={player.id} name={player.id === me ? 'You' : player.name.split(' ')[0]} player={player} history={history} />
            ))}
          </tbody>
        </table>
      </Card>
      {lines.length > 0 && (
        <div className="mt-2 space-y-1 px-2">
          {lines.map((l) => (
            <p key={l} className="text-caption leading-snug text-ink-dim">
              {l}
            </p>
          ))}
        </div>
      )}
    </>
  )
}

function HistoryRow({ name, player, history }: { name: string; player: { id: string; name: string; initials: string; color: string }; history: HoleHistory }) {
  return (
    <tr className="border-b border-line last:border-b-0">
      <th className="sticky left-0 z-10 bg-paper px-3 py-1.5 text-left font-semibold text-ink">
        <span className="flex items-center gap-1.5">
          <Avatar player={player as never} size={18} />
          <span>{name}</span>
          <span className="font-normal text-ink-faint">×{history.rounds}</span>
        </span>
      </th>
      {history.holes.map((h) => (
        <td key={h.hole} className={`px-1 py-1.5 text-center ${avgClass(h.avg, h.par)}`}>
          {h.avg == null ? '–' : h.avg.toFixed(1)}
        </td>
      ))}
    </tr>
  )
}

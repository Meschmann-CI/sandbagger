import { Fragment } from 'react'
import { useStore } from '../data/store'
import type { Round } from '../types'
import { HOLE_COUNT, cardOf, inTotal, outTotal } from '../lib/holes'
import { fmtDiff, ghostDiff, ghostFor } from '../lib/ghost'
import { shortDate } from '../lib/stats'
import { findCourse, hasPars, hasStrokeIndex, padded, scoreKind, strokesOffLow, toPar } from '../lib/courses'
import { Avatar, Card } from './ui'
import { CourseLogo } from './CourseLogo'
import { courseBrand } from '../lib/courseBrands'
import { Icon } from './icons'
import { MarkLegend, SCORE_MARK, StrokeDots } from './scoreMarks'

// Read-only card. Scrolls sideways rather than squeezing eighteen holes
// into a phone's width, with the golfer column pinned so you can tell
// whose row you're reading.

// A real card marks the good and bad holes rather than leaving you to do
// the arithmetic; the marks themselves live in scoreMarks.tsx.

export default function Scorecard({ round }: { round: Round }) {
  const { data } = useStore()
  const course = findCourse(data, round.courseName)
  // The course's own colours on the hole row, the way its printed card
  // has them. Without a brand, the Sandbagger forest.
  const brand = courseBrand(round.courseName)
  const headStyle = brand ? { backgroundColor: brand.color, color: brand.ink } : undefined
  const pars = hasPars(course) ? padded(course.pars) : null

  // The dots a paper card would carry: who gets a stroke where, off the
  // low handicap in the round. Only when there's a stroke index to say
  // which holes, and only when there's someone to give strokes against.
  const strokeDots =
    hasStrokeIndex(course) && round.players.length > 1 ? strokesOffLow(course, round.players, round.tee) : null
  const sumPars = (from: number, to: number) => (pars ?? []).slice(from, to).reduce<number>((s, p) => s + (p ?? 0), 0)

  // Best score on each hole, so the low number stands out. Only used when
  // there's no par to mark against — par is the better signal.
  const bestByHole = Array.from({ length: HOLE_COUNT }, (_, i) => {
    const scores = round.players.map((rp) => cardOf(rp)[i]).filter((h): h is number => h != null)
    return scores.length > 1 ? Math.min(...scores) : null
  })

  const headerCell = (i: number) => (
    <th key={i} className={`w-8 px-1 py-2 font-bold ${brand ? 'opacity-85' : 'text-on-forest/80'}`}>
      {i + 1}
    </th>
  )

  return (
    <Card className="overflow-hidden">
      {brand?.logo && (
        <div className={`flex gap-3 border-b border-line px-4 py-3 ${brand.wide ? 'flex-col items-start gap-2' : 'items-center'}`}>
          <CourseLogo brand={brand} name={round.courseName} size={brand.tall ? 56 : brand.wide ? 34 : 44} />
          <div className="min-w-0">
            <p className="text-footnote font-bold text-ink truncate">{course?.name ?? round.courseName}</p>
            <p className="text-caption text-ink-faint">
              {shortDate(round.date)}
              {round.tee && `, ${round.tee} tees`}
            </p>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="text-footnote tabular-nums">
          <thead>
            <tr className={brand ? '' : 'bg-forest text-on-forest'} style={headStyle}>
              <th
                className={`sticky left-0 z-10 px-3 py-2 text-left text-caption font-semibold uppercase ${brand ? '' : 'bg-forest text-on-forest'}`}
                style={headStyle}
              >
                Hole
              </th>
              {Array.from({ length: 9 }, (_, i) => headerCell(i))}
              <th className="w-9 px-1 py-2 font-bold">Out</th>
              {Array.from({ length: 9 }, (_, i) => headerCell(i + 9))}
              <th className="w-9 px-1 py-2 font-bold">In</th>
              <th className="w-10 px-1 py-2 font-bold">Tot</th>
            </tr>
            {/* Yardage, where the card came with it. One tee set; the
                label says which. */}
            {course?.yards && course.yards.length === HOLE_COUNT && (
              <tr className="border-b border-line">
                <td className="sticky left-0 z-10 bg-card px-3 py-1 text-caption font-semibold uppercase text-ink-faint whitespace-nowrap">
                  Yds{course.yardsTee ? ` · ${course.yardsTee}` : ''}
                </td>
                {course.yards.slice(0, 9).map((y, i) => (
                  <td key={i} className="px-1 py-1 text-center text-caption text-ink-faint tabular-nums">
                    {y ?? ''}
                  </td>
                ))}
                <td className="px-1 text-center text-caption text-ink-faint tabular-nums">
                  {course.yards.slice(0, 9).reduce<number>((s, y) => s + (y ?? 0), 0)}
                </td>
                {course.yards.slice(9).map((y, i) => (
                  <td key={i + 9} className="px-1 py-1 text-center text-caption text-ink-faint tabular-nums">
                    {y ?? ''}
                  </td>
                ))}
                <td className="px-1 text-center text-caption text-ink-faint tabular-nums">
                  {course.yards.slice(9).reduce<number>((s, y) => s + (y ?? 0), 0)}
                </td>
                <td className="px-1 text-center text-caption text-ink-faint tabular-nums">
                  {course.yards.reduce<number>((s, y) => s + (y ?? 0), 0)}
                </td>
              </tr>
            )}
            {pars && (
              <tr className="border-b border-line bg-paper/60">
                <td className="sticky left-0 z-10 bg-paper px-3 py-1.5 text-caption font-semibold uppercase text-ink-faint">
                  Par
                </td>
                {pars.slice(0, 9).map((p, i) => (
                  <td key={i} className="px-1 py-1.5 text-center text-caption font-bold text-ink-dim">
                    {p}
                  </td>
                ))}
                <td className="px-1 text-center text-caption font-extrabold text-ink-dim">{sumPars(0, 9)}</td>
                {pars.slice(9).map((p, i) => (
                  <td key={i + 9} className="px-1 py-1.5 text-center text-caption font-bold text-ink-dim">
                    {p}
                  </td>
                ))}
                <td className="px-1 text-center text-caption font-extrabold text-ink-dim">{sumPars(9, 18)}</td>
                <td className="px-1 text-center text-caption font-extrabold text-ink-dim">
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
              const dots = strokeDots?.[rp.playerId]
              const cell = (i: number) => {
                const v = card[i]
                const par = pars?.[i]
                // With par known, mark against par. Without it, fall back
                // to highlighting the low score on the hole.
                const style = v != null && par != null ? SCORE_MARK[scoreKind(v, par)] : null
                const best = !pars && bestByHole[i] != null && v === bestByHole[i]
                return (
                  <td key={i} className="px-1 py-1.5 text-center align-bottom">
                    {/* A row for the stroke dots keeps every cell the same
                        height whether or not this hole gives one. */}
                    {strokeDots && (
                      <StrokeDots count={dots?.[i]} />
                    )}
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
              const ghost = ghostFor(data, round, rp.playerId)
              const race = ghost ? ghostDiff(card, ghost.card) : null
              return (
                <Fragment key={rp.playerId}>
                <tr className="border-b border-line last:border-0">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar player={p} size={22} />
                      <span className="text-footnote font-bold text-ink whitespace-nowrap">{p.name}</span>
                    </div>
                  </td>
                  {Array.from({ length: 9 }, (_, i) => cell(i))}
                  <td className="px-1 text-center font-extrabold text-ink">{out || '–'}</td>
                  {Array.from({ length: 9 }, (_, i) => cell(i + 9))}
                  <td className="px-1 text-center font-extrabold text-ink">{inn || '–'}</td>
                  <td className="px-1 text-center font-extrabold text-ink">
                    {total || '–'}
                    {scoredPar != null && total > 0 && (
                      <span className="block text-caption font-bold text-ink-faint">{toPar(total - scoredPar)}</span>
                    )}
                  </td>
                </tr>
                {/* The ghost they raced: shown on the holes the live card
                    has, with the running difference. */}
                {ghost && race && (
                  <tr className="border-b border-line last:border-0 bg-paper/60">
                    <td className="sticky left-0 z-10 bg-paper px-3 py-1.5 leading-tight">
                      <span className="flex items-center gap-1 text-caption font-bold text-ink-dim whitespace-nowrap">
                        <Icon name="ghost" size={13} /> Ghost {p.name.split(' ')[0]}
                      </span>
                      <span className="block text-caption text-ink-faint whitespace-nowrap tabular-nums">{shortDate(ghost.round.date)}</span>
                    </td>
                    {Array.from({ length: HOLE_COUNT }, (_, i) => {
                      const g = ghost.card[i]
                      const v = card[i]
                      const shown = v != null && g != null
                      const tone = !shown ? 'text-ink-faint' : v < g ? 'text-green' : v > g ? 'text-flag' : 'text-ink-dim'
                      const cell = (
                        <td key={i} className={`px-1 py-1 text-center text-caption font-bold tabular-nums ${tone}`}>
                          {shown ? g : '·'}
                        </td>
                      )
                      // Keep the Out column aligned after hole 9.
                      return i === 8 ? (
                        <Fragment key={i}>
                          {cell}
                          <td className="px-1 text-center text-caption text-ink-faint tabular-nums">
                            {ghost.card.slice(0, 9).reduce<number>((s, h, k) => s + (card[k] != null ? (h ?? 0) : 0), 0) || '–'}
                          </td>
                        </Fragment>
                      ) : (
                        cell
                      )
                    })}
                    <td className="px-1 text-center text-caption text-ink-faint tabular-nums">
                      {ghost.card.slice(9).reduce<number>((s, h, k) => s + (card[k + 9] != null ? (h ?? 0) : 0), 0) || '–'}
                    </td>
                    <td className="px-1 text-center">
                      <span className="text-caption font-bold text-ink-dim tabular-nums">{race.holes ? race.ghostSum : '–'}</span>
                      {race.holes > 0 && (
                        <span
                          className={`block text-caption font-extrabold tabular-nums ${
                            race.diff < 0 ? 'text-green' : race.diff > 0 ? 'text-flag' : 'text-ink-faint'
                          }`}
                        >
                          {fmtDiff(race.diff)}
                        </span>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {(pars || strokeDots) && (
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-line px-3 py-2 text-caption text-ink-faint">
          <MarkLegend pars={!!pars} strokeLabel={strokeDots ? 'stroke given, off the low handicap' : undefined} />
        </div>
      )}
    </Card>
  )
}

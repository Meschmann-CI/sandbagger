import { useMemo } from 'react'
import { useStore } from '../data/store'
import { holeOrdinal, roundStory, storyLabel } from '../lib/roundStory'
import type { Round } from '../types'
import { Card, SectionLabel } from './ui'

// "How it went", under the podium on a round with full cards (2026-11-09):
// a line per golfer, their score to par after each hole, the winner's
// heavier, and up to three holes worth naming under it. Nothing shows for
// a round entered as totals. Same as RoundStory.swift.

const W = 358
const H = 196
const LEFT = 26
const RIGHT = 72
const TOP = 12
const BOTTOM = 24

export default function RoundStory({ round }: { round: Round }) {
  const { data } = useStore()
  const story = useMemo(() => roundStory(data, round), [data, round])
  if (!story) return null

  const player = (id: string) => data.players.find((p) => p.id === id)
  const first = (id: string) => player(id)?.name.trim().split(/\s+/)[0] ?? '?'
  const all = story.lines.flatMap((l) => l.points)
  const lo = Math.min(0, ...all)
  const hi = Math.max(1, ...all)
  const x = (hole: number) => LEFT + (hole / 17) * (W - LEFT - RIGHT)
  const y = (v: number) => TOP + ((v - lo) / (hi - lo)) * (H - TOP - BOTTOM)
  const step = [1, 2, 3, 5, 10, 20].find((s) => (hi - lo) / s <= 5) ?? 50
  const ticks: number[] = []
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t)

  // Names at the line ends, nudged apart so two close finishes don't overlap.
  const ends = story.lines
    .map((l) => ({ id: l.playerId, final: l.final, y: y(l.points[17]) }))
    .sort((a, b) => a.y - b.y)
  ends.forEach((e, i) => {
    if (i > 0 && e.y - ends[i - 1].y < 13) e.y = ends[i - 1].y + 13
  })

  // The winner's line goes on last, over the others.
  const drawn = [...story.lines].sort((a, b) => (a.playerId === story.winnerId ? 1 : 0) - (b.playerId === story.winnerId ? 1 : 0))
  const label = `${story.net ? 'Net score' : 'Score'} to par after each hole. ${story.lines.map((l) => `${first(l.playerId)} finished ${storyLabel(l.final)}`).join(', ')}.`

  return (
    <>
      <SectionLabel action={<span className="text-caption text-ink-faint">{story.net ? 'Net to par' : 'To par'}, hole by hole</span>}>How it went</SectionLabel>
      <Card className="overflow-hidden">
        <div className="px-4 pt-3 pb-1">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block w-full">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={LEFT - 4} x2={W - RIGHT + 6} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
                <text x={0} y={y(t) + 3.5} fontSize={10} fill="var(--color-ink-faint)">
                  {storyLabel(t)}
                </text>
              </g>
            ))}
            {/* The turn. */}
            <line x1={(x(8) + x(9)) / 2} x2={(x(8) + x(9)) / 2} y1={TOP - 4} y2={H - BOTTOM + 4} stroke="var(--color-line-strong)" strokeWidth={1} strokeDasharray="3 4" />
            {[0, 8, 9, 17].map((h) => (
              <text key={h} x={x(h)} y={H - 6} fontSize={10} fill="var(--color-ink-faint)" textAnchor="middle">
                {h + 1}
              </text>
            ))}
            {drawn.map((l) => (
              <polyline
                key={l.playerId}
                fill="none"
                stroke={player(l.playerId)?.color ?? 'var(--color-ink-dim)'}
                strokeWidth={l.playerId === story.winnerId ? 3.5 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={l.points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
              />
            ))}
            {story.beats.map((b, i) => {
              const line = story.lines.find((l) => l.playerId === b.playerId)
              if (!line) return null
              const blowup = b.kind === 'blowup'
              return (
                <circle
                  key={i}
                  cx={x(b.hole)}
                  cy={y(line.points[b.hole])}
                  r={5}
                  fill={blowup ? 'var(--color-flag)' : 'var(--color-card)'}
                  stroke={blowup ? 'var(--color-card)' : (player(b.playerId)?.color ?? 'var(--color-ink)')}
                  strokeWidth={blowup ? 2 : 2.5}
                />
              )
            })}
            {ends.map((e) => (
              <text key={e.id} x={x(17) + 9} y={Math.min(H - BOTTOM + 4, e.y) + 3.5} fontSize={11} fontWeight={e.id === story.winnerId ? 800 : 600} fill="var(--color-ink)">
                {first(e.id)} {storyLabel(e.final)}
              </text>
            ))}
          </svg>
        </div>
        {story.beats.length > 0 && (
          <div className="divide-y divide-line border-t border-line">
            {story.beats.map((b, i) => (
              <div key={i} className="flex gap-3 px-4 py-2.5 text-footnote leading-snug">
                <span className={`w-9 shrink-0 font-extrabold tabular-nums ${b.kind === 'blowup' ? 'text-flag' : 'text-ink'}`}>{holeOrdinal(b.hole)}</span>
                <span className="text-ink">{b.text}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}

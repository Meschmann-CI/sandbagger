import { useEffect, useState } from 'react'
import { cardSlice, liveLines, toParLabel } from '../lib/spectate'
import { courseForRound, hasPars, padded, scoreKind } from '../lib/courses'
import { cardOf } from '../lib/holes'
import { prettyDate } from '../lib/stats'
import { SCORE_MARK } from '../components/scoreMarks'
import { Avatar, Card, LIVE_YELLOW, SectionLabel } from '../components/ui'
import { dataFromView, fetchWatchView, type WatchView } from '../lib/watchLink'

// The page behind a shared link: the round for whoever has the link, no
// account. The same last-three-holes card as WatchRound.tsx, read from
// the `watch` Edge Function and asked for again every half minute while
// the round is going. No chirps, no money: just where everyone stands.

const EVERY_MS = 30_000

export default function PublicWatch({ linkKey }: { linkKey: string }) {
  const [view, setView] = useState<WatchView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const pull = () =>
      fetchWatchView(linkKey)
        .then((v) => live && (setView(v), setError(null)))
        .catch((e: Error) => live && setError(e.message))
    void pull()
    const t = setInterval(pull, EVERY_MS)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [linkKey])

  // A failed refresh keeps the last view; only a page that never loaded shows the error.
  if (error && !view) {
    return (
      <Shell>
        <p className="px-1 pt-10 text-body font-bold text-ink">{error}</p>
        <p className="px-1 pt-2 text-footnote text-ink-dim">Ask whoever sent it for a fresh one.</p>
      </Shell>
    )
  }
  if (!view) {
    return (
      <Shell>
        <p className="px-1 pt-10 text-body text-ink-dim">Loading the round…</p>
      </Shell>
    )
  }

  const { data, round } = dataFromView(view)
  const name = (pid: string) => data.players.find((p) => p.id === pid)?.name ?? '?'
  const player = (pid: string) => data.players.find((p) => p.id === pid)
  const course = courseForRound(data, round)
  const pars = hasPars(course) ? padded(course.pars) : null
  const lines = liveLines(data, round)
  const slice = cardSlice(round)
  const lastHole = Math.max(0, ...lines.map((l) => l.thru))
  const finished = round.players.length > 0 && round.players.every((rp) => cardOf(rp).every((h) => h != null))

  return (
    <Shell>
      <header className="-mx-4 -mt-3 bg-[#141816] px-5 pb-4 pt-5 text-white">
        <p className="flex items-center gap-1.5 text-footnote font-bold" style={{ color: LIVE_YELLOW }}>
          {!finished && (
            <span className="relative flex h-[7px] w-[7px]">
              <span className="live-ping absolute inset-0 rounded-full" style={{ backgroundColor: LIVE_YELLOW }} />
              <span className="relative h-[7px] w-[7px] rounded-full" style={{ backgroundColor: LIVE_YELLOW }} />
            </span>
          )}
          {finished ? 'Final' : lastHole ? `Live · thru ${lastHole}` : 'On the first tee'}
        </p>
        <h1 className="mt-1 text-title font-bold tracking-tight">{round.courseName}</h1>
        <p className="text-footnote text-white/70">
          {prettyDate(round.date)} · {round.players.map((p) => name(p.playerId)).join(', ')}
        </p>
      </header>

      <SectionLabel>The last three holes</SectionLabel>
      <Card className="overflow-hidden">
        <table className="w-full border-collapse text-footnote tabular-nums">
          <thead>
            <tr className="bg-forest text-on-forest">
              <th className="py-1.5 pl-3 text-left text-caption font-bold">Hole</th>
              {slice.map((h) => (
                <th key={h} className="py-1.5 text-center text-caption font-bold">
                  {h + 1}
                </th>
              ))}
              <th className="py-1.5 pr-3 text-right text-caption font-bold">Score</th>
            </tr>
          </thead>
          <tbody>
            {pars && slice.length > 0 && (
              <tr className="text-caption text-ink-faint">
                <td className="py-1 pl-3">Par</td>
                {slice.map((h) => (
                  <td key={h} className="py-1 text-center">
                    {pars[h] ?? ''}
                  </td>
                ))}
                <td />
              </tr>
            )}
            {lines.map((l) => {
              const rp = round.players.find((p) => p.playerId === l.playerId)!
              const card = cardOf(rp)
              const p = player(l.playerId)
              return (
                <tr key={l.playerId} className="border-t border-line">
                  <td className="py-2 pl-3">
                    <span className="flex items-center gap-2">
                      {p && <Avatar player={p} size={22} />}
                      <span className="truncate font-bold text-ink">{name(l.playerId)}</span>
                    </span>
                  </td>
                  {slice.map((h) => {
                    const v = card[h]
                    const par = pars?.[h]
                    const style = v != null && par != null ? SCORE_MARK[scoreKind(v, par)] : 'font-bold text-ink'
                    return (
                      <td key={h} className="py-2 text-center">
                        {v == null ? <span className="text-ink-faint">–</span> : <span className={`inline-flex h-6 w-6 items-center justify-center ${style}`}>{v}</span>}
                      </td>
                    )
                  })}
                  <td className="py-2 pr-3 text-right">
                    <span className="block text-headline font-extrabold leading-tight text-ink">{l.thru ? toParLabel(l) : rp.gross != null ? String(rp.gross) : '–'}</span>
                    <span className="text-caption text-ink-faint">{l.thru ? (l.thru === 18 ? 'F' : `thru ${l.thru}`) : rp.gross != null ? 'total' : 'not started'}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 px-1 text-caption text-ink-faint">{finished ? 'Every card is in.' : 'Updates on its own as the scores go in.'} Bandit, the group’s own app.</p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-dvh max-w-md px-4 pt-3 pb-10">{children}</div>
}

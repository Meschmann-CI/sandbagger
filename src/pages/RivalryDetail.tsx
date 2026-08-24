import { Link, useNavigate, useParams } from 'react-router-dom'
import { useGoBack } from '../lib/nav'
import { useStore } from '../data/store'
import { fmt1, hasScore, net, type ScoredRoundPlayer } from '../types'
import { byDate, headToHead, prettyDate, shortDate } from '../lib/stats'
import { Avatar, Card, RowButton, SectionLabel } from '../components/ui'

export default function RivalryDetail() {
  const { aId, bId } = useParams()
  const navigate = useNavigate()
  const goBack = useGoBack('/h2h')
  const { data } = useStore()
  const a = data.players.find((p) => p.id === aId)
  const b = data.players.find((p) => p.id === bId)

  if (!a || !b) {
    return (
      <div className="pt-16 text-center text-ink-dim">
        Rivalry not found. <Link to="/h2h" className="text-green font-bold">Back to head-to-head</Link>
      </div>
    )
  }

  const h = headToHead(data, a.id, b.id)
  // A meeting needs both scores posted, matching how the record is counted.
  const meetings = byDate(data.rounds)
    .filter(
      (r) =>
        r.players.some((p) => p.playerId === a.id && hasScore(p)) &&
        r.players.some((p) => p.playerId === b.id && hasScore(p)),
    )
    .reverse()

  const streakLine =
    h.aStreak >= 2
      ? `${a.name} has won ${h.aStreak} straight.`
      : h.aStreak <= -2
        ? `${b.name} has won ${-h.aStreak} straight.`
        : h.lastWinnerId
          ? `${data.players.find((p) => p.id === h.lastWinnerId)!.name} took the last one.`
          : 'Nothing on the books yet.'

  const droughtLine =
    h.aStreak >= 2 && h.lastBWinDate
      ? `${b.name} has not beaten ${a.name} since ${prettyDate(h.lastBWinDate)}.`
      : h.aStreak <= -2 && h.lastAWinDate
        ? `${a.name} has not beaten ${b.name} since ${prettyDate(h.lastAWinDate)}.`
        : h.aWins > 0 && h.bWins === 0 && h.aWins >= 2
          ? `${b.name} has literally never beaten ${a.name}.`
          : h.bWins > 0 && h.aWins === 0 && h.bWins >= 2
            ? `${a.name} has literally never beaten ${b.name}.`
            : null

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <button onClick={() => goBack()} className="text-[13px] font-bold text-ink-faint mb-3">← Back</button>
      </header>

      {/* Tale of the tape */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center gap-2 w-24">
            <Avatar player={a} size={56} />
            <p className="font-bold text-[14px] text-ink text-center">{a.name}</p>
          </div>
          <div className="text-center">
            <p className="text-[42px] font-extrabold text-ink leading-none tracking-tight tabular-nums">
              {h.aWins}<span className="text-ink-faint mx-2 text-[26px]">–</span>{h.bWins}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-faint mt-2">
              Lifetime{h.ties > 0 ? ` · ${h.ties} tied` : ''}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 w-24">
            <Avatar player={b} size={56} />
            <p className="font-bold text-[14px] text-ink text-center">{b.name}</p>
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-line text-center space-y-1.5">
          <p className="text-[14.5px] font-bold text-ink">{streakLine}</p>
          {droughtLine && <p className="text-[12.5px] text-flag font-semibold">{droughtLine}</p>}
        </div>
      </Card>

      {h.biggestMargin && (
        <Card className="mt-3 p-4 flex items-center gap-3.5">
          <span className="text-2xl">💥</span>
          <div>
            <p className="text-[13.5px] font-bold text-ink">
              Biggest blowout: {data.players.find((p) => p.id === h.biggestMargin!.winnerId)!.name} by {fmt1(h.biggestMargin.margin)}
            </p>
            <p className="text-[12px] text-ink-faint">
              {h.biggestMargin.round.courseName}, {shortDate(h.biggestMargin.round.date)}
            </p>
          </div>
        </Card>
      )}

      <SectionLabel>Every Meeting</SectionLabel>
      <Card className="divide-y divide-line">
        {meetings.length === 0 && <p className="p-5 text-center text-[13.5px] text-ink-dim">These two have never been in the same round.</p>}
        {meetings.map((r) => {
          const ra = r.players.find((p) => p.playerId === a.id) as ScoredRoundPlayer
          const rb = r.players.find((p) => p.playerId === b.id) as ScoredRoundPlayer
          const diff = net(ra) - net(rb)
          const winner = diff === 0 ? null : diff < 0 ? a : b
          return (
            <RowButton key={r.id} onClick={() => navigate(`/rounds/${r.id}`)} className="block px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13.5px] font-bold text-ink truncate">{r.courseName}</p>
                <p className="text-[10.5px] text-ink-faint shrink-0 tabular-nums">{shortDate(r.date)}</p>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[12.5px] text-ink-dim">
                  {winner ? (
                    <>
                      <span style={{ color: winner.color }} className="font-extrabold">{winner.name}</span> by {fmt1(Math.abs(diff))}
                    </>
                  ) : (
                    'Dead even'
                  )}
                </p>
                <p className="text-[12.5px] text-ink-dim tabular-nums">
                  {fmt1(net(ra))} <span className="text-ink-faint">vs</span> {fmt1(net(rb))}
                </p>
              </div>
            </RowButton>
          )
        })}
      </Card>
      <div className="h-4" />
    </div>
  )
}

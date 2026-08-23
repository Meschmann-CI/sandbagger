import { useNavigate } from 'react-router-dom'
import { useMembers, useStore } from '../data/store'
import { headToHead, leaderboard, saddamState, shortDate, trashTalk } from '../lib/stats'
import { Avatar, Card, MoneyBadge, SaddamBadge, SectionLabel } from '../components/ui'

// Head-to-head records. Deliberately tucked behind Home/Profile — the
// receipts are all here for when the group actually plays together.

export default function Ledger() {
  const { data } = useStore()
  const members = useMembers()
  const navigate = useNavigate()
  const board = leaderboard(data)
  const saddam = saddamState(data)
  const holder = data.players.find((p) => p.id === saddam.holderId)
  const talk = trashTalk(data)

  // Only pairs who have actually played together — an empty 0–0 card
  // adds nothing as the group grows.
  const pairs: [string, string][] = []
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const h = headToHead(data, members[i].id, members[j].id)
      if (h.aWins + h.bWins + h.ties > 0) pairs.push([members[i].id, members[j].id])
    }
  }

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <button onClick={() => navigate(-1)} className="text-[13px] font-bold text-ink-faint mb-2">← Back</button>
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink">Head-to-Head</h1>
        <p className="text-[13px] text-ink-dim">Group rounds only. The record is permanent.</p>
      </header>

      {holder && (
        <Card className="mt-2 p-4 flex items-center gap-3.5 border-gold/30 bg-gold-soft/40">
          <SaddamBadge size={24} />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] text-ink">
              <span className="font-extrabold">{holder.name}</span> holds the Saddam
            </p>
            <p className="text-[12px] text-ink-dim mt-0.5">
              Since {saddam.since && shortDate(saddam.since)}
              {saddam.courseName && ` · ${saddam.courseName}`}
            </p>
          </div>
          <Avatar player={holder} size={34} />
        </Card>
      )}

      {talk.length > 0 && (
        <Card className="mt-3 p-4 border-l-4 border-l-flag/50">
          <p className="text-[14px] font-bold text-ink leading-snug">
            {talk[(data.rounds.length + talk.length) % talk.length]}
          </p>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint mt-1.5">The ledger never lies</p>
        </Card>
      )}

      <SectionLabel>Group Leaderboard</SectionLabel>
      <Card>
        <div className="grid grid-cols-[1fr_repeat(4,auto)] gap-x-3.5 px-4 py-2.5 border-b border-line text-[9.5px] font-bold uppercase tracking-wider text-ink-faint">
          <span>Player</span>
          <span className="w-8 text-right">W</span>
          <span className="w-8 text-right">Rds</span>
          <span className="w-9 text-right">Avg</span>
          <span className="w-9 text-right">Best</span>
        </div>
        {board.map((row, i) => (
          <div key={row.player.id} className="grid grid-cols-[1fr_repeat(4,auto)] gap-x-3.5 items-center px-4 py-3.5 border-b border-line last:border-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`font-extrabold text-[15px] w-4 tabular-nums ${i === 0 ? 'text-gold' : 'text-ink-faint'}`}>{i + 1}</span>
              <Avatar player={row.player} size={32} />
              <div className="min-w-0">
                <p className="font-bold text-[14px] text-ink truncate flex items-center gap-1.5">
                  {row.player.name}
                  {saddam.holderId === row.player.id && <SaddamBadge size={13} />}
                </p>
                {row.streak >= 2 && <p className="text-[10.5px] text-green font-bold">{row.streak} straight 🔥</p>}
              </div>
            </div>
            <span className="w-8 text-right text-[15px] font-extrabold text-ink tabular-nums">{row.wins}</span>
            <span className="w-8 text-right text-[13px] text-ink-dim tabular-nums">{row.rounds}</span>
            <span className="w-9 text-right text-[13px] text-ink-dim tabular-nums">{row.avgGross ? row.avgGross.toFixed(1) : '—'}</span>
            <span className="w-9 text-right text-[13px] font-bold text-green tabular-nums">{row.bestGross ?? '—'}</span>
          </div>
        ))}
      </Card>
      <p className="text-[11px] text-ink-faint px-2 mt-1.5">W = group-round wins. Solo rounds count toward Rds, Avg, and Best.</p>

      <SectionLabel>All-Time Money</SectionLabel>
      <Card className="divide-y divide-line">
        {[...board]
          .sort((a, b) => b.money - a.money)
          .map((row) => (
            <div key={row.player.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar player={row.player} size={30} />
              <span className="flex-1 text-[14px] font-bold text-ink">{row.player.name}</span>
              <MoneyBadge amount={row.money} className="text-[15px]" />
            </div>
          ))}
      </Card>

      <SectionLabel>Rivalries</SectionLabel>
      <div className="space-y-3">
        {pairs.map(([aId, bId]) => {
          const a = data.players.find((p) => p.id === aId)!
          const b = data.players.find((p) => p.id === bId)!
          const h = headToHead(data, aId, bId)
          const total = h.aWins + h.bWins + h.ties
          const leader = h.aWins === h.bWins ? null : h.aWins > h.bWins ? a : b
          return (
            <Card key={`${aId}-${bId}`} onClick={() => navigate(`/h2h/${aId}/${bId}`)} className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Avatar player={a} size={34} />
                  <span className={`text-[14px] truncate ${leader?.id === a.id ? 'font-extrabold text-ink' : 'text-ink-dim'}`}>{a.name}</span>
                </div>
                <div className="text-center shrink-0">
                  <p className="text-[19px] font-extrabold text-ink tracking-wide tabular-nums">
                    {h.aWins}<span className="text-ink-faint text-[13px] mx-1">–</span>{h.bWins}
                  </p>
                  {h.ties > 0 && <p className="text-[9.5px] text-ink-faint tabular-nums">{h.ties} tied</p>}
                </div>
                <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
                  <span className={`text-[14px] truncate ${leader?.id === b.id ? 'font-extrabold text-ink' : 'text-ink-dim'}`}>{b.name}</span>
                  <Avatar player={b} size={34} />
                </div>
              </div>
              {total > 0 && (
                <div className="mt-3 h-1.5 rounded-full bg-paper border border-line overflow-hidden flex">
                  <div className="h-full" style={{ width: `${(h.aWins / total) * 100}%`, background: a.color }} />
                  <div className="h-full bg-line-strong" style={{ width: `${(h.ties / total) * 100}%` }} />
                  <div className="h-full" style={{ width: `${(h.bWins / total) * 100}%`, background: b.color }} />
                </div>
              )}
            </Card>
          )
        })}
      </div>
      <div className="h-4" />
    </div>
  )
}

import { Fragment, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoBack } from '../lib/nav'
import { BackButton } from '../components/Nav'
import type { Player } from '../types'
import { useMembers, useStore } from '../data/store'
import { headToHead, leaderboard, saddamState, shortDate, trashTalk } from '../lib/stats'
import { Avatar, Card, MoneyBadge, SaddamBadge, SectionLabel } from '../components/ui'
import { Icon } from '../components/icons'
import { StreakContext } from '../components/streakContext'

// Head-to-head records. Deliberately tucked behind Home/Profile — the
// receipts are all here for when the group actually plays together.

export default function Ledger() {
  const { data } = useStore()
  const members = useMembers()
  const navigate = useNavigate()
  const goBack = useGoBack('/rounds')
  const board = leaderboard(data)
  const saddam = saddamState(data)
  const holder = data.players.find((p) => p.id === saddam.holderId)
  const talk = trashTalk(data)
  const streaks = useContext(StreakContext)

  // Only pairs who have actually played together — an empty 0–0 card
  // adds nothing as the group grows.
  const pairs: [string, string][] = []
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const h = headToHead(data, members[i].id, members[j].id)
      if (h.aWins + h.bWins + h.ties > 0) pairs.push([members[i].id, members[j].id])
    }
  }

  // Everyone in at least one rivalry, in leaderboard order, for the grid.
  const inPairs = new Set(pairs.flat())
  const gridPlayers = board.map((row) => row.player).filter((p) => inPairs.has(p.id))

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <BackButton fallback="/rounds" onBack={goBack} />
        <h1 className="text-large font-bold tracking-tight text-ink">Head-to-Head</h1>
        <p className="text-footnote text-ink-dim">Group rounds only. The record is permanent.</p>
      </header>

      <Card onClick={() => navigate('/saddam')} className="mt-2 p-4 flex items-center gap-3.5 border-cream-deep/60 bg-cream">
        <SaddamBadge size={24} />
        <div className="flex-1 min-w-0">
          {holder ? (
            <>
              <p className="text-body text-ink">
                <span className="font-bold">{holder.name}</span> holds the Saddam
              </p>
              <p className="text-footnote text-ink-dim mt-0.5">
                Since {saddam.since && shortDate(saddam.since)}
                {saddam.courseName && ` · ${saddam.courseName}`}
              </p>
            </>
          ) : (
            <>
              <p className="text-body font-bold text-ink">Nobody holds the Saddam</p>
              <p className="text-footnote text-ink-dim mt-0.5">Tap to hand it over or see the history</p>
            </>
          )}
        </div>
        {holder ? <Avatar player={holder} size={34} /> : <span className="text-footnote font-bold text-green">Set it →</span>}
      </Card>

      {talk.length > 0 && (
        <Card className="mt-3 p-4 border-l-4 border-l-flag/50">
          <p className="text-body font-bold text-ink leading-snug">
            {talk[(data.rounds.length + talk.length) % talk.length]}
          </p>
          <p className="text-caption font-semibold uppercase tracking-wider text-ink-faint mt-1.5">The ledger never lies</p>
        </Card>
      )}

      <SectionLabel>Group leaderboard</SectionLabel>
      <Card>
        <div className="grid grid-cols-[1fr_repeat(4,auto)] gap-x-3.5 px-4 py-2.5 border-b border-line text-caption font-semibold uppercase tracking-wider text-ink-faint">
          <span>Player</span>
          <span className="w-8 text-right">W</span>
          <span className="w-8 text-right">Rds</span>
          <span className="w-9 text-right">Avg</span>
          <span className="w-9 text-right">Best</span>
        </div>
        {board.map((row, i) => (
          <div key={row.player.id} className="grid grid-cols-[1fr_repeat(4,auto)] gap-x-3.5 items-center px-4 py-3.5 border-b border-line last:border-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`font-extrabold text-body w-4 tabular-nums ${i === 0 ? 'text-gold' : 'text-ink-faint'}`}>{i + 1}</span>
              <Avatar player={row.player} size={32} />
              <div className="min-w-0">
                <p className="font-bold text-body text-ink truncate flex items-center gap-1.5">
                  {row.player.name}
                  {saddam.holderId === row.player.id && <SaddamBadge size={13} />}
                </p>
                {row.streak >= 2 ? (
                  <p className="flex items-center gap-0.5 text-caption text-green font-bold">
                    {row.streak} straight <Icon name="flame" size={12} className="text-flag" />
                  </p>
                ) : (
                  streaks.get(row.player.id)?.kind === 'cold' && (
                    <p
                      className="flex items-center gap-0.5 whitespace-nowrap text-caption text-sky font-bold"
                      title={`${streaks.get(row.player.id)!.count} group rounds without a win`}
                    >
                      {streaks.get(row.player.id)!.count} winless <Icon name="snowflake" size={12} strokeWidth={2.2} />
                    </p>
                  )
                )}
              </div>
            </div>
            <span className="w-8 text-right text-body font-extrabold text-ink tabular-nums">{row.wins}</span>
            <span className="w-8 text-right text-footnote text-ink-dim tabular-nums">{row.rounds}</span>
            <span className="w-9 text-right text-footnote text-ink-dim tabular-nums">{row.avgGross ? row.avgGross.toFixed(1) : '—'}</span>
            <span className="w-9 text-right text-footnote font-bold text-green tabular-nums">{row.bestGross ?? '—'}</span>
          </div>
        ))}
      </Card>
      <p className="text-caption text-ink-faint px-2 mt-1.5">W = group-round wins. Solo rounds count toward Rds, Avg, and Best.</p>

      <SectionLabel>All-time money</SectionLabel>
      <Card className="divide-y divide-line">
        {[...board]
          .sort((a, b) => b.money - a.money)
          .map((row) => (
            <div key={row.player.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar player={row.player} size={30} />
              <span className="flex-1 text-body font-bold text-ink">{row.player.name}</span>
              <MoneyBadge amount={row.money} className="text-body" />
            </div>
          ))}
      </Card>

      <SectionLabel>Rivalries</SectionLabel>
      {pairs.length === 0 && (
        <Card className="p-5 text-center text-footnote text-ink-dim">
          Nothing to settle yet. Records start the first time two of you play the same round.
        </Card>
      )}
      {pairs.length > 0 && gridPlayers.length <= 6 ? (
        <RivalryGrid players={gridPlayers} onOpen={(a, b) => navigate(`/h2h/${a}/${b}`)} />
      ) : (
        <div className="space-y-3">
          {pairs.map(([aId, bId]) => {
            const a = data.players.find((p) => p.id === aId)!
            const b = data.players.find((p) => p.id === bId)!
            const h = headToHead(data, aId, bId)
            const leader = h.aWins === h.bWins ? null : h.aWins > h.bWins ? a : b
            return (
              <Card key={`${aId}-${bId}`} onClick={() => navigate(`/h2h/${aId}/${bId}`)} className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Avatar player={a} size={34} />
                    <span className={`text-body truncate ${leader?.id === a.id ? 'font-bold text-ink' : 'text-ink-dim'}`}>{a.name}</span>
                  </div>
                  <p className="text-headline font-extrabold text-ink tracking-wide tabular-nums shrink-0">
                    {h.aWins}<span className="text-ink-faint text-footnote mx-1">–</span>{h.bWins}
                  </p>
                  <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
                    <span className={`text-body truncate ${leader?.id === b.id ? 'font-bold text-ink' : 'text-ink-dim'}`}>{b.name}</span>
                    <Avatar player={b} size={34} />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
      <div className="h-4" />
    </div>
  )
}

// Every rivalry in one grid: read across a row for that golfer's record
// against each of the others. Six stacked cards took 1,900px of scrolling
// to say what sixteen cells say at a glance. A cell leans green the more
// its row leads the matchup, gray when it trails, cream when it's level.
function RivalryGrid({ players, onOpen }: { players: Player[]; onOpen: (a: string, b: string) => void }) {
  const { data } = useStore()
  return (
    <Card className="p-3">
      <div className="grid gap-1" style={{ gridTemplateColumns: `36px repeat(${players.length}, minmax(0, 1fr))` }}>
        <span />
        {players.map((p) => (
          <span key={p.id} className="flex justify-center pb-1">
            <Avatar player={p} size={28} />
          </span>
        ))}
        {players.map((row) => (
          <Fragment key={row.id}>
            <span className="flex items-center">
              <Avatar player={row} size={28} />
            </span>
            {players.map((col) => {
              if (col.id === row.id) {
                return <span key={col.id} className="rounded-lg bg-[repeating-linear-gradient(45deg,var(--color-line)_0_3px,transparent_3px_7px)] opacity-60" />
              }
              const h = headToHead(data, row.id, col.id)
              const played = h.aWins + h.bWins + h.ties
              const lead = h.aWins - h.bWins
              const style =
                played === 0
                  ? undefined
                  : lead > 0
                    ? { background: `color-mix(in srgb, var(--color-green) ${Math.min(10 + lead * 6, 34)}%, var(--color-card))` }
                    : lead < 0
                      ? { background: `color-mix(in srgb, var(--color-ink) ${Math.min(4 + -lead * 2, 12)}%, var(--color-card))` }
                      : { background: 'var(--color-cream)' }
              return (
                <button
                  key={col.id}
                  type="button"
                  disabled={played === 0}
                  onClick={() => onOpen(row.id, col.id)}
                  style={style}
                  aria-label={`${row.name} against ${col.name}: ${h.aWins} to ${h.bWins}${h.ties ? `, ${h.ties} tied` : ''}`}
                  className={`flex h-12 flex-col items-center justify-center rounded-lg tabular-nums transition active:scale-95 ${
                    played === 0 ? 'text-ink-faint' : lead > 0 ? 'text-green-deep' : 'text-ink-dim'
                  }`}
                >
                  <span className="text-body font-extrabold leading-none tabular-nums">
                    {played === 0 ? '·' : `${h.aWins}–${h.bWins}`}
                  </span>
                  {h.ties > 0 && <span className="mt-0.5 text-caption leading-none tabular-nums">{h.ties} tied</span>}
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>
      <p className="mt-2.5 px-1 text-caption text-ink-faint">Read across: each row's record against the golfer above. Tap one for the whole rivalry.</p>
    </Card>
  )
}

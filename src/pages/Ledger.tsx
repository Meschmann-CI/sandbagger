import { Fragment, useState } from 'react'
import { useNavigate } from '../lib/nav'
import { isGroupRound, net, scored, type AppData, type Player, type Round } from '../types'
import { useMembers, useStore } from '../data/store'
import { byDate, headToHead, leaderboard, roundStandings, saddamReigns, saddamState, shortDate, trashTalk, type LeaderRow } from '../lib/stats'
import { indexHistory } from '../lib/badges'
import { money } from '../lib/money'
import { coursePar, courseForRound, playingHandicap } from '../lib/courses'
import { Avatar, Card, HelpTip, SaddamIcon, SectionLabel } from '../components/ui'
import { Icon } from '../components/icons'
import { todayISO } from '../lib/dates'
import { meterLine, meterVerdict, sandbagBoard } from '../lib/sandbagMeter'

// Standings, a tab of its own: the season (or all time) on the group's
// terms. The Saddam up top as a band, then the table with each golfer's
// form and which way they're moving, the money, your own rivalries, the
// records and the wall of shame, and where everyone's handicap has gone
// this year. Home has the race at a glance; this is the whole argument.

type Scope = 'season' | 'all'
type Form = 'win' | 'podium' | 'mid' | 'last'
/** A round against your handicap: net par or better, within 3, or 4 or more over. */
type Play = 'beat' | 'close' | 'off'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const first = (name: string) => name.trim().split(/\s+/)[0]
const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${s}`
}
const shortCourse = (name: string) => name.replace(/ (Golf Course|Golf Club|Country Club|Golf Links)$/, '')

/** How a golfer finished each group round they played, oldest first. */
function formOf(groupRounds: Round[], playerId: string): Form[] {
  return groupRounds
    .filter((r) => scored(r).some((rp) => rp.playerId === playerId))
    .map((r) => {
      const st = roundStandings(r)
      const me = st.find((s) => s.playerId === playerId)!
      const worst = Math.max(...st.map((s) => s.rank))
      if (me.rank === 1) return 'win'
      if (me.rank === worst) return 'last'
      return me.rank <= 3 && st.length >= 3 ? 'podium' : 'mid'
    })
}

/** How a golfer played against their handicap in each round, oldest
 *  first: their score less the course handicap for that day's tees,
 *  against par. Solo rounds count; a course with no par yet can't say. */
function playOf(data: AppData, rounds: Round[], playerId: string): Play[] {
  const out: Play[] = []
  for (const r of rounds) {
    const rp = scored(r).find((x) => x.playerId === playerId)
    if (!rp) continue
    const course = courseForRound(data, r)
    const par = coursePar(course)
    if (par == null) continue
    const over = rp.gross - playingHandicap(course, rp.handicapSnapshot, r.tee) - par
    out.push(over <= 0 ? 'beat' : over <= 3 ? 'close' : 'off')
  }
  return out
}

/** The longest run of group rounds without a win, and whether it's still going. */
function longestDrought(form: Form[]): { length: number; current: boolean } {
  let best = 0
  let run = 0
  let bestEndsAtLast = false
  form.forEach((f, i) => {
    run = f === 'win' ? 0 : run + 1
    if (run > best) {
      best = run
      bestEndsAtLast = i === form.length - 1
    } else if (run === best && run > 0 && i === form.length - 1) {
      bestEndsAtLast = true
    }
  })
  return { length: best, current: bestEndsAtLast && run === best }
}

export default function Ledger() {
  const { data } = useStore()
  const members = useMembers()
  const navigate = useNavigate()
  const meterBoard = sandbagBoard(data, members.map((m) => m.id))
  const [scope, setScope] = useState<Scope>('season')
  const [showGrid, setShowGrid] = useState(false)
  const today = todayISO()
  const YEAR = today.slice(0, 4)

  // Everything below reads the rounds in scope, so the chips switch the
  // whole page at once.
  const scopeRounds = scope === 'season' ? data.rounds.filter((r) => r.date.startsWith(YEAR)) : data.rounds
  const scoped: AppData = { ...data, rounds: scopeRounds }
  const groupRounds = byDate(scopeRounds).filter(isGroupRound)
  const board = leaderboard(data, scopeRounds).filter((row) => row.rounds > 0)

  // Which way each golfer moved with the latest group round: the table as
  // it stood before that round, against the table now.
  const latest = groupRounds[groupRounds.length - 1]
  const before = latest ? leaderboard(data, scopeRounds.filter((r) => r.id !== latest.id)).filter((row) => row.rounds > 0) : []
  const moved = (id: string, now: number) => {
    if (groupRounds.length < 2) return 0
    const was = before.findIndex((row) => row.player.id === id)
    return was < 0 ? 0 : was - now
  }

  // ---- The Saddam ----
  const saddam = saddamState(data)
  const holder = data.players.find((p) => p.id === saddam.holderId)
  const reigns = saddamReigns(data, today)
  const reignNo = holder ? reigns.filter((r) => r.playerId === holder.id).length : 0
  const holdDays = reigns.at(-1)?.days ?? 0
  const talk = trashTalk(data)

  // ---- Money ----
  const scopeIds = new Set(scopeRounds.map((r) => r.id))
  const moneyRows = [...board].filter((row) => row.money !== 0).sort((a, b) => b.money - a.money)
  const maxMoney = Math.max(1, ...moneyRows.map((row) => Math.abs(row.money)))
  const biggestTake = data.bets
    .filter((b) => scopeIds.has(b.roundId))
    .flatMap((b) => b.results.map((res) => ({ bet: b, res })))
    .filter((x) => x.res.amount > 0)
    .sort((a, b) => b.res.amount - a.res.amount)[0]
  const takeRound = biggestTake ? data.rounds.find((r) => r.id === biggestTake.bet.roundId) : undefined
  const taker = biggestTake ? data.players.find((p) => p.id === biggestTake.res.playerId) : undefined

  // ---- Your rivalries ----
  const meId = data.currentUserId
  const rivals = members
    .filter((p) => p.id !== meId)
    .map((p) => ({ player: p, h: headToHead(scoped, meId, p.id) }))
    .filter((x) => x.h.aWins + x.h.bWins + x.h.ties > 0)
    .sort((a, b) => b.h.aWins + b.h.bWins + b.h.ties - (a.h.aWins + a.h.bWins + a.h.ties))

  // Every pair who has played together, for the full grid.
  const pairs: [string, string][] = []
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const h = headToHead(scoped, members[i].id, members[j].id)
      if (h.aWins + h.bWins + h.ties > 0) pairs.push([members[i].id, members[j].id])
    }
  }
  const inPairs = new Set(pairs.flat())
  const gridPlayers = board.map((row) => row.player).filter((p) => inPairs.has(p.id))

  // ---- Records ----
  const nameOf = (id: string) => first(data.players.find((p) => p.id === id)?.name ?? '?')
  const allScores = byDate(scopeRounds).flatMap((r) => scored(r).map((rp) => ({ r, rp })))
  const isMember = (id: string) => data.group.memberIds.includes(id)
  const memberScores = allScores.filter((x) => isMember(x.rp.playerId))
  const low = memberScores.reduce<(typeof memberScores)[number] | null>((m, x) => (!m || x.rp.gross < m.rp.gross ? x : m), null)
  const high = memberScores.reduce<(typeof memberScores)[number] | null>((m, x) => (!m || x.rp.gross > m.rp.gross ? x : m), null)
  const bestNet = memberScores.reduce<(typeof memberScores)[number] | null>((m, x) => (!m || net(x.rp) < net(m.rp) ? x : m), null)
  const blowout = groupRounds
    .map((r) => {
      const st = roundStandings(r)
      if (st.length < 2 || st[0].rank === st[1].rank) return null
      return { r, winner: st[0].playerId, second: st[1].playerId, margin: Math.round((st[1].netScore - st[0].netScore) * 10) / 10 }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.margin - a.margin)[0]
  const longestReign = [...reigns].sort((a, b) => b.days - a.days)[0]
  const drought = members
    .map((p) => ({ player: p, ...longestDrought(formOf(groupRounds, p.id)) }))
    .sort((a, b) => b.length - a.length)[0]

  // ---- Handicaps this year ----
  const handicaps = members
    .map((p) => {
      const pts = indexHistory(data, p.id, p.handicap).filter((x) => x.date.startsWith(YEAR) || x.date === '9999-12-31')
      if (pts.length < 2) return null
      return { player: p, pts: pts.map((x) => x.index), change: Math.round((p.handicap - pts[0].index) * 10) / 10 }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
  // Four flat lines say nothing; the section waits until someone's index has moved.
  const anyMoved = handicaps.some((x) => Math.max(...x.pts) !== Math.min(...x.pts))

  return (
    <div className="rise">
      <header className="flex items-end justify-between gap-3 px-1 pt-5 pb-1">
        <h1 className="text-large font-bold tracking-tight text-ink">Standings</h1>
        <div className="flex gap-1.5">
          {(
            [
              ['season', YEAR],
              ['all', 'All-time'],
            ] as [Scope, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setScope(key)}
              className={`rounded-full border px-3.5 py-1.5 text-footnote font-bold transition ${
                scope === key ? 'border-ink bg-ink text-white' : 'border-line-strong bg-card text-ink-dim'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* The Saddam, as a band across the page: who has it, where they won
          it, which reign and what day. Its own page has every reign. */}
      <button
        type="button"
        onClick={() => navigate('/saddam')}
        className="saddam-stage -mx-4 mt-4 flex w-[calc(100%+2rem)] items-center gap-3.5 px-4 py-4 text-left text-on-forest active:opacity-90"
      >
        <span className={`shrink-0 rounded-[16px] bg-cream p-0.5 ${holder ? '' : 'opacity-60 grayscale'}`}>
          <SaddamIcon size={52} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-caption font-bold text-on-forest/70">The Saddam</span>
          <span className="block truncate text-title font-extrabold leading-tight tracking-tight">{holder ? holder.name : 'Up for grabs'}</span>
          <span className="block truncate text-footnote text-on-forest/80">
            {holder
              ? saddam.courseName
                ? `Won it at ${shortCourse(saddam.courseName)}, ${shortDate(saddam.since!).replace(/, \d{4}$/, '')}`
                : 'Handed over by the group'
              : 'Win a group round and it’s yours.'}
          </span>
        </span>
        {holder && (
          <span className="shrink-0 text-right">
            <span className="block text-caption text-on-forest/70">{ordinal(reignNo)} reign</span>
            <span className="block text-footnote font-bold">Day {holdDays + 1}</span>
          </span>
        )}
        <Icon name="chevronRight" size={16} className="shrink-0 text-on-forest/60" />
      </button>
      {talk.length > 0 && (
        <p className="px-1 pt-3 text-body font-bold leading-snug text-ink">{talk[(data.rounds.length + talk.length) % talk.length]}</p>
      )}

      {/* The table */}
      <SectionLabel
        action={
          <HelpTip
            title="How the table works"
            lines={[
              'Wins are group rounds (two or more scores posted) won on net. A tie at the top counts as a win for everyone tied.',
              'Avg counts every round, solo ones included.',
              'The squares are your last five rounds against your handicap, oldest first: dark green net par or better, beige within 3, red 4 or more over. Solo rounds count.',
              'The arrow is how far a golfer moved with the latest group round.',
            ]}
          />
        }
      >
        The table
      </SectionLabel>
      {board.length === 0 ? (
        <Card className="p-5 text-center text-footnote text-ink-dim">
          {scope === 'season' ? `No rounds in ${YEAR} yet. The first one starts the table.` : 'No rounds yet.'}
        </Card>
      ) : (
        <Card>
          <div className="grid grid-cols-[16px_32px_1fr_44px_40px_26px] items-center gap-x-3 border-b border-line px-4 py-2 text-caption font-bold text-ink-faint">
            <span className="col-span-3">Last 5 rounds vs your handicap</span>
            <span className="text-right">Avg</span>
            <span className="text-right">Wins</span>
            <span />
          </div>
          {board.map((row, i) => (
            <TableRow
              key={row.player.id}
              row={row}
              place={i}
              form={formOf(groupRounds, row.player.id)}
              play={playOf(data, byDate(scopeRounds), row.player.id).slice(-5)}
              move={moved(row.player.id, i)}
              isMe={row.player.id === meId}
            />
          ))}
        </Card>
      )}
      {board.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-caption text-ink-faint">
          {(
            [
              ['bg-green', 'Beat it'],
              ['bg-cream-deep', 'Within 3'],
              ['bg-flag/50', '4+ over'],
            ] as const
          ).map(([tone, label]) => (
            <span key={label} className="inline-flex items-center gap-1">
              <span className={`h-[9px] w-[9px] rounded-[3px] ${tone}`} />
              {label}
            </span>
          ))}
          <span>· oldest on the left</span>
        </p>
      )}

      {/* Money */}
      {moneyRows.length > 0 && (
        <>
          <SectionLabel>Money</SectionLabel>
          <Card className="px-4 pt-2 pb-3">
            {moneyRows.map((row) => {
              const w = `${Math.max(4, Math.round((Math.abs(row.money) / maxMoney) * 100))}%`
              return (
                <div key={row.player.id} className="grid h-8 grid-cols-[64px_1fr_1fr_60px] items-center">
                  <span className="truncate text-footnote font-bold text-ink">{first(row.player.name)}</span>
                  <span className="flex h-full items-center justify-end border-r border-line-strong">
                    {row.money < 0 && <span className="h-3 rounded-l bg-flag/45" style={{ width: w }} />}
                  </span>
                  <span className="flex h-full items-center">
                    {row.money > 0 && <span className="h-3 rounded-r bg-green/45" style={{ width: w }} />}
                  </span>
                  <span className={`text-right text-footnote font-extrabold tabular-nums ${row.money > 0 ? 'text-green' : 'text-flag'}`}>
                    {row.money > 0 ? '+' : '−'}
                    {money(Math.abs(row.money))}
                  </span>
                </div>
              )
            })}
            {biggestTake && taker && takeRound && (
              <p className="mt-2 text-footnote text-ink-dim">
                <span className="font-bold text-ink">Biggest single take:</span> {first(taker.name)}, {money(biggestTake.res.amount)} on the{' '}
                {biggestTake.bet.name} at {shortCourse(takeRound.courseName)}.
              </p>
            )}
          </Card>
        </>
      )}

      {/* Your rivalries */}
      {rivals.length > 0 && (
        <>
          <SectionLabel
            action={
              pairs.length > 0 && (
                <button onClick={() => setShowGrid((v) => !v)} className="text-footnote font-bold text-green">
                  {showGrid ? 'Hide the grid' : 'Every matchup'}
                </button>
              )
            }
          >
            Your rivalries
          </SectionLabel>
          <Card>
            <div className="divide-y divide-line">
              {rivals.map(({ player, h }) => {
                const theirs = first(player.name)
                const line =
                  h.aStreak >= 2
                    ? `You've won ${h.aStreak} straight`
                    : h.aStreak <= -2
                      ? `${theirs} has won ${-h.aStreak} straight`
                      : h.lastWinnerId
                        ? `${h.lastWinnerId === meId ? 'You' : theirs} took the last one, ${shortDate(h.lastWinDate!)}`
                        : 'All square so far'
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => navigate(`/h2h/${meId}/${player.id}`)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-ink/[0.04]"
                  >
                    <Avatar player={player} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-bold text-ink">vs {theirs}</span>
                      <span className="block truncate text-caption text-ink-faint">{line}</span>
                    </span>
                    {h.aStreak >= 3 && (
                      <span className="shrink-0 rounded-md bg-green-soft px-1.5 py-0.5 text-caption font-bold text-green">{h.aStreak} in a row</span>
                    )}
                    {h.aStreak <= -3 && (
                      <span className="shrink-0 rounded-md bg-flag-soft px-1.5 py-0.5 text-caption font-bold text-flag">Lost {-h.aStreak}</span>
                    )}
                    <span className="shrink-0 text-title font-extrabold tabular-nums tracking-tight text-ink">
                      {h.aWins}
                      <span className="mx-0.5 font-semibold text-ink-faint">–</span>
                      {h.bWins}
                    </span>
                  </button>
                )
              })}
            </div>
          </Card>
          {showGrid && (gridPlayers.length <= 6 ? <RivalryGrid players={gridPlayers} data={scoped} onOpen={(a, b) => navigate(`/h2h/${a}/${b}`)} /> : (
            <Card className="mt-3">
              <div className="divide-y divide-line">
                {pairs.map(([aId, bId]) => {
                  const a = data.players.find((p) => p.id === aId)!
                  const b = data.players.find((p) => p.id === bId)!
                  const h = headToHead(scoped, aId, bId)
                  return (
                    <button
                      key={`${aId}-${bId}`}
                      type="button"
                      onClick={() => navigate(`/h2h/${aId}/${bId}`)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-ink/[0.04]"
                    >
                      <span className="flex-1 truncate text-body text-ink">
                        {first(a.name)} vs {first(b.name)}
                      </span>
                      <span className="text-headline font-extrabold tabular-nums text-ink">
                        {h.aWins}–{h.bWins}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Card>
          ))}
        </>
      )}

      {/* Records, and the wall of shame */}
      {low && (
        <>
          <SectionLabel>Records</SectionLabel>
          <Card>
            <div className="grid grid-cols-2">
              <RecordCell label="Low round" value={String(low.rp.gross)} who={`${nameOf(low.rp.playerId)} · ${shortCourse(low.r.courseName)}`} />
              {bestNet && <RecordCell label="Best net" value={net(bestNet.rp).toFixed(1)} who={`${nameOf(bestNet.rp.playerId)} · ${shortCourse(bestNet.r.courseName)}`} />}
              {blowout && <RecordCell label="Biggest blowout" value={blowout.margin.toFixed(1)} who={`${nameOf(blowout.winner)} over ${nameOf(blowout.second)}`} />}
              {longestReign && (
                <RecordCell
                  label="Longest Saddam reign"
                  value={plural(longestReign.days, 'day')}
                  who={`${nameOf(longestReign.playerId)}${longestReign.current ? ', still going' : ''}`}
                />
              )}
            </div>
            {(high || (drought && drought.length >= 2)) && (
              <>
                <p className="px-4 pt-3 text-caption font-extrabold text-ink-dim">The wall of shame</p>
                <div className="grid grid-cols-2">
                  {high && <RecordCell shame label="High round" value={String(high.rp.gross)} who={`${nameOf(high.rp.playerId)} · ${shortCourse(high.r.courseName)}`} />}
                  {drought && drought.length >= 2 && (
                    <RecordCell
                      shame
                      label="Longest drought"
                      value={plural(drought.length, 'round')}
                      who={`${first(drought.player.name)} without a win${drought.current ? ', still going' : ''}`}
                    />
                  )}
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {/* The sandbagger meter: each golfer against the number they claim (lib/sandbagMeter.ts). */}
      {meterBoard.length > 0 && (
        <div className="mt-6">
          <SectionLabel>Sandbagger watch</SectionLabel>
          <Card className="divide-y divide-line">
            {meterBoard.map((m) => {
              const p = data.players.find((pl) => pl.id === m.playerId)
              if (!p) return null
              return (
                <div key={m.playerId} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar player={p} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-bold text-ink">
                      {p.name} <span className="ml-1 text-caption font-semibold text-ink-faint">{meterVerdict(m)}</span>
                    </p>
                    <p className="text-caption text-ink-dim">{meterLine(m)}</p>
                  </div>
                  <span className={`text-headline font-extrabold tabular-nums ${m.avgBy >= 2 ? 'text-flag' : m.avgBy >= 0.5 ? 'text-gold' : 'text-ink'}`}>
                    {m.avgBy > 0 ? '+' : ''}
                    {m.avgBy.toFixed(1)}
                  </span>
                </div>
              )
            })}
          </Card>
          <p className="mt-2 px-2 text-caption text-ink-faint">Net against par with the day’s course handicap, over the last ten rounds with a par. Plus means they beat their number.</p>
        </div>
      )}

      {/* Handicaps this year */}
      {anyMoved && (
        <>
          <SectionLabel>Handicaps this year</SectionLabel>
          <Card>
            <div className="divide-y divide-line">
              {handicaps.map(({ player, pts, change }) => (
                <div key={player.id} className="grid grid-cols-[32px_1fr_104px_56px] items-center gap-3 px-4 py-2.5">
                  <Avatar player={player} size={32} />
                  <span className="truncate text-body font-bold text-ink">{first(player.name)}</span>
                  <Spark values={pts} color={player.color} />
                  <span className="text-right">
                    <span className="block text-headline font-extrabold tabular-nums leading-tight text-ink">{player.handicap.toFixed(1)}</span>
                    <span className={`block text-caption font-bold tabular-nums ${change < 0 ? 'text-green' : change > 0 ? 'text-flag' : 'text-ink-faint'}`}>
                      {change === 0 ? 'even' : `${change < 0 ? '↓' : '↑'} ${Math.abs(change).toFixed(1)}`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <p className="mt-1.5 px-2 text-caption text-ink-faint">Down is good for a handicap, so down is green.</p>
        </>
      )}
      <div className="h-4" />
    </div>
  )
}

/** One golfer's line in the table: place, face, form squares, average, wins, and which way they moved. */
function TableRow({ row, place, form: all, play, move, isMe }: { row: LeaderRow; place: number; form: Form[]; play: Play[]; move: number; isMe: boolean }) {
  // Runs are counted over every group round in view, so the notes agree
  // with the chips; the squares show the last five.
  const run = (hit: (f: Form) => boolean) => {
    let n = 0
    for (let i = all.length - 1; i >= 0 && hit(all[i]); i--) n++
    return n
  }
  const lastRun = run((f) => f === 'last')
  const cold = run((f) => f !== 'win')
  const note =
    row.streak >= 2 ? (
      <span className="inline-flex items-center gap-0.5 text-green">
        {row.streak} straight <Icon name="flame" size={11} className="text-flag" />
      </span>
    ) : lastRun >= 2 ? (
      <span className="text-flag">last {lastRun} straight</span>
    ) : cold >= 3 ? (
      <span className="inline-flex items-center gap-0.5 text-sky">
        {cold} winless <Icon name="snowflake" size={11} strokeWidth={2.2} />
      </span>
    ) : null
  const tone: Record<Play, string> = { beat: 'bg-green', close: 'bg-cream-deep', off: 'bg-flag/50' }
  return (
    <div className="grid grid-cols-[16px_32px_1fr_44px_40px_26px] items-center gap-x-3 border-b border-line px-4 py-3 last:border-0">
      <span className={`text-body font-extrabold tabular-nums ${place === 0 ? 'text-gold' : 'text-ink-faint'}`}>{place + 1}</span>
      <Avatar player={row.player} size={32} />
      <span className="min-w-0">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-body font-bold text-ink">{row.player.name.split(' ')[0]}</span>
          {isMe && <span className="text-caption font-semibold text-ink-faint">(you)</span>}
          {note && <span className="whitespace-nowrap text-caption font-bold">{note}</span>}
        </span>
        <span className="mt-1 flex gap-[3px]" aria-label={`Last ${play.length} rounds against handicap: ${play.join(', ')}`}>
          {play.map((p, k) => (
            <span key={k} className={`h-[9px] w-[9px] rounded-[3px] ${tone[p]}`} />
          ))}
          {play.length === 0 && <span className="text-caption text-ink-faint">No rounds with a par yet</span>}
        </span>
      </span>
      <span className="text-right text-footnote tabular-nums text-ink-dim">{row.avgGross != null ? row.avgGross.toFixed(1) : '–'}</span>
      <span className="text-right text-headline font-extrabold tabular-nums text-ink">{row.wins}</span>
      <span
        className={`text-center text-caption font-extrabold tabular-nums ${move > 0 ? 'text-green' : move < 0 ? 'text-flag' : 'text-ink-faint'}`}
        aria-label={move === 0 ? 'No change' : `${move > 0 ? 'Up' : 'Down'} ${Math.abs(move)}`}
      >
        {move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : '–'}
      </span>
    </div>
  )
}

function RecordCell({ label, value, who, shame = false }: { label: string; value: string; who: string; shame?: boolean }) {
  return (
    <div className="border-b border-line px-4 py-3.5 odd:border-r [&:nth-last-child(-n+2)]:border-b-0">
      <p className="text-caption font-bold text-ink-faint">{label}</p>
      <p className={`mt-1 text-large font-extrabold leading-none tabular-nums ${shame ? 'text-flag' : 'text-ink'}`}>{value}</p>
      <p className="mt-1 truncate text-caption text-ink-dim">{who}</p>
    </div>
  )
}

/** A handicap's path over the year as a small line, scaled to its own range. */
function Spark({ values, color }: { values: number[]; color: string }) {
  const w = 104
  const h = 28
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  // Higher index draws higher on the line, so a falling handicap reads as a falling line.
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - 3 - ((v - lo) / span) * (h - 6)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  )
}

// Every rivalry in one grid: read across a row for that golfer's record
// against each of the others. A cell leans green the more its row leads
// the matchup, gray when it trails, cream when it's level.
function RivalryGrid({ players, data, onOpen }: { players: Player[]; data: AppData; onOpen: (a: string, b: string) => void }) {
  return (
    <Card className="mt-3 p-3">
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
                  <span className="text-body font-extrabold leading-none tabular-nums">{played === 0 ? '·' : `${h.aWins}–${h.bWins}`}</span>
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

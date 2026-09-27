import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useNavigate } from '../lib/nav'
import { useLogSheet } from '../components/logSheet'
import { useStore } from '../data/store'
import { byDate, leaderboard, playerStats, roundStandings, saddamState, shortDate } from '../lib/stats'
import { daysAgoISO, todayISO } from '../lib/dates'
import { myOutstanding } from '../lib/settlements'
import { anyCards, cardComplete, cardOf, holesEntered } from '../lib/holes'
import { money } from '../lib/money'
import { courseSlug, findCourse, hasPars, padded } from '../lib/courses'
import { byGroupRank, courseSummaries, fmtStars, ratingFor } from '../lib/ratings'
import { canSeeTrip, fmt1, hasScore, isSoloRound, pending, type Round, type Trip } from '../types'
import { StarRating } from '../components/Stars'
import { Icon, IconTile } from '../components/icons'
import CourseScene from '../components/CourseScene'
import RoundScene from '../components/RoundScene'
import { Avatar, AvatarStack, Card, RowButton, SaddamBadge, SectionLabel } from '../components/ui'
import { CountUp } from '../components/Delight'

// The front door. Anything that needs doing comes first (a card mid-
// round, a score you owe), then the one hero: your season, with the
// Saddam riding along underneath it so the trophy is on the first
// screen every time. Money is one line until you ask for the list.
// Trips have no tab, so they live here: up top when one is close or
// being argued about, and always reachable at the bottom.

const DAY = 86_400_000
const fromISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}
const daysBetween = (a: string, b: string) => Math.round((fromISO(b) - fromISO(a)) / DAY)
const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${s}`
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export default function Home() {
  const { data } = useStore()
  const navigate = useNavigate()
  const { open: openLog } = useLogSheet()
  const [moneyOpen, setMoneyOpen] = useState(false)
  const TODAY = todayISO()
  const YEAR = TODAY.slice(0, 4)
  const me = data.players.find((p) => p.id === data.currentUserId)!
  const saddam = saddamState(data)
  const holder = data.players.find((p) => p.id === saddam.holderId)
  const rounds = byDate(data.rounds)
  const recent = rounds.slice(-8).reverse()
  const awaiting = playerStats(data, me.id).awaitingScore.slice().reverse()

  // What I owe and what I'm owed, everywhere.
  const debts = myOutstanding(data, me.id)
  const netPosition = debts.reduce((sum, d) => sum + (d.toId === me.id ? d.amount : -d.amount), 0)
  const owedToMe = debts.filter((d) => d.toId === me.id)
  const iOwe = debts.filter((d) => d.fromId === me.id)
  const debtors = [...new Set(owedToMe.map((d) => d.fromId))]
  const iOweTotal = iOwe.reduce((s, d) => s + d.amount, 0)
  const iOweTo = [...new Set(iOwe.map((d) => d.toId))]

  // A card being filled in today — one tap back to scoring, since coming
  // back to the app mid-round is the single most common thing on a
  // course. Latest first, in case of a 36-hole day.
  const inProgress = rounds
    .filter((r) => r.date === TODAY && anyCards(r) && r.players.some((rp) => !cardComplete(rp)))
    .at(-1)
  const inProgressHoles = inProgress ? inProgress.players.reduce((sum, rp) => sum + holesEntered(rp), 0) : 0
  // "thru 4 · E": my holes so far, against par when the course has one.
  const liveLine = (() => {
    const rp = inProgress?.players.find((p) => p.playerId === me.id)
    if (!inProgress || !rp) return null
    const card = cardOf(rp)
    const thru = card.filter((h) => h != null).length
    if (thru === 0) return 'on the first tee'
    const course = findCourse(data, inProgress.courseName)
    if (!hasPars(course)) return `thru ${thru}`
    const pars = padded(course.pars)
    let diff = 0
    card.forEach((h, i) => {
      if (h != null && pars[i] != null) diff += h - pars[i]!
    })
    return `thru ${thru} · ${diff === 0 ? 'E' : diff > 0 ? `+${diff}` : diff}`
  })()

  // The most recent round I played and haven't rated, if it's fresh.
  // Two weeks, then it stops asking — an unrated round from March is
  // not something anyone wants nagging about in September.
  const fortnightAgo = daysAgoISO(14)
  const toRate = [...rounds]
    .reverse()
    .find(
      (r) =>
        r.date >= fortnightAgo &&
        r.players.some((rp) => rp.playerId === me.id) &&
        (roundStandings(r).length > 0 || anyCards(r)) &&
        !ratingFor(data, courseSlug(r.courseName)),
    )

  // This year, on the group's terms: who's winning group rounds.
  const seasonRounds = rounds.filter((r) => r.date.startsWith(YEAR))
  const board = leaderboard(data, seasonRounds).filter((row) => row.rounds > 0)
  const myPlace = board.findIndex((row) => row.player.id === me.id)
  const myRow = myPlace >= 0 ? board[myPlace] : undefined

  // My last few posted scores this season, oldest first, for the line in
  // the hero. Same season as the numbers beside it, or it read "5 rounds"
  // next to "LAST 6".
  const myScores = seasonRounds
    .map((r) => r.players.find((rp) => rp.playerId === me.id))
    .filter((rp): rp is NonNullable<typeof rp> => !!rp && hasScore(rp))
    .map((rp) => rp.gross as number)
    .slice(-6)

  const favourite = byGroupRank(courseSummaries(data)).find((c) => c.groupRank === 1)

  const visibleTrips = data.trips.filter((t) => canSeeTrip(t, me.id))
  const planning = visibleTrips.filter((t) => t.status === 'planning')
  const upcoming = visibleTrips
    .filter((t) => t.status === 'booked' && t.startDate && t.startDate >= TODAY)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
  const past = visibleTrips.filter((t) => t.status === 'booked' && (!t.startDate || t.startDate < TODAY))
  // A booked trip inside two weeks goes above the season; one still being
  // planned goes just under the money. Anything further out waits in the
  // Trips row at the bottom.
  const soonTrip = upcoming.find((t) => daysBetween(TODAY, t.startDate!) <= 14)
  const planningTrip = planning[0]

  // One live line under the greeting: the most pressing fact there is.
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'
  // The Saddam used to be the fallback here too, which said the same
  // thing as the strip under the hero. It now lives as one small mark
  // on the standings, and gets its full due on the Standings page.
  const subline = soonTrip
    ? (() => {
        const n = daysBetween(TODAY, soonTrip.startDate!)
        return n === 0 ? `${soonTrip.name} starts today.` : `${soonTrip.name} in ${plural(n, 'day')}.`
      })()
    : null
  const firstName = me.name.trim().split(/\s+/)[0]

  return (
    <div className="rise">
      <header className="pt-4 pb-1 px-1 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/group" className="text-caption font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {data.group.name}
          </Link>
          <h1 className="text-large font-bold text-ink truncate">
            {hello}, {firstName}
          </h1>
          {subline && <p className="text-footnote text-ink-dim mt-0.5">{subline}</p>}
        </div>
        <Link to="/profile" className="shrink-0">
          <Avatar player={me} size={40} />
        </Link>
      </header>

      <div className="mt-3 space-y-2.5">
        {/* Straight back onto the card — the app's front door mid-round */}
        {/* A round in progress, like a Live Activity: where, how far, how
            it's going, and one tap back onto the card. */}
        {inProgress && (
          <button
            type="button"
            onClick={() => navigate(`/rounds/${inProgress.id}/card`)}
            className="press flex w-full items-center gap-3 rounded-full bg-forest py-2.5 pl-4 pr-3 text-left text-on-forest shadow-[0_6px_18px_rgba(28,70,50,0.28)]"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="live-ping absolute inset-0 rounded-full bg-[#7fd39b]" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-[#7fd39b]" />
            </span>
            <span className="min-w-0 flex-1 truncate text-footnote">
              <span className="font-bold">{inProgress.courseName}</span>
              <span className="text-on-forest/70"> · live</span>
            </span>
            <span className="shrink-0 text-footnote font-bold tabular-nums">
              {liveLine ?? plural(inProgressHoles, 'hole score')}
            </span>
            <Icon name="chevronRight" size={16} className="shrink-0 text-on-forest/60" />
          </button>
        )}

        {/* Rounds someone logged you into without your score */}
        {awaiting.length > 0 && (
          <Card onClick={() => navigate(`/rounds/${awaiting[0].id}`)} className="p-4 border-gold/40 bg-gold-soft/60 flex items-center gap-3.5">
            <IconTile name="pencil" tone="gold" />
            <div className="flex-1 min-w-0">
              <p className="text-body font-bold text-ink">
                {awaiting.length === 1 ? 'You owe a score' : `You owe ${awaiting.length} scores`}
              </p>
              <p className="text-footnote text-ink-dim mt-0.5 truncate">
                {awaiting.length === 1
                  ? `${awaiting[0].courseName}, ${shortDate(awaiting[0].date)}`
                  : `Starting with ${awaiting[0].courseName}, ${shortDate(awaiting[0].date)}`}
              </p>
            </div>
            <Icon name="chevronRight" size={18} className="text-ink-faint" />
          </Card>
        )}

        {/* The hero: my season */}
        <div className="overflow-hidden rounded-3xl bg-forest text-on-forest shadow-[0_10px_30px_rgba(28,70,50,0.22)]">
          <button type="button" onClick={() => navigate('/h2h')} className="relative block w-full px-5 pt-4 pb-4 text-left active:opacity-90">
            <div className="flex items-center justify-between">
              <p className="text-caption font-semibold uppercase tracking-[0.16em] text-on-forest/70">Your {YEAR}</p>
              {myRow && (
                <span className="rounded-full bg-on-forest/15 px-2.5 py-0.5 text-caption font-extrabold tabular-nums">
                  {ordinal(myPlace + 1)} of {board.length}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-baseline gap-2">
                  <CountUp id="home-wins" value={myRow?.wins ?? 0} className="text-hero font-extrabold leading-[0.9]" />
                  <span className="text-body font-bold text-on-forest/85">group {myRow?.wins === 1 ? 'win' : 'wins'}</span>
                </p>
                <p className="mt-1.5 text-footnote text-on-forest/75 tabular-nums">
                  {myRow
                    ? [
                        plural(myRow.rounds, 'round'),
                        myRow.avgGross != null && `avg ${myRow.avgGross.toFixed(1)}`,
                        myRow.bestGross != null && `best ${myRow.bestGross}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : 'No rounds yet this year. The first one starts the count.'}
                </p>
              </div>
              {myScores.length >= 3 && <Sparkline scores={myScores} />}
            </div>
          </button>
        </div>

        {/* Money: one line until you want the list. Each row in the list
            goes to the round or trip it belongs to, where Pay lives. */}
        {debts.length > 0 && (
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              {debtors.length > 0 ? (
                <AvatarStack players={debtors.map((id) => data.players.find((p) => p.id === id))} size={24} />
              ) : (
                <AvatarStack players={iOweTo.map((id) => data.players.find((p) => p.id === id))} size={24} />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-headline font-extrabold tabular-nums leading-tight ${
                    netPosition > 0 ? 'text-green' : netPosition < 0 ? 'text-flag' : 'text-ink'
                  }`}
                >
                  {netPosition === 0 ? (
                    'All square'
                  ) : (
                    <>
                      {netPosition > 0 && '+'}
                      <CountUp id="home-money" value={Math.abs(netPosition)} format={(n) => money(Math.round(n))} />
                      {netPosition > 0 ? ' coming' : ' to pay'}
                    </>
                  )}
                </p>
                <p className="truncate text-caption text-ink-dim">
                  {[
                    debtors.length > 0 && `${debtors.length} owe${debtors.length === 1 ? 's' : ''} you`,
                    iOwe.length > 0 &&
                      `you owe ${iOweTo.length === 1 ? `${data.players.find((p) => p.id === iOweTo[0])?.name} ` : ''}${money(iOweTotal)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMoneyOpen((o) => !o)}
                aria-expanded={moneyOpen}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-footnote font-bold transition ${
                  moneyOpen ? 'bg-ink/[0.06] text-ink-dim' : 'bg-green text-white'
                }`}
              >
                {moneyOpen ? 'Done' : 'Settle up'}
              </button>
            </div>
            {moneyOpen && (
              <div className="divide-y divide-line border-t border-line">
                {debts.map((d, i) => {
                  const mine = d.fromId === me.id
                  const other = data.players.find((p) => p.id === (mine ? d.toId : d.fromId))
                  return (
                    <RowButton key={i} onClick={() => navigate(d.href)} className="flex items-center gap-3 px-4 py-3">
                      {other && <Avatar player={other} size={26} />}
                      <div className="flex-1 min-w-0">
                        <p className="text-footnote text-ink truncate">
                          {mine ? (
                            <>
                              You owe <span className="font-bold">{other?.name}</span>
                            </>
                          ) : (
                            <>
                              <span className="font-bold">{other?.name}</span> owes you
                            </>
                          )}
                        </p>
                        <p className="text-caption text-ink-faint truncate">{d.label}</p>
                      </div>
                      <span className={`text-body font-extrabold tabular-nums shrink-0 ${mine ? 'text-flag' : 'text-green'}`}>
                        {money(d.amount)}
                      </span>
                      <Icon name="chevronRight" size={16} className="text-ink-faint" />
                    </RowButton>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {/* A course to rate, while it's still fresh */}
        {toRate && (
          <Card onClick={() => navigate(`/rounds/${toRate.id}`)} className="p-4 flex items-center gap-3.5">
            <IconTile name="star" tone="gold" />
            <div className="flex-1 min-w-0">
              <p className="text-body font-bold text-ink truncate">How was {toRate.courseName}?</p>
              <p className="text-footnote text-ink-dim mt-0.5">One tap for the stars, one for where it lands on your list.</p>
            </div>
            <Icon name="chevronRight" size={18} className="text-ink-faint" />
          </Card>
        )}
      </div>

      {/* Recent rounds, as pictures you swipe through */}
      <SectionLabel
        action={
          <Link to="/rounds" className="text-footnote font-bold text-green">
            All rounds
          </Link>
        }
      >
        Recent rounds
      </SectionLabel>
      {recent.length === 0 ? (
        <Card className="p-5 text-center">
          <p className="text-body font-bold text-ink">No rounds logged yet</p>
          <p className="text-footnote text-ink-dim mt-1">Log one and the records start keeping themselves. Solo rounds count too.</p>
          <button onClick={() => openLog()} className="mt-3 rounded-xl bg-green px-5 py-2.5 text-body font-bold text-white">
            Log a round
          </button>
        </Card>
      ) : (
        <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {recent.map((r) => (
            <RoundTile key={r.id} round={r} onOpen={() => navigate(`/rounds/${r.id}`, { shared: r.id })} />
          ))}
          <button
            type="button"
            onClick={() => navigate('/rounds')}
            className="flex w-[108px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-footnote font-bold text-green active:bg-card"
          >
            <IconTile name="chevronRight" size={36} />
            All rounds
          </button>
        </div>
      )}

      {/* The season, on the group's terms */}
      <SectionLabel
        action={
          <Link to="/h2h" className="text-footnote font-bold text-green">
            Full standings
          </Link>
        }
      >
        Standings
      </SectionLabel>
      {board.length === 0 ? (
        <Card className="p-5 text-center">
          <p className="text-body font-bold text-ink">Nothing on the board yet this year</p>
          <p className="text-footnote text-ink-dim mt-1">The first group round starts the count.</p>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-line">
            {board.slice(0, 3).map((row, i) => (
              <RowButton key={row.player.id} onClick={() => navigate('/h2h')} className="flex items-center gap-3 px-4 py-3">
                <span className={`w-5 text-body font-extrabold tabular-nums ${i === 0 ? 'text-gold' : 'text-ink-faint'}`}>{i + 1}</span>
                <Avatar player={row.player} size={30} />
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-1.5 text-body font-bold text-ink">
                    <span className="truncate">
                      {row.player.name}
                      {row.player.id === me.id && <span className="text-ink-faint font-semibold"> (you)</span>}
                    </span>
                    {holder?.id === row.player.id && <SaddamBadge size={14} />}
                  </p>
                  <p className="text-caption text-ink-faint tabular-nums">
                    {plural(row.rounds, 'round')}
                    {row.avgGross != null && ` · avg ${row.avgGross.toFixed(1)}`}
                    {row.streak >= 2 && (
                      <>
                        {' '}· {row.streak} straight <Icon name="flame" size={12} className="inline -mt-0.5 text-flag" />
                      </>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-headline font-extrabold text-ink tabular-nums leading-none">{row.wins}</p>
                  <p className="text-caption font-semibold uppercase tracking-wider text-ink-faint mt-0.5">{row.wins === 1 ? 'win' : 'wins'}</p>
                </div>
              </RowButton>
            ))}
          </div>
          {myPlace >= 3 && (
            <p className="px-4 py-2.5 border-t border-line text-footnote text-ink-dim">
              You're {ordinal(myPlace + 1)} of {board.length} · {plural(board[myPlace].wins, 'win')}
            </p>
          )}
          {holder && !board.slice(0, 3).some((row) => row.player.id === holder.id) && (
            <RowButton onClick={() => navigate('/h2h')} className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-footnote text-ink-dim">
              <SaddamBadge size={14} />
              {holder.id === me.id ? 'You hold' : `${holder.name.split(' ')[0]} holds`} the Saddam
            </RowButton>
          )}
        </Card>
      )}

      {/* Trips: under the standings, since a round happens every weekend
          and a trip twice a year. Booked and close first, then one being planned. */}
      {(soonTrip || planningTrip) && (
        <div className="mt-6 space-y-2.5">
          {soonTrip && <TripHero trip={soonTrip} today={TODAY} meId={me.id} />}
          {planningTrip && planningTrip.id !== soonTrip?.id && <TripHero trip={planningTrip} today={TODAY} meId={me.id} />}
        </div>
      )}

      {/* Where to next, and where we've been */}
      <SectionLabel>More</SectionLabel>
      <Card>
        <div className="divide-y divide-line">
          <RowButton onClick={() => navigate('/trips')} className="flex items-center gap-3.5 px-4 py-3.5">
            <IconTile name="suitcase" tone="sand" size={38} />
            <div className="flex-1 min-w-0">
              <p className="text-body font-bold text-ink">Trips</p>
              <p className="text-caption text-ink-faint truncate">
                {[
                  planning.length > 0 && `${planning.length} in the works`,
                  upcoming.length > 0 && `${upcoming.length} coming up`,
                  past.length > 0 && `${past.length} in the archive`,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Plan the first one'}
              </p>
            </div>
            <Icon name="chevronRight" size={18} className="text-ink-faint" />
          </RowButton>
          <RowButton
            onClick={() => navigate(favourite ? `/courses/${encodeURIComponent(favourite.slug)}` : '/courses')}
            className="flex items-center gap-3.5 px-4 py-3.5"
          >
            <IconTile name="star" tone="gold" size={38} />
            <div className="flex-1 min-w-0">
              <p className="text-body font-bold text-ink truncate">{favourite ? favourite.name : 'No favourite yet'}</p>
              <p className="flex items-center gap-1.5 text-caption text-ink-faint">
                The group’s favourite
                {favourite?.avg != null && (
                  <>
                    <span aria-hidden>·</span>
                    <StarRating value={favourite.avg} size={10} />
                    <span className="tabular-nums">{fmtStars(favourite.avg)}</span>
                  </>
                )}
              </p>
            </div>
            <Icon name="chevronRight" size={18} className="text-ink-faint" />
          </RowButton>
        </div>
      </Card>
      <div className="h-4" />
    </div>
  )
}

/** The last few scores as a line: lower is better, so lower draws higher. */
function Sparkline({ scores }: { scores: number[] }) {
  const W = 112
  const H = 40
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const span = Math.max(1, max - min)
  const pts = scores.map((s, i) => [4 + (i * (W - 8)) / (scores.length - 1), 4 + ((s - min) / span) * (H - 8)] as const)
  const last = pts[pts.length - 1]
  return (
    <svg width={W} height={H + 12} viewBox={`0 0 ${W} ${H + 12}`} className="shrink-0" aria-label={`Last ${scores.length} scores: ${scores.join(', ')}`}>
      <polyline
        points={pts.map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
      <circle cx={last[0]} cy={last[1]} r="3.4" fill="currentColor" />
      <text x={W - 2} y={H + 10} textAnchor="end" fontSize="8.5" fontWeight="800" letterSpacing="1" fill="currentColor" opacity="0.6">
        LAST {scores.length} · {scores[scores.length - 1]}
      </text>
    </svg>
  )
}

/** A round as a card in the carousel: its first photo, or the flag. */
function RoundTile({ round: r, onOpen }: { round: Round; onOpen: () => void }) {
  const { data } = useStore()
  const standings = roundStandings(r)
  const top = standings.length ? data.players.find((p) => p.id === standings[0].playerId) : undefined
  const solo = isSoloRound(r)
  const waiting = pending(r)
  const photo = r.photos?.[0]
  const line = !top
    ? 'No scores yet'
    : waiting.length > 0
      ? `Waiting on ${waiting.length}`
      : solo
        ? `Solo · ${standings[0].gross}`
        : `${top.name.split(' ')[0]} · net ${fmt1(standings[0].netScore)}`
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-[124px] shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-card text-left shadow-[0_1px_2px_rgba(24,32,25,0.05)] transition-transform active:scale-[0.98]"
    >
      <div data-shared={r.id} className="relative h-[62px] bg-paper">
        {photo ? (
          <img src={photo.url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <RoundScene round={r} />
        )}
        {(r.photos?.length ?? 0) > 1 && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-caption font-bold text-white">
            <Icon name="camera" size={11} strokeWidth={2.2} /> {r.photos!.length}
          </span>
        )}
        <div className="absolute -bottom-2.5 left-2">
          <AvatarStack players={r.players.map((rp) => data.players.find((p) => p.id === rp.playerId))} size={20} />
        </div>
      </div>
      <div className="px-2.5 pb-2.5 pt-3.5">
        <p className="truncate text-footnote font-bold text-ink">{r.courseName}</p>
        <p className="truncate text-caption text-ink-dim tabular-nums">{line}</p>
        <p className="text-caption text-ink-faint tabular-nums">{shortDate(r.date)}</p>
      </div>
    </button>
  )
}

/** A trip on Home: booked and close, or still being planned. */
function TripHero({ trip, today, meId }: { trip: Trip; today: string; meId: string }) {
  const navigate = useNavigate()
  const isPlanning = trip.status === 'planning'
  const votesIn = isPlanning ? new Set(trip.options.flatMap((o) => o.votes)).size : 0
  const myVoteCast = isPlanning && trip.options.some((o) => o.votes.includes(meId))
  const days = trip.startDate ? daysBetween(today, trip.startDate) : null
  return (
    <Card onClick={() => navigate(`/trips/${trip.id}`)} className="overflow-hidden">
      {/* The scene stays clear: its flag sits somewhere different in each one. */}
      <CourseScene course={trip.location || trip.name} light="golden" className="h-24 w-full" />
      <div className="px-5 pt-3">
        <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.14em] text-sand">
          <Icon name="suitcase" size={13} strokeWidth={2.2} />
          {isPlanning ? 'Trip in the works' : days === 0 ? 'Trip starts today' : `Trip in ${plural(days ?? 0, 'day')}`}
        </p>
        <h2 className="mt-0.5 text-title font-bold leading-tight text-ink">{trip.name}</h2>
        <p className="mt-0.5 text-footnote text-ink-dim">
          {isPlanning
            ? `${plural(trip.options.length, 'destination')} on the table`
            : `${trip.location}${trip.startDate ? ` · ${shortDate(trip.startDate)}` : ''}`}
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line px-5 py-3">
        {isPlanning ? (
          <>
            <p className="text-footnote text-ink-dim">
              {votesIn} of {trip.attendeeIds.length} votes in
            </p>
            <span className={`text-footnote font-bold ${myVoteCast ? 'text-ink-faint' : 'text-green'}`}>
              {myVoteCast ? 'Vote cast ✓' : 'Cast your vote'}
            </span>
          </>
        ) : (
          <>
            <p className="text-footnote text-ink-dim">Itinerary, tee times, standings</p>
            <Icon name="chevronRight" size={18} className="text-ink-faint" />
          </>
        )}
      </div>
    </Card>
  )
}

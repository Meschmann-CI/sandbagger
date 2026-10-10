import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useNavigate } from '../lib/nav'
import { useLogSheet } from '../components/logSheet'
import { useStore } from '../data/store'
import { byDate, leaderboard, playerStats, roundStandings, saddamState, shortDate, type LeaderRow } from '../lib/stats'
import { daysAgoISO, todayISO } from '../lib/dates'
import { myOutstanding } from '../lib/settlements'
import { anyCards, cardComplete, cardOf, holesEntered } from '../lib/holes'
import { money } from '../lib/money'
import { courseSlug, findCourse, hasPars, padded } from '../lib/courses'
import { byGroupRank, courseSummaries, fmtStars, ratingFor } from '../lib/ratings'
import { canSeeTrip, fmt1, isSoloRound, pending, type Round, type Trip } from '../types'
import { StarRating } from '../components/Stars'
import { Icon, IconTile } from '../components/icons'
import CourseScene from '../components/CourseScene'
import RoundScene from '../components/RoundScene'
import { Avatar, AvatarStack, Card, RowButton, SaddamIcon, SectionLabel } from '../components/ui'
import { CountUp } from '../components/Delight'

// The front door, titled with the group's name. A round being played
// comes first as a slim live strip, then anything you owe, then the one
// centrepiece: the season as a race, with the Saddam's face on whoever
// holds it so the trophy is on the first screen every time. Money is one line until you ask for the list.
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
  // How the live round is going for me, for the strip: my score (against
  // par when the course has pars, strokes when it doesn't), how many holes
  // in, and the hole I'm on. Someone else's live round (I'm not in it)
  // just says how far along they are.
  const live: Live | null = (() => {
    if (!inProgress) return null
    const rp = inProgress.players.find((p) => p.playerId === me.id)
    if (!rp) {
      const thru = Math.max(...inProgress.players.map((p) => holesEntered(p)))
      return { big: `Thru ${thru}`, line: 'The group is out there without you.', next: null, thru }
    }
    const card = cardOf(rp)
    const thru = card.filter((h) => h != null).length
    const nextAt = card.findIndex((h) => h == null)
    const next = nextAt >= 0 ? nextAt + 1 : null
    if (thru === 0) return { big: 'E', line: 'on the first tee', next, thru }
    const course = findCourse(data, inProgress.courseName)
    let big = String(card.reduce<number>((acc, h) => acc + (h ?? 0), 0))
    if (hasPars(course)) {
      const pars = padded(course.pars)
      let diff = 0
      card.forEach((h, k) => {
        if (h != null && pars[k] != null) diff += h - pars[k]!
      })
      big = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `−${-diff}`
    }
    return { big, line: `thru ${thru}`, next, thru }
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

  // One line under the group's name, only when a trip is close.
  // The Saddam used to be the fallback here too, which said the same
  // thing as the strip under the hero. It now lives as one small mark
  // on the standings, and gets its full due on the Standings page.
  const subline = soonTrip
    ? (() => {
        const n = daysBetween(TODAY, soonTrip.startDate!)
        return n === 0 ? `${soonTrip.name} starts today.` : `${soonTrip.name} in ${plural(n, 'day')}.`
      })()
    : null
  return (
    <div className="rise">
      <header className="pt-5 pb-1 px-1 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-large font-bold text-ink leading-tight truncate">{data.group.name}</h1>
          {subline && <p className="text-footnote text-ink-dim mt-0.5">{subline}</p>}
        </div>
        <Link to="/profile" className="shrink-0">
          <Avatar player={me} size={40} />
        </Link>
      </header>

      <div className="mt-3 space-y-2.5">
        {inProgress && live && <LiveStrip round={inProgress} live={live} />}

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

        <SeasonRace board={board} meId={me.id} holderId={holder?.id} saddamSince={saddam.since} year={YEAR} />

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
                  className={`whitespace-nowrap text-headline font-extrabold tabular-nums leading-tight ${
                    netPosition > 0 ? 'text-green' : netPosition < 0 ? 'text-flag' : 'text-ink'
                  }`}
                >
                  {netPosition === 0 ? (
                    'All square'
                  ) : (
                    <>
                      {netPosition > 0 && '+'}
                      <CountUp id="home-money" value={Math.abs(netPosition)} format={(n) => money(Math.round(n))} />
                      <span className="text-body font-bold">{netPosition > 0 ? ' coming' : ' to pay'}</span>
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
          <p className="text-footnote text-ink-dim mt-1">Solo rounds count too.</p>
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

      {/* Trips: under the rounds, since a round happens every weekend
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

/**
 * The centre of Home: the season as a race. Each golfer is a column as
 * tall as their group wins, their face on top, yours in cream (the
 * colour of winning), the Saddam's face on whoever holds it. Under it,
 * the story in a line.
 */
function SeasonRace({
  board,
  meId,
  holderId,
  saddamSince,
  year,
}: {
  board: LeaderRow[]
  meId: string
  holderId?: string
  saddamSince: string | null
  year: string
}) {
  const navigate = useNavigate()
  const first = (name: string) => name.trim().split(/\s+/)[0]
  const top = Math.max(1, ...board.map((r) => r.wins))
  const myPlace = board.findIndex((r) => r.player.id === meId)
  const me = board[myPlace]
  const story = (() => {
    if (board.length === 0) return 'No group rounds yet. The first one starts the race.'
    if (!me) return `${first(board[0].player.name)} leads with ${plural(board[0].wins, 'win')}. You haven't played a group round yet.`
    if (myPlace === 0) {
      const next = board[1]
      if (!next) return `You lead with ${plural(me.wins, 'win')}.`
      const gap = me.wins - next.wins
      return gap > 0 ? `You lead, ${plural(gap, 'win')} clear of ${first(next.player.name)}.` : `You and ${first(next.player.name)} are level at the top.`
    }
    const gap = board[0].wins - me.wins
    return gap > 0
      ? `You're ${ordinal(myPlace + 1)}, ${plural(gap, 'win')} behind ${first(board[0].player.name)}.`
      : `You're level with ${first(board[0].player.name)} at the top.`
  })()
  const holder = board.find((r) => r.player.id === holderId)?.player
  return (
    <button
      type="button"
      onClick={() => navigate('/h2h')}
      className="press block w-full overflow-hidden rounded-3xl bg-forest px-5 pt-4 pb-5 text-left text-on-forest shadow-[0_10px_30px_rgba(28,70,50,0.22)]"
    >
      <div className="flex items-baseline justify-between">
        <p className="text-footnote font-bold text-on-forest/75">{year} season</p>
        <p className="flex items-center gap-0.5 text-footnote font-bold text-on-forest/75">
          Standings <Icon name="chevronRight" size={14} />
        </p>
      </div>

      {board.length > 0 && (
        <div className="mt-5 flex items-end gap-2" role="img" aria-label={`Group wins: ${board.map((r) => `${r.player.name} ${r.wins}`).join(', ')}`}>
          {board.slice(0, 6).map((r) => {
            const mine = r.player.id === meId
            return (
              <div key={r.player.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <span className="relative">
                  <Avatar player={r.player} size={34} />
                  {r.player.id === holderId && (
                    <span className="absolute -top-2 -right-4 rounded-md ring-2 ring-forest">
                      <SaddamIcon size={20} />
                    </span>
                  )}
                </span>
                <span
                  className={`flex w-full items-start justify-center rounded-t-lg pt-1.5 text-headline font-extrabold tabular-nums ${
                    mine ? 'bg-cream text-forest' : 'bg-on-forest/12 text-on-forest'
                  }`}
                  style={{ height: 34 + Math.round((r.wins / top) * 62) }}
                >
                  {r.wins}
                </span>
                <span className={`max-w-full truncate text-footnote font-bold ${mine ? 'text-on-forest' : 'text-on-forest/70'}`}>
                  {mine ? 'You' : first(r.player.name)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-4 text-headline font-bold">{story}</p>
      {holder && (
        <p className="text-footnote text-on-forest/75">
          {holder.id === meId ? 'You have' : `${first(holder.name)} has`} the Saddam
          {saddamSince && ` since ${shortDate(saddamSince).replace(/, \d{4}$/, '')}`}.
        </p>
      )}
    </button>
  )
}

interface Live {
  /** Against par ('+6', 'E'), or strokes so far without pars. */
  big: string
  line: string
  /** The next hole to play, 1-18, or null when the card is full. */
  next: number | null
  /** Holes played, for the progress line. */
  thru: number
}

// The yellow of the flag on the pin: only for Live, here.
const LIVE_YELLOW = '#F6C744'

/**
 * A round being played right now, as a slim strip like a Live Activity.
 * Near-black, the way iOS draws a Live Activity, so it never blends into
 * the green season race under it; yellow only on the pulsing Live and on
 * the line along the bottom that fills as you play the eighteen. One tap
 * goes back to the next hole, and it disappears with the round.
 */
function LiveStrip({ round, live }: { round: Round; live: Live }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate(`/rounds/${round.id}/card`)}
      className="press relative block w-full overflow-hidden rounded-2xl bg-[#141816] text-left text-white shadow-[0_6px_18px_rgba(20,24,22,0.25)]"
    >
      <span className="flex items-center gap-3 py-3 pr-3 pl-4">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-footnote font-bold" style={{ color: LIVE_YELLOW }}>
            <span className="relative flex h-[7px] w-[7px] shrink-0">
              <span className="live-ping absolute inset-0 rounded-full" style={{ backgroundColor: LIVE_YELLOW }} />
              <span className="relative h-[7px] w-[7px] rounded-full" style={{ backgroundColor: LIVE_YELLOW }} />
            </span>
            <span className="truncate">Live · {round.courseName.replace(/ (Golf Course|Golf Club|Country Club)$/, '')}</span>
          </span>
          <span className="mt-0.5 flex items-baseline gap-2">
            <span className="text-title font-extrabold tabular-nums">{live.big}</span>
            <span className="truncate text-footnote text-white/70">{live.line}</span>
          </span>
        </span>
        <span className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-white pr-2.5 pl-3.5 text-footnote font-bold text-ink">
          {live.next ? `Hole ${live.next}` : 'Card'}
          <Icon name="chevronRight" size={16} />
        </span>
      </span>
      {/* How far through the round. */}
      <span className="absolute inset-x-0 bottom-0 block h-[3px] bg-white/10" aria-hidden>
        <span className="block h-full transition-[width] duration-500" style={{ width: `${Math.round((live.thru / 18) * 100)}%`, backgroundColor: LIVE_YELLOW }} />
      </span>
    </button>
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
        <h2 className="text-title font-bold leading-tight text-ink">{trip.name}</h2>
        <p className="mt-0.5 text-footnote text-ink-dim">
          {isPlanning
            ? `${plural(trip.options.length, 'destination')} on the table, nothing booked`
            : [trip.location, days === 0 ? 'starts today' : `${plural(days ?? 0, 'day')} out`].filter(Boolean).join(', ')}
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
            <p className="text-footnote text-ink-dim">{trip.attendeeIds.length} going</p>
            <Icon name="chevronRight" size={18} className="text-ink-faint" />
          </>
        )}
      </div>
    </Card>
  )
}

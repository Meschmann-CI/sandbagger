import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { HOLE_COUNT, cardOf, cardTotal, holesEntered } from '../lib/holes'
import { findCourse, hasPars, hasStrokeIndex, padded, scoreKind, strokesOffLow, toPar, type ScoreKind } from '../lib/courses'
import { settleFromCard } from '../lib/bets'
import { fmtDiff, ghostDiff, ghostFor, ghostOptions } from '../lib/ghost'
import { roundStandings, shortDate } from '../lib/stats'
import { notifyGroup } from '../lib/push'
import { fmt1, type Round } from '../types'
import { Avatar, Card, HelpTip, PrimaryButton } from '../components/ui'
import { betRules } from '../lib/betRules'

// The live card, laid out like the card in your pocket.
//
// One grid: hole, yards, par, stroke index across the top, then a row
// per golfer, scrolling sideways with the labels pinned. Tap a cell,
// type the number on the pad, tap Next. That's the GHIN posting screen,
// borrowed on purpose — everyone in the group already knows it — with
// the things it can't do: four golfers on one card, strokes marked on
// the holes they land on, and the bets settling underneath as it fills.
//
// Still a companion, not an editor. Every tap saves itself, nothing
// moves unless you tap Next, and leaving mid-round costs nothing.

// How a hole's score reads against its par, same marks as the finished card.
const MARK: Record<ScoreKind, string> = {
  albatross: 'ring-2 ring-gold rounded-full bg-gold-soft font-extrabold text-gold',
  eagle: 'ring-2 ring-gold rounded-full bg-gold-soft font-extrabold text-gold',
  birdie: 'rounded-full bg-green-soft font-extrabold text-green',
  par: 'text-ink font-bold',
  bogey: 'rounded-md bg-paper border border-line-strong text-ink font-bold',
  double: 'rounded-md bg-flag-soft border border-flag/40 font-bold text-flag',
  worse: 'rounded-md bg-flag-soft border-2 border-flag/60 font-extrabold text-flag',
}

interface Active {
  playerId: string
  hole: number
}

export default function HoleEntry() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, updateRound, updateBet } = useStore()
  const round = data.rounds.find((r) => r.id === id)

  // Only the cells this session actually typed, keyed player → hole.
  // Everything on screen is the live round with these laid over the top,
  // so a score somebody posts from another phone mid-round shows up here
  // rather than being silently overwritten when this card is saved.
  const [edits, setEdits] = useState<Record<string, Record<number, number | null>>>({})
  const [active, setActive] = useState<Active | null>(null)
  // Digits typed into the active cell so far. "1" then "2" is a 12; any
  // other pair, the second replaces the first. No timers — the first
  // live round proved a clock is wrong for whoever is holding the phone.
  const [buffer, setBuffer] = useState('')
  const commitRef = useRef<() => void>(() => {})
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scroller = useRef<HTMLDivElement>(null)
  const columns = useRef<(HTMLTableCellElement | null)[]>([])

  const players = round?.players ?? []
  const cards: Record<string, (number | null)[]> = Object.fromEntries(
    players.map((rp) => {
      const merged = cardOf(rp)
      for (const [index, value] of Object.entries(edits[rp.playerId] ?? {})) merged[Number(index)] = value
      return [rp.playerId, merged]
    }),
  )

  const course = findCourse(data, round?.courseName ?? '')
  const pars = hasPars(course) ? padded(course.pars) : null
  const index = hasStrokeIndex(course) ? padded(course.strokeIndex) : null
  const yards = course?.yards && course.yards.length === HOLE_COUNT ? course.yards : null
  const strokeDots =
    hasStrokeIndex(course) && players.length > 1 ? strokesOffLow(course, players, round?.tee) : null

  const liveRound: Round | null = round
    ? { ...round, players: round.players.map((rp) => ({ ...rp, holes: cards[rp.playerId] })) }
    : null
  const liveBets = (round && liveRound ? data.bets.filter((b) => b.roundId === round.id) : [])
    .map((bet) => ({ bet, outcome: settleFromCard(bet, liveRound!, course) }))
    .filter((x): x is { bet: (typeof x)['bet']; outcome: NonNullable<(typeof x)['outcome']> } => x.outcome != null)

  // Keep the column you're typing in on screen as Next walks across.
  useEffect(() => {
    if (!active) return
    columns.current[active.hole]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [active])

  if (!round) {
    return (
      <div className="pt-16 text-center text-ink-dim">
        Round not found. <Link to="/rounds" className="text-green font-bold">Back to rounds</Link>
      </div>
    )
  }

  // Writes the card, the grosses, and the live bets in one pass. The
  // gross comes from the card only once the card is finished: a ten-hole
  // card summing to 41 is not a round of 41.
  const commitCards = () => {
    const nextPlayers = round.players.map((rp) => {
      const card = cards[rp.playerId]
      const complete = card.every((h) => h != null)
      return {
        ...rp,
        holes: card.some((h) => h != null) ? card : undefined,
        gross: complete ? cardTotal(card) : rp.gross,
      }
    })
    updateRound({ ...round, players: nextPlayers })
    const saved: Round = { ...round, players: nextPlayers }
    for (const bet of data.bets.filter((b) => b.roundId === round.id)) {
      const outcome = settleFromCard(bet, saved, course)
      if (outcome) updateBet({ ...bet, results: outcome.results })
    }

    // The moment the last score lands is the moment the group hears the
    // result — once, on the save that crossed the line.
    const wasFinal = round.players.length > 1 && round.players.every((rp) => rp.gross != null)
    const isFinal = saved.players.length > 1 && saved.players.every((rp) => rp.gross != null)
    if (isFinal && !wasFinal) {
      const standings = roundStandings(saved)
      const winner = data.players.find((p) => p.id === standings[0]?.playerId)
      notifyGroup({
        toPlayerIds: data.group.memberIds.filter((id) => id !== data.currentUserId),
        title: `Final at ${round.courseName}`,
        body: `${winner ? `${winner.name} takes it, net ${fmt1(standings[0].netScore)}.` : 'All the cards are in.'} Rate the course while it’s fresh.`,
        url: `/rounds/${round.id}`,
      })
    }
  }
  commitRef.current = commitCards

  // Every tap saves itself, a beat later so a flurry on one hole lands
  // as one write. The store already applies it on screen instantly and
  // queues it offline, so there is nothing for a save button to add.
  const queueCommit = () => {
    clearTimeout(commitTimer.current)
    commitTimer.current = setTimeout(() => commitRef.current(), 800)
  }

  const setScore = (playerId: string, hole: number, value: number | null) => {
    setEdits((all) => ({
      ...all,
      [playerId]: { ...(all[playerId] ?? {}), [hole]: value == null ? null : Math.max(1, Math.min(20, value)) },
    }))
    queueCommit()
  }

  const select = (cell: Active) => {
    setActive(cell)
    setBuffer('')
  }

  // Down the golfers on this hole, then on to the next hole's first —
  // the order a scorekeeper reads names off a green.
  const advance = () => {
    if (!active) return
    const i = round.players.findIndex((rp) => rp.playerId === active.playerId)
    if (i < round.players.length - 1) return select({ playerId: round.players[i + 1].playerId, hole: active.hole })
    if (active.hole < HOLE_COUNT - 1) return select({ playerId: round.players[0].playerId, hole: active.hole + 1 })
    setActive(null)
  }

  const typeDigit = (d: number) => {
    if (!active) return
    if (buffer === '1' && d >= 0 && d <= 9) {
      setScore(active.playerId, active.hole, 10 + d)
      setBuffer('')
      return
    }
    if (d === 0) return
    setScore(active.playerId, active.hole, d)
    setBuffer(String(d))
  }

  const clearActive = () => {
    if (!active) return
    setScore(active.playerId, active.hole, null)
    setBuffer('')
  }

  // Ghosts: each golfer races their own earlier card here, if they have
  // one. Chosen on your own phone, stored on the round so it survives a
  // reload and shows on everyone else's.
  const me = data.currentUserId
  const iPlay = round.players.some((rp) => rp.playerId === me)
  const myGhostOptions = iPlay ? ghostOptions(data, round, me) : []
  const myGhost = ghostFor(data, round, me)
  const setMyGhost = (roundId: string | null) => {
    const others = (round.ghosts ?? []).filter((g) => g.playerId !== me)
    const ghosts = roundId ? [...others, { playerId: me, roundId }] : others
    updateRound({ ...round, ghosts: ghosts.length ? ghosts : undefined })
  }

  // "Done" just leaves — with any pending write flushed first.
  const done = () => {
    clearTimeout(commitTimer.current)
    commitCards()
    navigate(`/rounds/${round.id}`, { replace: true })
  }

  const sum = (card: (number | null)[], from: number, to: number) =>
    card.slice(from, to).reduce<number>((s, h) => s + (h ?? 0), 0)
  // Against par for the holes actually scored — the number you keep in
  // your head walking down the fairway.
  const toParThru = (card: (number | null)[]): string | null => {
    if (!pars) return null
    let strokes = 0
    let par = 0
    card.forEach((h, i) => {
      if (h == null) return
      strokes += h
      par += pars[i] ?? 0
    })
    return par === 0 ? null : toPar(strokes - par)
  }

  // Start on the first hole nobody has filled in.
  const firstOpenHole = Math.min(
    Math.max(0, ...round.players.map((rp) => holesEntered(rp))),
    HOLE_COUNT - 1,
  )
  const totalEntered = round.players.reduce((n, rp) => n + (cards[rp.playerId]?.filter((h) => h != null).length ?? 0), 0)
  const totalYards = yards ? yards.reduce<number>((s, y) => s + (y ?? 0), 0) : null
  const coursePar = pars ? pars.reduce<number>((s, p) => s + (p ?? 0), 0) : null

  const cellBase =
    'w-11 h-11 flex flex-col items-center justify-center text-[14px] tabular-nums select-none active:bg-paper transition'

  return (
    // No entry animation here: it leaves a transform on the wrapper, and
    // a fixed element inside a transformed box is fixed to the box, not
    // the screen — the first cut had the tab bar drawn over the pad.
    <div className={active ? 'pb-72' : ''}>
      <header className="pt-4 pb-3 px-1">
        <button onClick={done} className="text-[13px] font-bold text-ink-faint mb-1">
          ← Back
        </button>
        <h1 className="text-[21px] font-extrabold tracking-tight text-ink truncate">{round.courseName}</h1>
        <p className="text-[12.5px] text-ink-dim tabular-nums">
          {round.tee ? `${round.tee} tees` : 'Tees not noted'}
          {coursePar != null && ` · par ${coursePar}`}
          {totalYards != null && ` · ${totalYards.toLocaleString()} yds${course?.yardsTee && round.tee && course.yardsTee.toLowerCase() !== round.tee.toLowerCase() ? ` (${course.yardsTee})` : ''}`}
          {` · ${totalEntered} score${totalEntered === 1 ? '' : 's'} in`}
        </p>
      </header>

      {/* Where everyone stands, thru whatever they've scored */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {round.players.map((rp) => {
          const p = data.players.find((pl) => pl.id === rp.playerId)
          if (!p) return null
          const card = cards[rp.playerId]
          const thru = card.filter((h) => h != null).length
          const gross = sum(card, 0, HOLE_COUNT)
          const vs = toParThru(card)
          const ghost = ghostFor(data, round, rp.playerId)
          const race = ghost ? ghostDiff(card, ghost.card) : null
          return (
            <div key={rp.playerId} className="flex items-center gap-2 rounded-xl border border-line bg-card px-2.5 py-1.5 shrink-0">
              <Avatar player={p} size={22} />
              <div className="leading-tight">
                <p className="text-[12px] font-bold text-ink">{p.name.split(' ')[0]}</p>
                <p className="text-[11px] text-ink-faint tabular-nums">
                  {thru === 0 ? 'no scores' : `${gross}${vs ? ` · ${vs}` : ''} thru ${thru}`}
                </p>
                {race && race.holes > 0 && (
                  <p
                    className={`text-[11px] font-bold tabular-nums ${
                      race.diff < 0 ? 'text-green' : race.diff > 0 ? 'text-flag' : 'text-ink-dim'
                    }`}
                  >
                    👻 {fmtDiff(race.diff)} vs {shortDate(ghost!.round.date)}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Race yourself: pick one of your earlier cards here. Shown only
          to the golfer it's for — the ghost is personal, even if
          everyone can see the race once it's on. */}
      {iPlay && myGhostOptions.length > 0 && (
        <Card className="mt-3 p-3.5">
          {myGhost ? (
            <div className="flex items-center gap-3">
              <span className="text-[18px]">👻</span>
              <p className="flex-1 min-w-0 text-[12.5px] text-ink-dim">
                Racing your <span className="font-extrabold text-ink tabular-nums">{myGhost.card.reduce<number>((s, h) => s + (h ?? 0), 0)}</span> from{' '}
                {shortDate(myGhost.round.date)}. Its scores show a hole at a time, as you post yours.
              </p>
              <button onClick={() => setMyGhost(null)} className="text-[12px] font-bold text-ink-faint shrink-0">
                Drop it
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="text-[18px]">👻</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-extrabold text-ink">Race a ghost?</p>
                  <p className="text-[12px] text-ink-dim">
                    You’ve played here before. Put one of those cards under yours and chase it hole by hole.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {myGhostOptions.slice(0, 5).map((o) => (
                  <button
                    key={o.round.id}
                    onClick={() => setMyGhost(o.round.id)}
                    className={`rounded-full px-3.5 py-2 text-[12.5px] font-bold border transition active:scale-95 ${
                      o.best ? 'border-gold/50 bg-gold-soft text-ink' : 'border-line-strong bg-card text-ink-dim'
                    }`}
                  >
                    <span className="tabular-nums">{o.gross}</span> · {shortDate(o.round.date)}
                    {o.best && <span className="ml-1 text-[10px] uppercase tracking-wider text-gold">best</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {/* The bets riding on this card, as it stands right now */}
      {liveBets.length > 0 && (
        <Card className="mt-3 p-3.5 bg-gold-soft/40 border-gold/30 space-y-1.5">
          {liveBets.map(({ bet, outcome }) => (
            <div key={bet.id} className="flex items-start justify-between gap-2">
              <p className="text-[12.5px] text-ink">
                <span className="font-extrabold">{bet.name}:</span>{' '}
                {outcome.detail
                  .map((line) => {
                    const [text, playerId] = line.split('|')
                    const who = playerId ? data.players.find((p) => p.id === playerId)?.name : null
                    return who ? `${who} ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text
                  })
                  .join(' · ')}
              </p>
              <HelpTip {...betRules(bet.type, { net: bet.net, winnerTakeAll: bet.winnerTakeAll })} />
            </div>
          ))}
        </Card>
      )}

      {/* The card */}
      <Card className="mt-3 overflow-hidden">
        <div ref={scroller} className="overflow-x-auto">
          <table className="border-collapse tabular-nums">
            <thead>
              <tr className="bg-ink text-white">
                <th className="sticky left-0 z-20 bg-ink px-3 text-left text-[10px] font-bold uppercase tracking-wider">Hole</th>
                {Array.from({ length: HOLE_COUNT }, (_, i) => (
                  <th
                    key={i}
                    ref={(el) => {
                      columns.current[i] = el
                    }}
                    onClick={() => select({ playerId: round.players[0].playerId, hole: i })}
                    className={`w-11 h-9 text-[13px] font-extrabold cursor-pointer ${active?.hole === i ? 'bg-green' : ''}`}
                  >
                    {i + 1}
                  </th>
                ))}
                <th className="w-12 h-9 text-[11px] font-extrabold">Tot</th>
              </tr>
              {yards && (
                <tr className="bg-paper/70">
                  <th className="sticky left-0 z-20 bg-paper px-3 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint whitespace-nowrap">
                    Yds{course?.yardsTee ? ` ${course.yardsTee}` : ''}
                  </th>
                  {yards.map((y, i) => (
                    <td key={i} className="h-7 text-center text-[11px] text-ink-dim">{y ?? ''}</td>
                  ))}
                  <td className="h-7 text-center text-[11px] text-ink-dim">{totalYards?.toLocaleString()}</td>
                </tr>
              )}
              {pars && (
                <tr className="bg-paper/70">
                  <th className="sticky left-0 z-20 bg-paper px-3 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">Par</th>
                  {pars.map((p, i) => (
                    <td key={i} className="h-7 text-center text-[12px] font-bold text-ink-dim">{p}</td>
                  ))}
                  <td className="h-7 text-center text-[12px] font-extrabold text-ink-dim">{coursePar}</td>
                </tr>
              )}
              {index && (
                <tr className="bg-paper/70 border-b border-line">
                  <th className="sticky left-0 z-20 bg-paper px-3 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint whitespace-nowrap">S. index</th>
                  {index.map((n, i) => (
                    <td key={i} className="h-7 text-center text-[11px] text-ink-faint">{n}</td>
                  ))}
                  <td />
                </tr>
              )}
            </thead>
            <tbody>
              {round.players.map((rp) => {
                const p = data.players.find((pl) => pl.id === rp.playerId)
                if (!p) return null
                const card = cards[rp.playerId]
                const dots = strokeDots?.[rp.playerId]
                const total = sum(card, 0, HOLE_COUNT)
                const vs = toParThru(card)
                const ghost = ghostFor(data, round, rp.playerId)
                const race = ghost ? ghostDiff(card, ghost.card) : null
                return (
                  <Fragment key={rp.playerId}>
                  <tr className="border-b border-line last:border-0">
                    <th className="sticky left-0 z-20 bg-card px-3 text-left">
                      <div className="flex items-center gap-2">
                        <Avatar player={p} size={22} />
                        <span className="text-[12.5px] font-bold text-ink whitespace-nowrap">{p.name.split(' ')[0]}</span>
                      </div>
                    </th>
                    {card.map((v, i) => {
                      const isActive = active?.playerId === rp.playerId && active.hole === i
                      const par = pars?.[i]
                      const mark = v != null && par != null ? MARK[scoreKind(v, par)] : 'text-ink font-bold'
                      return (
                        <td key={i} className="p-0">
                          <button
                            onClick={() => select({ playerId: rp.playerId, hole: i })}
                            aria-label={`${p.name}, hole ${i + 1}${v != null ? `, ${v}` : ''}`}
                            className={`${cellBase} ${isActive ? 'ring-2 ring-inset ring-green bg-green-soft/40' : ''}`}
                          >
                            {/* The stroke dots a paper card would carry */}
                            <span className="h-2 text-[8px] leading-none text-gold" aria-hidden>
                              {dots?.[i] ? '•'.repeat(Math.min(dots[i], 3)) : ''}
                            </span>
                            {v == null ? (
                              <span className="text-ink-faint">{isActive ? '_' : '·'}</span>
                            ) : (
                              <span className={`inline-flex h-7 w-7 items-center justify-center ${mark}`}>{v}</span>
                            )}
                          </button>
                        </td>
                      )
                    })}
                    <td className="text-center">
                      <p className="text-[14px] font-extrabold text-ink">{total || '–'}</p>
                      {vs && <p className="text-[10px] font-bold text-ink-faint -mt-0.5">{vs}</p>}
                    </td>
                  </tr>
                  {/* The ghost's card, one hole at a time: a hole shows only
                      once the live card has a score on it. */}
                  {ghost && race && (
                    <tr className="border-b border-line last:border-0 bg-paper/60">
                      <th className="sticky left-0 z-20 bg-paper px-3 text-left">
                        <span className="text-[11px] font-bold text-ink-dim whitespace-nowrap">👻 {shortDate(ghost.round.date)}</span>
                      </th>
                      {card.map((v, i) => {
                        const g = ghost.card[i]
                        const shown = v != null && g != null
                        const tone = !shown ? 'text-ink-faint' : v < g ? 'text-green' : v > g ? 'text-flag' : 'text-ink-dim'
                        return (
                          <td key={i} className={`h-8 text-center text-[12px] font-bold tabular-nums ${tone}`}>
                            {shown ? g : '·'}
                          </td>
                        )
                      })}
                      <td className="text-center">
                        {race.holes > 0 ? (
                          <>
                            <p className="text-[12px] font-bold text-ink-dim tabular-nums">{race.ghostSum}</p>
                            <p
                              className={`text-[10px] font-extrabold -mt-0.5 tabular-nums ${
                                race.diff < 0 ? 'text-green' : race.diff > 0 ? 'text-flag' : 'text-ink-faint'
                              }`}
                            >
                              you {fmtDiff(race.diff)}
                            </p>
                          </>
                        ) : (
                          <p className="text-[12px] text-ink-faint">–</p>
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
        <div className="flex items-center gap-x-3.5 gap-y-1 flex-wrap border-t border-line px-3 py-2 text-[10.5px] text-ink-faint">
          {strokeDots && (
            <span>
              <span className="text-gold text-[12px] leading-none">•</span> stroke here
            </span>
          )}
          {pars && (
            <>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-green-soft" /> birdie</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-md border border-line-strong bg-paper" /> bogey</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-md border border-flag/40 bg-flag-soft" /> double+</span>
            </>
          )}
          {!active && (
            <button
              onClick={() => select({ playerId: round.players[0].playerId, hole: firstOpenHole })}
              className="ml-auto text-[12px] font-bold text-green"
            >
              Score hole {firstOpenHole + 1} →
            </button>
          )}
        </div>
      </Card>

      <div className="mt-4">
        <PrimaryButton onClick={done} className="w-full !py-4">
          Done — back to the round
        </PrimaryButton>
      </div>
      <p className="text-[11.5px] text-ink-faint px-1 mt-2">
        Every tap saves by itself, so pocket the phone whenever — coming back picks up right where the card left off.
      </p>
      <div className="h-4" />

      {/* The pad. Fixed to the bottom like a keyboard, over the tab bar,
          and only there while a cell is picked. */}
      {active && (
        <div data-pad className="fixed inset-x-0 bottom-0 z-50 sheet-up">
          <div className="mx-auto max-w-md bg-card border-t border-line shadow-[0_-8px_24px_rgba(24,32,25,0.12)] pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-4 py-2 bg-paper border-b border-line">
              <p className="text-[12.5px] text-ink-dim">
                <span className="font-extrabold text-ink">
                  {data.players.find((pl) => pl.id === active.playerId)?.name.split(' ')[0]}
                </span>{' '}
                · hole {active.hole + 1}
                {pars?.[active.hole] != null && ` · par ${pars[active.hole]}`}
                {(strokeDots?.[active.playerId]?.[active.hole] ?? 0) > 0 && (
                  <span className="text-gold font-bold"> · {'•'.repeat(Math.min(strokeDots![active.playerId][active.hole], 3))} stroke</span>
                )}
              </p>
              <button onClick={() => setActive(null)} className="text-[13px] font-bold text-green">
                Done
              </button>
            </div>
            <div className="grid grid-cols-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                <button
                  key={d}
                  onClick={() => typeDigit(d)}
                  className={`h-14 border-b border-r border-line text-[24px] font-bold text-ink active:bg-paper ${
                    pars?.[active.hole] === d ? 'bg-green-soft/40' : 'bg-card'
                  }`}
                >
                  {d}
                </button>
              ))}
              <button onClick={clearActive} aria-label="Clear" className="h-14 border-r border-line bg-paper text-[15px] font-bold text-ink-dim active:bg-line">
                ⌫
              </button>
              <button onClick={() => typeDigit(0)} className="h-14 border-r border-line bg-card text-[24px] font-bold text-ink active:bg-paper">
                0
              </button>
              <button onClick={advance} className="h-14 bg-green text-[15px] font-extrabold text-white active:bg-green-deep">
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

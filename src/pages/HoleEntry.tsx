import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useNavigate } from '../lib/nav'
import { useStore } from '../data/store'
import { HOLE_COUNT, cardOf, cardTotal, holesEntered, puttsOf, tracksPutts } from '../lib/holes'
import {
  courseForRound,
  hasPars,
  hasStrokeIndex,
  ninesFor,
  ninesLabel,
  padded,
  playingHandicap,
  scoreKind,
  strokesOffLow,
  teeFor,
  toPar,
  yardsFor,
} from '../lib/courses'
import { settleFromCard } from '../lib/bets'
import { Confetti, buzz } from '../components/Delight'
import { MarkLegend, SCORE_MARK, StrokeDots } from '../components/scoreMarks'
import { PuttsRow } from '../components/PuttsRow'
import { fmtDiff, ghostDiff, ghostFor, ghostOptions } from '../lib/ghost'
import { scanScores, scanSupported, type ScannedScoreRow } from '../lib/scan'
import { roundStandings, shortDate } from '../lib/stats'
import { notifyGroup } from '../lib/push'
import { fmt1, type Round } from '../types'
import { Avatar, Card, HelpTip, PrimaryButton, Segmented } from '../components/ui'
import { betRules } from '../lib/betRules'
import { Icon, IconTile } from '../components/icons'
import { courseBrand, inkOn, teeColour } from '../lib/courseBrands'
import RoundScene from '../components/RoundScene'
import HoleMap from '../components/HoleMap'
import HoleMapSheet from '../components/HoleMapSheet'
import { autoFetchCourseMap, drawable, emptyCourseMap, greenCentre, greenYards, mapHoleFor, markKey, metres, ON_HOLE_METRES, saveCourseMap } from '../lib/courseMap'
import { useCourseMap } from '../lib/useCourseMap'
import { ordinal } from '../lib/ratings'
import { distancesWanted, setDistancesWanted, usePosition } from '../lib/usePosition'

// The live card, in two views.
//
// Hole: the hole you're on as one column cut out of the card, on a band
// the colour of the tees being played, with the yards, par and index under
// it and a row per golfer. The pad is always up, pointed at the next box
// to fill, and the last key reads Next hole. That's the GHIN posting
// screen, borrowed on purpose, since everyone in the group already knows it.
//
// Card: the whole card like the one in your pocket, all eighteen across
// with Out and In, scrolling sideways with the names pinned, strokes
// marked on the holes they land on, ghosts under their golfers, and the
// bets settling above it as it fills.
//
// Still a companion, not an editor. Every tap saves itself, nothing
// moves unless you tap Next, and leaving mid-round costs nothing.


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
  // Putts, the same way: what this session tapped, laid over the round.
  // And who this session switched putts tracking on or off for.
  const [puttEdits, setPuttEdits] = useState<Record<string, Record<number, number | null>>>({})
  const [trackEdits, setTrackEdits] = useState<Record<string, boolean>>({})
  const [pickingPutters, setPickingPutters] = useState(false)
  const [active, setActive] = useState<Active | null>(null)
  // Digits typed into the active cell so far. "1" then "2" is a 12; any
  // other pair, the second replaces the first. No timers — the first
  // live round proved a clock is wrong for whoever is holding the phone.
  const [buffer, setBuffer] = useState('')
  const commitRef = useRef<() => void>(() => {})
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scroller = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<'hole' | 'card'>('hole')
  // The hole the Hole view shows. Starts on the first hole nobody has
  // filled in, and follows the pad as Next walks the card.
  const [hole, setHole] = useState<number | null>(null)
  // The last score worth a reaction, so its cell can pop, and a counter
  // that fires the confetti for the big ones.
  const [cheer, setCheer] = useState<{ playerId: string; hole: number; label: string; big: boolean; n: number } | null>(null)
  const [confetti, setConfetti] = useState(0)
  useEffect(() => {
    if (!cheer) return
    const t = setTimeout(() => setCheer(null), 1500)
    return () => clearTimeout(t)
  }, [cheer])
  // The paper-card scan under review (see onScanPhoto below). Every hook
  // has to sit above the not-found return: in cloud mode the round can
  // arrive after the first render, and a hook count that changes between
  // renders crashes the page.
  const scanRef = useRef<HTMLInputElement>(null)
  const [scanBusy, setScanBusy] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanRows, setScanRows] = useState<(ScannedScoreRow & { playerId: string | null })[] | null>(null)
  const [scanWarnings, setScanWarnings] = useState<string[]>([])

  const players = round?.players ?? []
  const cards: Record<string, (number | null)[]> = Object.fromEntries(
    players.map((rp) => {
      const merged = cardOf(rp)
      for (const [index, value] of Object.entries(edits[rp.playerId] ?? {})) merged[Number(index)] = value
      return [rp.playerId, merged]
    }),
  )
  const tracking = (playerId: string) => {
    const rp = players.find((x) => x.playerId === playerId)
    return trackEdits[playerId] ?? (rp ? tracksPutts(rp, data.currentUserId) : false)
  }
  const puttCards: Record<string, (number | null)[]> = Object.fromEntries(
    players.map((rp) => {
      const merged = puttsOf(rp)
      for (const [index, value] of Object.entries(puttEdits[rp.playerId] ?? {})) merged[Number(index)] = value
      return [rp.playerId, merged]
    }),
  )

  const course = (round ? courseForRound(data, round) : undefined)
  const brand = courseBrand(round?.courseName)
  const pars = hasPars(course) ? padded(course.pars) : null
  const index = hasStrokeIndex(course) ? padded(course.strokeIndex) : null
  // The yards off the tee being played when the course has that tee's
  // holes, else the card's own row, labelled with the tee it is from.
  const yardsCard = yardsFor(course, round?.tee)
  const yards = yardsCard?.yards ?? null
  const strokeDots =
    hasStrokeIndex(course) && players.length > 1 ? strokesOffLow(course, players, round?.tee) : null

  // The hole map and GPS. Distances are this phone's own, and only once
  // its golfer has turned them on (the location prompt comes from that
  // tap, once). The map's holes follow the round's nines on a 27.
  const { map: courseMap, reload: reloadMap } = useCourseMap(course?.id)
  const pair = round ? ninesFor(course, round) : null
  const ninePair = pair ? ([pair[0].name, pair[1].name] as [string, string]) : null
  const mapHoleAt = (i: number) => (courseMap ? mapHoleFor(courseMap, i, ninePair) : undefined)
  const [gpsOn, setGpsOn] = useState(distancesWanted)
  const pos = usePosition(gpsOn && !!courseMap)
  // A course with no map yet gets one tried in the background, once per
  // phone, the first time a round opens there.
  const courseId = course?.id
  useEffect(() => {
    const c = courseId ? data.courses.find((x) => x.id === courseId) : undefined
    if (courseMap !== null || !c) return
    void autoFetchCourseMap(c).then((got) => got && reloadMap())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseMap, courseId])
  const [mapOpen, setMapOpen] = useState<number | null>(null)
  const [marking, setMarking] = useState(false)

  const liveRound: Round | null = round
    ? { ...round, players: round.players.map((rp) => ({ ...rp, holes: cards[rp.playerId] })) }
    : null
  const liveBets = (round && liveRound ? data.bets.filter((b) => b.roundId === round.id) : [])
    .map((bet) => ({ bet, outcome: settleFromCard(bet, liveRound!, course) }))
    .filter((x): x is { bet: (typeof x)['bet']; outcome: NonNullable<(typeof x)['outcome']> } => x.outcome != null)

  // Keep the column you're on in view on the card, as Next walks across
  // or when the card opens.
  useEffect(() => {
    if (view !== 'card') return
    scroller.current?.querySelector('[data-current]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [active, view, hole])

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
      // Putts: the holes when tracked, an empty list once turned off,
      // and nothing at all for a round that never said either way.
      const putts = puttCards[rp.playerId]
      const said = rp.putts !== undefined || trackEdits[rp.playerId] !== undefined
      const nextPutts = tracking(rp.playerId)
        ? said || putts.some((p) => p != null)
          ? putts
          : undefined
        : said
          ? []
          : undefined
      return {
        ...rp,
        holes: card.some((h) => h != null) ? card : undefined,
        gross: complete ? cardTotal(card) : rp.gross,
        putts: nextPutts,
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

  // Tapping the putts already showing clears them; anything else sets them.
  const setPutts = (playerId: string, hole: number, value: number) => {
    const now = puttCards[playerId]?.[hole]
    setPuttEdits((all) => ({ ...all, [playerId]: { ...(all[playerId] ?? {}), [hole]: now === value ? null : value } }))
    queueCommit()
  }

  const toggleTracking = (playerId: string) => {
    setTrackEdits((all) => ({ ...all, [playerId]: !tracking(playerId) }))
    queueCommit()
  }

  // Under par gets a reaction: a ring and "Birdie" for one under, the
  // same plus confetti for anything better. Over par gets nothing; the
  // square on the card says enough.
  const celebrate = (playerId: string, hole: number, value: number) => {
    const par = pars?.[hole]
    if (par == null) return
    const kind = value === 1 ? 'ace' : scoreKind(value, par)
    const label =
      kind === 'ace' ? 'Ace!' : kind === 'albatross' ? 'Albatross!' : kind === 'eagle' ? 'Eagle!' : kind === 'birdie' ? 'Birdie' : null
    if (!label) return
    const big = kind !== 'birdie'
    setCheer((c) => ({ playerId, hole, label, big, n: (c?.n ?? 0) + 1 }))
    if (big) setConfetti((n) => n + 1)
    buzz(big ? [30, 50, 30, 50, 70] : 25)
  }

  // Start on the first hole nobody has filled in.
  const firstOpenHole = Math.min(
    Math.max(0, ...round.players.map((rp) => holesEntered(rp))),
    HOLE_COUNT - 1,
  )
  const h = hole ?? firstOpenHole
  // On the Hole view the pad is always up, pointed at the first golfer on
  // this hole without a score (the first golfer once they're all in), so
  // the only thing to do is type. On the Card view it's up once a box is
  // picked.
  const cur: Active | null =
    active ??
    (view === 'hole'
      ? { playerId: (round.players.find((rp) => cards[rp.playerId][h] == null) ?? round.players[0]).playerId, hole: h }
      : null)

  // A lone "1" might be the start of a 12, so an ace only counts once
  // the cell is left with the 1 still in it.
  const leaveCell = () => {
    if (cur && buffer === '1') celebrate(cur.playerId, cur.hole, 1)
  }

  // Picking a box (or Next walking to another hole) takes the Hole view
  // with it.
  const select = (cell: Active) => {
    leaveCell()
    setActive(cell)
    setHole(cell.hole)
    setBuffer('')
  }

  // Down the golfers on this hole, then on to the next hole's first —
  // the order a scorekeeper reads names off a green.
  const isLastGolfer = !!cur && round.players[round.players.length - 1].playerId === cur.playerId
  const advance = () => {
    if (!cur) return
    const i = round.players.findIndex((rp) => rp.playerId === cur.playerId)
    if (i < round.players.length - 1) return select({ playerId: round.players[i + 1].playerId, hole: cur.hole })
    if (cur.hole < HOLE_COUNT - 1) return select({ playerId: round.players[0].playerId, hole: cur.hole + 1 })
    leaveCell()
    setActive(null)
    if (view === 'hole') done()
  }

  // Typing pins the box the pad was pointing at, so a 1 then a 2 lands
  // as a 12 in the same box instead of the pad moving on after the 1.
  const typeDigit = (d: number) => {
    if (!cur) return
    if (!active) setActive(cur)
    if (buffer === '1' && d >= 0 && d <= 9) {
      setScore(cur.playerId, cur.hole, 10 + d)
      setBuffer('')
      return
    }
    if (d === 0) return
    setScore(cur.playerId, cur.hole, d)
    setBuffer(String(d))
    if (d !== 1) celebrate(cur.playerId, cur.hole, d)
  }

  const clearActive = () => {
    if (!cur) return
    if (!active) setActive(cur)
    setScore(cur.playerId, cur.hole, null)
    setBuffer('')
  }

  // Stepping to another hole with the arrows: the pad points at that
  // hole's first open box.
  const goHole = (i: number) => {
    leaveCell()
    setActive(null)
    setBuffer('')
    setHole(Math.max(0, Math.min(HOLE_COUNT - 1, i)))
  }

  const closePad = () => {
    leaveCell()
    setActive(null)
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

  // Course handicaps for the tee on the round, so "how many do I get"
  // is settled on the first tee rather than argued on the eighteenth.
  const tee = hasPars(course) ? teeFor(course, round.tee) : null
  const courseHandicaps = tee
    ? round.players.map((rp) => ({
        rp,
        name: data.players.find((pl) => pl.id === rp.playerId)?.name.split(' ')[0] ?? '?',
        hcp: playingHandicap(course, rp.handicapSnapshot, round.tee),
      }))
    : []
  const lowHcp = courseHandicaps.length ? Math.min(...courseHandicaps.map((c) => c.hcp)) : 0

  // Reading the paper card at the end. The photo goes to the same
  // function as the course scanner, in scores mode; what comes back is
  // laid out for review with each row matched to a golfer by name, and
  // nothing lands on the card until Apply. Its state is declared up top
  // with the other hooks.

  const matchPlayer = (name: string | null): string | null => {
    if (!name) return null
    const n = name.trim().toLowerCase()
    const hit = round.players
      .map((rp) => data.players.find((pl) => pl.id === rp.playerId))
      .find((pl) => {
        if (!pl) return false
        const full = pl.name.toLowerCase()
        const first = full.split(' ')[0]
        return n === full || n === first || n === pl.initials.toLowerCase() || full.startsWith(n) || n.startsWith(first)
      })
    return hit?.id ?? null
  }

  const onScanPhoto = async (file: File | undefined) => {
    if (!file) return
    setScanBusy(true)
    setScanError(null)
    try {
      const { rows, warnings, notes } = await scanScores(file)
      setScanRows(rows.map((r) => ({ ...r, playerId: matchPlayer(r.name) })))
      setScanWarnings([...warnings, ...notes])
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err))
    } finally {
      setScanBusy(false)
      if (scanRef.current) scanRef.current.value = ''
    }
  }

  const applyScan = () => {
    if (!scanRows) return
    setEdits((all) => {
      const next = { ...all }
      for (const row of scanRows) {
        if (!row.playerId) continue
        const mine = { ...(next[row.playerId] ?? {}) }
        row.scores.forEach((s, i) => {
          if (s != null) mine[i] = Math.max(1, Math.min(20, s))
        })
        next[row.playerId] = mine
      }
      return next
    })
    queueCommit()
    setScanRows(null)
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

  const cellBase =
    'w-11 h-11 flex flex-col items-center justify-center text-body tabular-nums select-none active:bg-paper transition'

  // Who gets what off this tee: the first-tee conversation, settled.
  const handicapLine = tee && courseHandicaps.length > 0 && (
        <p className="mt-2 px-1 text-caption text-ink-faint tabular-nums">
          Course handicaps{round.tee ? ` off the ${round.tee}s` : ''} ({tee.rating}/{tee.slope}):{' '}
          {courseHandicaps.map((c) => `${c.name} ${c.hcp}`).join(' · ')}
          {courseHandicaps.length > 1 &&
            hasStrokeIndex(course) &&
            `. Strokes off ${courseHandicaps.find((c) => c.hcp === lowHcp)?.name}: ${courseHandicaps
              .filter((c) => c.hcp > lowHcp)
              .map((c) => `${c.name} ${c.hcp - lowHcp}`)
              .join(', ') || 'none'}`}
        </p>
      )

  // Race yourself: pick one of your earlier cards here. Shown only to the
  // golfer it's for; the ghost is personal, even if everyone can see the
  // race once it's on.
  const ghostPicker = iPlay && myGhostOptions.length > 0 && (
        <Card className="mt-3 p-3.5">
          {myGhost ? (
            <div className="flex items-center gap-3">
              <IconTile name="ghost" tone="plain" size={34} />
              <p className="flex-1 min-w-0 text-footnote text-ink-dim">
                Racing your <span className="font-extrabold text-ink tabular-nums">{myGhost.card.reduce<number>((s, h) => s + (h ?? 0), 0)}</span> from{' '}
                {shortDate(myGhost.round.date)}. Its scores show a hole at a time, as you post yours.
              </p>
              <button onClick={() => setMyGhost(null)} className="text-footnote font-bold text-ink-faint shrink-0">
                Drop it
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <IconTile name="ghost" tone="plain" size={34} />
                <div className="flex-1 min-w-0">
                  <p className="text-footnote font-bold text-ink">Race a ghost?</p>
                  <p className="text-footnote text-ink-dim">
                    You’ve played here before. Put one of those cards under yours and chase it hole by hole.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {myGhostOptions.slice(0, 5).map((o) => (
                  <button
                    key={o.round.id}
                    onClick={() => setMyGhost(o.round.id)}
                    className={`rounded-full px-3.5 py-2 text-footnote font-bold border transition active:scale-95 ${
                      o.best ? 'border-gold/50 bg-gold-soft text-ink' : 'border-line-strong bg-card text-ink-dim'
                    }`}
                  >
                    <span className="tabular-nums">{o.gross}</span> · {shortDate(o.round.date)}
                    {o.best && <span className="ml-1 text-caption font-semibold text-gold">best</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>
      )

  const betLine = (detail: string[]) =>
    detail
      .map((line) => {
        const [text, playerId] = line.split('|')
        const who = playerId ? data.players.find((p) => p.id === playerId)?.name : null
        return who ? `${who} ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text
      })
      .join(' · ')

  const totalEntered = round.players.reduce((n, rp) => n + (cards[rp.playerId]?.filter((x) => x != null).length ?? 0), 0)
  const totalYards = yards ? yards.reduce<number>((s, y) => s + (y ?? 0), 0) : null
  const coursePar = pars ? pars.reduce<number>((s, p) => s + (p ?? 0), 0) : null
  const myCard = iPlay ? cards[me] : null

  // The hole row, on the Hole view and the card alike, is the colour of
  // the tees being played, like the marker on the tee box. A tee with no
  // clear colour gets the course's own (its logo's), and a course with
  // neither the Sandbagger forest. A pale tee (white, gold) gets dark ink
  // and a hairline so it doesn't wash out.
  const ribbon = teeColour(round.tee) ?? brand?.color
  const ribbonInk = ribbon ? inkOn(ribbon) : '#FFFFFF'
  const pale = ribbonInk !== '#FFFFFF'
  const bandStyle = ribbon ? { backgroundColor: ribbon, color: ribbonInk } : undefined
  const yardsDot = teeColour(yardsCard?.tee)
  // The column the card is on: the box being typed in, else the hole the
  // Hole view was showing.
  const here = cur?.hole ?? h

  // A score worth cheering, drawn over its box: a ring (two for the big
  // ones) spreading off it, and the word floating up.
  const cheerBits = (playerId: string, i: number) => {
    if (!cheer || cheer.playerId !== playerId || cheer.hole !== i) return null
    return (
      <>
        <i className="cheer-ring pointer-events-none absolute inset-0 rounded-full border-2 border-green" />
        {cheer.big && (
          <i className="cheer-ring pointer-events-none absolute inset-0 rounded-full border-2 border-gold" style={{ animationDelay: '0.15s' }} />
        )}
        <span
          className={`cheer-float pointer-events-none absolute left-1/2 -top-4 whitespace-nowrap text-caption font-extrabold uppercase ${
            cheer.big ? 'text-gold' : 'text-green'
          }`}
        >
          {cheer.label}
        </span>
      </>
    )
  }
  const isCheering = (playerId: string, i: number) => cheer != null && cheer.playerId === playerId && cheer.hole === i

  // The front nine, Out, the back nine, In: the order a paper card runs.
  const across = (hole: (i: number) => ReactNode, out: ReactNode, inn: ReactNode) => [
    ...Array.from({ length: 9 }, (_, i) => hole(i)),
    out,
    ...Array.from({ length: 9 }, (_, i) => hole(i + 9)),
    inn,
  ]

  // Back to the round, and the Hole / Card switch.
  const topBar = (overScene: boolean) => (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={done}
        aria-label="Back to the round"
        className={`flex h-10 w-10 items-center justify-center rounded-full text-ink active:scale-95 transition ${
          overScene ? 'bg-white/85 backdrop-blur' : 'bg-card border border-line'
        }`}
      >
        <Icon name="chevronLeft" size={20} />
      </button>
      <Segmented
        label="View"
        overlay={overScene}
        options={[
          ['hole', 'Hole'],
          ['card', 'Card'],
        ]}
        value={view}
        onChange={(v) => {
          closePad()
          setView(v)
        }}
        className="w-40"
      />
      <span className="w-10" />
    </div>
  )

  // One golfer's box on the Hole view: big, with the mark it earns, and
  // outlined in green while the pad is pointed at it.
  const bigBox = (playerId: string, i: number) => {
    const v = cards[playerId][i]
    const pointed = cur?.playerId === playerId && cur.hole === i
    const par = pars?.[i]
    const mark = v != null && par != null ? SCORE_MARK[scoreKind(v, par)] : 'text-ink font-extrabold'
    const cheering = isCheering(playerId, i)
    return (
      <button
        type="button"
        onClick={() => select({ playerId, hole: i })}
        aria-label={`${data.players.find((pl) => pl.id === playerId)?.name ?? ''}, hole ${i + 1}${v != null ? `, ${v}` : ', no score'}`}
        className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${pointed ? 'ring-2 ring-green bg-green-soft/60' : ''}`}
      >
        {v == null ? (
          !pointed && <span className="h-11 w-11 rounded-lg border-[1.5px] border-dashed border-line-strong" />
        ) : (
          <span
            key={cheering ? `cheer-${cheer!.n}` : 'mark'}
            className={`relative inline-flex h-11 w-11 items-center justify-center text-title tabular-nums ${mark} ${cheering ? 'cheer-pop' : ''}`}
          >
            {v}
            {cheerBits(playerId, i)}
          </span>
        )}
      </button>
    )
  }

  // ---------------- Hole view ----------------
  // The hole as one column cut out of the scorecard: the hole number on
  // the tee-coloured band, the yards, par and index under it the way a
  // card prints them, then a row per golfer with their box. The course's
  // scene fills whatever the golfers leave, big for a solo round and a
  // slim band for a foursome, and the pad sits underneath, always up.
  const facts: { label: string; value: string; dot?: string }[] = [
    yards?.[h] != null && { label: yardsCard?.tee ? `${yardsCard.tee} yds` : 'Yards', value: String(yards[h]), dot: yardsDot },
    pars?.[h] != null && { label: 'Par', value: String(pars[h]) },
    index?.[h] != null && { label: 'Index', value: String(index[h]) },
  ].filter((x): x is { label: string; value: string; dot?: string } => !!x)
  // The hole drawn where the scene was, when the map has it, with the
  // distance to the green on it. Tap it for the full map.
  const mapHole = mapHoleAt(h)
  const onThisHole = !!(mapHole && courseMap && pos.at && metres(pos.at, greenCentre(courseMap, mapHole)) < ON_HOLE_METRES)
  const gy = onThisHole ? greenYards(courseMap!, mapHole!, pos.at!) : null
  // A fix worse than about 15 yards either way shows grey, not trusted.
  const weakFix = pos.accuracy != null && pos.accuracy > 14
  // Standing on another hole's tee: the card is usually still on the
  // hole just finished. Offered, never done for you.
  const onTee = (() => {
    if (!courseMap || !pos.at) return null
    for (let i = 0; i < HOLE_COUNT; i++) {
      const t = mapHoleAt(i)?.line?.[0]
      if (t && i !== h && metres(pos.at, t) < 25) return i
    }
    return null
  })()
  // A hole the map hasn't got: standing on its green and tapping saves
  // that spot for everyone, and distances work here from then on.
  const markGreenHere = async () => {
    if (!course || !pos.at) return
    setMarking(true)
    try {
      const base = courseMap ?? emptyCourseMap()
      await saveCourseMap(course, { ...base, marked: { ...base.marked, [markKey(h, ninePair)]: pos.at } })
      reloadMap()
    } finally {
      setMarking(false)
    }
  }
  const greenButton =
    courseMap && gpsOn && pos.at && !mapHole ? (
      <button type="button" onClick={() => void markGreenHere()} disabled={marking} className="rounded-full bg-forest px-3 py-2 text-footnote font-bold text-on-forest active:scale-95 disabled:opacity-60">
        {marking ? 'Saving…' : 'I’m on the green'}
      </button>
    ) : null
  const distanceChip = !courseMap ? null : !gpsOn ? (
    <button
      type="button"
      onClick={() => {
        setDistancesWanted(true)
        setGpsOn(true)
      }}
      className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-2 text-footnote font-bold text-ink active:scale-95"
    >
      <Icon name="pin" size={15} />
      Distances
    </button>
  ) : pos.error ? (
    <span className="max-w-[240px] rounded-xl bg-white/95 px-3 py-2 text-caption font-semibold text-flag">{pos.error}</span>
  ) : !pos.at ? (
    <span className="rounded-full bg-white/95 px-3 py-2 text-footnote font-semibold text-ink-dim">Finding you…</span>
  ) : !mapHole ? null : gy ? (
    <span className={`rounded-xl bg-white/95 px-3 py-1.5 ${weakFix ? 'text-ink-faint' : 'text-ink'}`}>
      <span className="flex items-baseline gap-1.5">
        <span className="text-title font-extrabold tabular-nums">{gy.middle}</span>
        <span className="text-caption font-semibold text-ink-dim">{gy.front == null && gy.back == null ? 'to the green' : 'to middle'}</span>
      </span>
      {(gy.front != null || gy.back != null) && (
        <span className="block text-caption font-semibold tabular-nums text-ink-dim">
          Front {gy.front ?? '–'} · Back {gy.back ?? '–'}
        </span>
      )}
    </span>
  ) : (
    <span className="rounded-full bg-white/95 px-3 py-2 text-footnote font-semibold text-ink-dim">Not on this hole</span>
  )

  const holeView = (
    <div className="-mx-4 -mt-3 flex flex-col" style={{ minHeight: 'calc(100dvh - 290px)' }}>
      <div className={`relative flex-1 overflow-hidden ${drawable(mapHole) ? 'min-h-[170px]' : 'min-h-[132px]'}`}>
        {mapHole && courseMap && drawable(mapHole) ? (
          <>
            <HoleMap map={courseMap} hole={mapHole} from={pos.at} mode="mini" padTop={52} className="absolute inset-0 h-full w-full" />
            <button type="button" onClick={() => setMapOpen(h)} aria-label={`Open the map of hole ${h + 1}`} className="absolute inset-0" />
          </>
        ) : (
          <RoundScene round={round} className="absolute inset-0 h-full w-full" />
        )}
        {courseMap && (
          <div className="pointer-events-none absolute bottom-2.5 left-3 flex flex-col items-start gap-1.5 [&>*]:pointer-events-auto">
            {onTee != null && (
              <button type="button" onClick={() => goHole(onTee)} className="rounded-full bg-forest px-3 py-1.5 text-footnote font-bold text-on-forest active:scale-95">
                On the {ordinal(onTee + 1)} tee? Go there
              </button>
            )}
            {greenButton}
            {distanceChip}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/20 to-transparent" />
        <div className="absolute inset-x-4 top-3">{topBar(true)}</div>
      </div>

      <div className={`flex items-center gap-2 px-3 py-2.5 ${ribbon ? '' : 'bg-forest text-on-forest'} ${pale ? 'border-b border-line-strong' : ''}`} style={bandStyle}>
        <button
          type="button"
          onClick={() => goHole(h - 1)}
          disabled={h === 0}
          aria-label="Previous hole"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-30 ${pale ? 'bg-black/[0.07]' : 'bg-white/15'}`}
        >
          <Icon name="chevronLeft" size={20} />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2.5">
          {brand?.logo && (
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white p-0.5 ${pale ? 'ring-1 ring-line-strong' : ''}`}
              style={brand.dark ? { backgroundColor: brand.color } : undefined}
            >
              <img src={brand.logo} alt="" className="max-h-full max-w-full object-contain" />
            </span>
          )}
          <h1 className="text-title font-extrabold tracking-tight">Hole {h + 1}</h1>
        </div>
        <button
          type="button"
          onClick={() => goHole(h + 1)}
          disabled={h === HOLE_COUNT - 1}
          aria-label="Next hole"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-30 ${pale ? 'bg-black/[0.07]' : 'bg-white/15'}`}
        >
          <Icon name="chevronRight" size={20} />
        </button>
      </div>

      {/* What the card prints under the hole number. */}
      <div
        className="grid divide-x divide-line border-b border-line bg-paper"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, facts.length)}, minmax(0, 1fr))` }}
      >
        {facts.length > 0 ? (
          facts.map((x) => (
            <div key={x.label} className="flex flex-col items-center py-2">
              <span className="flex items-center gap-1.5 text-caption font-semibold text-ink-faint">
                {x.dot && <span className="h-2.5 w-2.5 rounded-full ring-1 ring-ink/20" style={{ backgroundColor: x.dot }} aria-hidden />}
                {x.label}
              </span>
              <span className="text-title font-extrabold tabular-nums text-ink">{x.value}</span>
            </div>
          ))
        ) : (
          <p className="py-3 text-center text-footnote text-ink-dim">No card for this course yet. Add it from the course page.</p>
        )}
      </div>

      <div className="bg-card">
        {round.players.map((rp) => {
          const p = data.players.find((pl) => pl.id === rp.playerId)
          if (!p) return null
          const card = cards[rp.playerId]
          const thru = card.filter((x) => x != null).length
          const vs = toParThru(card)
          const strokes = strokeDots?.[rp.playerId]?.[h] ?? 0
          const ghost = ghostFor(data, round, rp.playerId)
          const ghostHere = ghost?.card[h]
          const pointing = cur?.playerId === rp.playerId
          return (
            <div
              key={rp.playerId}
              className={`flex min-h-[64px] items-center gap-3 border-b border-line px-4 py-1 ${pointing ? 'bg-green-soft/40' : ''}`}
            >
              <Avatar player={p} size={32} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-headline font-bold text-ink">
                  <span className="truncate">{p.name.split(' ')[0]}</span>
                  {strokes > 0 && (
                    <span className="shrink-0 rounded-full bg-gold-soft px-2 py-0.5 text-caption font-bold text-gold">
                      {'•'.repeat(Math.min(strokes, 3))} stroke{strokes > 1 ? 's' : ''}
                    </span>
                  )}
                </p>
                <p className="truncate text-footnote text-ink-dim tabular-nums">
                  {thru === 0 ? 'No scores yet' : `${sum(card, 0, HOLE_COUNT)}${vs ? ` (${vs})` : ''} thru ${thru}`}
                  {ghostHere != null && (
                    <>
                      {' · '}
                      <Icon name="ghost" size={12} className="inline -mt-0.5" /> made {ghostHere}
                    </>
                  )}
                </p>
                {/* Putts, for the golfers tracking them: one tap, and
                    tapping the same number again clears it. */}
                {tracking(rp.playerId) && (
                  <div className="mt-1 mb-0.5 flex items-center gap-1" role="group" aria-label={`${p.name.split(' ')[0]}'s putts on hole ${h + 1}`}>
                    <span className="mr-0.5 text-caption font-semibold text-ink-faint">Putts</span>
                    {[0, 1, 2, 3, 4].map((n) => {
                      const on = puttCards[rp.playerId][h] === n
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setPutts(rp.playerId, h, n)}
                          aria-pressed={on}
                          className={`h-7 min-w-7 rounded-lg border px-1.5 text-footnote font-extrabold tabular-nums transition active:scale-95 ${
                            on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-card text-ink-dim'
                          }`}
                        >
                          {n === 4 ? '4+' : n}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              {bigBox(rp.playerId, h)}
            </div>
          )
        })}
      </div>

      {/* Who's tracking putts this round: you, unless you say otherwise. */}
      <div className="px-4 pt-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-footnote text-ink-dim">
            Putts:{' '}
            <span className="font-bold text-ink">
              {(() => {
                const names = round.players
                  .filter((rp) => tracking(rp.playerId))
                  .map((rp) => (rp.playerId === me ? 'You' : (data.players.find((pl) => pl.id === rp.playerId)?.name.split(' ')[0] ?? '?')))
                return names.length ? names.join(', ') : 'off'
              })()}
            </span>
          </p>
          <button type="button" onClick={() => setPickingPutters((v) => !v)} className="shrink-0 text-footnote font-bold text-green">
            {pickingPutters ? 'Done' : 'Change'}
          </button>
        </div>
        {pickingPutters && (
          <div className="mt-2 flex flex-wrap gap-2">
            {round.players.map((rp) => {
              const pl = data.players.find((x) => x.id === rp.playerId)
              if (!pl) return null
              const on = tracking(rp.playerId)
              return (
                <button
                  key={rp.playerId}
                  type="button"
                  onClick={() => toggleTracking(rp.playerId)}
                  aria-pressed={on}
                  className={`rounded-full border px-3.5 py-1.5 text-footnote font-bold transition ${
                    on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-card text-ink-dim'
                  }`}
                >
                  {rp.playerId === me ? 'You' : pl.name.split(' ')[0]}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="space-y-3 px-4 pt-3">
        {totalEntered === 0 && handicapLine}
        {liveBets.length > 0 && (
          <Card className="p-3.5 bg-gold-soft/40 border-gold/30 space-y-1">
            {liveBets.slice(0, 2).map(({ bet, outcome }) => (
              <p key={bet.id} className="text-footnote text-ink">
                <span className="font-bold">{bet.name}:</span> {betLine(outcome.detail)}
              </p>
            ))}
            {liveBets.length > 2 && (
              <button onClick={() => setView('card')} className="text-footnote font-bold text-green">
                All {liveBets.length} bets on the card
              </button>
            )}
          </Card>
        )}
        {/* The ghost is offered on the first tee, before you've scored. */}
        {myCard && myCard.every((x) => x == null) && ghostPicker}
      </div>
    </div>
  )

  return (
    // No entry animation here: it leaves a transform on the wrapper, and
    // a fixed element inside a transformed box is fixed to the box, not
    // the screen — the first cut had the tab bar drawn over the pad.
    <div className={view === 'hole' ? 'pb-[150px]' : active ? 'pb-72' : ''}>
      <Confetti fire={confetti} originY={0.4} />
      {mapOpen != null && courseMap && (
        <HoleMapSheet
          map={courseMap}
          holeAt={mapHoleAt}
          index={mapOpen}
          onIndex={setMapOpen}
          par={pars?.[mapOpen]}
          from={pos.at}
          onClose={() => setMapOpen(null)}
        />
      )}
      {view === 'hole' ? (
        holeView
      ) : (
        <>
      <div className="pt-1">{topBar(false)}</div>
      <header className="pt-4 pb-3 px-1">
        <h1 className="text-title font-bold tracking-tight text-ink truncate">{round.courseName}</h1>
        <p className="text-footnote text-ink-dim tabular-nums">
          {ninesLabel(course, round) && `${ninesLabel(course, round)} · `}
          {round.tee ? `${round.tee} tees` : 'Tees not noted'}
          {coursePar != null && ` · par ${coursePar}`}
          {totalYards != null &&
            ` · ${totalYards.toLocaleString()} yds${yardsCard?.tee && round.tee && teeColour(yardsCard.tee) !== teeColour(round.tee) ? ` (${yardsCard.tee})` : ''}`}
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
                <p className="text-footnote font-bold text-ink">{p.name.split(' ')[0]}</p>
                <p className="text-caption text-ink-faint tabular-nums">
                  {thru === 0 ? 'no scores' : `${gross}${vs ? ` · ${vs}` : ''} thru ${thru}`}
                </p>
                {race && race.holes > 0 && (
                  <p
                    className={`text-caption font-bold tabular-nums ${
                      race.diff < 0 ? 'text-green' : race.diff > 0 ? 'text-flag' : 'text-ink-dim'
                    }`}
                  >
                    <Icon name="ghost" size={12} className="inline -mt-0.5 mr-0.5" />
                    {fmtDiff(race.diff)} vs {shortDate(ghost!.round.date)}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {handicapLine}

      {/* The paper card, read into the phone. For the round nobody
          scored live: photograph the filled card and every row lands
          under the right name for a once-over. */}
      {scanSupported() && (
        <>
          <input
            ref={scanRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-label="Photograph the filled-in scorecard"
            onChange={(e) => void onScanPhoto(e.target.files?.[0])}
          />
          {!scanRows && (
            <div className="mt-2 px-1 flex items-center gap-3">
              <button
                onClick={() => scanRef.current?.click()}
                disabled={scanBusy}
                className="inline-flex items-center gap-1.5 text-footnote font-bold text-green disabled:opacity-50"
              >
                <Icon name="camera" size={16} />
                {scanBusy ? 'Reading the card…' : 'Read scores off the paper card'}
              </button>
              {scanError && <span className="text-footnote font-semibold text-flag">{scanError}</span>}
            </div>
          )}
          {scanRows && (
            <Card className="mt-3 p-3.5 border-gold/40 bg-gold-soft/40">
              <p className="text-footnote font-bold text-ink">Read from your photo</p>
              <p className="text-footnote text-ink-dim mt-0.5">
                Match each row to a golfer, check the numbers, then Apply. Anything the reader couldn’t make out stays blank.
              </p>
              <div className="mt-2.5 space-y-2.5">
                {scanRows.map((row, idx) => {
                  const filled = row.scores.filter((s): s is number => s != null)
                  const sum = filled.reduce((s, x) => s + x, 0)
                  return (
                    <div key={idx} className="rounded-xl border border-line bg-card p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-footnote text-ink-faint truncate">“{row.name ?? 'no name'}” →</span>
                        <select
                          value={row.playerId ?? ''}
                          onChange={(e) =>
                            setScanRows((rows) =>
                              rows ? rows.map((r, i) => (i === idx ? { ...r, playerId: e.target.value || null } : r)) : rows,
                            )
                          }
                          className="flex-1 rounded-lg border border-line-strong bg-card px-2 py-1.5 text-footnote font-bold text-ink"
                        >
                          <option value="">Skip this row</option>
                          {round.players.map((rp) => {
                            const pl = data.players.find((p) => p.id === rp.playerId)
                            return pl ? (
                              <option key={pl.id} value={pl.id}>
                                {pl.name}
                              </option>
                            ) : null
                          })}
                        </select>
                        <span className="text-footnote font-extrabold text-ink tabular-nums shrink-0">{sum || '–'}</span>
                      </div>
                      <div className="mt-1.5 grid grid-cols-9 gap-0.5 text-center text-caption tabular-nums">
                        {row.scores.map((s, i) => (
                          <span key={i} className={s == null ? 'text-flag font-bold' : 'text-ink-dim'}>
                            {s ?? '?'}
                          </span>
                        ))}
                      </div>
                      {row.total != null && filled.length === HOLE_COUNT && row.total !== sum && (
                        <p className="mt-1 text-caption font-semibold text-flag">Written total {row.total} ≠ {sum} from the holes.</p>
                      )}
                    </div>
                  )
                })}
              </div>
              {scanWarnings.length > 0 && (
                <ul className="mt-2.5 space-y-0.5">
                  {scanWarnings.map((w) => (
                    <li key={w} className="text-caption text-ink-dim">
                      · {w}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 mt-3">
                <PrimaryButton
                  onClick={applyScan}
                  disabled={!scanRows.some((r) => r.playerId)}
                  className="flex-1 !py-2.5"
                >
                  Apply to the card
                </PrimaryButton>
                <button onClick={() => setScanRows(null)} className="px-4 text-footnote font-bold text-ink-faint">
                  Cancel
                </button>
              </div>
            </Card>
          )}
        </>
      )}

      {ghostPicker}

      {/* The bets riding on this card, as it stands right now */}
      {liveBets.length > 0 && (
        <Card className="mt-3 p-3.5 bg-gold-soft/40 border-gold/30 space-y-1.5">
          {liveBets.map(({ bet, outcome }) => (
            <div key={bet.id} className="flex items-start justify-between gap-2">
              <p className="text-footnote text-ink">
                <span className="font-bold">{bet.name}:</span>{' '}
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

      {/* The card: all eighteen across with Out after the ninth and In
          and Tot at the end, scrolling sideways under the names. */}
      <Card className="mt-3 overflow-hidden">
        <div ref={scroller} className="overflow-x-auto">
          <table className="border-collapse tabular-nums">
            <thead>
              <tr className={`${ribbon ? '' : 'bg-forest text-on-forest'} ${pale ? 'border-b border-line-strong' : ''}`} style={bandStyle}>
                <th
                  className={`sticky left-0 z-20 px-3 text-left text-caption font-semibold uppercase ${ribbon ? '' : 'bg-forest'}`}
                  style={bandStyle}
                >
                  Hole
                </th>
                {across(
                  (i) => (
                    <th
                      key={i}
                      data-current={i === here ? '' : undefined}
                      onClick={() => select({ playerId: round.players[0].playerId, hole: i })}
                      className={`w-11 h-9 text-footnote font-extrabold cursor-pointer ${
                        i === here ? (ribbon ? (pale ? 'bg-black/15' : 'bg-black/25') : 'bg-green') : ''
                      }`}
                    >
                      {i + 1}
                    </th>
                  ),
                  <th key="out" className="w-11 h-9 text-caption font-bold">Out</th>,
                  <th key="in" className="w-11 h-9 text-caption font-bold">In</th>,
                )}
                <th className="w-12 h-9 text-caption font-bold">Tot</th>
              </tr>
              {yards && (
                <tr className="bg-paper/70">
                  <th className="sticky left-0 z-20 bg-paper px-3 text-left text-caption font-semibold uppercase text-ink-faint whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      {yardsDot && <span className="h-2 w-2 rounded-full ring-1 ring-ink/20" style={{ backgroundColor: yardsDot }} aria-hidden />}
                      Yds{yardsCard?.tee ? ` ${yardsCard.tee}` : ''}
                    </span>
                  </th>
                  {across(
                    (i) => (
                      <td key={i} className="h-7 text-center text-caption text-ink-dim">{yards[i] ?? ''}</td>
                    ),
                    <td key="out" className="h-7 text-center text-caption text-ink-dim">{sum(yards, 0, 9) || ''}</td>,
                    <td key="in" className="h-7 text-center text-caption text-ink-dim">{sum(yards, 9, 18) || ''}</td>,
                  )}
                  <td className="h-7 text-center text-caption text-ink-dim">{totalYards?.toLocaleString()}</td>
                </tr>
              )}
              {pars && (
                <tr className="bg-paper/70">
                  <th className="sticky left-0 z-20 bg-paper px-3 text-left text-caption font-semibold uppercase text-ink-faint">Par</th>
                  {across(
                    (i) => (
                      <td key={i} className="h-7 text-center text-footnote font-bold text-ink-dim">{pars[i]}</td>
                    ),
                    <td key="out" className="h-7 text-center text-footnote font-extrabold text-ink-dim">{sum(pars, 0, 9)}</td>,
                    <td key="in" className="h-7 text-center text-footnote font-extrabold text-ink-dim">{sum(pars, 9, 18)}</td>,
                  )}
                  <td className="h-7 text-center text-footnote font-extrabold text-ink-dim">{coursePar}</td>
                </tr>
              )}
              {index && (
                <tr className="bg-paper/70 border-b border-line">
                  <th className="sticky left-0 z-20 bg-paper px-3 text-left text-caption font-semibold uppercase text-ink-faint whitespace-nowrap">Index</th>
                  {across(
                    (i) => (
                      <td key={i} className="h-7 text-center text-caption text-ink-faint">{index[i]}</td>
                    ),
                    <td key="out" />,
                    <td key="in" />,
                  )}
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
                const putts = tracking(rp.playerId) ? puttCards[rp.playerId] : null
                return (
                  <Fragment key={rp.playerId}>
                  <tr className={putts ? '' : 'border-b border-line last:border-0'}>
                    <th className="sticky left-0 z-20 bg-paper px-3 text-left">
                      <div className="flex items-center gap-2">
                        <Avatar player={p} size={22} />
                        <span className="text-footnote font-bold text-ink whitespace-nowrap">{p.name.split(' ')[0]}</span>
                      </div>
                    </th>
                    {across(
                      (i) => {
                        const v = card[i]
                        const isActive = active?.playerId === rp.playerId && active.hole === i
                        const par = pars?.[i]
                        const mark = v != null && par != null ? SCORE_MARK[scoreKind(v, par)] : 'text-ink font-bold'
                        const cheering = isCheering(rp.playerId, i)
                        return (
                          <td key={i} className="p-0">
                            <button
                              onClick={() => select({ playerId: rp.playerId, hole: i })}
                              aria-label={`${p.name}, hole ${i + 1}${v != null ? `, ${v}` : ''}`}
                              className={`${cellBase} ${isActive ? 'ring-2 ring-inset ring-green bg-green-soft/40' : ''}`}
                            >
                              {/* The stroke dots a paper card would carry */}
                              <StrokeDots count={dots?.[i]} />
                              {v == null ? (
                                <span className="text-ink-faint">{isActive ? '_' : '·'}</span>
                              ) : (
                                <span
                                  key={cheering ? `cheer-${cheer!.n}` : 'mark'}
                                  className={`relative mt-0.5 inline-flex h-7 w-7 items-center justify-center ${mark} ${cheering ? 'cheer-pop' : ''}`}
                                >
                                  {v}
                                  {cheerBits(rp.playerId, i)}
                                </span>
                              )}
                            </button>
                          </td>
                        )
                      },
                      <td key="out" className="bg-paper/60 text-center text-body font-extrabold text-ink-dim">{sum(card, 0, 9) || '–'}</td>,
                      <td key="in" className="bg-paper/60 text-center text-body font-extrabold text-ink-dim">{sum(card, 9, 18) || '–'}</td>,
                    )}
                    <td className="text-center">
                      <p className="text-body font-extrabold text-ink">{total || '–'}</p>
                      {vs && <p className="text-caption font-bold text-ink-faint -mt-0.5">{vs}</p>}
                    </td>
                  </tr>
                  {putts && <PuttsRow putts={putts} />}
                  {/* The ghost's card, one hole at a time: a hole shows only
                      once the live card has a score on it. */}
                  {ghost && race && (
                    <tr className="border-b border-line last:border-0 bg-paper/60">
                      <th className="sticky left-0 z-20 bg-paper px-3 text-left leading-tight">
                        <span className="flex items-center gap-1 text-caption font-bold text-ink-dim whitespace-nowrap">
                          <Icon name="ghost" size={13} /> Ghost {p.name.split(' ')[0]}
                        </span>
                        <span className="block text-caption text-ink-faint whitespace-nowrap tabular-nums">{shortDate(ghost.round.date)}</span>
                      </th>
                      {across(
                        (i) => {
                          const v = card[i]
                          const g = ghost.card[i]
                          const shown = v != null && g != null
                          // Beat the ghost on a hole and it flickers out there,
                          // struck through; lose one and it stays, in red.
                          const tone = !shown ? 'text-ink-faint' : v < g ? 'ghost-out text-ink-faint line-through' : v > g ? 'text-flag' : 'text-ink-dim'
                          return (
                            <td key={i} className={`h-8 text-center text-footnote font-bold tabular-nums ${tone}`}>
                              {shown ? g : '·'}
                            </td>
                          )
                        },
                        <td key="out" />,
                        <td key="in" />,
                      )}
                      <td className="text-center">
                        {race.holes > 0 ? (
                          <>
                            <p className="text-footnote font-bold text-ink-dim tabular-nums">{race.ghostSum}</p>
                            <p
                              className={`text-caption font-extrabold -mt-0.5 tabular-nums ${
                                race.diff < 0 ? 'text-green' : race.diff > 0 ? 'text-flag' : 'text-ink-faint'
                              }`}
                            >
                              you {fmtDiff(race.diff)}
                            </p>
                          </>
                        ) : (
                          <p className="text-footnote text-ink-faint">–</p>
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
        <div className="flex items-center gap-x-3.5 gap-y-1 flex-wrap border-t border-line px-3 py-2 text-caption text-ink-faint">
          <MarkLegend pars={!!pars} strokeLabel={strokeDots ? 'stroke here' : undefined} />
        </div>
      </Card>

      {/* Hidden while the pad is up: the pad has its own Done, and two
          Done buttons on one screen meant two different things. */}
      {!active && (
        <>
          <div className="mt-4 flex gap-2">
            <PrimaryButton onClick={() => setView('hole')} className="flex-1 !py-4">
              Back to hole {h + 1}
            </PrimaryButton>
          </div>
        </>
      )}
        </>
      )}
      <div className="h-4" />

      {/* The pad. Fixed to the bottom like a keyboard, over the tab bar:
          always up on the Hole view, and up on the Card view once a box
          is picked. */}
      {cur && (
        <div data-pad className={`fixed inset-x-0 bottom-0 z-50 ${view === 'card' ? 'sheet-up' : ''}`}>
          <div className="mx-auto max-w-md bg-card border-t border-line shadow-[0_-8px_24px_rgba(24,32,25,0.12)] pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-4 py-2 bg-paper border-b border-line">
              <p className="text-footnote text-ink-dim">
                <span className="font-bold text-ink">
                  {data.players.find((pl) => pl.id === cur.playerId)?.name.split(' ')[0]}
                </span>{' '}
                · hole {cur.hole + 1}
                {pars?.[cur.hole] != null && ` · par ${pars[cur.hole]}`}
                {(strokeDots?.[cur.playerId]?.[cur.hole] ?? 0) > 0 && (
                  <span className="text-gold font-bold"> · {'•'.repeat(Math.min(strokeDots![cur.playerId][cur.hole], 3))} stroke</span>
                )}
              </p>
              {view === 'card' && (
                <button onClick={closePad} className="text-footnote font-bold text-green">
                  Done
                </button>
              )}
            </div>
            <div className="grid grid-cols-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                <button
                  key={d}
                  onClick={() => typeDigit(d)}
                  className={`h-14 border-b border-r border-line text-large font-bold text-ink active:bg-paper ${
                    pars?.[cur.hole] === d ? 'bg-green-soft/40' : 'bg-card'
                  }`}
                >
                  {d}
                </button>
              ))}
              <button onClick={clearActive} aria-label="Clear" className="h-14 border-r border-line bg-paper text-body font-bold text-ink-dim active:bg-line">
                ⌫
              </button>
              <button onClick={() => typeDigit(0)} className="h-14 border-r border-line bg-card text-large font-bold text-ink active:bg-paper">
                0
              </button>
              <button onClick={advance} className="h-14 bg-green text-body font-bold text-white active:bg-green-deep">
                {view === 'hole' && isLastGolfer ? (cur.hole === HOLE_COUNT - 1 ? 'Finish' : 'Next hole') : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useStore } from '../data/store'
import type { Bet, BetResult, BetType, HammerPlay, JunkKind, JunkPlay, NassauPlay, Round, SixesPlay, VegasPlay, WolfPlay } from '../types'
import { hasScore } from '../types'
import {
  BLIND_WOLF,
  HAMMER_LIMIT,
  JUNK_KINDS,
  LONE_WOLF,
  calcBbb,
  calcCustom,
  calcHammer,
  calcJunk,
  calcMatchPlay,
  calcNassau,
  calcNassauMatch,
  calcRabbit,
  calcSixes,
  calcSkins,
  calcSnake,
  calcStableford,
  calcVegas,
  calcWolf,
  sixesLegs,
  wolfOn,
} from '../lib/bets'
import { betRules } from '../lib/betRules'
import { betDetailLines } from '../lib/betText'
import { HOLE_COUNT, anyCards, cardOf } from '../lib/holes'
import { courseForRound, hasPars, hasStrokeIndex } from '../lib/courses'
import { money } from '../lib/money'
import { Avatar, Card, HelpTip, PrimaryButton } from '../components/ui'
import { useHoldUpdates } from '../lib/holdUpdates'
import { gameInfo, gameLabel } from '../lib/games'
import { gameCard } from '../lib/gameCards'
import { GameCardSheet } from './GameCardSheet'

const JUNK_LABEL: Record<JunkKind, string> = {
  greenie: 'Greenies',
  sandie: 'Sandies',
  barkie: 'Barkies',
  chippie: 'Chippies',
  birdie: 'Birdies',
}

// Games played for small change a point, and the ones a few dollars a
// unit. Only a default: whatever is typed stands.
const defaultStake = (type: BetType) =>
  type === 'vegas' ? '0.25' : type === 'snake' || type === 'stableford' || type === 'bbb' || type === 'junk' ? '1' : type === 'hammer' ? '2' : '5'

// Games settled on something other than strokes, so net or gross doesn't come into them.
const noNet = (type: BetType) => type === 'custom' || type === 'snake' || type === 'bbb' || type === 'junk'

/**
 * Sets up one game on a round: the stake, who's in, and whatever the game
 * needs to know before the first tee. The game itself is picked on the
 * games menu first; `step` is "1 of 3" when several were picked at once.
 */
export default function BetEditor({
  round,
  type,
  step,
  onSave,
  onCancel,
}: {
  round: Round
  type: BetType
  step?: string
  onSave: (bet: Omit<Bet, 'id'>) => void
  onCancel: () => void
}) {
  useHoldUpdates()
  const { data } = useStore()
  const scoredIds = round.players.filter(hasScore).map((rp) => rp.playerId)
  const course = courseForRound(data, round)

  const [name, setName] = useState('')
  const [stake, setStake] = useState(() => defaultStake(type))
  const [reading, setReading] = useState(false)
  // Default to whoever has a score in; on the first tee that's nobody,
  // and a live bet is between everyone who teed off.
  const [inIds, setInIds] = useState<string[]>(
    scoredIds.length ? scoredIds : round.players.map((rp) => rp.playerId),
  )
  const [useNet, setUseNet] = useState(true)
  // Skins payout: paid per skin as they're won, or one pot to whoever
  // holds the most at the end.
  const [winnerTakeAll, setWinnerTakeAll] = useState(false)
  const [customWinner, setCustomWinner] = useState<string | null>(null)
  // Nassau between two can be played as matches, and only then pressed.
  const [nassauMatch, setNassauMatch] = useState(false)
  const [autoPress, setAutoPress] = useState(2)
  // Wolf: the tee order (whoever's in, in the order picked unless moved)
  // and, for holes already played, the wolf's calls.
  const [orderPicked, setOrderPicked] = useState<string[]>([])
  const [picks, setPicks] = useState<(string | null)[]>(Array(HOLE_COUNT).fill(null))
  // Vegas and a four-ball hammer: who partners the first golfer in; the
  // other two are the other team.
  const [partner, setPartner] = useState<string | null>(null)
  const [birdieFlip, setBirdieFlip] = useState(true)
  // Junk: which feats count.
  const [junkKinds, setJunkKinds] = useState<JunkKind[]>(JUNK_KINDS)
  // Hammer: how many times a hole may double.
  const [hammerLimit, setHammerLimit] = useState(HAMMER_LIMIT)
  const [manual, setManual] = useState<Record<string, string>>({})
  const [manualMode, setManualMode] = useState(false)

  // Whole cents only: a $0.125 stake rounded per golfer makes money out of
  // nothing (audit 2026-10-24).
  const stakeNum = Math.round((Number(stake) || 0) * 100) / 100
  const card = gameCard(type)
  const cardsExist = anyCards(round)

  const order = [...orderPicked.filter((id) => inIds.includes(id)), ...inIds.filter((id) => !orderPicked.includes(id))]
  const nassauPlay: NassauPlay | undefined = nassauMatch ? { format: 'match', ...(autoPress ? { autoPress } : {}) } : undefined
  const wolfPlay: WolfPlay = { order, picks }
  const first = inIds[0]
  const pairs: [string[], string[]] | undefined =
    partner && first && partner !== first && inIds.includes(partner) && inIds.length === 4
      ? [[first, partner], inIds.filter((id) => id !== first && id !== partner)]
      : undefined
  const vegasPlay: VegasPlay | undefined = pairs ? { teams: pairs, birdieFlip } : undefined
  const sixesPlay: SixesPlay = { order }
  const junkPlay: JunkPlay = { kinds: JUNK_KINDS.filter((k) => junkKinds.includes(k)), claims: [] }
  const hammerSides: [string[], string[]] | undefined =
    inIds.length === 2 ? [[inIds[0]], [inIds[1]]] : inIds.length === 4 ? pairs : undefined
  const hammerPlay: HammerPlay | undefined = hammerSides ? { teams: hammerSides, limit: hammerLimit, holes: [] } : undefined

  const outcome = useMemo(() => {
    if (type === 'skins') return calcSkins(round, inIds, stakeNum, useNet, course, winnerTakeAll)
    if (type === 'nassau')
      return nassauPlay
        ? calcNassauMatch(round, inIds, stakeNum, useNet, course, nassauPlay)
        : calcNassau(round, inIds, stakeNum, useNet, course)
    if (type === 'match') return calcMatchPlay(round, inIds, stakeNum, useNet, course)
    if (type === 'wolf') return calcWolf(round, inIds, stakeNum, useNet, course, wolfPlay)
    if (type === 'vegas') return calcVegas(round, inIds, stakeNum, useNet, course, vegasPlay)
    if (type === 'rabbit') return calcRabbit(round, inIds, stakeNum, useNet, course)
    if (type === 'snake') return calcSnake(round, inIds, stakeNum)
    if (type === 'sixes') return calcSixes(round, inIds, stakeNum, useNet, course, sixesPlay)
    if (type === 'stableford') return calcStableford(round, inIds, stakeNum, useNet, course)
    if (type === 'bbb') return calcBbb(round, inIds, stakeNum)
    if (type === 'junk') return calcJunk(round, inIds, stakeNum, course, junkPlay)
    if (type === 'hammer') return calcHammer(round, inIds, stakeNum, useNet, course, hammerPlay)
    return calcCustom(inIds, customWinner, stakeNum)
    // The play objects are rebuilt every render from the state below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, round, inIds, stakeNum, useNet, winnerTakeAll, customWinner, course, nassauMatch, autoPress, orderPicked, picks, partner, birdieFlip, junkKinds, hammerLimit])

  // Holes the wolf calls can be put in for here: any hole with a score
  // on it already. Holes still to play get their calls on the live card.
  const scoredHoles = Array.from({ length: HOLE_COUNT }, (_, h) => h).filter((h) =>
    round.players.some((rp) => inIds.includes(rp.playerId) && cardOf(rp)[h] != null),
  )

  // Typing amounts is a deliberate choice now, not a fallback the editor
  // forces. An undecided card bet is saveable as it stands — it goes on
  // the round at $0 and settles itself as the card fills in, which is
  // what lets the match go on the board at the first tee.
  const showManual = manualMode
  const liveSave = type !== 'custom' && !showManual && !outcome.computable

  const manualResults: BetResult[] = inIds.map((playerId) => ({
    playerId,
    amount: Math.round((Number(manual[playerId]) || 0) * 100) / 100,
  }))
  const manualSum = manualResults.reduce((s, r) => s + r.amount, 0)

  const results = showManual ? manualResults : outcome.results
  const balanced = Math.abs(manualSum) < 0.005
  const canSave =
    inIds.length >= 2 &&
    // A match is strictly one on one; three players in a "match" is a
    // different game (and it has a name: skins).
    (type !== 'match' || inIds.length === 2) &&
    (type !== 'nassau' || !nassauMatch || inIds.length === 2) &&
    (type !== 'wolf' || inIds.length === 4) &&
    (type !== 'vegas' || (inIds.length === 4 && !!vegasPlay)) &&
    (type !== 'sixes' || inIds.length === 4) &&
    (type !== 'hammer' || !!hammerPlay) &&
    (type !== 'junk' || junkKinds.length > 0) &&
    stakeNum >= 0 &&
    (showManual
      ? balanced && manualResults.some((r) => r.amount !== 0)
      : // A custom bet needs its winner picked; a card bet can go on the
        // board undecided and settle itself from the card.
        type === 'custom'
        ? outcome.computable
        : true)

  const label = 'block text-footnote font-semibold text-ink-dim mb-1.5'
  const field =
    'w-full rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-green focus:outline-none'

  const nameFor = (id: string) => data.players.find((p) => p.id === id)?.name ?? 'Someone'

  return (
    <div className="rounded-2xl border border-green/30 bg-card p-4 space-y-3.5">
      {/* The game, picked on the games menu */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream">
          {card ? (
            <span className="h-8 w-8" aria-hidden="true" dangerouslySetInnerHTML={{ __html: card.icon }} />
          ) : (
            <span className="text-footnote font-extrabold text-forest" aria-hidden="true">
              {type === 'match' ? '1v1' : '?'}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold text-ink">
            {gameLabel(type)}
            {step && <span className="ml-2 text-caption font-semibold text-ink-faint">{step}</span>}
          </p>
          <p className="text-footnote leading-snug text-ink-dim">{gameInfo(type).blurb}</p>
        </div>
        {card ? (
          <button type="button" onClick={() => setReading(true)} className="shrink-0 text-caption font-bold text-green">
            How it works
          </button>
        ) : (
          <HelpTip
            {...betRules(type, {
              net: type === 'custom' ? undefined : useNet,
              winnerTakeAll,
              nassau: nassauPlay ?? (nassauMatch ? { format: 'match' } : undefined),
              vegas: { teams: [[], []], birdieFlip },
            })}
          />
        )}
      </div>
      {reading && <GameCardSheet type={type} onClose={() => setReading(false)} />}

      <div className="grid grid-cols-[1fr_auto] gap-2.5">
        <div>
          <label className={label}>{type === 'custom' ? 'What was the bet' : 'Name (optional)'}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === 'custom' ? 'Closest to the pin, 17th' : gameLabel(type)}
            className={field}
          />
        </div>
        <div className="w-24">
          <label className={label}>Stake</label>
          <input
            value={stake}
            onChange={(e) => setStake(e.target.value.replace(/[^\d.]/g, '').replace(/^(\d*\.\d{0,2}).*$/, '$1'))}
            inputMode="decimal"
            className={`${field} tabular-nums text-center`}
          />
        </div>
      </div>
      {type !== 'custom' && (
        <p className="text-caption text-ink-faint">
          {type === 'skins'
            ? winnerTakeAll
              ? `${money(stakeNum)} in from each player. Most skins at the end takes the pot; a tie for most splits it.`
              : `${money(stakeNum)} per skin, from each of the others. A carried hole pays its whole stack. No separate kitty.`
            : type === 'match'
              ? `${money(stakeNum)} on the match. Winner takes it; all square and nobody pays.`
              : type === 'wolf'
                ? `${money(stakeNum)} a hole between partners, ${money(stakeNum * 2)} with each of the three when the wolf goes lone, ${money(stakeNum * 3)} blind.`
                : type === 'vegas'
                  ? `${money(stakeNum)} a point, from each golfer on the losing team to one on the winning team.`
                  : type === 'rabbit'
                    ? `${money(stakeNum)} from each of the others to whoever holds the rabbit at the turn, and again at the 18th.`
                    : type === 'snake'
                      ? `${money(stakeNum)} into the pot for every three-putt. Whoever holds the snake at the end pays the pot to each of the others.`
                      : type === 'sixes'
                        ? `${money(stakeNum)} on each six-hole match, each winner from one loser.`
                        : type === 'stableford'
                          ? `${money(stakeNum)} a point, between every pair, on the difference in their points.`
                          : type === 'bbb'
                            ? `${money(stakeNum)} a point, between every pair, on the difference in their points.`
                            : type === 'junk'
                              ? `${money(stakeNum)} a point, from each of the others.`
                              : type === 'hammer'
                                ? `${money(stakeNum)} a hole to start, doubling with every hammer, at most ${2 ** hammerLimit} times the stake.`
                                : nassauMatch
                    ? `${money(stakeNum)} on each of the three matches, and on every press.`
                    : `${money(stakeNum)} on each of the three, paid by everyone else to whoever wins it.`}
        </p>
      )}

      {/* Skins payout: per skin as they land, or one pot at the end */}
      {type === 'skins' && (
        <div>
          <label className={label}>Payout</label>
          <div className="flex gap-2">
            {[
              { v: false, l: 'Per skin' },
              { v: true, l: 'Winner takes all' },
            ].map((o) => (
              <button
                key={o.l}
                onClick={() => setWinnerTakeAll(o.v)}
                className={`flex-1 rounded-lg py-2 text-footnote font-bold border transition ${
                  winnerTakeAll === o.v ? 'bg-ink text-white border-ink' : 'border-line-strong text-ink-dim'
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nassau: everyone on totals, or two golfers on matches with presses */}
      {type === 'nassau' && (
        <div>
          <label className={label}>Played as</label>
          <div className="flex gap-2">
            {[
              { v: false, l: 'Lowest total' },
              { v: true, l: 'Match play' },
            ].map((o) => (
              <button
                key={o.l}
                onClick={() => setNassauMatch(o.v)}
                className={`flex-1 rounded-lg py-2 text-footnote font-bold border transition ${
                  nassauMatch === o.v ? 'bg-ink text-white border-ink' : 'border-line-strong text-ink-dim'
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
          {nassauMatch && (
            <>
              <label className={`${label} mt-3`}>Presses</label>
              <div className="flex gap-2">
                {[
                  { v: 2, l: 'Auto at 2 down' },
                  { v: 0, l: 'By hand only' },
                ].map((o) => (
                  <button
                    key={o.l}
                    onClick={() => setAutoPress(o.v)}
                    className={`flex-1 rounded-lg py-2 text-footnote font-bold border transition ${
                      autoPress === o.v ? 'bg-ink text-white border-ink' : 'border-line-strong text-ink-dim'
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
              <p className="text-caption text-ink-faint mt-1.5">
                Two golfers. Press by hand from the live card any time; a press runs to the end of its nine.
              </p>
            </>
          )}
        </div>
      )}

      {/* Who's in */}
      <div>
        <label className={label}>Who's in ({inIds.length})</label>
        <div className="flex flex-wrap gap-2">
          {round.players.map((rp) => {
            const p = data.players.find((pl) => pl.id === rp.playerId)
            if (!p) return null
            const on = inIds.includes(p.id)
            const noScore = !hasScore(rp)
            return (
              <button
                key={p.id}
                onClick={() => setInIds((ids) => (on ? ids.filter((x) => x !== p.id) : [...ids, p.id]))}
                className={`flex items-center gap-1.5 rounded-full border pl-1 pr-3 py-1 text-footnote font-bold transition ${
                  on ? 'bg-green-soft text-green border-green/40' : 'border-line-strong text-ink-faint opacity-60'
                }`}
              >
                <Avatar player={p} size={22} />
                {p.name}
                {noScore && <span className="text-caption font-semibold">(no score)</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Wolf: the tee order, and the calls on holes already played */}
      {type === 'wolf' && inIds.length === 4 && (
        <div>
          <label className={label}>Tee order</label>
          <div className="space-y-1.5">
            {order.map((id, i) => (
              <div key={id} className="flex items-center gap-2.5">
                <span className="w-5 text-footnote font-bold text-ink-faint tabular-nums">{i + 1}</span>
                {(() => {
                  const p = data.players.find((pl) => pl.id === id)
                  return p ? <Avatar player={p} size={22} /> : null
                })()}
                <span className="flex-1 text-footnote font-bold text-ink">{nameFor(id)}</span>
                {i > 0 && (
                  <button
                    onClick={() => setOrderPicked(order.map((x, k) => (k === i - 1 ? id : k === i ? order[i - 1] : x)))}
                    className="text-caption font-bold text-green"
                    aria-label={`Move ${nameFor(id)} up`}
                  >
                    Move up
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-caption text-ink-faint mt-1.5">
            The wolf goes in this order, a hole each. The calls go in on the live card as you play.
          </p>
          {scoredHoles.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <label className={label}>The calls so far</label>
              {scoredHoles.map((h) => {
                const wolf = wolfOn(order, h)
                return (
                  <div key={h} className="flex items-center gap-2">
                    <span className="w-6 text-footnote font-bold text-ink-faint tabular-nums">{h + 1}</span>
                    <span className="w-24 truncate text-footnote text-ink-dim">{nameFor(wolf).split(' ')[0]}</span>
                    <select
                      value={picks[h] ?? ''}
                      onChange={(e) => setPicks((all) => all.map((x, k) => (k === h ? e.target.value || null : x)))}
                      aria-label={`Wolf's call on hole ${h + 1}`}
                      className="flex-1 rounded-lg border border-line-strong bg-card px-2 py-1.5 text-footnote font-bold text-ink"
                    >
                      <option value="">No call yet</option>
                      {order
                        .filter((id) => id !== wolf)
                        .map((id) => (
                          <option key={id} value={id}>
                            With {nameFor(id)}
                          </option>
                        ))}
                      <option value={LONE_WOLF}>Lone wolf</option>
                      <option value={BLIND_WOLF}>Blind wolf</option>
                    </select>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Vegas: two teams of two */}
      {type === 'vegas' && inIds.length === 4 && first && (
        <div>
          <label className={label}>{nameFor(first).split(' ')[0]} plays with</label>
          <div className="flex flex-wrap gap-2">
            {inIds
              .filter((id) => id !== first)
              .map((id) => {
                const p = data.players.find((pl) => pl.id === id)
                if (!p) return null
                return (
                  <button
                    key={id}
                    onClick={() => setPartner(id)}
                    className={`flex items-center gap-1.5 rounded-full border pl-1 pr-3 py-1 text-footnote font-bold transition ${
                      partner === id ? 'bg-green text-white border-green' : 'border-line-strong text-ink-dim'
                    }`}
                  >
                    <Avatar player={p} size={22} />
                    {p.name}
                  </button>
                )
              })}
          </div>
          <label className={`${label} mt-3`}>Birdie flip</label>
          <div className="flex gap-2">
            {[
              { v: true, l: 'On' },
              { v: false, l: 'Off' },
            ].map((o) => (
              <button
                key={o.l}
                onClick={() => setBirdieFlip(o.v)}
                className={`flex-1 rounded-lg py-2 text-footnote font-bold border transition ${
                  birdieFlip === o.v ? 'bg-ink text-white border-ink' : 'border-line-strong text-ink-dim'
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
          <p className="text-caption text-ink-faint mt-1.5">
            A birdie turns the other team’s number round, high digit first.
          </p>
        </div>
      )}

      {/* Sixes: the order decides the partners on each six */}
      {type === 'sixes' && inIds.length === 4 && (
        <div>
          <label className={label}>Partners</label>
          <div className="space-y-1.5">
            {order.map((id, i) => (
              <div key={id} className="flex items-center gap-2.5">
                <span className="w-5 text-footnote font-bold text-ink-faint tabular-nums">{i + 1}</span>
                <span className="flex-1 text-footnote font-bold text-ink">{nameFor(id)}</span>
                {i > 0 && (
                  <button
                    onClick={() => setOrderPicked(order.map((x, k) => (k === i - 1 ? id : k === i ? order[i - 1] : x)))}
                    className="text-caption font-bold text-green"
                    aria-label={`Move ${nameFor(id)} up`}
                  >
                    Move up
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 space-y-0.5">
            {sixesLegs(order).map((leg) => (
              <p key={leg.from} className="text-caption text-ink-faint">
                Holes {leg.from + 1} to {leg.to}: {leg.sides.map((side) => side.map((id) => nameFor(id).split(' ')[0]).join(' & ')).join(' v ')}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Hammer: the sides, and how far a hole may double */}
      {type === 'hammer' && (
        <div>
          {inIds.length === 4 && first && (
            <>
              <label className={label}>{nameFor(first).split(' ')[0]} plays with</label>
              <div className="mb-3 flex flex-wrap gap-2">
                {inIds
                  .filter((id) => id !== first)
                  .map((id) => {
                    const p = data.players.find((pl) => pl.id === id)
                    if (!p) return null
                    return (
                      <button
                        key={id}
                        onClick={() => setPartner(id)}
                        className={`flex items-center gap-1.5 rounded-full border pl-1 pr-3 py-1 text-footnote font-bold transition ${
                          partner === id ? 'bg-green text-white border-green' : 'border-line-strong text-ink-dim'
                        }`}
                      >
                        <Avatar player={p} size={22} />
                        {p.name}
                      </button>
                    )
                  })}
              </div>
            </>
          )}
          {inIds.length !== 2 && inIds.length !== 4 && (
            <p className="mb-3 text-caption font-semibold text-flag">Hammer is one against one, or two against two.</p>
          )}
          <label className={label}>Most a hole can double</label>
          <div className="flex gap-2">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setHammerLimit(n)}
                className={`flex-1 rounded-lg py-2 text-footnote font-bold border transition ${
                  hammerLimit === n ? 'bg-ink text-white border-ink' : 'border-line-strong text-ink-dim'
                }`}
              >
                {n} times, ×{2 ** n}
              </button>
            ))}
          </div>
          <p className="text-caption text-ink-faint mt-1.5">The hammer goes down on the live card, and the side hammered accepts or turns it down there.</p>
        </div>
      )}

      {/* Junk: which feats count */}
      {type === 'junk' && (
        <div>
          <label className={label}>What counts</label>
          <div className="flex flex-wrap gap-2">
            {JUNK_KINDS.map((k) => {
              const on = junkKinds.includes(k)
              return (
                <button
                  key={k}
                  onClick={() => setJunkKinds((all) => (on ? all.filter((x) => x !== k) : [...all, k]))}
                  aria-pressed={on}
                  className={`rounded-full border px-3.5 py-1.5 text-footnote font-bold transition ${
                    on ? 'bg-ink text-white border-ink' : 'border-line-strong text-ink-dim'
                  }`}
                >
                  {JUNK_LABEL[k]}
                </button>
              )
            })}
          </div>
          <p className="text-caption text-ink-faint mt-1.5">
            {junkKinds.includes('birdie')
              ? hasPars(course)
                ? 'Birdies come off the card on their own. Claim the rest on the live card as they happen.'
                : 'Birdies need this course’s pars to count themselves. Claim the rest on the live card as they happen.'
              : 'Claim them on the live card as they happen.'}
          </p>
        </div>
      )}

      {type === 'snake' && (
        <p className="text-caption text-ink-faint">
          The snake counts three-putts off the putts on the card, so the live card keeps putts for everyone in it.
        </p>
      )}
      {type === 'bbb' && (
        <p className="text-caption text-ink-faint">
          Bingo, Bango and Bongo go in on the live card, a tap each, hole by hole.
        </p>
      )}
      {type === 'stableford' && !hasPars(course) && (
        <p className="text-caption font-semibold text-flag">Stableford needs this course’s pars. Add them from the Courses page.</p>
      )}

      {/* Gross/net, for the games where handicaps come into it */}
      {!noNet(type) && (
        <div>
          <label className={label}>Decided on</label>
          <div className="flex gap-2">
            {[
              { v: true, l: 'Net' },
              { v: false, l: 'Gross' },
            ].map((o) => (
              <button
                key={o.l}
                onClick={() => setUseNet(o.v)}
                className={`flex-1 rounded-lg py-2 text-footnote font-bold border transition ${
                  useNet === o.v ? 'bg-ink text-white border-ink' : 'border-line-strong text-ink-dim'
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
          <p className="text-caption text-ink-faint mt-1.5">
            {type === 'match' || (type === 'nassau' && nassauMatch)
              ? hasStrokeIndex(course)
                ? 'Net gives the difference in handicaps as strokes on the hardest holes, off this course’s stroke index.'
                : 'Net needs this course’s stroke index, since which holes get a stroke decides who wins them. Add it from the Courses page, or play it gross.'
              : type === 'stableford'
                ? hasStrokeIndex(course)
                  ? 'Net gives each golfer their full course handicap in strokes, hardest holes first.'
                  : 'Net needs this course’s stroke index, since which holes get a stroke decides the points. Add it from the Courses page, or play it gross.'
              : type === 'skins' || type === 'wolf' || type === 'vegas' || type === 'rabbit' || type === 'sixes' || type === 'hammer'
                ? hasStrokeIndex(course)
                  ? 'Net gives strokes off the low handicap: the best player plays scratch, everyone else gets their difference on the hardest holes.'
                  : 'Net needs this course’s stroke index, since which holes get a stroke decides who wins them. Add it from the Courses page, or play it gross.'
                : hasStrokeIndex(course)
                  ? 'Net gives strokes hole by hole off this course’s stroke index.'
                  : 'Net takes off the full handicap over eighteen and half of it on each nine. Add this course’s stroke index for the real hole-by-hole allocation.'}
          </p>
        </div>
      )}

      {/* Custom winner */}
      {type === 'custom' && (
        <div>
          <label className={label}>Who won it</label>
          <div className="flex flex-wrap gap-2">
            {inIds.map((id) => {
              const p = data.players.find((pl) => pl.id === id)
              if (!p) return null
              return (
                <button
                  key={id}
                  onClick={() => setCustomWinner(id)}
                  className={`flex items-center gap-1.5 rounded-full border pl-1 pr-3 py-1 text-footnote font-bold transition ${
                    customWinner === id ? 'bg-green text-white border-green' : 'border-line-strong text-ink-dim'
                  }`}
                >
                  <Avatar player={p} size={22} />
                  {p.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Result */}
      {!showManual ? (
        <Card tile className="p-3.5 bg-paper">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-footnote font-semibold text-ink-dim">Works out to</p>
            {type !== 'custom' && (
              <button onClick={() => setManualMode(true)} className="text-caption font-bold text-green">
                Enter by hand
              </button>
            )}
          </div>
          {betDetailLines(outcome.detail, (id) => data.players.find((p) => p.id === id)?.name).map((line, i) => (
            <p key={i} className="text-footnote text-ink-dim">
              {line}
            </p>
          ))}
          <div className="mt-2.5 pt-2.5 border-t border-line space-y-1.5">
            {results
              .slice()
              .sort((a, b) => b.amount - a.amount)
              .map((r) => {
                const p = data.players.find((pl) => pl.id === r.playerId)
                if (!p) return null
                return (
                  <div key={r.playerId} className="flex items-center gap-2.5">
                    <Avatar player={p} size={22} />
                    <span className="flex-1 text-footnote font-bold text-ink">{p.name}</span>
                    <span
                      className={`text-footnote font-extrabold tabular-nums ${
                        r.amount > 0 ? 'text-green' : r.amount < 0 ? 'text-flag' : 'text-ink-faint'
                      }`}
                    >
                      {r.amount > 0 ? '+' : r.amount < 0 ? '−' : ''}
                      {money(Math.abs(r.amount))}
                    </span>
                  </div>
                )
              })}
          </div>
        </Card>
      ) : (
        <Card tile className="p-3.5 bg-paper">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-footnote font-semibold text-ink-dim">Amounts</p>
            {outcome.computable && (
              <button onClick={() => setManualMode(false)} className="text-caption font-bold text-green">
                Work it out for me
              </button>
            )}
          </div>
          {!outcome.computable && (
            <p className="text-footnote text-ink-dim mb-2">
              {cardsExist
                ? outcome.detail[0]
                : 'No hole scores on this round, so enter what changed hands. Fill in the card and the app can do the maths.'}
            </p>
          )}
          <div className="space-y-2">
            {inIds.map((id) => {
              const p = data.players.find((pl) => pl.id === id)
              if (!p) return null
              return (
                <div key={id} className="flex items-center gap-2.5">
                  <Avatar player={p} size={24} />
                  <span className="flex-1 text-footnote font-bold text-ink">{p.name}</span>
                  <input
                    value={manual[id] ?? ''}
                    onChange={(e) => setManual((m) => ({ ...m, [id]: e.target.value.replace(/[^\d.-]/g, '') }))}
                    inputMode="decimal"
                    placeholder="0"
                    className="w-24 rounded-lg border border-line-strong bg-card px-2 py-2 text-center text-body font-bold text-ink tabular-nums focus:border-green focus:outline-none"
                  />
                </div>
              )
            })}
          </div>
          <p className={`text-caption mt-2 font-semibold ${balanced ? 'text-ink-faint' : 'text-flag'}`}>
            {balanced
              ? 'Winnings and losses cancel out. Use a minus sign for money lost.'
              : `Off by ${money(Math.abs(Math.round(manualSum * 100) / 100))}. Winnings and losses have to cancel out.`}
          </p>
        </Card>
      )}

      <div className="flex gap-2">
        <PrimaryButton
          onClick={() =>
            canSave &&
            onSave({
              roundId: round.id,
              type,
              name: name.trim() || gameLabel(type),
              stake: stakeNum,
              results: results.filter((r) => inIds.includes(r.playerId)),
              // What settleFromCard needs later: hand-typed amounts are
              // final, and a card bet remembers how it's decided.
              manual: showManual || undefined,
              net: type === 'custom' || showManual ? undefined : noNet(type) ? false : useNet,
              winnerTakeAll: type === 'skins' && winnerTakeAll ? true : undefined,
              // How the game is set up, for the card to settle it by.
              nassau: type === 'nassau' && !showManual ? nassauPlay : undefined,
              wolf: type === 'wolf' && !showManual ? wolfPlay : undefined,
              vegas: type === 'vegas' && !showManual ? vegasPlay : undefined,
              sixes: type === 'sixes' && !showManual ? sixesPlay : undefined,
              junk: type === 'junk' && !showManual ? junkPlay : undefined,
              hammer: type === 'hammer' && !showManual ? hammerPlay : undefined,
            })
          }
          disabled={!canSave}
          className="flex-1 !py-2.5"
        >
          {liveSave ? 'Save, the card settles it' : 'Save bet'}
        </PrimaryButton>
        <button onClick={onCancel} className="px-4 text-footnote font-bold text-ink-faint">Cancel</button>
      </div>
    </div>
  )
}

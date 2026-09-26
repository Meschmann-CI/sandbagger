import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useGoBack } from '../lib/nav'
import { BackButton } from '../components/Nav'
import { useStore } from '../data/store'
import { canSeeTrip, fmt1, isSoloRound, net, pending, round1, saddamCounts, type ScoredRoundPlayer } from '../types'
import { prettyDate, roundStandings, saddamState } from '../lib/stats'
import { anyCards, cardComplete, holesEntered } from '../lib/holes'
import { settleFromCard } from '../lib/bets'
import { coursePar, courseSlug, findCourse, toPar } from '../lib/courses'
import { todayISO } from '../lib/dates'
import { grossWarning } from '../lib/scores'
import { money } from '../lib/money'
import BetEditor from '../components/BetEditor'
import CourseRatingEditor from '../components/CourseRatingEditor'
import { courseSummaries, fmtStars } from '../lib/ratings'
import Scorecard from '../components/Scorecard'
import RoundPhotos from '../components/RoundPhotos'
import SettleUp from '../components/SettleUp'
import { roundBetSettlements } from '../lib/settlements'
import { useConfirm } from '../components/Confirm'
import { Avatar, Card, HelpTip, MoneyBadge, Pill, PrimaryButton, SaddamBadge, SaddamIcon, SectionLabel } from '../components/ui'
import { betRules } from '../lib/betRules'
import { sandbaggers } from '../lib/delight'
import { SandbagStamp } from '../components/Delight'
import { Icon, type IconName } from '../components/icons'

export default function RoundDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const goBack = useGoBack('/rounds')
  const { data, updateRound, addBet, deleteBet, addPayment, deletePayment } = useStore()
  const confirm = useConfirm()
  const [entering, setEntering] = useState<string | null>(null)
  const [draftScore, setDraftScore] = useState('')
  const [addingBet, setAddingBet] = useState(false)
  const [rating, setRating] = useState(false)
  const round = data.rounds.find((r) => r.id === id)

  if (!round) {
    return (
      <div className="pt-16 text-center text-ink-dim">
        Round not found. <Link to="/rounds" className="text-green font-bold">Back to rounds</Link>
      </div>
    )
  }

  const standings = roundStandings(round)
  const waiting = pending(round)
  const top = standings.length ? data.players.find((p) => p.id === standings[0].playerId) : undefined
  const tripRecord = round.tripId ? data.trips.find((t) => t.id === round.tripId) : undefined
  const trip = tripRecord && canSeeTrip(tripRecord, data.currentUserId) ? tripRecord : undefined
  const bets = data.bets.filter((b) => b.roundId === round.id)
  // Genuinely a solo round only if nobody else played — not merely because
  // their card hasn't landed yet.
  const solo = isSoloRound(round)
  const margin = standings.length > 1 ? round1(standings[1].netScore - standings[0].netScore) : 0
  const roundPaybacks = data.payments.filter((p) => p.roundId === round.id)
  const betsOwed = roundBetSettlements(data, round)

  const course = findCourse(data, round.courseName)
  const par = coursePar(course)
  const saddam = saddamState(data)
  const saddamChangedHere = saddam.since === round.date && saddam.holderId === standings[0]?.playerId && !solo
  const iAmWaiting = waiting.some((rp) => rp.playerId === data.currentUserId)

  // The course, as an opinion. Asked of anyone who played, once the
  // round has actually happened (a score or a card on it), and only
  // until they've answered.
  const slug = courseSlug(round.courseName)
  const courseTake = courseSummaries(data).find((c) => c.slug === slug)
  const iPlayed = round.players.some((rp) => rp.playerId === data.currentUserId)
  const roundHappened = standings.length > 0 || anyCards(round)
  const askForRating = iPlayed && roundHappened && !courseTake?.mine

  // Warns on an implausible number but still takes it — some rounds
  // really do go that way.
  const draftWarning = draftScore.trim() ? grossWarning(parseInt(draftScore, 10)) : null

  const saveScore = (playerId: string) => {
    const gross = parseInt(draftScore, 10)
    if (Number.isNaN(gross)) return
    updateRound({
      ...round,
      players: round.players.map((rp) => (rp.playerId === playerId ? { ...rp, gross } : rp)),
    })
    setEntering(null)
    setDraftScore('')
  }

  const waitingNames = waiting
    .map((rp) => data.players.find((p) => p.id === rp.playerId)?.name)
    .filter(Boolean)
    .join(' and ')

  // Anyone who played suspiciously far under their handicap gets stamped.
  const bags = waiting.length === 0 ? sandbaggers(data, round) : []
  const bagged = new Map(bags.map((b) => [b.playerId, b]))

  // The podium: a group round with every score in and two or more posted.
  const podium = !solo && waiting.length === 0 ? standings.slice(0, 3) : []
  const podiumOrder = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium

  const chips: { key: string; label: string; icon: IconName; hot?: boolean; onClick: () => void }[] = []
  if (askForRating) chips.push({ key: 'rate', label: 'Rate it', icon: 'star', hot: true, onClick: () => setRating(true) })
  if (iPlayed && courseTake?.mine)
    chips.push({
      key: 'rated',
      label: `You gave it ${courseTake.mine.overall}${courseTake.avg != null && courseTake.ratings.length > 1 ? ` · group ${fmtStars(courseTake.avg)}` : ''}`,
      icon: 'star',
      onClick: () => navigate(`/courses/${encodeURIComponent(slug)}`),
    })
  // Par is entered once per course and reaches back through every round
  // already played there, so it's worth asking for here.
  if (!par) chips.push({ key: 'par', label: 'Add par', icon: 'flag', onClick: () => navigate(`/courses/${encodeURIComponent(slug)}/card`) })
  if ((round.photos?.length ?? 0) === 0)
    chips.push({
      key: 'photos',
      label: 'Add photos',
      icon: 'camera',
      onClick: () => document.getElementById('photos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    })

  const holesIn = round.players.reduce((sum, rp) => sum + holesEntered(rp), 0)
  const blurb = !top
    ? anyCards(round)
      ? `Card's going — ${holesIn} hole score${holesIn === 1 ? '' : 's'} in so far.`
      : 'Nobody has posted a score for this round yet.'
    : waiting.length > 0
      ? `${top.name} posted ${standings[0].gross}. Still waiting on ${waitingNames}.`
      : solo
        ? `${top.name} out on the solo grind. ${standings[0].gross} on the card.`
        : margin === 0
        ? 'Dead heat at the top. Nobody gets bragging rights today.'
        : margin >= 8
          ? `${top.name} won by ${fmt1(margin)}. That's not a win, that's a crime scene.`
          : margin >= 4
            ? `${top.name} won comfortably by ${fmt1(margin)}.`
            : `${top.name} escaped with it by ${fmt1(margin)}.`

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <BackButton fallback="/rounds" onBack={goBack} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-large font-extrabold tracking-tight leading-tight text-ink">{round.courseName}</h1>
            <p className="text-footnote text-ink-dim mt-1">
              {prettyDate(round.date)}
              {par != null && ` · par ${par}`}
              {round.tee && ` · ${round.tee} tees`}
            </p>
          </div>
          <button
            onClick={() => navigate(`/rounds/${round.id}/edit`)}
            className="shrink-0 rounded-xl border border-line-strong bg-card px-4 py-2 text-footnote font-bold text-ink-dim active:bg-paper"
          >
            Edit
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {!solo && round.players.length > 1 && saddamCounts(round) && <Pill tone="cream">Saddam on the line</Pill>}
          {solo && standings.length > 0 && <Pill>Solo round</Pill>}
          {waiting.length > 0 && <Pill tone="flag">{waiting.length} score{waiting.length === 1 ? '' : 's'} outstanding</Pill>}
          {trip && (
            <Link to={`/trips/${trip.id}`}>
              <Pill tone="sand">
                <Icon name="suitcase" size={12} strokeWidth={2.2} /> {trip.name}
              </Pill>
            </Link>
          )}
        </div>
      </header>

      {/* Your own outstanding score gets top billing */}
      {iAmWaiting && (
        <Card className="mt-2 p-4 border-gold/40 bg-gold-soft/50">
          <p className="text-body font-extrabold text-ink">Your score is missing</p>
          <p className="text-footnote text-ink-dim mt-1">
            Someone logged this round and left yours blank. Add it and the records update.
          </p>
          {entering === data.currentUserId ? (
            <div className="flex items-center gap-2 mt-3">
              <input
                type="number"
                inputMode="numeric"
                value={draftScore}
                onChange={(e) => setDraftScore(e.target.value)}
                placeholder="Gross"
                autoFocus
                className="w-24 h-12 rounded-xl border border-line-strong bg-card text-center text-headline font-extrabold text-ink tabular-nums focus:border-green focus:outline-none"
              />
              <PrimaryButton onClick={() => saveScore(data.currentUserId)} disabled={!draftScore.trim()} className="flex-1 !py-3">
                Post it
              </PrimaryButton>
              <button onClick={() => setEntering(null)} className="px-3 text-footnote font-bold text-ink-faint">Cancel</button>
            </div>
          ) : null}
          {entering === data.currentUserId && draftWarning && (
            <p className="text-footnote font-semibold text-flag mt-2">{draftWarning}</p>
          )}
          {entering !== data.currentUserId && (
            <button
              onClick={() => { setEntering(data.currentUserId); setDraftScore('') }}
              className="mt-3 rounded-xl bg-green px-5 py-2.5 text-body font-bold text-white"
            >
              Enter my score
            </button>
          )}
        </Card>
      )}

      {/* Who won comes first. A settled group round gets the podium; a
          solo round, or one still waiting on scores, gets the line. */}
      <Card className="mt-3 overflow-hidden">
        {podium.length >= 2 && (
          <div className="px-4 pt-4">
            <div className={`grid items-end gap-2 ${podium.length === 3 ? 'grid-cols-[1fr_1.15fr_1fr]' : 'grid-cols-2'}`}>
              {podiumOrder.map((s) => {
                const p = data.players.find((pl) => pl.id === s.playerId)
                if (!p) return null
                const first = s.rank === 1
                return (
                  <div key={s.playerId} className="flex min-w-0 flex-col items-center gap-1">
                    {first && saddamChangedHere && (
                      <span className="-mb-1.5 rounded-[10px] ring-2 ring-card">
                        <SaddamIcon size={26} />
                      </span>
                    )}
                    <Avatar player={p} size={first ? 46 : 38} />
                    <span className={`max-w-full truncate text-footnote ${first ? 'font-extrabold text-ink' : 'font-bold text-ink-dim'}`}>
                      {p.name}
                    </span>
                    {bagged.has(s.playerId) && <SandbagStamp />}
                    <span className="text-caption text-ink-faint tabular-nums">net {fmt1(s.netScore)}</span>
                    <div
                      className={`mt-1 flex w-full justify-center rounded-t-xl pt-1.5 text-headline font-extrabold text-on-forest tabular-nums ${
                        s.rank === 1 ? 'h-16 bg-forest' : s.rank === 2 ? 'h-11 bg-forest-soft' : 'h-8 bg-forest/55'
                      }`}
                    >
                      {s.rank}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <div className={`px-4 py-3.5 ${podium.length >= 2 ? 'border-t border-line' : ''}`}>
          <p className="text-body font-bold text-ink leading-snug">{blurb}</p>
          {saddamChangedHere && top && (
            <p className="mt-2 flex items-center gap-2 text-footnote text-ink-dim">
              <SaddamBadge size={16} /> The Saddam changed hands here. {top.name} carries it now.
            </p>
          )}
          {bags.map((b) => (
            <p key={b.playerId} className="mt-2 text-footnote text-ink-dim">
              <span className="font-bold text-ink">{data.players.find((p) => p.id === b.playerId)?.name}</span> played {fmt1(b.by)}{' '}
              {b.basis === 'handicap' ? 'better than the handicap says' : 'better than usual'}. Someone check the GHIN.
            </p>
          ))}
        </div>
      </Card>

      {/* The chores, as one row of chips instead of a stack of cards */}
      {chips.length > 0 && !rating && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onClick}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-footnote font-bold transition active:scale-95 ${
                c.hot ? 'border-green/25 bg-green-soft text-green-deep' : 'border-line-strong bg-card text-ink-dim'
              }`}
            >
              <Icon name={c.icon} size={15} strokeWidth={2.1} className={c.hot ? '' : 'text-ink-faint'} />
              {c.label}
            </button>
          ))}
        </div>
      )}
      {rating && (
        <div className="mt-3">
          <CourseRatingEditor courseName={round.courseName} onDone={() => setRating(false)} />
        </div>
      )}

      <SectionLabel>Scorecard</SectionLabel>
      <Card>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-2.5 border-b border-line text-caption font-bold uppercase tracking-wider text-ink-faint">
          <span>Player</span>
          <span className="w-12 text-right">Net</span>
          <span className="w-10 text-right">Gross</span>
          <span className="w-10 text-right">Hcp</span>
        </div>

        {standings.map((s) => {
          const p = data.players.find((pl) => pl.id === s.playerId)
          const rp = round.players.find((x) => x.playerId === s.playerId) as ScoredRoundPlayer | undefined
          if (!p || !rp) return null
          return (
            <div key={s.playerId} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center px-4 py-3 border-b border-line last:border-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {!solo && <span className={`font-extrabold w-4 tabular-nums ${s.rank === 1 ? 'text-gold' : 'text-ink-faint'}`}>{s.rank}</span>}
                <Avatar player={p} size={30} />
                <span className="min-w-0">
                  <span className={`block truncate text-body ${s.rank === 1 && !solo ? 'font-extrabold text-ink' : 'text-ink-dim'}`}>{p.name}</span>
                  {bagged.has(s.playerId) && (
                    <span className="-ml-0.5 mt-0.5 block">
                      <SandbagStamp />
                    </span>
                  )}
                </span>
              </div>
              <span className="w-12 text-right text-headline font-extrabold text-ink tabular-nums">{fmt1(net(rp))}</span>
              <span className="w-10 text-right text-footnote text-ink-dim tabular-nums">
                {rp.gross}
                {par != null && <span className="block text-caption text-ink-faint">{toPar(rp.gross - par)}</span>}
              </span>
              <span className="w-10 text-right text-footnote text-ink-faint tabular-nums">{fmt1(rp.handicapSnapshot)}</span>
            </div>
          )
        })}

        {/* Still to come */}
        {waiting.map((rp) => {
          const p = data.players.find((pl) => pl.id === rp.playerId)
          if (!p) return null
          const isMe = rp.playerId === data.currentUserId
          return (
            <div key={rp.playerId} className="px-4 py-3 border-b border-line last:border-0 bg-paper/60">
              <div className="flex items-center gap-2.5">
                {!solo && <span className="w-4" />}
                <Avatar player={p} size={30} />
                <div className="flex-1 min-w-0">
                  <span className="text-body text-ink-dim truncate">{p.name}</span>
                  <p className="text-caption text-ink-faint">Score not in yet</p>
                </div>
                {entering === rp.playerId ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={draftScore}
                      onChange={(e) => setDraftScore(e.target.value)}
                      placeholder="—"
                      autoFocus
                      className="w-16 h-10 rounded-lg border border-line-strong bg-card text-center text-headline font-extrabold text-ink tabular-nums focus:border-green focus:outline-none"
                    />
                    <button
                      onClick={() => saveScore(rp.playerId)}
                      disabled={!draftScore.trim()}
                      className="rounded-lg bg-green px-3 py-2 text-footnote font-bold text-white disabled:opacity-30"
                    >
                      Save
                    </button>
                    <button onClick={() => setEntering(null)} className="px-1 text-footnote font-bold text-ink-faint">✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEntering(rp.playerId); setDraftScore('') }}
                    className="shrink-0 rounded-lg border border-line-strong px-3 py-1.5 text-footnote font-bold text-green"
                  >
                    {isMe ? 'Add mine' : 'Add it'}
                  </button>
                )}
              </div>
              {entering === rp.playerId && draftWarning && (
                <p className="text-footnote font-semibold text-flag mt-1.5">{draftWarning}</p>
              )}
            </div>
          )
        })}
      </Card>

      {waiting.length > 0 && (
        <p className="text-caption text-ink-faint px-2 mt-2">
          Outstanding scores don't count toward records. This round starts affecting the leaderboard and the Saddam once at
          least two are in.
        </p>
      )}

      {/* Per-hole card */}
      <SectionLabel
        action={
          <button onClick={() => navigate(`/rounds/${round.id}/card`)} className="text-footnote font-bold text-green">
            {!anyCards(round) ? '+ Add hole scores' : round.players.some((rp) => !cardComplete(rp)) ? 'Keep scoring →' : 'Edit card'}
          </button>
        }
      >
        Scorecard by hole
      </SectionLabel>
      {anyCards(round) ? (
        <Scorecard round={round} />
      ) : (
        <Card className="p-4 text-center">
          <p className="text-footnote text-ink-dim">
            No hole-by-hole scores yet. Add them and skins and nassau work themselves out.
          </p>
        </Card>
      )}

      <div id="photos" className="scroll-mt-16">
        <RoundPhotos round={round} />
      </div>

      <SectionLabel
        action={
          !addingBet ? (
            <button onClick={() => setAddingBet(true)} className="text-footnote font-bold text-green">+ Add bet</button>
          ) : undefined
        }
      >
        Money games
      </SectionLabel>

      {addingBet && (
        <div className="mb-3">
          <BetEditor
            round={round}
            onSave={(bet) => {
              addBet(bet)
              setAddingBet(false)
            }}
            onCancel={() => setAddingBet(false)}
          />
        </div>
      )}

      {bets.length === 0 && !addingBet && (
        <Card className="p-4 text-center text-footnote text-ink-dim">Nothing on this round. Yet.</Card>
      )}

      {/* What the bets add up to between people, and how to make it stop
          being true. Money won on a round is a permanent record; this is
          about whether it's actually changed hands. */}
      {bets.length > 0 && (
        <Card className={`mb-3 p-4 ${betsOwed.length === 0 ? 'bg-green-soft/50 border-green/25' : 'bg-gold-soft/40 border-gold/30'}`}>
          <p className="text-footnote font-bold uppercase tracking-wider text-ink-faint mb-2.5">Settle up</p>
          <SettleUp
            url={`/rounds/${round.id}`}
            owed={betsOwed}
            note={`${round.courseName} (Sandbagger)`}
            squareLabel="All settled. Nobody owes anybody for this one."
            onMarkPaid={(s) =>
              addPayment({ roundId: round.id, fromId: s.fromId, toId: s.toId, amount: s.amount, date: todayISO() })
            }
          />
          {roundPaybacks.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gold/25 space-y-1.5">
              {roundPaybacks.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-footnote">
                  <span className="flex-1 text-ink-dim">
                    <span className="font-bold text-ink">{data.players.find((x) => x.id === p.fromId)?.name}</span> paid{' '}
                    <span className="font-bold text-ink">{data.players.find((x) => x.id === p.toId)?.name}</span>{' '}
                    <span className="font-bold tabular-nums text-green">{money(p.amount)}</span>
                  </span>
                  <button onClick={() => deletePayment(p.id)} className="text-caption font-bold text-flag/70 shrink-0">
                    Undo
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {bets.length > 0 && (
        <>
          <div className="space-y-3">
            {bets.map((bet) => {
              // The card's verdict as it stands — "2 up thru 14", "3
              // holes judged" — for bets that settle from the card.
              const live = settleFromCard(bet, round, course)
              const status = live?.detail
                .map((line) => {
                  const [text, playerId] = line.split('|')
                  const who = playerId ? data.players.find((p) => p.id === playerId)?.name : null
                  return who ? `${who} ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text
                })
                .join(' · ')
              return (
              <Card key={bet.id} className="p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-bold text-body text-ink min-w-0 truncate">{bet.name}</p>
                  <div className="flex items-center gap-3 shrink-0">
                    <HelpTip {...betRules(bet.type, { net: bet.net, winnerTakeAll: bet.winnerTakeAll })} />
                    <p className="text-caption text-ink-faint tabular-nums">{money(bet.stake)} stake</p>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Remove "${bet.name}"?`,
                          body: 'The money from this bet comes back off everyone\'s all-time total.',
                          confirmLabel: 'Remove bet',
                          danger: true,
                        })
                        if (ok) deleteBet(bet.id)
                      }}
                      className="text-caption font-bold text-flag/70"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {status && (
                  <p className={`text-footnote mt-1 font-semibold ${live?.computable ? 'text-ink-dim' : 'text-gold'}`}>
                    {live?.computable ? status : `Live: ${status}`}
                  </p>
                )}
                <div className="mt-2.5 space-y-1.5">
                  {[...bet.results]
                    .sort((a, b) => b.amount - a.amount)
                    .map((res) => {
                      const p = data.players.find((pl) => pl.id === res.playerId)
                      if (!p) return null
                      return (
                        <div key={res.playerId} className="flex items-center justify-between text-footnote">
                          <span className="text-ink-dim">{p.name}</span>
                          <MoneyBadge amount={res.amount} />
                        </div>
                      )
                    })}
                </div>
              </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Deleting lives in Edit, out of reach of a stray thumb. */}
      <div className="h-6" />
    </div>
  )
}

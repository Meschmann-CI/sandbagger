import { useState } from 'react'
import { useGoBack, useNavigate } from '../lib/nav'
import { BackButton } from '../components/Nav'
import { useMembers, useStore } from '../data/store'
import { fmt1, type Round } from '../types'
import { prettyDate } from '../lib/stats'
import { shortDay, todayISO, weekdayName } from '../lib/dates'
import { findCourse } from '../lib/courses'
import { teeTimeInput, teeTimeLabel } from '../lib/bookings'
import { notifyGroup } from '../lib/push'
import { money } from '../lib/money'
import { useHoldUpdates } from '../lib/holdUpdates'
import { AddGames } from '../components/AddGames'
import TeePicker from '../components/TeePicker'
import CourseScene, { roundLight } from '../components/CourseScene'
import { useRoundWeather } from '../lib/weather'
import { useConfirm } from '../components/Confirm'
import { Avatar, Card, PrimaryButton, SECONDARY_BTN, SectionLabel } from '../components/ui'
import { Icon } from '../components/icons'
import { BookedSettleUp, GreenFeeSection } from '../components/GreenFees'

// A round booked ahead (Matt, 2026-10-22): who's in, the tee time and tees,
// and bets set up early. Only whoever booked it changes who's in, the day
// or the time, or cancels it: tee times come in twos and fours, so nobody
// adds themselves to a full one. On the day it opens into the live card;
// once the day has gone by it asks whether it happened. Same page as
// BookedRoundView.swift in the iPhone app.

const FIELD = 'w-full rounded-xl border border-line-strong bg-card px-4 py-3 text-body text-ink focus:border-green focus:outline-none'

export default function BookedRound({ round }: { round: Round }) {
  const navigate = useNavigate()
  const goBack = useGoBack('/rounds')
  const { data, deleteRound, deleteBet } = useStore()
  const confirm = useConfirm()
  const weather = useRoundWeather(data, round)
  const [editing, setEditing] = useState(false)
  const [golfers, setGolfers] = useState(false)
  const [addingBet, setAddingBet] = useState(false)

  const today = todayISO()
  const isToday = round.date === today
  const gone = round.date < today
  // An old booking with nobody named on it is anyone's to change.
  const mine = !round.bookedById || round.bookedById === data.currentUserId
  const booker = data.players.find((p) => p.id === round.bookedById)
  const me = data.players.find((p) => p.id === data.currentUserId)
  const bets = data.bets.filter((b) => b.roundId === round.id)
  const when = `${weekdayName(round.date)}, ${prettyDate(round.date).replace(/, \d{4}$/, '')}`

  const cancel = async () => {
    const ok = await confirm({
      title: gone ? 'Let this one go?' : 'Cancel this round?',
      body: gone ? 'It comes off the list, bets and all.' : "Everyone on it hears it's off. Any bets set up for it go too.",
      confirmLabel: gone ? 'Delete it' : 'Cancel round',
      danger: true,
    })
    if (!ok) return
    deleteRound(round.id)
    if (!gone) {
      notifyGroup({
        toPlayerIds: round.players.map((p) => p.playerId).filter((id) => id !== data.currentUserId),
        title: `${round.courseName} is off`,
        body: `${me?.name.split(' ')[0] ?? 'Someone'} cancelled ${weekdayName(round.date)} ${shortDay(round.date)}.`,
      })
    }
    navigate('/rounds', { replace: true })
  }

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <BackButton fallback="/rounds" onBack={goBack} />
        <div data-shared={round.id} data-shared-hero className="relative -mx-1 mb-3 mt-1 h-52 overflow-hidden rounded-3xl bg-paper">
          <CourseScene course={round.courseName} light={roundLight(round)} weather={weather} className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/60" />
          {weather && (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-caption font-bold text-white backdrop-blur-sm tabular-nums">
              {weather.label} · {weather.tempF}°F · wind {weather.windMph} mph
            </span>
          )}
          <div className="absolute inset-x-4 bottom-4 min-w-0 text-white">
            <h1 className="text-title font-bold tracking-tight leading-tight [text-shadow:0_1px_12px_rgba(0,0,0,0.35)]">{round.courseName}</h1>
            <p className="text-footnote text-white/85 [text-shadow:0_1px_8px_rgba(0,0,0,0.35)]">
              {[when, round.teeTime, round.tee && `${round.tee} tees`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      </header>

      {gone ? (
        <Card className="border-gold/30 bg-gold-soft p-4">
          <p className="text-headline font-bold text-ink">Did it happen?</p>
          <p className="mt-1 text-footnote text-ink-dim">
            This was booked for {weekdayName(round.date)}. Put the scores in, or let it go if it got called off.
          </p>
          <div className="mt-3 flex gap-2.5">
            <PrimaryButton onClick={() => navigate(`/rounds/${round.id}/card`)} className="flex-1">
              Add scores
            </PrimaryButton>
            {mine && (
              <button type="button" onClick={cancel} className={`flex-1 rounded-xl py-3 text-body ${SECONDARY_BTN}`}>
                It didn't
              </button>
            )}
          </div>
        </Card>
      ) : (
        isToday && (
          <PrimaryButton onClick={() => navigate(`/rounds/${round.id}/card`)} className="w-full !py-3.5">
            Start the card
          </PrimaryButton>
        )
      )}

      <SectionLabel>Who's in</SectionLabel>
      {golfers ? (
        <GolfersEditor round={round} onDone={() => setGolfers(false)} />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-line">
            {round.players.map((rp) => {
              const p = data.players.find((x) => x.id === rp.playerId)
              if (!p) return null
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar player={p} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-bold text-ink">{p.id === data.currentUserId ? 'You' : p.name}</p>
                    <p className="text-caption tabular-nums text-ink-faint">index {fmt1(p.handicap)}</p>
                  </div>
                  {p.id === round.bookedById && <span className="text-caption font-bold text-ink-faint">Booked it</span>}
                </div>
              )
            })}
            {mine && (
              <button
                type="button"
                onClick={() => setGolfers(true)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-body font-bold text-green active:bg-paper"
              >
                <span aria-hidden className="text-headline leading-none">+</span>
                Add or remove golfers
              </button>
            )}
          </div>
        </Card>
      )}
      {!mine && booker && (
        <p className="mt-2 px-1 text-caption text-ink-faint">
          {booker.name.split(' ')[0]} booked it, so {booker.name.split(' ')[0]} says who's in.
        </p>
      )}

      <GreenFeeSection round={round} />
      <BookedSettleUp round={round} />

      <SectionLabel
        action={
          !addingBet && (
            <button onClick={() => setAddingBet(true)} className="text-footnote font-bold text-green">
              Add bet
            </button>
          )
        }
      >
        Money games
      </SectionLabel>
      {addingBet && <AddGames round={round} onDone={() => setAddingBet(false)} />}
      {bets.length === 0 && !addingBet ? (
        <p className="px-1 text-footnote text-ink-faint">Set up the bets now and they're ready on the day.</p>
      ) : (
        bets.length > 0 && (
          <Card className="overflow-hidden">
            <div className="divide-y divide-line">
              {bets.map((bet) => (
                <div key={bet.id} className="flex items-center gap-3 px-4 py-3">
                  <p className="min-w-0 flex-1 truncate text-body font-bold text-ink">{bet.name}</p>
                  <span className="text-caption tabular-nums text-ink-faint">{money(bet.stake)} stake</span>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirm({ title: `Remove "${bet.name}"?`, confirmLabel: 'Remove bet', danger: true })
                      if (ok) deleteBet(bet.id)
                    }}
                    className="text-caption font-bold text-flag"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )
      )}

      {mine && !gone && (
        editing ? (
          <>
            <SectionLabel>Edit booking</SectionLabel>
            <BookingEditor round={round} onDone={() => setEditing(false)} />
          </>
        ) : (
          <div className="mt-8 flex gap-2.5">
            <button type="button" onClick={() => setEditing(true)} className={`flex-1 rounded-xl py-3 text-body ${SECONDARY_BTN}`}>
              Edit
            </button>
            <button type="button" onClick={cancel} className="flex-1 rounded-xl bg-flag-soft py-3 text-body font-bold text-flag active:opacity-70">
              Cancel round
            </button>
          </div>
        )
      )}
      <div className="h-6" />
    </div>
  )
}

/** The day, the tee time and the tees. The golfers on it hear if the day or time moves. */
function BookingEditor({ round, onDone }: { round: Round; onDone: () => void }) {
  useHoldUpdates()
  const { data, updateRound } = useStore()
  const [date, setDate] = useState(round.date)
  const [time, setTime] = useState(teeTimeInput(round.teeTime))
  const [tee, setTee] = useState(round.tee ?? '')

  const save = () => {
    const teeTime = teeTimeLabel(time)
    updateRound({ ...round, date, teeTime, tee: tee.trim() || undefined })
    if (date !== round.date || teeTime !== round.teeTime) {
      notifyGroup({
        toPlayerIds: round.players.map((p) => p.playerId).filter((id) => id !== data.currentUserId),
        title: `${round.courseName} moved`,
        body: `Now ${weekdayName(date)} ${shortDay(date)}, ${teeTime}.`,
        url: `/rounds/${round.id}`,
      })
    }
    onDone()
  }

  return (
    <Card className="space-y-3 p-4">
      <label className="block">
        <span className="mb-1.5 block px-1 text-footnote font-semibold text-ink-dim">Day</span>
        <input type="date" value={date} min={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} className={FIELD} />
      </label>
      <label className="block">
        <span className="mb-1.5 block px-1 text-footnote font-semibold text-ink-dim">Tee time</span>
        <input type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} className={FIELD} />
      </label>
      <div>
        <span className="mb-1.5 block px-1 text-footnote font-semibold text-ink-dim">Tees</span>
        <TeePicker value={tee} onChange={setTee} course={findCourse(data, round.courseName)} className={`${FIELD} placeholder:text-ink-faint`} />
      </div>
      <div className="flex gap-2.5 pt-1">
        <button type="button" onClick={onDone} className={`flex-1 rounded-xl py-3 text-body ${SECONDARY_BTN}`}>
          Never mind
        </button>
        <PrimaryButton onClick={save} className="flex-1">
          Save
        </PrimaryButton>
      </div>
    </Card>
  )
}

/** Who's on it, for whoever booked it. Anyone new hears they're on it. */
function GolfersEditor({ round, onDone }: { round: Round; onDone: () => void }) {
  useHoldUpdates()
  const { data, updateRound } = useStore()
  const members = useMembers()
  const [ids, setIds] = useState(() => round.players.map((p) => p.playerId))
  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const save = () => {
    const kept = round.players.filter((p) => ids.includes(p.playerId))
    const added = members
      .filter((m) => ids.includes(m.id) && !round.players.some((p) => p.playerId === m.id))
      .map((m) => ({ playerId: m.id, gross: null, handicapSnapshot: m.handicap }))
    if (added.length || kept.length !== round.players.length) {
      updateRound({ ...round, players: [...kept, ...added] })
      const me = data.players.find((p) => p.id === data.currentUserId)
      notifyGroup({
        toPlayerIds: added.map((p) => p.playerId).filter((id) => id !== data.currentUserId),
        title: `${me?.name.split(' ')[0] ?? 'Someone'} put you on ${round.courseName}`,
        body: `${weekdayName(round.date)} ${shortDay(round.date)}, ${round.teeTime}.`,
        url: `/rounds/${round.id}`,
      })
    }
    onDone()
  }

  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-line">
        {members.map((p) => {
          const on = ids.includes(p.id)
          return (
            <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={on} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-paper">
              <Avatar player={p} size={32} />
              <span className="min-w-0 flex-1 truncate text-body font-bold text-ink">{p.id === data.currentUserId ? 'You' : p.name}</span>
              <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-full ${on ? 'bg-green text-white' : 'ring-[1.5px] ring-inset ring-line-strong'}`}>
                {on && <Icon name="check" size={13} strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2.5 border-t border-line p-3">
        <span className="flex-1 px-1 text-caption text-ink-faint">
          {ids.length} {ids.length === 1 ? 'spot' : 'spots'} on this tee time.
        </span>
        <button type="button" onClick={onDone} className="px-2 text-footnote font-bold text-ink-faint">
          Cancel
        </button>
        <PrimaryButton onClick={save} disabled={ids.length === 0} className="!py-2">
          Save
        </PrimaryButton>
      </div>
    </Card>
  )
}

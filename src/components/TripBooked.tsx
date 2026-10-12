import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from '../lib/nav'
import { useStore } from '../data/store'
import type { AppData, ItineraryItem, Review, Round, Trip, TripStory } from '../types'
import { SPANNING_KINDS, fmt1 } from '../types'
import { byDate, moneyTotals, prettyDate, roundStandings, shortDate, timeToMinutes, tripBoard, type TripRow } from '../lib/stats'
import { todayISO } from '../lib/dates'
import { ordinal } from '../lib/ratings'
import ItineraryCard from './ItineraryCard'
import ItineraryEditor from './ItineraryEditor'
import TripCosts from './TripCosts'
import { Avatar, Card, MoneyBadge, PrimaryButton, SectionLabel } from './ui'
import { Icon } from './icons'
import { StarRating } from './Stars'
import { useConfirm } from './Confirm'

// Locked in. Before the trip: what's sorted, where we're staying, getting
// there, the schedule, then the money. After it, in the order you'd look
// back: the champion, the photos, the stories, what got rated, settling
// up, then the full record. Same as the iPhone app's TripBookedSection.

type Adding = 'stay' | 'schedule' | null

export default function TripBooked({ trip }: { trip: Trip }) {
  const navigate = useNavigate()
  const { data, updateTrip, newId } = useStore()
  const today = todayISO()
  const [editDates, setEditDates] = useState(false)
  const [start, setStart] = useState(trip.startDate ?? '')
  const [end, setEnd] = useState(trip.endDate ?? '')
  const [adding, setAdding] = useState<Adding>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const rounds = byDate(data.rounds.filter((r) => r.tripId === trip.id))
  const board = tripBoard(data, rounds)
  const isPast = !!trip.endDate && trip.endDate < today

  const saveDates = () => {
    updateTrip({ ...trip, startDate: start || undefined, endDate: end || undefined })
    setEditDates(false)
  }

  const upsertItem = (draft: Omit<ItineraryItem, 'id'>, id?: string) => {
    updateTrip({
      ...trip,
      itinerary: id ? trip.itinerary.map((i) => (i.id === id ? { ...draft, id } : i)) : [...trip.itinerary, { ...draft, id: newId('i') }],
    })
    setAdding(null)
    setEditingId(null)
  }

  const addReview = (itemId: string, review: Review) => {
    updateTrip({
      ...trip,
      itinerary: trip.itinerary.map((i) =>
        i.id === itemId ? { ...i, reviews: [...(i.reviews ?? []).filter((r) => r.playerId !== review.playerId), review] } : i,
      ),
    })
  }

  // One itinerary row, or its editor in place while it's being edited.
  const item = (it: ItineraryItem) =>
    editingId === it.id ? (
      <div key={it.id} className="p-3">
        <ItineraryEditor initial={it} defaultDate={it.date} onSave={(draft) => upsertItem(draft, it.id)} onCancel={() => setEditingId(null)} />
      </div>
    ) : (
      <ItineraryCard
        key={it.id}
        item={it}
        players={data.players}
        currentUserId={data.currentUserId}
        editable
        isPast={!!it.date && it.date <= today}
        onReview={(r) => addReview(it.id, r)}
        onEdit={() => setEditingId(it.id)}
        onRemove={() => updateTrip({ ...trip, itinerary: trip.itinerary.filter((i) => i.id !== it.id) })}
      />
    )

  const addTo = (where: Exclude<Adding, null>) =>
    !adding && !editingId ? (
      <button onClick={() => setAdding(where)} className="text-footnote font-bold text-green">
        Add to trip
      </button>
    ) : undefined

  const newItem = (where: Exclude<Adding, null>) =>
    adding === where && (
      <div className="mb-3">
        <ItineraryEditor defaultDate={trip.startDate ?? today} onSave={(draft) => upsertItem(draft)} onCancel={() => setAdding(null)} />
      </div>
    )

  const schedule = trip.itinerary.filter((i) => !SPANNING_KINDS.includes(i.kind))
  const days = [...new Set(schedule.map((i) => i.date))].sort()
  const scheduleSection = (
    <>
      <SectionLabel action={addTo('schedule')}>Schedule</SectionLabel>
      {newItem('schedule')}
      {days.length === 0 ? (
        <Card className="p-5 text-center text-footnote text-ink-dim">Nothing booked yet. Tee times, dinners, bad decisions.</Card>
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <div key={day}>
              <p className="mb-2 px-1 text-footnote font-bold text-green">{prettyDate(day)}</p>
              <Card className="divide-y divide-line">
                {schedule
                  .filter((i) => i.date === day)
                  .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))
                  .map(item)}
              </Card>
            </div>
          ))}
        </div>
      )}
    </>
  )

  const roundsSection = rounds.length > 0 && (
    <>
      <SectionLabel>Rounds</SectionLabel>
      <Card className="divide-y divide-line">
        {rounds.map((r) => (
          <RoundRow key={r.id} round={r} data={data} onOpen={() => navigate(`/rounds/${r.id}`)} />
        ))}
      </Card>
    </>
  )

  const datesEditor = (
    <>
      {!trip.startDate && !editDates && (
        <Card className="mt-3 flex items-center justify-between bg-gold-soft/50 p-4">
          <p className="text-footnote font-bold text-ink">Dates not set yet</p>
          <button onClick={() => setEditDates(true)} className="text-footnote font-bold text-green">
            Set dates
          </button>
        </Card>
      )}
      {editDates && (
        <Card className="mt-3 space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-footnote font-semibold text-ink-dim">First day</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-lg border border-line-strong px-3 py-2.5 text-body text-ink focus:border-green focus:outline-none" />
            </div>
            <div>
              <label className="mb-1.5 block text-footnote font-semibold text-ink-dim">Last day</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-lg border border-line-strong px-3 py-2.5 text-body text-ink focus:border-green focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-2">
            <PrimaryButton onClick={saveDates} className="flex-1 !py-2.5">
              Save dates
            </PrimaryButton>
            <button onClick={() => setEditDates(false)} className="px-4 text-footnote font-bold text-ink-faint">
              Cancel
            </button>
          </div>
        </Card>
      )}
    </>
  )

  if (isPast) {
    const rated = trip.itinerary.filter((i) => (i.reviews ?? []).length > 0).sort((a, b) => a.date.localeCompare(b.date))
    const logistics = trip.itinerary
      .filter((i) => SPANNING_KINDS.includes(i.kind))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.date.localeCompare(b.date))
    return (
      <>
        {datesEditor}
        {board[0] && <ChampionCard board={board} />}
        <TripPhotos trip={trip} rounds={rounds} />
        <Stories trip={trip} />

        {rated.length > 0 && (
          <>
            <SectionLabel>Rated</SectionLabel>
            <Card className="divide-y divide-line">
              {rated.map((it) => {
                const reviews = it.reviews ?? []
                const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
                return (
                  <div key={it.id} className="flex items-center gap-2.5 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-semibold text-ink">{it.title}</p>
                      <p className="text-caption text-ink-faint">
                        {reviews.length} rating{reviews.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <StarRating value={avg} size={14} />
                  </div>
                )
              })}
            </Card>
          </>
        )}

        <TripCosts trip={trip} />
        {board.length > 0 && <Standings board={board} rounds={rounds} final />}
        {roundsSection}
        {scheduleSection}
        {logistics.length > 0 && (
          <>
            <SectionLabel>Travel & housing</SectionLabel>
            <Card className="divide-y divide-line">{logistics.map(item)}</Card>
          </>
        )}
      </>
    )
  }

  const stays = trip.itinerary.filter((i) => i.kind === 'lodging').sort((a, b) => a.date.localeCompare(b.date))
  const travel = trip.itinerary.filter((i) => i.kind === 'flight').sort((a, b) => a.date.localeCompare(b.date))
  return (
    <>
      {datesEditor}
      <Readiness trip={trip} hasCosts={data.expenses.some((e) => e.tripId === trip.id)} />
      {trip.startDate && !editDates && (
        <button onClick={() => setEditDates(true)} className="mt-2.5 px-1 text-footnote font-bold text-ink-faint">
          Edit dates
        </button>
      )}

      <SectionLabel action={addTo('stay')}>Where we’re staying</SectionLabel>
      {newItem('stay')}
      <Card>
        {stays.length === 0 && (
          <p className="p-5 text-center text-footnote text-ink-dim">Nowhere yet. Paste the listing link and its photo comes with it.</p>
        )}
        {stays.map((it, i) => {
          // The listing's photo, big, over the row that holds the details.
          const photo = it.previewImage || it.photos?.[0]
          return (
            <div key={it.id} className={i > 0 ? 'border-t border-line' : ''}>
              {photo && <img src={photo} alt="" loading="lazy" className="h-[150px] w-full object-cover" />}
              {item(it)}
            </div>
          )
        })}
      </Card>

      {travel.length > 0 && (
        <>
          <SectionLabel>Getting there</SectionLabel>
          <Card className="divide-y divide-line">{travel.map(item)}</Card>
        </>
      )}

      {scheduleSection}
      {board.length > 0 && <Standings board={board} rounds={rounds} final={false} />}
      <TripCosts trip={trip} />
      {roundsSection}
    </>
  )
}

/** What's sorted for a trip that's coming, worked out from the schedule and the costs. */
function Readiness({ trip, hasCosts }: { trip: Trip; hasCosts: boolean }) {
  const tees = trip.itinerary.filter((i) => i.kind === 'tee').length
  const items: [string, boolean][] = [
    [tees > 0 ? `${tees} tee time${tees === 1 ? '' : 's'}` : 'Tee times', tees > 0],
    ['House', trip.itinerary.some((i) => i.kind === 'lodging')],
    ['Flights', trip.itinerary.some((i) => i.kind === 'flight')],
    ['Costs', hasCosts],
  ]
  return (
    <div className="mt-3 grid grid-cols-4 gap-1.5">
      {items.map(([label, done]) => (
        <div
          key={label}
          aria-label={`${label}, ${done ? 'sorted' : 'not yet'}`}
          className={`flex flex-col items-center gap-0.5 rounded-xl border py-2 ${done ? 'border-green/20 bg-green-soft text-green' : 'border-line bg-card text-ink-faint'}`}
        >
          {done ? (
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2.5 6.5 5 9l4.5-6" />
            </svg>
          ) : (
            <span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-dashed border-current" aria-hidden />
          )}
          <span className="max-w-full truncate px-1 text-caption font-semibold">{label}</span>
        </div>
      ))}
    </div>
  )
}

/** The trip's winner, in the season race's forest green. */
function ChampionCard({ board }: { board: TripRow[] }) {
  const top = board[0]
  const rest = board
    .slice(1)
    .map((r, i) => (i === 0 ? `${r.player.name} ${ordinal(2)} by ${fmt1(r.netTotal - top.netTotal)}` : `${r.player.name} ${ordinal(i + 2)}`))
  return (
    <div className="mt-3.5 flex items-center gap-3 rounded-[18px] bg-forest p-3.5">
      <Avatar player={top.player} size={44} />
      <div className="min-w-0 flex-1">
        <p className="text-caption font-bold text-on-forest/70">Trip champion</p>
        <p className="text-headline font-bold text-on-forest tabular-nums">
          {top.player.name} · net {fmt1(top.netTotal)}
        </p>
        {rest.length > 0 && <p className="text-caption text-on-forest/75 tabular-nums">{rest.join(' · ')}</p>}
      </div>
      <Icon name="trophy" size={26} className="shrink-0 text-gold" label="Champion" />
    </div>
  )
}

/** Every photo from the trip: its rounds', then the house's and the dinners' (listing photos too). */
function TripPhotos({ trip, rounds }: { trip: Trip; rounds: Round[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const photos = [
    ...rounds.flatMap((r) => (r.photos ?? []).map((p) => p.url)),
    ...[...trip.itinerary].sort((a, b) => a.date.localeCompare(b.date)).flatMap((i) => [...(i.photos ?? []), ...(i.previewImage ? [i.previewImage] : [])]),
  ].filter(Boolean)
  if (photos.length === 0) return null

  const tile = (i: number, more = 0) => (
    <button key={i} onClick={() => setOpen(i)} className="relative min-h-0 flex-1 overflow-hidden" aria-label={more > 0 ? `${more} more photos` : `Photo ${i + 1}`}>
      <img src={photos[i]} alt="" loading="lazy" className="h-full w-full object-cover" />
      {more > 0 && <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-headline font-extrabold text-white">+{more}</span>}
    </button>
  )

  return (
    <>
      <SectionLabel
        action={
          <button onClick={() => setOpen(0)} className="text-footnote font-bold text-green">
            All {photos.length}
          </button>
        }
      >
        Photos
      </SectionLabel>
      {/* One big, two stacked, the last saying how many more. */}
      <div className="flex h-[132px] gap-1 overflow-hidden rounded-[14px]">
        <div className="flex flex-1">{tile(0)}</div>
        {photos.length > 1 && (
          <div className="flex flex-1 flex-col gap-1">
            {tile(1)}
            {photos.length > 2 && tile(2)}
          </div>
        )}
        {photos.length > 3 && <div className="flex flex-1">{tile(3, photos.length - 4)}</div>}
      </div>
      {open !== null && createPortal(<PhotosViewer photos={photos} start={open} onClose={() => setOpen(null)} />, document.body)}
    </>
  )
}

/** Every trip photo full screen, swiped through (scroll-snap, as on a round). */
function PhotosViewer({ photos, start, onClose }: { photos: string[]; start: number; onClose: () => void }) {
  const stripRef = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(start)
  useLayoutEffect(() => {
    const el = stripRef.current
    if (el) el.scrollLeft = start * el.clientWidth
  }, [start])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = stripRef.current
      if (e.key === 'Escape') onClose()
      else if (el && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) el.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * el.clientWidth, behavior: 'smooth' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" aria-modal="true" role="dialog">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)] text-white">
        <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <p className="text-footnote font-bold text-white/80 tabular-nums">
          {at + 1} of {photos.length}
        </p>
      </div>
      <div
        ref={stripRef}
        onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((src, i) => (
          <div key={i} className="flex h-full w-full shrink-0 snap-center snap-always items-center justify-center p-3">
            <img src={src} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The lines people want kept. The trip's note leads, as the organizer's;
 * then everyone's stories, oldest first. You can take back your own.
 */
function Stories({ trip }: { trip: Trip }) {
  const { data, addTripStory, removeTripStory } = useStore()
  const confirm = useConfirm()
  const [writing, setWriting] = useState(false)
  const [draft, setDraft] = useState('')
  const who = (id: string) => data.players.find((p) => p.id === id)
  const lines: { key: string; playerId: string; text: string; story?: TripStory }[] = [
    ...(trip.note ? [{ key: 'note', playerId: trip.createdById, text: trip.note }] : []),
    ...[...(trip.stories ?? [])].sort((a, b) => a.at.localeCompare(b.at)).map((s) => ({ key: s.id, playerId: s.playerId, text: s.text, story: s })),
  ]

  const add = () => {
    if (!draft.trim()) return
    addTripStory(trip.id, draft)
    setDraft('')
    setWriting(false)
  }

  const takeBack = async (story: TripStory) => {
    const ok = await confirm({ title: 'Take it back?', body: 'It comes off the trip for everyone.', confirmLabel: 'Take it back', danger: true })
    if (ok) removeTripStory(trip.id, story.id)
  }

  return (
    <>
      <SectionLabel
        action={
          !writing && (
            <button onClick={() => setWriting(true)} className="text-footnote font-bold text-green">
              Add one
            </button>
          )
        }
      >
        The stories
      </SectionLabel>
      {writing && (
        <div className="mb-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={280}
            rows={2}
            autoFocus
            placeholder="Kim’s 4-putt on 17. From six feet."
            className="w-full resize-none rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <p className="flex-1 px-1 text-caption text-ink-faint">Everyone on the trip sees it, with your name on it.</p>
            <button onClick={() => { setWriting(false); setDraft('') }} className="px-2 text-footnote font-bold text-ink-faint">
              Cancel
            </button>
            <PrimaryButton onClick={add} disabled={!draft.trim()} className="!py-2 px-4">
              Add
            </PrimaryButton>
          </div>
        </div>
      )}
      <Card className="divide-y divide-line">
        {lines.length === 0 && <p className="p-5 text-center text-footnote text-ink-dim">Nothing yet. The 4-putt, the bar tab, who snored.</p>}
        {lines.map((line) => {
          const p = who(line.playerId)
          return (
            <div key={line.key} className="flex items-start gap-2.5 px-4 py-3">
              {p ? <Avatar player={p} size={26} /> : <span className="h-[26px] w-[26px] shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-caption font-bold text-ink-faint">{p?.name}</p>
                <p className="text-body text-ink">{line.text}</p>
              </div>
              {line.story && line.story.playerId === data.currentUserId && (
                <button onClick={() => void takeBack(line.story!)} className="shrink-0 pt-0.5 text-caption font-bold text-ink-faint">
                  Take back
                </button>
              )}
            </div>
          )
        })}
      </Card>
    </>
  )
}

function Standings({ board, rounds, final }: { board: TripRow[]; rounds: Round[]; final: boolean }) {
  const { data } = useStore()
  const money = moneyTotals(data, new Set(rounds.map((r) => r.id)))
  return (
    <>
      <SectionLabel>{final ? 'Final standings' : 'Trip leaderboard'}</SectionLabel>
      <Card>
        <div className="grid grid-cols-[1fr_repeat(3,auto)] gap-x-3 whitespace-nowrap border-b border-line px-4 py-2.5 text-footnote font-semibold text-ink-dim">
          <span>Player</span>
          <span className="w-14 text-right">Net Σ</span>
          <span className="w-12 text-right">Gross Σ</span>
          <span className="w-11 text-right">Money</span>
        </div>
        {board.map((row, i) => (
          <div key={row.player.id} className="grid grid-cols-[1fr_repeat(3,auto)] items-center gap-x-3 border-b border-line px-4 py-3.5 last:border-0">
            <div className="flex min-w-0 items-center gap-2.5">
              {/* The trophy is the winner's rank, in the rank column. */}
              <span className={`w-5 shrink-0 text-body tabular-nums ${i === 0 ? '' : 'font-extrabold text-ink-faint'}`}>
                {i === 0 ? <Icon name="trophy" size={18} className="text-gold" label="Winner" /> : i + 1}
              </span>
              <Avatar player={row.player} size={30} />
              <div className="min-w-0">
                <p className={`truncate text-body ${i === 0 ? 'font-bold text-ink' : 'text-ink-dim'}`}>{row.player.name}</p>
                {/* A smaller total from fewer rounds isn't a lead, so say it. */}
                {row.roundsPlayed < board[0].roundsPlayed && (
                  <p className="text-caption text-ink-faint">
                    {row.roundsPlayed} of {rounds.length} rounds
                  </p>
                )}
              </div>
            </div>
            <span className="w-14 text-right text-body font-extrabold text-ink tabular-nums">{fmt1(row.netTotal)}</span>
            <span className="w-12 text-right text-footnote text-ink-dim tabular-nums">{row.grossTotal}</span>
            <span className="w-11 text-right">
              <MoneyBadge amount={money.get(row.player.id) ?? 0} className="text-footnote" />
            </span>
          </div>
        ))}
      </Card>
    </>
  )
}

function RoundRow({ round, data, onOpen }: { round: Round; data: AppData; onOpen: () => void }) {
  const standings = roundStandings(round)
  // Nobody has a score yet: no winner to show.
  const winner = standings[0] ? data.players.find((p) => p.id === standings[0].playerId) : undefined
  return (
    <button onClick={onOpen} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-ink/[0.04]">
      <div className="min-w-0">
        <p className="truncate text-body font-bold text-ink">{round.courseName}</p>
        <p className="mt-0.5 text-footnote text-ink-faint tabular-nums">{shortDate(round.date)}</p>
      </div>
      {winner ? (
        <p className="shrink-0 text-footnote text-ink-dim">
          <span className="font-bold text-ink">{winner.name}</span> · net <span className="font-bold tabular-nums">{fmt1(standings[0].netScore)}</span>
        </p>
      ) : (
        <p className="shrink-0 text-footnote text-ink-faint">No scores yet</p>
      )}
    </button>
  )
}

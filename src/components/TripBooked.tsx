import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../data/store'
import type { ItineraryItem, Review, Trip } from '../types'
import { SPANNING_KINDS, fmt1, hasScore, type ScoredRoundPlayer } from '../types'
import { byDate, leaderboard, moneyTotals, prettyDate, roundStandings, shortDate, timeToMinutes } from '../lib/stats'
import { todayISO } from '../lib/dates'
import ItineraryCard from './ItineraryCard'
import ItineraryEditor from './ItineraryEditor'
import TripCosts from './TripCosts'
import { Avatar, Card, MoneyBadge, PrimaryButton, SectionLabel } from './ui'

export default function TripBooked({ trip }: { trip: Trip }) {
  const navigate = useNavigate()
  const { data, updateTrip, newId } = useStore()
  const TODAY = todayISO()
  const [editDates, setEditDates] = useState(false)
  const [start, setStart] = useState(trip.startDate ?? '')
  const [end, setEnd] = useState(trip.endDate ?? '')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const rounds = byDate(data.rounds.filter((r) => r.tripId === trip.id))
  const board = leaderboard(data, rounds).filter((row) => row.rounds > 0)
  const roundIds = new Set(rounds.map((r) => r.id))
  const money = moneyTotals(data, roundIds)
  const isPast = !!trip.endDate && trip.endDate < TODAY

  const logistics = trip.itinerary.filter((i) => SPANNING_KINDS.includes(i.kind))
  const schedule = trip.itinerary.filter((i) => !SPANNING_KINDS.includes(i.kind))
  const days = [...new Set(schedule.map((i) => i.date))].sort()

  const saveDates = () => {
    updateTrip({ ...trip, startDate: start || undefined, endDate: end || undefined })
    setEditDates(false)
  }

  const upsertItem = (draft: Omit<ItineraryItem, 'id'>, id?: string) => {
    updateTrip({
      ...trip,
      itinerary: id
        ? trip.itinerary.map((i) => (i.id === id ? { ...draft, id } : i))
        : [...trip.itinerary, { ...draft, id: newId('i') }],
    })
    setAdding(false)
    setEditingId(null)
  }

  const removeItem = (itemId: string) => {
    updateTrip({ ...trip, itinerary: trip.itinerary.filter((i) => i.id !== itemId) })
  }

  const addReview = (itemId: string, review: Review) => {
    updateTrip({
      ...trip,
      itinerary: trip.itinerary.map((i) =>
        i.id === itemId
          ? { ...i, reviews: [...(i.reviews ?? []).filter((r) => r.playerId !== review.playerId), review] }
          : i,
      ),
    })
  }

  const cardProps = (item: ItineraryItem) => ({
    item,
    players: data.players,
    currentUserId: data.currentUserId,
    editable: true,
    isPast: !!item.date && item.date <= TODAY,
    onReview: (r: Review) => addReview(item.id, r),
    onEdit: () => setEditingId(item.id),
    onRemove: () => removeItem(item.id),
  })

  const editorFor = (item: ItineraryItem) => (
    <div className="p-3">
      <ItineraryEditor
        initial={item}
        defaultDate={item.date}
        onSave={(draft) => upsertItem(draft, item.id)}
        onCancel={() => setEditingId(null)}
      />
    </div>
  )

  return (
    <>
      {/* Dates */}
      {!trip.startDate && !editDates && (
        <Card className="p-4 flex items-center justify-between bg-gold-soft/50 border-gold/25">
          <p className="text-[13.5px] font-bold text-ink">Dates not set yet</p>
          <button onClick={() => setEditDates(true)} className="text-[13px] font-bold text-green">Set dates</button>
        </Card>
      )}
      {trip.startDate && !editDates && !isPast && (
        <button onClick={() => setEditDates(true)} className="text-[12px] font-bold text-ink-faint px-1">Edit dates</button>
      )}
      {editDates && (
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">First day</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-lg border border-line-strong px-3 py-2.5 text-[14px] text-ink focus:border-green focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">Last day</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-lg border border-line-strong px-3 py-2.5 text-[14px] text-ink focus:border-green focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-2">
            <PrimaryButton onClick={saveDates} className="flex-1 !py-2.5">Save dates</PrimaryButton>
            <button onClick={() => setEditDates(false)} className="px-4 text-[13px] font-bold text-ink-faint">Cancel</button>
          </div>
        </Card>
      )}

      {/* Standings */}
      {board.length > 0 && (
        <>
          <SectionLabel>{isPast ? 'Final Standings' : 'Trip Leaderboard'}</SectionLabel>
          <Card>
            <div className="grid grid-cols-[1fr_repeat(3,auto)] gap-x-4 px-4 py-2.5 border-b border-line text-[10px] font-bold uppercase tracking-wider text-ink-faint">
              <span>Player</span>
              <span className="w-14 text-right">Net Σ</span>
              <span className="w-12 text-right">Gross Σ</span>
              <span className="w-11 text-right">Money</span>
            </div>
            {board
              .map((row) => {
                // Only rounds they've posted a score for count toward the totals.
                const mine = rounds
                  .map((r) => r.players.find((p) => p.playerId === row.player.id))
                  .filter((rp): rp is ScoredRoundPlayer => !!rp && hasScore(rp))
                const netTotal = mine.reduce((sum, rp) => sum + rp.gross - rp.handicapSnapshot, 0)
                const grossTotal = mine.reduce((sum, rp) => sum + rp.gross, 0)
                return { row, netTotal, grossTotal }
              })
              .sort((a, b) => a.netTotal - b.netTotal)
              .map(({ row, netTotal, grossTotal }, i) => (
                <div key={row.player.id} className="grid grid-cols-[1fr_repeat(3,auto)] gap-x-4 items-center px-4 py-3.5 border-b border-line last:border-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`font-extrabold text-[15px] w-4 tabular-nums ${i === 0 ? 'text-gold' : 'text-ink-faint'}`}>{i + 1}</span>
                    <Avatar player={row.player} size={30} />
                    <span className={`text-[14px] truncate ${i === 0 ? 'font-extrabold text-ink' : 'text-ink-dim'}`}>
                      {row.player.name}
                      {i === 0 && ' 🏆'}
                    </span>
                  </div>
                  <span className="w-14 text-right font-extrabold text-[15px] text-ink tabular-nums">{fmt1(netTotal)}</span>
                  <span className="w-12 text-right text-[12.5px] text-ink-dim tabular-nums">{grossTotal}</span>
                  <span className="w-11 text-right">
                    <MoneyBadge amount={money.get(row.player.id) ?? 0} className="text-[12.5px]" />
                  </span>
                </div>
              ))}
          </Card>
        </>
      )}

      <TripCosts trip={trip} />

      {/* Add anything */}
      <SectionLabel
        action={
          !adding && !editingId ? (
            <button onClick={() => setAdding(true)} className="text-[12.5px] font-bold text-green">+ Add to trip</button>
          ) : undefined
        }
      >
        Travel & Housing
      </SectionLabel>

      {adding && (
        <div className="mb-3">
          <ItineraryEditor defaultDate={trip.startDate ?? TODAY} onSave={(draft) => upsertItem(draft)} onCancel={() => setAdding(false)} />
        </div>
      )}

      {logistics.length === 0 && !adding ? (
        <Card className="p-5 text-center text-[13.5px] text-ink-dim">
          No flights or housing yet. Add them with links, confirmation numbers, and photos.
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {[...logistics]
            .sort((a, b) => a.kind.localeCompare(b.kind) || a.date.localeCompare(b.date))
            .map((item) => (editingId === item.id ? <div key={item.id}>{editorFor(item)}</div> : <ItineraryCard key={item.id} {...cardProps(item)} />))}
        </Card>
      )}

      <SectionLabel>Schedule</SectionLabel>
      {days.length === 0 ? (
        <Card className="p-5 text-center text-[13.5px] text-ink-dim">Nothing scheduled yet. Tee times, dinners, chaos — it all goes here.</Card>
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <div key={day}>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-green px-1 mb-2">{prettyDate(day)}</p>
              <Card className="divide-y divide-line">
                {schedule
                  .filter((i) => i.date === day)
                  .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))
                  .map((item) => (editingId === item.id ? <div key={item.id}>{editorFor(item)}</div> : <ItineraryCard key={item.id} {...cardProps(item)} />))}
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Rounds */}
      {rounds.length > 0 && (
        <>
          <SectionLabel>Rounds</SectionLabel>
          <div className="space-y-3">
            {rounds.map((r) => {
              const standings = roundStandings(r)
              const winner = data.players.find((p) => p.id === standings[0].playerId)!
              return (
                <Card key={r.id} onClick={() => navigate(`/rounds/${r.id}`)} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[14px] text-ink truncate">{r.courseName}</p>
                    <p className="text-[12px] text-ink-faint mt-0.5 tabular-nums">{shortDate(r.date)}</p>
                  </div>
                  <p className="text-[12.5px] text-ink-dim shrink-0">
                    <span className="font-extrabold text-ink">{winner.name}</span> · net{' '}
                    <span className="font-bold tabular-nums">{fmt1(standings[0].netScore)}</span>
                  </p>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

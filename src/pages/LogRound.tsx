import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from '../lib/nav'
import { useMembers, useStore } from '../data/store'
import { courseSuggestions, shortDate } from '../lib/stats'
import { daysAgoISO, todayISO } from '../lib/dates'
import { courseSlug } from '../lib/courses'
import CourseScene from '../components/CourseScene'
import { Icon } from '../components/icons'
import { ghostOptions } from '../lib/ghost'
import { GROSS_CEILING, GROSS_FLOOR, grossWarning } from '../lib/scores'
import { notifyGroup } from '../lib/push'
import { fmt1, type Round } from '../types'
import { findCourse, hasPars } from '../lib/courses'
import { directorySupported, fetchDirectoryCourse, searchDirectory, type DirectoryMatch } from '../lib/courseLookup'
import TeePicker from '../components/TeePicker'
import { Avatar, Card, PrimaryButton, SaddamIcon, SECONDARY_BTN } from '../components/ui'

// Logging a round, as a sheet over whatever screen you were on: it's a
// quick action, not a trip to another page. One screen for where, when
// and who, all taps (the courses you play as scene cards, the date as
// Today / Yesterday chips, the golfers as faces), then either straight to
// the hole-by-hole card or a second screen for totals.
// Defaults to just you, since most rounds are solo.

// Today, yesterday, and the last weekend day before that if it was this
// week, since that's when most rounds happen.
function dateChips(): { iso: string; label: string }[] {
  const out = [
    { iso: todayISO(), label: 'Today' },
    { iso: daysAgoISO(1), label: 'Yesterday' },
  ]
  for (let n = 2; n <= 6; n++) {
    const iso = daysAgoISO(n)
    const d = new Date(`${iso}T12:00:00`)
    if (d.getDay() === 0 || d.getDay() === 6) {
      out.push({ iso, label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }) })
      break
    }
  }
  return out
}

// "Jul 25" this year, "Oct 2025" before that: short enough for a card.
function sinceLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  return iso.slice(0, 4) === todayISO().slice(0, 4)
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export default function LogRound({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { data, addRound, addPlayer, addTrip, saveCourse } = useStore()
  const members = useMembers()

  const [step, setStep] = useState<0 | 2>(0)
  const [query, setQuery] = useState('')
  const [ghostId, setGhostId] = useState<string | null>(null)
  const [pickingDate, setPickingDate] = useState(false)
  const [courseName, setCourseName] = useState('')
  const [date, setDate] = useState(todayISO)
  const [tee, setTee] = useState('')
  const [tripId, setTripId] = useState<string>('')
  // Most rounds are just rounds. The trip picker stays folded until
  // somebody says otherwise, rather than listing every trip the group
  // has ever taken under every Sunday round.
  const [tripMode, setTripMode] = useState<'none' | 'pick' | 'new'>('none')
  const [newTripName, setNewTripName] = useState('')
  const [playerIds, setPlayerIds] = useState<string[]>([data.currentUserId])
  const [scores, setScores] = useState<Record<string, number>>({})
  const [addingGuest, setAddingGuest] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestHcp, setGuestHcp] = useState('')
  // Off by default: putting the trophy up is a declaration, not a side
  // effect of logging scores.
  const [saddamOn, setSaddamOn] = useState(false)

  const guests = data.players.filter((p) => p.guest)

  const addGuest = () => {
    if (!guestName.trim()) return
    // 18 when nobody knows — the polite default for a mystery guest.
    const player = addPlayer({ name: guestName, handicap: Number(guestHcp) || 18, guest: true })
    setPlayerIds((ids) => [...ids, player.id])
    setGuestName('')
    setGuestHcp('')
    setAddingGuest(false)
  }

  const suggestions = useMemo(() => courseSuggestions(data), [data])
  // Trips this round could belong to, the one happening now first.
  const bookedTrips = data.trips
    .filter((t) => t.status === 'booked')
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))
  const chosenTrip = data.trips.find((t) => t.id === tripId)

  // A trip created from here is one you're on right now, so it's
  // booked, starts today, and everyone in the group is on it.
  const createTrip = () => {
    if (!newTripName.trim()) return
    const trip = addTrip({
      name: newTripName.trim(),
      status: 'booked',
      startDate: date,
      attendeeIds: members.map((m) => m.id),
      createdById: data.currentUserId,
      options: [],
      itinerary: [],
    })
    setTripId(trip.id)
    setTripMode('none')
    setNewTripName('')
  }

  const togglePlayer = (id: string) =>
    setPlayerIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const bump = (id: string, delta: number) =>
    setScores((s) => ({ ...s, [id]: Math.max(GROSS_FLOOR, Math.min(GROSS_CEILING, (s[id] ?? 90) + delta)) }))

  // One score is enough. Anyone left blank gets asked for theirs later.
  const anyScored = playerIds.some((id) => scores[id] !== undefined)
  const missing = playerIds.filter((id) => scores[id] === undefined)

  const save = () => {
    const round = addRound({
      date,
      courseName: courseName.trim(),
      tee: tee.trim() || undefined,
      tripId: tripId || undefined,
      saddamOnTheLine: playerIds.length >= 2 ? saddamOn : false,
      ghosts: ghost ? [{ playerId: data.currentUserId, roundId: ghost.round.id }] : undefined,
      players: playerIds.map((pid) => ({
        playerId: pid,
        gross: scores[pid] ?? null,
        handicapSnapshot: data.players.find((p) => p.id === pid)!.handicap,
      })),
    })
    // A posted round is news; a round just starting is not — the group
    // hears about that one when the card finishes.
    if (anyScored) {
      const me = data.players.find((p) => p.id === data.currentUserId)
      notifyGroup({
        toPlayerIds: data.group.memberIds.filter((id) => id !== data.currentUserId),
        title: `${me?.name ?? 'Someone'} logged a round at ${courseName.trim()}`,
        body: `${
          missing.length > 0 ? `${playerIds.length - missing.length} of ${playerIds.length} scores in.` : 'All scores in.'
        } Rate the course while it’s fresh.`,
        url: `/rounds/${round.id}`,
      })
    }
    // No totals yet means they're on the course — go straight to the
    // hole-by-hole card instead of a round page full of blanks.
    onClose()
    navigate(anyScored ? `/rounds/${round.id}` : `/rounds/${round.id}/card`)
  }

  // A sheet: Escape closes it, and the page underneath stops scrolling.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  const chips = dateChips()
  const lastPlayed = (name: string) => {
    const slug = courseSlug(name)
    return data.rounds.filter((r) => courseSlug(r.courseName) === slug).reduce<string | null>((a, r) => (!a || r.date > a ? r.date : a), null)
  }
  // The courses you play, as cards. A course picked from search (or a
  // brand-new one) jumps to the front, so what's chosen is always in view.
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  const picked = courseName.trim()
  const courseCards = picked && !suggestions.slice(0, 8).some((c) => same(c, picked)) ? [picked, ...suggestions.slice(0, 7)] : suggestions.slice(0, 8)
  const q = query.trim().toLowerCase()
  const matches = q ? suggestions.filter((c) => c.toLowerCase().includes(q)).slice(0, 6) : []
  const exact = !!q && suggestions.some((c) => same(c, q))
  const pickCourse = (name: string) => {
    setCourseName(name.trim())
    setQuery('')
  }

  // The course directory. A search costs one of the group's 35 daily
  // lookups and pulling a course in costs another, so both wait for a tap.
  const [dir, setDir] = useState<{
    query: string
    state: 'searching' | 'done' | 'error'
    results: DirectoryMatch[]
    error?: string
    loadingId?: string
  }>({ query: '', state: 'done', results: [] })
  const lookUp = async () => {
    const asked = q
    setDir({ query: asked, state: 'searching', results: [] })
    try {
      const results = await searchDirectory(asked)
      setDir((d) => (d.query === asked ? { query: asked, state: 'done', results } : d))
    } catch (err) {
      setDir((d) => (d.query === asked ? { query: asked, state: 'error', results: [], error: (err as Error).message } : d))
    }
  }
  const pullIn = async (id: string) => {
    setDir((d) => ({ ...d, loadingId: id }))
    try {
      const c = await fetchDirectoryCourse(id)
      // A course the group already has a card for keeps it: the directory
      // never overwrites pars or a stroke index someone typed in.
      const existing = findCourse(data, c.name)
      if (!hasPars(existing)) {
        saveCourse(
          c.name,
          c.hasCard ? c.pars : Array(18).fill(null),
          c.hasCard ? c.strokeIndex : undefined,
          c.rating != null && c.slope != null ? { rating: c.rating, slope: c.slope } : undefined,
          { tees: c.tees.length ? c.tees : undefined, yards: c.hasCard ? c.yards : undefined, yardsTee: c.yardsTee ?? undefined, town: c.town ?? undefined },
        )
      }
      pickCourse(c.name)
      setDir({ query: '', state: 'done', results: [] })
    } catch (err) {
      setDir((d) => ({ ...d, loadingId: undefined, state: 'error', error: (err as Error).message }))
    }
  }
  // Racing your ghost, offered the moment you pick a course you've scored
  // hole by hole before. It used to show up only on the live card, which
  // meant most people never saw it.
  const ghosts = courseName.trim() ? ghostOptions(data, { id: '', groupId: '', courseName: courseName.trim(), date, players: [] } as Round, data.currentUserId) : []
  const ghost = ghosts.find((g) => g.round.id === ghostId)
  const label = 'block text-footnote font-semibold text-ink-dim mb-2 px-1'
  const toggle = (on: boolean) =>
    `rounded-full px-3.5 py-2 text-footnote font-bold transition active:scale-95 ${on ? 'bg-forest text-on-forest' : 'bg-card text-ink-dim ring-1 ring-inset ring-line-strong'}`

  const everyone = [...members, ...guests]

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Log a round">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 animate-[fade_0.2s_ease-out]" />
      <div className="sheet-up absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] max-w-md flex-col rounded-t-3xl bg-paper shadow-[0_-12px_40px_rgba(0,0,0,0.2)]">
        <div className="shrink-0 px-5 pt-2.5">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-line-strong" />
          <div className="mt-3 flex items-center justify-between">
            {step === 2 ? (
              <button onClick={() => setStep(0)} className="text-footnote font-bold text-green">
                ‹ Back
              </button>
            ) : (
              <h2 className="text-title font-bold tracking-tight text-ink">Log a round</h2>
            )}
            {step === 2 && <h2 className="text-headline font-bold text-ink">Scores</h2>}
            <button onClick={onClose} className="px-1 text-footnote font-bold text-ink-faint">
              Cancel
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4">
          {step === 0 && (
            <div className="space-y-5">
              {/* Where: the courses you play, as pictures */}
              <div>
                <span className={label}>Where'd you play?</span>
                {/* Search first, so a course nobody has played is one line
                    of typing away, not hidden past the end of a row. */}
                <label className="relative block">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden>
                      <circle cx="11" cy="11" r="6.5" />
                      <path d="M16 16l4.5 4.5" />
                    </svg>
                  </span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && query.trim()) pickCourse(matches[0] ?? query)
                    }}
                    placeholder="Search courses, or add a new one"
                    aria-label="Search courses, or add a new one"
                    enterKeyHint="done"
                    className="w-full rounded-xl border border-line-strong bg-card py-3 pl-10 pr-4 text-body text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
                  />
                </label>

                {query.trim() ? (
                  <div className="mt-2 overflow-hidden rounded-2xl bg-card ring-1 ring-line divide-y divide-line">
                    {matches.map((c) => {
                      const last = lastPlayed(c)
                      const town = findCourse(data, c)?.town
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => pickCourse(c)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-paper"
                        >
                          <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                            <CourseScene course={c} className="h-full w-full" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-footnote font-bold text-ink">{c}</span>
                            <span className="block truncate text-caption text-ink-faint">
                              {[last ? `Last ${sinceLabel(last)}` : 'Not played yet', town].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                    {!exact && (
                      <button
                        type="button"
                        onClick={() => pickCourse(query)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-paper"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-soft text-title font-bold leading-none text-green-deep">+</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-footnote font-bold text-green-deep">Add “{query.trim()}”</span>
                          <span className="block text-caption text-ink-faint">A new course. Add its scorecard any time after.</span>
                        </span>
                      </button>
                    )}
                    {/* The course directory: scorecard, tees and town filled in
                        for you. Searched only on a tap, since the free plan
                        allows 35 lookups a day for the whole group. */}
                    {!exact && directorySupported() && q.length >= 3 && (
                      <>
                        {dir.query !== q ? (
                          <button
                            type="button"
                            onClick={() => void lookUp()}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-paper"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-soft text-sky">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden>
                                <circle cx="11" cy="11" r="6.5" />
                                <path d="M16 16l4.5 4.5" />
                              </svg>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-footnote font-bold text-sky">Look it up in the course directory</span>
                              <span className="block text-caption text-ink-faint">Fills in the scorecard, tees and town</span>
                            </span>
                          </button>
                        ) : dir.state === 'searching' ? (
                          <p className="px-3 py-3 text-footnote text-ink-dim">Searching the directory…</p>
                        ) : dir.state === 'error' ? (
                          <p className="px-3 py-3 text-footnote font-semibold text-flag">{dir.error}</p>
                        ) : dir.results.length === 0 ? (
                          <p className="px-3 py-3 text-footnote text-ink-dim">Nothing in the directory by that name. Add it yourself above.</p>
                        ) : (
                          dir.results.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              disabled={!!dir.loadingId}
                              onClick={() => void pullIn(m.id)}
                              className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-paper disabled:opacity-60"
                            >
                              <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                                <CourseScene course={m.name} className="h-full w-full" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-footnote font-bold text-ink">{m.name}</span>
                                <span className="block truncate text-caption text-ink-faint">
                                  {dir.loadingId === m.id ? 'Pulling in the card…' : [m.town, m.hasCard ? 'scorecard included' : 'name and town only'].filter(Boolean).join(' · ')}
                                </span>
                              </span>
                            </button>
                          ))
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="-mx-4 mt-2.5 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                    {courseCards.map((c) => {
                      const on = courseName.trim().toLowerCase() === c.toLowerCase()
                      const last = lastPlayed(c)
                      const isNew = !suggestions.some((s) => s.toLowerCase() === c.toLowerCase())
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCourseName(c)}
                          aria-pressed={on}
                          className={`w-[108px] shrink-0 snap-start overflow-hidden rounded-2xl bg-card text-left transition active:scale-[0.97] ${
                            on ? 'ring-[2.5px] ring-forest' : 'ring-1 ring-line'
                          }`}
                        >
                          <CourseScene course={c} className="h-14 w-full" />
                          <span className="block px-2.5 pb-2 pt-1.5">
                            <span className="block truncate text-footnote font-bold text-ink">{c}</span>
                            <span className="block text-caption text-ink-faint tabular-nums">
                              {isNew ? 'New course' : last ? `Last ${sinceLabel(last)}` : 'Not played yet'}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {ghosts.length > 0 && (
                <div className="rounded-2xl bg-card p-3.5 ring-1 ring-line">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink/[0.06] text-ink-dim">
                      <Icon name="ghost" size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-footnote font-bold text-ink">{ghost ? `Racing your ${ghost.gross}` : 'Race a ghost?'}</p>
                      <p className="text-caption text-ink-dim">
                        {ghost
                          ? 'It shows up a hole at a time under your card as you play.'
                          : "You've scored this course hole by hole before. Chase one of those cards."}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {ghosts.slice(0, 4).map((g) => (
                      <button
                        key={g.round.id}
                        type="button"
                        onClick={() => setGhostId(ghostId === g.round.id ? null : g.round.id)}
                        aria-pressed={ghostId === g.round.id}
                        className={toggle(ghostId === g.round.id)}
                      >
                        <span className="tabular-nums">{g.gross}</span> · {sinceLabel(g.round.date)}
                        {g.best && ' · best'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* When */}
              <div>
                <span className={label}>When</span>
                <div className="flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <button
                      key={c.iso}
                      type="button"
                      onClick={() => {
                        setDate(c.iso)
                        setPickingDate(false)
                      }}
                      aria-pressed={date === c.iso && !pickingDate}
                      className={toggle(date === c.iso && !pickingDate)}
                    >
                      {c.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPickingDate(true)}
                    aria-pressed={pickingDate || !chips.some((c) => c.iso === date)}
                    className={toggle(pickingDate || !chips.some((c) => c.iso === date))}
                  >
                    {!pickingDate && !chips.some((c) => c.iso === date) ? shortDate(date) : 'Other day'}
                  </button>
                </div>
                {pickingDate && (
                  <input
                    type="date"
                    value={date}
                    max={todayISO()}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                    aria-label="Date played"
                    className="mt-2.5 w-full rounded-xl border border-line-strong bg-card px-4 py-3 text-body text-ink focus:border-green focus:outline-none"
                  />
                )}
              </div>

              {/* Tees, once there's a course to take them from */}
              {courseName.trim() && (
                <div>
                  <span className={label}>Tees (optional)</span>
                  <TeePicker
                    value={tee}
                    onChange={setTee}
                    course={findCourse(data, courseName)}
                    className="w-full rounded-xl border border-line-strong bg-card px-4 py-3 text-body text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
                  />
                </div>
              )}

              {/* Who: faces to tap. Guests are on the round and in the bets,
                  off the lifetime records, and stick around for next time. */}
              <div>
                <span className={label}>Who played</span>
                <div className="flex flex-wrap gap-x-3 gap-y-3 px-1">
                  {everyone.map((p) => {
                    const on = playerIds.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePlayer(p.id)}
                        aria-pressed={on}
                        className="relative flex w-[58px] flex-col items-center gap-1 transition active:scale-95"
                      >
                        <span className={`transition ${on ? '' : 'opacity-35 grayscale'}`}>
                          <Avatar player={p} size={44} />
                        </span>
                        {on && (
                          <span className="absolute right-0.5 top-0 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-forest text-on-forest ring-2 ring-paper">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4.5 12.5 L9.5 17.5 L19.5 6.5" />
                            </svg>
                          </span>
                        )}
                        <span className={`max-w-full truncate text-caption font-bold ${on ? 'text-ink' : 'text-ink-faint'}`}>
                          {p.id === data.currentUserId ? 'You' : p.name.split(' ')[0]}
                        </span>
                        <span className="-mt-1 text-caption text-ink-faint tabular-nums">{p.guest ? 'guest' : fmt1(p.handicap)}</span>
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setAddingGuest(true)}
                    className="flex w-[58px] flex-col items-center gap-1 text-ink-faint"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-line-strong text-headline font-bold">+</span>
                    <span className="text-caption font-bold">Guest</span>
                  </button>
                </div>

                {addingGuest && (
                  <Card className="mt-3 p-3.5 space-y-2.5">
                    <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                      <input
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Guest's name"
                        autoFocus
                        className="rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
                      />
                      <input
                        value={guestHcp}
                        onChange={(e) => setGuestHcp(e.target.value.replace(/[^\d.]/g, ''))}
                        placeholder="Hcp"
                        inputMode="decimal"
                        className="rounded-lg border border-line-strong bg-card px-3 py-2.5 text-center text-body text-ink tabular-nums placeholder:text-ink-faint focus:border-green focus:outline-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <PrimaryButton onClick={addGuest} disabled={!guestName.trim()} className="flex-1 !py-2.5">
                        Add to round
                      </PrimaryButton>
                      <button onClick={() => setAddingGuest(false)} className="px-3 text-footnote font-bold text-ink-faint">
                        Cancel
                      </button>
                    </div>
                  </Card>
                )}
              </div>

              {/* The Saddam is declared, not automatic: the trophy has house
                  rules the app can't know, so the group says when it's at stake. */}
              {playerIds.length >= 2 && (
                <Card
                  onClick={() => setSaddamOn((v) => !v)}
                  className={`p-3.5 flex items-center gap-3 transition ${saddamOn ? 'border-cream-deep bg-cream' : ''}`}
                >
                  <SaddamIcon size={26} />
                  <div className="flex-1 min-w-0">
                    <p className="text-body font-bold text-ink">The Saddam is on the line</p>
                    <p className="text-caption text-ink-faint">{saddamOn ? 'Winner takes the trophy.' : 'Off. This round can’t move the trophy.'}</p>
                  </div>
                  <span className={`h-7 w-12 rounded-full p-1 transition shrink-0 ${saddamOn ? 'bg-gold' : 'bg-line-strong'}`}>
                    <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${saddamOn ? 'translate-x-5' : ''}`} />
                  </span>
                </Card>
              )}

              {/* Trips, folded. Just a round is the default and needs no tap. */}
              <div>
                {tripMode === 'none' && !chosenTrip && (
                  <button onClick={() => setTripMode('pick')} className="px-1 text-footnote font-bold text-green">
                    Part of a trip?
                  </button>
                )}

                {chosenTrip && tripMode !== 'new' && (
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-footnote text-ink-dim">
                      Part of <span className="font-bold text-ink">{chosenTrip.name}</span>
                    </span>
                    <button onClick={() => setTripMode('pick')} className="text-footnote font-bold text-green">
                      Change
                    </button>
                    <button
                      onClick={() => {
                        setTripId('')
                        setTripMode('none')
                      }}
                      className="text-footnote font-bold text-ink-faint"
                    >
                      Not a trip
                    </button>
                  </div>
                )}

                {tripMode === 'pick' && (
                  <div>
                    <span className={label}>Which trip?</span>
                    <div className="flex flex-wrap gap-2">
                      {bookedTrips.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setTripId(t.id)
                            setTripMode('none')
                          }}
                          className={toggle(tripId === t.id)}
                        >
                          {t.name}
                        </button>
                      ))}
                      <button
                        onClick={() => setTripMode('new')}
                        className="rounded-full px-3.5 py-2 text-footnote font-bold border border-dashed border-green/50 text-green"
                      >
                        + New trip
                      </button>
                      <button
                        onClick={() => {
                          setTripId('')
                          setTripMode('none')
                        }}
                        className="px-2 text-footnote font-bold text-ink-faint"
                      >
                        {chosenTrip ? 'Cancel' : 'Never mind'}
                      </button>
                    </div>
                  </div>
                )}

                {tripMode === 'new' && (
                  <div>
                    <span className={label}>New trip</span>
                    <div className="flex gap-2">
                      <input
                        value={newTripName}
                        onChange={(e) => setNewTripName(e.target.value)}
                        placeholder="e.g. Myrtle Beach 2026"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && createTrip()}
                        className="flex-1 rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
                      />
                      <button
                        onClick={createTrip}
                        disabled={!newTripName.trim()}
                        className="rounded-xl bg-green px-4 py-2.5 text-footnote font-bold text-white disabled:opacity-30"
                      >
                        Create
                      </button>
                      <button onClick={() => setTripMode('pick')} className="px-2 text-footnote font-bold text-ink-faint">
                        Back
                      </button>
                    </div>
                    <p className="text-caption text-ink-faint mt-1.5 px-1">
                      Booked, starting today, everyone in the group on it. Dates, lodging and costs can be filled in from Trips later.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-footnote text-ink-dim px-1">
                Gross scores at {courseName.trim()}. Net is handled for you.
              </p>
              {playerIds.map((pid) => {
                const p = data.players.find((pl) => pl.id === pid)!
                const val = scores[pid]
                const warning = val === undefined ? null : grossWarning(val)
                return (
                  <Card key={pid} className="p-4 flex flex-wrap items-center gap-3">
                    <Avatar player={p} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-body text-ink truncate">{p.name}</p>
                      <p className="text-caption text-ink-faint tabular-nums">
                        {val !== undefined ? `net ${fmt1(val - p.handicap)}` : `hcp ${fmt1(p.handicap)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => bump(pid, -1)}
                        className="h-12 w-12 rounded-xl bg-ink/[0.06] text-ink text-large font-bold active:scale-95 transition"
                        aria-label={`decrease ${p.name}`}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={val ?? ''}
                        placeholder="—"
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10)
                          setScores((sc) => {
                            const copy = { ...sc }
                            if (Number.isNaN(n)) delete copy[pid]
                            else copy[pid] = n
                            return copy
                          })
                        }}
                        className="w-16 h-12 rounded-xl border border-line-strong bg-card text-center text-title font-extrabold text-ink tabular-nums focus:border-green focus:outline-none"
                      />
                      <button
                        onClick={() => bump(pid, 1)}
                        className="h-12 w-12 rounded-xl bg-ink/[0.06] text-ink text-large font-bold active:scale-95 transition"
                        aria-label={`increase ${p.name}`}
                      >
                        +
                      </button>
                    </div>
                    {warning && <p className="w-full text-footnote font-semibold text-flag">{warning}</p>}
                  </Card>
                )
              })}
              <p className="text-caption text-ink-faint px-1 pt-1">Tap − / + to nudge from 90, or type it straight in.</p>
              {missing.length > 0 && anyScored && (
                <Card className="p-3.5 border-gold/30 bg-gold-soft/40">
                  <p className="text-footnote text-ink">
                    <span className="font-bold">Don't know everyone's score?</span> Leave it blank.{' '}
                    {missing
                      .map((id) => data.players.find((p) => p.id === id)?.name)
                      .filter(Boolean)
                      .join(' and ')}{' '}
                    will be asked to fill {missing.length === 1 ? 'theirs' : 'them'} in next time they open the app.
                  </p>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Footer, pinned to the bottom of the sheet */}
        <div className="shrink-0 border-t border-line bg-paper px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.9rem)]">
          {step === 0 ? (
            <div className="grid gap-2">
              <PrimaryButton onClick={() => save()} disabled={!courseName.trim() || playerIds.length === 0} className="w-full !py-3.5">
                Start scoring
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!courseName.trim() || playerIds.length === 0}
                className={`w-full rounded-xl py-3 text-body ${SECONDARY_BTN}`}
              >
                Just enter totals
              </button>
            </div>
          ) : (
            <PrimaryButton onClick={() => save()} disabled={!anyScored} className="w-full !py-3.5">
              {anyScored && missing.length > 0 ? `Save with ${missing.length} to come` : 'Save round'}
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

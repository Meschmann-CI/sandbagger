import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import { useGoBack } from '../lib/nav'
import { useStore } from '../data/store'
import { wrappedFor } from '../lib/wrapped'
import { todayISO } from '../lib/dates'
import { money } from '../lib/money'
import { shortDate } from '../lib/stats'
import { fmt1 } from '../types'
import RoundScene from '../components/RoundScene'
import CourseScene from '../components/CourseScene'
import { Avatar, SaddamIcon } from '../components/ui'
import { CountUp, Confetti } from '../components/Delight'
import { Medal } from '../components/Medal'

// Season Wrapped: your year as a stack of full-screen cards, the way
// Stories work. Tap the right side for the next card, the left for the
// one before; each moves on by itself after a few seconds. Cards with
// nothing to say (no rival, no money) are left out.

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const HOLD_MS = 5200

interface Slide {
  key: string
  bg: string
  dark?: boolean
  body: ReactNode
}

export default function Wrapped() {
  const { year = String(new Date().getFullYear()) } = useParams()
  const goBack = useGoBack('/profile')
  const { data } = useStore()
  const me = data.players.find((p) => p.id === data.currentUserId)!
  const w = useMemo(() => wrappedFor(data, me.id, year, todayISO()), [data, me.id, year])
  const mount = useRef(Math.random().toString(36).slice(2)).current
  const [at, setAt] = useState(0)
  const [started, setStarted] = useState(() => performance.now())
  const rival = w.rival ? data.players.find((p) => p.id === w.rival!.playerId) : undefined
  const big = 'text-[76px] font-extrabold leading-[0.9] tracking-[-0.04em]'
  const kicker = 'text-caption font-semibold uppercase tracking-[0.18em] opacity-75'

  const slides: Slide[] = [
    {
      key: 'intro',
      bg: 'radial-gradient(80% 60% at 50% 30%, #2f6a4d, #1c4632 75%)',
      dark: true,
      body: (
        <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
          <span className="rounded-[30px] bg-cream p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
            <SaddamIcon size={104} />
          </span>
          <p className={kicker}>Sandbagger Wrapped</p>
          <p className="text-[44px] font-extrabold leading-none tracking-tight">{me.name}'s {year}</p>
          <p className="max-w-[260px] text-body opacity-80">Every round, every dollar, every day with the trophy. Tap to start.</p>
        </div>
      ),
    },
    {
      key: 'rounds',
      bg: 'linear-gradient(160deg, #2f6fa3, #1c4632)',
      dark: true,
      body: (
        <div className="flex h-full flex-col justify-center gap-3">
          <p className={kicker}>You teed it up</p>
          <p className={big}>
            <CountUp id={`w-rounds-${mount}`} value={w.rounds} />
          </p>
          <p className="text-title font-bold">{w.rounds === 1 ? 'round' : 'rounds'} this year</p>
          <p className="mt-2 text-body opacity-85">
            {w.groupRounds > 0 ? `${plural(w.groupRounds, 'group round')}, ${plural(w.groupWins, 'win')}.` : 'All of them solo.'}
            {w.busiestMonth && ` ${w.busiestMonth.name} was the busiest, with ${w.busiestMonth.rounds}.`}
          </p>
        </div>
      ),
    },
  ]
  if (w.best)
    slides.push({
      key: 'best',
      bg: '#1c4632',
      dark: true,
      body: (
        <div className="relative flex h-full flex-col justify-end gap-2 pb-10">
          <div className="absolute inset-x-[-24px] top-[-60px] h-[58%]">
            <RoundScene round={w.best.round} />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent from-40% to-[#1c4632]" />
          </div>
          <p className={`relative ${kicker}`}>Round of the year</p>
          <p className={`relative ${big}`}>
            <CountUp id={`w-best-${mount}`} value={w.best.gross} />
          </p>
          <p className="relative text-title font-bold">{w.best.round.courseName}</p>
          <p className="relative text-body opacity-80">
            {shortDate(w.best.round.date)}
            {w.average != null && ` · you averaged ${fmt1(w.average)}`}
          </p>
        </div>
      ),
    })
  if (w.homeTurf)
    slides.push({
      key: 'turf',
      bg: '#f3ead4',
      body: (
        <div className="flex h-full flex-col justify-center gap-4 text-forest">
          <p className={kicker}>Home turf</p>
          <div className="overflow-hidden rounded-3xl shadow-[0_18px_40px_rgba(28,70,50,0.25)]">
            <CourseScene course={w.homeTurf.course} className="h-48 w-full" />
          </div>
          <p className="text-[40px] font-extrabold leading-none tracking-tight">{w.homeTurf.course}</p>
          <p className="text-title font-bold">{plural(w.homeTurf.rounds, 'round')} there.</p>
        </div>
      ),
    })
  if (w.rival && rival)
    slides.push({
      key: 'rival',
      bg: 'linear-gradient(160deg, #9a6a33, #5c3a14)',
      dark: true,
      body: (
        <div className="flex h-full flex-col justify-center gap-4">
          <p className={kicker}>Your rival</p>
          <div className="flex items-center gap-4">
            <Avatar player={me} size={72} />
            <span className="text-title font-bold opacity-70">vs</span>
            <Avatar player={rival} size={72} />
          </div>
          <p className="text-[40px] font-extrabold leading-none tracking-tight">{rival.name}</p>
          <p className={big}>
            {w.rival.wins}–{w.rival.losses}
          </p>
          <p className="text-body opacity-85">
            {w.rival.wins > w.rival.losses
              ? `On net, in group rounds. ${rival.name} will want that back.`
              : w.rival.wins < w.rival.losses
                ? `On net, in group rounds. Next year.`
                : 'Dead even on net. Nobody gets to talk.'}
            {w.rival.ties > 0 && ` Plus ${plural(w.rival.ties, 'tie')}.`}
          </p>
        </div>
      ),
    })
  if (w.money !== 0)
    slides.push({
      key: 'money',
      bg: w.money > 0 ? 'linear-gradient(160deg, #1c7c4a, #14603a)' : 'linear-gradient(160deg, #4a554d, #182019)',
      dark: true,
      body: (
        <div className="flex h-full flex-col justify-center gap-3">
          <p className={kicker}>On the bets</p>
          <p className={big}>
            {w.money > 0 ? '+' : '−'}
            <CountUp id={`w-money-${mount}`} value={Math.abs(w.money)} format={(n) => money(Math.round(n))} />
          </p>
          <p className="text-body opacity-85">{w.money > 0 ? 'Up on the year. Drinks are on you.' : 'Down on the year. Consider it a donation.'}</p>
        </div>
      ),
    })
  slides.push({
    key: 'saddam',
    bg: 'radial-gradient(70% 55% at 50% 30%, #2f6a4d, #1c4632 72%)',
    dark: true,
    body: (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <span className={`rounded-[26px] bg-cream p-1.5 ${w.saddamDays ? '' : 'opacity-60 grayscale'}`}>
          <SaddamIcon size={88} />
        </span>
        <p className={kicker}>The Saddam</p>
        <p className={big}>
          <CountUp id={`w-saddam-${mount}`} value={w.saddamDays} />
        </p>
        <p className="text-title font-bold">{w.saddamDays === 1 ? 'day' : 'days'} holding it</p>
        {!w.saddamDays && <p className="text-body opacity-80">Not one. There's always next year.</p>}
      </div>
    ),
  })
  if (w.badges.length)
    slides.push({
      key: 'badges',
      bg: '#f6f6f2',
      body: (
        <div className="flex h-full flex-col justify-center gap-6 text-ink">
          <div>
            <p className={kicker}>On the shelf</p>
            <p className="mt-1 text-[40px] font-extrabold leading-none tracking-tight">{plural(w.badges.length, 'badge')}</p>
          </div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-5">
            {w.badges.slice(0, 9).map((b) => (
              <div key={b.key} className="flex flex-col items-center gap-1.5 text-center">
                <Medal badge={b} />
                <span className="text-caption font-bold">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    })
  slides.push({
    key: 'outro',
    bg: 'radial-gradient(80% 60% at 50% 30%, #2f6a4d, #1c4632 75%)',
    dark: true,
    body: (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p className={kicker}>That's the year</p>
        <p className="text-[40px] font-extrabold leading-tight tracking-tight">See you on the first tee in {Number(year) + 1}.</p>
        <button onClick={goBack} className="mt-4 rounded-xl bg-cream px-5 py-3 text-body font-bold text-forest active:scale-95">
          Done
        </button>
      </div>
    ),
  })

  const last = slides.length - 1
  const go = (n: number) => {
    setAt(Math.max(0, Math.min(last, n)))
    setStarted(performance.now())
  }

  // Moves on by itself, and stops on the last card.
  useEffect(() => {
    if (at >= last) return
    const t = setTimeout(() => go(at + 1), HOLD_MS)
    return () => clearTimeout(t)
    // `go` is recreated each render; the timer only cares about the card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, last])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(at + 1)
      if (e.key === 'ArrowLeft') go(at - 1)
      if (e.key === 'Escape') goBack()
    }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  })

  const slide = slides[at]
  return createPortal(
    <div
      className={`fixed inset-0 z-[80] select-none overflow-hidden ${slide.dark ? 'text-on-forest' : 'text-ink'}`}
      style={{ background: slide.bg }}
      role="dialog"
      aria-modal="true"
      aria-label={`${year} Wrapped, card ${at + 1} of ${slides.length}`}
    >
      <Confetti fire={slide.key === 'best' || (slide.key === 'money' && w.money > 0) ? at + 1 : 0} originY={0.3} />
      <div className="mx-auto flex h-full max-w-md flex-col px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="relative z-10 flex gap-1.5 pt-2">
          {slides.map((s, i) => (
            <span key={s.key} className={`h-[3px] flex-1 overflow-hidden rounded-full ${slide.dark ? 'bg-white/25' : 'bg-ink/15'}`}>
              <span
                key={`${i}-${started}`}
                className={`block h-full rounded-full ${slide.dark ? 'bg-white' : 'bg-ink'} ${i === at && at < last ? 'wrapped-fill' : ''}`}
                style={{ width: i < at || (i === at && at === last) ? '100%' : i === at ? undefined : '0%', animationDuration: `${HOLD_MS}ms` }}
              />
            </span>
          ))}
        </div>
        <div className="relative z-10 flex justify-end pt-2">
          <button onClick={goBack} aria-label="Close" className={`flex h-9 w-9 items-center justify-center rounded-full ${slide.dark ? 'bg-white/15' : 'bg-ink/10'}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div key={slide.key} className="wrapped-in relative min-h-0 flex-1">
          {slide.body}
        </div>
      </div>
      {/* Tap zones: the left third goes back, the rest goes on. */}
      {at < last && (
        <>
          <button aria-label="Previous" onClick={() => go(at - 1)} className="absolute bottom-0 left-0 top-24 w-1/3" />
          <button aria-label="Next" onClick={() => go(at + 1)} className="absolute bottom-0 right-0 top-24 w-2/3" />
        </>
      )}
    </div>,
    document.body,
  )
}

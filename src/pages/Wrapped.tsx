import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import { useGoBack } from '../lib/nav'
import { useStore } from '../data/store'
import { pickPhotos, wrappedFor, type Wrapped as WrappedData, type WrappedPhoto } from '../lib/wrapped'
import { todayISO } from '../lib/dates'
import { money } from '../lib/money'
import { shortDate } from '../lib/stats'
import { fmt1 } from '../types'
import RoundScene from '../components/RoundScene'
import CourseScene from '../components/CourseScene'
import { Avatar, SaddamIcon } from '../components/ui'
import { CountUp, Confetti } from '../components/Delight'
import { preloadMusic, setSoundOn, soundOn, startMusic } from '../lib/sound'
import { Medal } from '../components/Medal'

// Season Wrapped: your year as a stack of full-screen cards, the way
// Stories work. Tap the right side for the next card, the left for the
// one before; each moves on by itself after a few seconds. Cards with
// nothing to say (no rival, no money, no photos) are left out. Photos
// from the year's rounds stand in for the painted scenes wherever one
// fits, and get a card of their own.

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const HOLD_MS = 5200

interface Slide {
  key: string
  bg: string
  dark?: boolean
  /** How long the card stays up before moving on, if not HOLD_MS. */
  hold?: number
  body: ReactNode
}

const signedMoney = (n: number) => `${n < 0 ? '−' : '+'}${money(Math.abs(n))}`

const MONTH_INITIALS =['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export default function Wrapped() {
  const { year = String(new Date().getFullYear()) } = useParams()
  const goBack = useGoBack('/profile')
  const { data } = useStore()
  const me = data.players.find((p) => p.id === data.currentUserId)!
  const w = useMemo(() => wrappedFor(data, me.id, year, todayISO()), [data, me.id, year])
  const mount = useRef(Math.random().toString(36).slice(2)).current
  const [at, setAt] = useState(0)
  const [started, setStarted] = useState(() => performance.now())
  // Music under the cards, if sound is on. It starts as the recap opens
  // (the tap that opened it woke the audio), or on the first tap inside
  // if it didn't; the speaker button turns it off and remembers.
  const [musicOn, setMusicOn] = useState(soundOn)
  const stopMusic = useRef<(() => void) | null>(null)
  const startIfWanted = () => {
    if (musicOn && !stopMusic.current) stopMusic.current = startMusic()
  }
  useEffect(() => {
    preloadMusic()
    startIfWanted()
    return () => {
      stopMusic.current?.()
      stopMusic.current = null
    }
    // Once, on open; toggling goes through the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const toggleMusic = () => {
    if (stopMusic.current) {
      stopMusic.current()
      stopMusic.current = null
      setMusicOn(false)
      setSoundOn(false)
    } else {
      setSoundOn(true)
      setMusicOn(true)
      stopMusic.current = startMusic()
    }
  }
  const rival = w.rival ? data.players.find((p) => p.id === w.rival!.playerId) : undefined
  const bestPhoto = w.best ? w.photos.find((p) => p.roundId === w.best!.round.id) : undefined
  const turfPhoto = w.homeTurf ? w.photos.filter((p) => p.courseName === w.homeTurf!.course).at(-1) : undefined
  const pile = useMemo(() => pickPhotos(w.photos, 6), [w.photos])
  const montage = useMemo(() => pickPhotos(w.photos, 9), [w.photos])
  const photoRounds = new Set(w.photos.map((p) => p.roundId)).size
  const bestDay = w.moneyLine.reduce<WrappedData['moneyLine'][number] | null>((a, p) => (!a || p.delta > a.delta ? p : a), null)

  // Fetch the pictures while the first cards are up, so each is there
  // the moment its card is.
  useEffect(() => {
    for (const p of new Set([bestPhoto, turfPhoto, ...pile, ...montage])) {
      if (p) new Image().src = p.url
    }
  }, [bestPhoto, turfPhoto, pile, montage])

  const big = 'text-[76px] font-extrabold leading-[0.9] tracking-[-0.04em]'
  const kicker = 'text-body font-semibold opacity-75'

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
          <MonthBars months={w.months} />
        </div>
      ),
    },
  ]
  if (w.scores.length >= 3) {
    const steady = w.trend == null || Math.abs(w.trend) < 0.5
    slides.push({
      key: 'scores',
      bg: 'linear-gradient(170deg, #eef4f9, #d9e6f1)',
      body: (
        <div className="flex h-full flex-col justify-center gap-4 text-ink">
          <p className={`${kicker} text-sky`}>Stroke by stroke</p>
          <p className="text-[40px] font-extrabold leading-[1.02] tracking-tight">
            {steady ? 'Steady all year.' : w.trend! < 0 ? `${fmt1(-w.trend!)} strokes better.` : `${fmt1(w.trend!)} strokes worse.`}
          </p>
          <ScoreLine scores={w.scores} bestId={w.best?.round.id} average={w.average} />
          <p className="text-body text-ink-dim">
            {steady
              ? 'Every round of the year, left to right. Remarkably, boringly consistent.'
              : w.trend! < 0
                ? 'The back half of the year against the front. Someone has been practicing.'
                : 'The back half of the year against the front. Blame the weather.'}
          </p>
        </div>
      ),
    })
  }
  if (w.best)
    slides.push({
      key: 'best',
      bg: '#1c4632',
      dark: true,
      body: (
        <div className="relative flex h-full flex-col justify-end gap-2 pb-10">
          <div className="absolute inset-x-[-24px] top-[-60px] h-[58%] overflow-hidden">
            {bestPhoto ? (
              <img src={bestPhoto.url} alt="" className="wrapped-drift h-full w-full object-cover" />
            ) : (
              <RoundScene round={w.best.round} />
            )}
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
  if (pile.length)
    slides.push({
      key: 'photos',
      bg: 'radial-gradient(90% 70% at 50% 40%, #37322b, #191713 80%)',
      dark: true,
      hold: 2600 + pile.length * 700,
      body: (
        <div className="flex h-full flex-col gap-4 pt-4">
          <div>
            <p className={kicker}>The year in pictures</p>
            <p className="mt-1 text-[40px] font-extrabold leading-none tracking-tight">{plural(w.photos.length, 'photo')}</p>
            <p className="mt-1 text-body opacity-80">
              {photoRounds === 1 ? 'All from one round.' : `From ${photoRounds} rounds.`}
              {w.photos.length > pile.length && ` Here are ${pile.length}.`}
            </p>
          </div>
          <PhotoPile photos={pile} />
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
          <div className="h-48 overflow-hidden rounded-3xl shadow-[0_18px_40px_rgba(28,70,50,0.25)]">
            {turfPhoto ? (
              <img src={turfPhoto.url} alt="" className="wrapped-drift h-full w-full object-cover" />
            ) : (
              <CourseScene course={w.homeTurf.course} className="h-full w-full" />
            )}
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
          <RivalBar record={w.rival} />
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
          {w.moneyLine.length > 0 && <MoneyLine line={w.moneyLine} />}
          <p className="text-body opacity-85">
            {bestDay && bestDay.delta > 0 && `Best day: ${signedMoney(bestDay.delta)} at ${bestDay.courseName}, ${shortDate(bestDay.date).replace(/, \d{4}$/, '')}. `}
            {w.money > 0 ? 'Up on the year. Drinks are on you.' : 'Down on the year. Consider it a donation.'}
          </p>
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
      <div className="relative flex h-full flex-col items-center justify-center gap-4 text-center">
        {montage.length >= 3 && <Montage photos={montage} />}
        <p className={`relative ${kicker}`}>That's the year</p>
        <p className="relative text-[40px] font-extrabold leading-tight tracking-tight">See you on the first tee in {Number(year) + 1}.</p>
        <button onClick={goBack} className="relative mt-4 rounded-xl bg-cream px-5 py-3 text-body font-bold text-forest active:scale-95">
          Done
        </button>
      </div>
    ),
  })

  const last = slides.length - 1
  const go = (n: number) => {
    startIfWanted()
    setAt(Math.max(0, Math.min(last, n)))
    setStarted(performance.now())
  }

  // Moves on by itself, and stops on the last card.
  const hold = slides[at].hold ?? HOLD_MS
  useEffect(() => {
    if (at >= last) return
    const t = setTimeout(() => go(at + 1), hold)
    return () => clearTimeout(t)
    // `go` is recreated each render; the timer only cares about the card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, last, hold])

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
                style={{ width: i < at || (i === at && at === last) ? '100%' : i === at ? undefined : '0%', animationDuration: `${hold}ms` }}
              />
            </span>
          ))}
        </div>
        <div className="relative z-10 flex justify-end gap-2 pt-2">
          <button
            onClick={toggleMusic}
            aria-label={musicOn ? 'Turn the music off' : 'Turn the music on'}
            aria-pressed={musicOn}
            className={`flex h-9 w-9 items-center justify-center rounded-full ${slide.dark ? 'bg-white/15' : 'bg-ink/10'}`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" />
              {musicOn ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
            </svg>
          </button>
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

/** Rounds per month as bars; the busiest month in cream. */
function MonthBars({ months }: { months: number[] }) {
  const top = Math.max(...months, 1)
  return (
    <div className="mt-6" aria-hidden>
      <div className="flex h-24 items-end gap-1.5">
        {months.map((n, i) => (
          <span
            key={i}
            className={`wrapped-grow flex-1 rounded-t-md ${n === top ? 'bg-cream' : n ? 'bg-white/40' : 'bg-white/15'}`}
            style={{ height: n ? `${(n / top) * 100}%` : '3px', animationDelay: `${0.25 + i * 0.05}s` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {MONTH_INITIALS.map((m, i) => (
          <span key={i} className={`flex-1 text-center text-caption font-semibold ${months[i] === top ? 'opacity-100' : 'opacity-60'}`}>
            {m}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Every round's gross, left to right through the year. Lower scores sit higher. */
function ScoreLine({ scores, bestId, average }: { scores: WrappedData['scores']; bestId?: string; average: number | null }) {
  const W = 320
  const H = 190
  const pad = { x: 14, top: 26, bottom: 18 }
  const grosses = scores.map((s) => s.gross)
  const lo = Math.min(...grosses)
  const hi = Math.max(...grosses)
  const x = (i: number) => pad.x + (i / (scores.length - 1)) * (W - pad.x * 2)
  const y = (g: number) => pad.top + ((g - lo) / (hi - lo || 1)) * (H - pad.top - pad.bottom)
  const points = scores.map((s, i) => `${x(i).toFixed(1)},${y(s.gross).toFixed(1)}`).join(' ')
  const bestIndex = scores.findIndex((s) => s.roundId === bestId)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`Scores this year, from ${hi} down to ${lo}`}>
      {average != null && (
        <>
          <line x1={0} x2={W} y1={y(average)} y2={y(average)} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="4 5" />
          <text x={W} y={y(average) - 6} textAnchor="end" className="fill-ink-dim text-[11px] font-semibold">
            avg {fmt1(average)}
          </text>
        </>
      )}
      <polyline
        points={points}
        pathLength={1}
        fill="none"
        stroke="var(--color-sky)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="wrapped-draw"
      />
      {scores.map((s, i) => (
        <circle
          key={s.roundId}
          cx={x(i)}
          cy={y(s.gross)}
          r={i === bestIndex ? 7 : 4}
          fill={i === bestIndex ? 'var(--color-forest)' : 'white'}
          stroke={i === bestIndex ? 'white' : 'var(--color-sky)'}
          strokeWidth={2.5}
          className="wrapped-pop"
          style={{ animationDelay: `${0.3 + (i / scores.length) * 1.6}s` }}
        />
      ))}
      {bestIndex >= 0 && (
        <text
          x={Math.min(Math.max(x(bestIndex), 20), W - 20)}
          y={y(scores[bestIndex].gross) - 13}
          textAnchor="middle"
          className="wrapped-pop fill-forest text-[13px] font-extrabold"
          style={{ animationDelay: '2s' }}
        >
          {scores[bestIndex].gross}
        </text>
      )}
    </svg>
  )
}

/**
 * The running total on the bets through the year, from $0 before the
 * first bet. Money won sits above the dashed $0 line, money lost below;
 * the biggest single day and where the year ended are labeled.
 */
function MoneyLine({ line }: { line: WrappedData['moneyLine'] }) {
  const W = 320
  const H = 170
  const pad = { x: 12, top: 26, bottom: 24 }
  const totals = [0, ...line.map((p) => p.total)]
  const lo = Math.min(0, ...totals)
  const hi = Math.max(0, ...totals)
  const x = (i: number) => pad.x + (i / (totals.length - 1)) * (W - pad.x * 2)
  const y = (v: number) => pad.top + ((hi - v) / (hi - lo || 1)) * (H - pad.top - pad.bottom)
  const pts = totals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const zero = y(0)
  const last = totals.length - 1
  const best = line.reduce((b, p, i) => (p.delta > line[b].delta ? i : b), 0) + 1
  const label = (i: number, text: string, bold = false) => {
    const below = totals[i] < 0
    return (
      <text
        x={Math.min(Math.max(x(i), 24), W - 24)}
        y={y(totals[i]) + (below ? 20 : -12)}
        textAnchor="middle"
        className={`wrapped-pop fill-current text-[12px] ${bold ? 'font-extrabold' : 'font-semibold opacity-80'}`}
        style={{ animationDelay: '1.9s' }}
      >
        {text}
      </text>
    )
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="my-2 w-full overflow-visible" role="img" aria-label={`Running total on the bets, ending at ${signedMoney(totals[last])}`}>
      <defs>
        <linearGradient id="wrapped-money-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity={0.28} />
          <stop offset="1" stopColor="white" stopOpacity={0.04} />
        </linearGradient>
      </defs>
      <polygon
        points={`${x(0)},${zero} ${pts.join(' ')} ${x(last)},${zero}`}
        fill="url(#wrapped-money-fill)"
        className="motion-safe:animate-[fade_0.8s_ease_1.4s_both]"
      />
      <line x1={0} x2={W} y1={zero} y2={zero} stroke="currentColor" strokeOpacity={0.4} strokeDasharray="4 5" />
      <text x={0} y={zero - 6} className="fill-current text-[11px] font-semibold opacity-70">
        $0
      </text>
      <polyline points={pts.join(' ')} pathLength={1} fill="none" stroke="var(--color-cream)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="wrapped-draw" />
      {totals.slice(1).map((v, k) => (
        <circle
          key={line[k].roundId}
          cx={x(k + 1)}
          cy={y(v)}
          r={k + 1 === last ? 6 : 3.5}
          fill={k + 1 === last ? 'var(--color-cream)' : 'white'}
          className="wrapped-pop"
          style={{ animationDelay: `${0.3 + ((k + 1) / totals.length) * 1.6}s` }}
        />
      ))}
      {best !== last && line[best - 1].delta > 0 && label(best, signedMoney(line[best - 1].delta))}
      {label(last, signedMoney(totals[last]), true)}
    </svg>
  )
}

// Where each polaroid lands on the pile, by how many there are: left and
// top as a percentage of the table, and a resting tilt. The widths keep
// the whole pile on screen however tall the phone is.
const PILES: { l: number; t: number; r: number }[][] = [
  [{ l: 14, t: 4, r: -3 }],
  [
    { l: 2, t: 2, r: -5 },
    { l: 40, t: 28, r: 4 },
  ],
  [
    { l: 0, t: 0, r: -6 },
    { l: 46, t: 8, r: 5 },
    { l: 18, t: 42, r: -2 },
  ],
  [
    { l: 0, t: 0, r: -6 },
    { l: 48, t: 4, r: 5 },
    { l: 4, t: 46, r: 4 },
    { l: 46, t: 50, r: -4 },
  ],
  [
    { l: 2, t: 0, r: -6 },
    { l: 46, t: 4, r: 5 },
    { l: 22, t: 30, r: 2 },
    { l: 0, t: 60, r: 4 },
    { l: 48, t: 62, r: -5 },
  ],
  [
    { l: 2, t: 0, r: -6 },
    { l: 46, t: 4, r: 5 },
    { l: 6, t: 30, r: 3 },
    { l: 48, t: 34, r: -4 },
    { l: 2, t: 60, r: -3 },
    { l: 44, t: 62, r: 6 },
  ],
]
const PILE_WIDTH = ['min(68cqw, 62cqh)', 'min(56cqw, 50cqh)', 'min(50cqw, 44cqh)', 'min(48cqw, 40cqh)', 'min(44cqw, 31cqh)', 'min(44cqw, 31cqh)']

/** The year's photos as polaroids dropped on a table, one after another. */
function PhotoPile({ photos }: { photos: WrappedPhoto[] }) {
  const spots = PILES[photos.length - 1]
  return (
    <div className="relative min-h-0 w-full flex-1" style={{ containerType: 'size' }}>
      {photos.map((p, i) => (
        <figure
          key={p.id}
          className="wrapped-drop absolute m-0 bg-white p-[4%] pb-[3%] shadow-[0_14px_30px_rgba(0,0,0,0.45)]"
          style={{
            left: `${spots[i].l}%`,
            top: `${spots[i].t}%`,
            width: PILE_WIDTH[photos.length - 1],
            ['--r' as string]: `${spots[i].r}deg`,
            animationDelay: `${0.4 + i * 0.7}s`,
          }}
        >
          <img src={p.url} alt="" className="aspect-square w-full bg-paper object-cover" />
          <figcaption className="mt-[4%] flex gap-1.5 text-caption font-semibold text-ink-dim">
            <span className="min-w-0 flex-1 truncate">{p.courseName}</span>
            <span className="shrink-0">{shortDate(p.date).replace(/, \d{4}$/, '')}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

/** Wins, ties and losses as one bar. */
function RivalBar({ record }: { record: { wins: number; losses: number; ties: number } }) {
  const parts = [
    { n: record.wins, cls: 'bg-cream' },
    { n: record.ties, cls: 'bg-white/45' },
    { n: record.losses, cls: 'bg-white/25' },
  ].filter((p) => p.n > 0)
  return (
    <div className="wrapped-grow-x flex h-3 gap-1 overflow-hidden rounded-full" aria-hidden>
      {parts.map((p, i) => (
        <span key={i} className={`${p.cls} rounded-full`} style={{ flexGrow: p.n }} />
      ))}
    </div>
  )
}

/** The year's photos, dimmed and drifting behind the last card. */
function Montage({ photos }: { photos: WrappedPhoto[] }) {
  return (
    <div className="absolute inset-x-[-24px] inset-y-[-80px] overflow-hidden" aria-hidden>
      <div className="wrapped-drift grid h-full grid-cols-3 gap-1 opacity-35">
        {photos.map((p) => (
          <img key={p.id} src={p.url} alt="" className="h-full min-h-0 w-full object-cover" />
        ))}
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(70%_50%_at_50%_45%,rgba(28,70,50,0.92),rgba(28,70,50,0.55))]" />
    </div>
  )
}

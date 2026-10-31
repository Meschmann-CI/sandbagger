import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../data/store'
import type { BetType, Round } from '../types'
import { GAMES, countWord, listed, type GameInfo } from '../lib/games'
import { gameCard } from '../lib/gameCards'
import { shortDate } from '../lib/stats'
import { AvatarStack } from './ui'
import { GameCardSheet } from './GameCardSheet'

// "Pick the games": every money game the round's group size suits, the
// ones this group already plays at the top, and a spin for one nobody
// has played in a while. Picking returns the games, and each one is then
// set up (stake, who's in) in the bet editor in turn.

const NEW_GAMES: BetType[] = ['rabbit', 'snake', 'sixes', 'stableford', 'bbb', 'junk', 'hammer']

type Filter = 'all' | 'card' | 'taps'

const pickOne = <T,>(from: T[]): T => from[Math.floor(Math.random() * from.length)]

const groupOf = (n: number) =>
  n === 1 ? 'one golfer' : n === 2 ? 'a twosome' : n === 3 ? 'a threesome' : n === 4 ? 'a foursome' : `a group of ${countWord(n)}`

export function GamesMenu({
  round,
  onClose,
  onPick,
}: {
  round: Round
  onClose: () => void
  onPick: (types: BetType[]) => void
}) {
  const { data } = useStore()
  const [picked, setPicked] = useState<BetType[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [spun, setSpun] = useState<{ type: BetType; last?: string } | null>(null)
  const [reading, setReading] = useState<BetType | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !reading && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, reading])

  const golfers = round.players.length
  // When this group last played each game, off the bets on every round.
  const lastPlayed = useMemo(() => {
    const dates = new Map<BetType, string>()
    for (const bet of data.bets) {
      const date = data.rounds.find((r) => r.id === bet.roundId)?.date
      if (!date) continue
      const was = dates.get(bet.type)
      if (!was || date > was) dates.set(bet.type, date)
    }
    return dates
  }, [data.bets, data.rounds])

  const fits = GAMES.filter((g) => g.fits(golfers))
  const hidden = GAMES.filter((g) => !g.fits(golfers))
  const shown = fits.filter((g) => filter === 'all' || g.kind === filter)
  const usual = shown.filter((g) => g.type !== 'custom' && lastPlayed.has(g.type))
  const fresh = shown.filter((g) => g.type !== 'custom' && !lastPlayed.has(g.type))
  const other = shown.filter((g) => g.type === 'custom')

  const toggle = (type: BetType) => {
    setPicked((all) => (all.includes(type) ? all.filter((t) => t !== type) : [...all, type]))
    setSpun(null)
  }

  // The spin: a game that suits the group and isn't picked, never played
  // first, then whichever has gone longest.
  const surprise = () => {
    const pool = fits.filter((g) => g.type !== 'custom' && !picked.includes(g.type))
    if (!pool.length) return
    const never = pool.filter((g) => !lastPlayed.has(g.type))
    let choice: GameInfo
    if (never.length) choice = pickOne(never)
    else choice = [...pool].sort((a, b) => lastPlayed.get(a.type)!.localeCompare(lastPlayed.get(b.type)!))[0]
    setPicked((all) => [...all, choice.type])
    setSpun({ type: choice.type, last: lastPlayed.get(choice.type) })
    setFilter('all')
  }

  const name = (type: BetType) => GAMES.find((g) => g.type === type)!.label
  const names = picked.map(name)
  const spunLine = spun
    ? spun.last
      ? `Bandit picked ${name(spun.type)}. Last played ${shortDate(spun.last)}.`
      : `Bandit picked ${name(spun.type)}. Nobody has played it yet.`
    : 'Bandit picks a game the group hasn’t played in a while.'

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: `All for ${countWord(golfers)}` },
    { key: 'card', label: 'Card does the maths' },
    { key: 'taps', label: 'Needs taps' },
  ]

  const row = (g: GameInfo) => {
    const on = picked.includes(g.type)
    const card = gameCard(g.type)
    return (
      <div key={g.type} className="flex items-center gap-3 border-b border-line py-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cream">
          {card ? (
            <span className="h-9 w-9" aria-hidden="true" dangerouslySetInnerHTML={{ __html: card.icon }} />
          ) : (
            <span className="text-title font-extrabold text-forest" aria-hidden="true">
              {g.type === 'match' ? '1v1' : '?'}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-body font-bold text-ink">{g.label}</span>
            {NEW_GAMES.includes(g.type) && !lastPlayed.has(g.type) && (
              <span className="rounded-md bg-green-soft px-1.5 py-0.5 text-caption font-extrabold text-green-deep">New</span>
            )}
          </div>
          <p className="text-footnote leading-snug text-ink-dim">{g.blurb}</p>
          <p className="mt-0.5 text-caption text-ink-faint">
            {g.how}
            {card && (
              <>
                {' · '}
                <button type="button" onClick={() => setReading(g.type)} className="font-bold text-green-deep">
                  See how it works
                </button>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => toggle(g.type)}
          aria-pressed={on}
          aria-label={on ? `Take ${g.label} off` : `Add ${g.label}`}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
            on ? 'bg-green text-white' : 'border-[1.5px] border-line-strong bg-card text-ink'
          }`}
        >
          {on ? (
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 9.5l3.2 3L14 5.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 2.5v11M2.5 8h11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>
    )
  }

  const section = (title: string, games: GameInfo[]) =>
    games.length > 0 && (
      <div className="flex flex-col">
        <p className="pb-1 text-caption font-bold text-ink-faint">{title}</p>
        {games.map(row)}
      </div>
    )

  return createPortal(
    <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true" aria-label="Pick the games">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 animate-[fade_0.2s_ease-out]" />
      <div className="sheet-up absolute inset-x-0 bottom-0 mx-auto flex max-h-[94dvh] max-w-md flex-col rounded-t-3xl bg-paper shadow-[0_-12px_40px_rgba(0,0,0,0.2)]">
        <div className="flex-1 space-y-[18px] overflow-y-auto px-4 pt-2.5 pb-4">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-line-strong" />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h2 className="text-large font-extrabold text-ink">Pick the games</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink-dim">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M2 2l10 10M12 2L2 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <p className="text-body text-ink-dim">
              {round.courseName}, {shortDate(round.date)}
              {round.teeTime ? ` ${round.teeTime}` : ''}
            </p>
            <div className="flex items-center gap-2.5 pt-1">
              <AvatarStack players={round.players.map((rp) => data.players.find((p) => p.id === rp.playerId))} size={30} max={6} ring="var(--color-paper)" />
              <span className="text-footnote text-ink-dim">
                {listed(round.players.map((rp) => data.players.find((p) => p.id === rp.playerId)?.name.split(' ')[0] ?? '?'))}
              </span>
            </div>
          </div>

          {/* Cream, not forest: no new forest surfaces (Decisions, 2026-10-10). */}
          <div className="flex items-center gap-3.5 rounded-[18px] bg-cream p-4 text-ink">
            <svg width="52" height="52" viewBox="0 0 40 40" aria-hidden="true" className="shrink-0 text-forest">
              <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="7" y="9" width="20" height="20" rx="4" />
                <path d="M27 15l6 3v14l-14 2-2-5" />
                <circle cx="12.5" cy="14.5" r="1.4" fill="currentColor" />
                <circle cx="17" cy="19" r="1.4" fill="currentColor" />
                <circle cx="21.5" cy="23.5" r="1.4" fill="currentColor" />
              </g>
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-headline font-bold">Surprise us</p>
              <p className="text-footnote leading-snug text-ink-dim">{spunLine}</p>
            </div>
            <button type="button" onClick={surprise} className="h-11 shrink-0 rounded-full bg-forest px-[18px] text-body font-bold text-on-forest active:scale-95">
              Spin
            </button>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`h-9 rounded-full border-[1.5px] px-3.5 text-footnote font-bold ${
                  filter === f.key ? 'border-ink bg-ink text-white' : 'border-line-strong bg-card text-ink-dim'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {section('Your usual', usual)}
          {section(usual.length ? 'New to try' : 'The games', fresh)}
          {section('Or', other)}

          {hidden.length > 0 && (
            <p className="text-caption leading-snug text-ink-faint">
              {listed(hidden.map((g) => g.label))} {hidden.length === 1 ? 'doesn’t' : 'don’t'} suit {groupOf(golfers)}, so{' '}
              {hidden.length === 1 ? 'it’s' : 'they’re'} hidden.
            </p>
          )}
        </div>

        <div className="space-y-3 border-t border-line bg-card px-4 pt-3.5 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <p className="text-footnote text-ink-dim">
            <span className="font-bold text-ink">{names.length === 1 ? '1 game.' : `${names.length} games.`}</span>{' '}
            {names.length ? `${listed(names)} on this round.` : 'Nothing riding yet.'}
          </p>
          <button
            type="button"
            disabled={!picked.length}
            onClick={() => onPick(picked)}
            className="h-[52px] w-full rounded-full bg-green text-headline font-bold text-white disabled:opacity-40"
          >
            {picked.length > 1 ? `Set up the ${countWord(picked.length)} games` : picked.length ? `Set up ${names[0]}` : 'Pick a game'}
          </button>
        </div>
      </div>

      {reading && (
        <GameCardSheet
          type={reading}
          added={picked.includes(reading)}
          onAdd={() => {
            toggle(reading)
            setReading(null)
          }}
          onClose={() => setReading(null)}
        />
      )}
    </div>,
    document.body,
  )
}

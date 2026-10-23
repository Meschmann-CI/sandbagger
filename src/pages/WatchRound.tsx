import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useGoBack } from '../lib/nav'
import { BackButton } from '../components/Nav'
import { useStore } from '../data/store'
import { findRound } from '../lib/bookings'
import { courseForRound, hasPars, padded, scoreKind } from '../lib/courses'
import { cardOf } from '../lib/holes'
import { settleFromCard } from '../lib/bets'
import { betStatus } from '../lib/betText'
import { cardSlice, liveLines, moments, toParLabel, type Moment } from '../lib/spectate'
import { SCORE_MARK } from '../components/scoreMarks'
import { Avatar, Card, SectionLabel } from '../components/ui'

// Watching a round you're not in (Matt, 2026-10-23, option A): who leads
// by gross, the card cut to its last three holes, the money as it stands,
// the moments, and chirps from the couch. Everything here updates as the
// group's phones save; nothing on this page writes to the round. Same page
// as WatchRoundView.swift.

const CHIRPS = ['Holy... 🙌', '😬 Yikes', '😱 Wow']
const LIVE_YELLOW = '#F6C744'

export default function WatchRound() {
  const { id } = useParams()
  const goBack = useGoBack(`/rounds/${id}`)
  const { data, addChirp, setRoundMuted } = useStore()
  const round = findRound(data, id)
  const [chirpAt, setChirpAt] = useState<string | null>(null)
  const [custom, setCustom] = useState('')
  const [writing, setWriting] = useState(false)
  if (!round) return <p className="px-1 pt-10 text-body text-ink-dim">That round is gone.</p>

  const name = (pid: string) => data.players.find((p) => p.id === pid)?.name.split(' ')[0] ?? '?'
  const player = (pid: string) => data.players.find((p) => p.id === pid)
  const course = courseForRound(data, round)
  const pars = hasPars(course) ? padded(course.pars) : null
  const lines = liveLines(data, round)
  const slice = cardSlice(round)
  const me = data.players.find((p) => p.id === data.currentUserId)
  const muted = !!me?.mutedRounds?.includes(round.id)
  const imIn = round.players.some((p) => p.playerId === data.currentUserId)
  const bets = data.bets.filter((b) => b.roundId === round.id)
  const chirps = (data.chirps ?? []).filter((c) => c.roundId === round.id).slice().reverse()
  const lastHole = Math.max(0, ...lines.map((l) => l.thru))
  const feed = moments(data, round).slice(0, 8)

  const send = (text: string) => {
    if (!chirpAt) return
    addChirp(round.id, chirpAt, text)
    setCustom('')
    setWriting(false)
  }

  return (
    <div className="rise">
      <header className="-mx-4 -mt-3 bg-[#141816] px-5 pb-4 pt-4 text-white">
        <BackButton fallback={`/rounds/${round.id}`} onBack={goBack} />
        <p className="mt-2 flex items-center gap-1.5 text-footnote font-bold" style={{ color: LIVE_YELLOW }}>
          <span className="relative flex h-[7px] w-[7px]">
            <span className="live-ping absolute inset-0 rounded-full" style={{ backgroundColor: LIVE_YELLOW }} />
            <span className="relative h-[7px] w-[7px] rounded-full" style={{ backgroundColor: LIVE_YELLOW }} />
          </span>
          {lastHole >= 18 ? 'Finished' : lastHole ? `Live · thru ${lastHole}` : 'On the first tee'}
        </p>
        <h1 className="mt-1 text-title font-bold tracking-tight">{round.courseName}</h1>
        <p className="text-footnote text-white/70">{round.players.map((p) => name(p.playerId)).join(', ')}</p>
      </header>

      <SectionLabel action={<Link to={`/rounds/${round.id}`} className="text-footnote font-bold text-green">Whole card</Link>}>
        The last three holes
      </SectionLabel>
      <Card className="overflow-hidden">
        <table className="w-full border-collapse text-footnote tabular-nums">
          <thead>
            <tr className="bg-forest text-on-forest">
              <th className="py-1.5 pl-3 text-left text-caption font-bold">Hole</th>
              {slice.map((h) => (
                <th key={h} className="py-1.5 text-center text-caption font-bold">{h + 1}</th>
              ))}
              <th className="py-1.5 pr-3 text-right text-caption font-bold">Score</th>
            </tr>
          </thead>
          <tbody>
            {pars && slice.length > 0 && (
              <tr className="text-caption text-ink-faint">
                <td className="py-1 pl-3">Par</td>
                {slice.map((h) => (
                  <td key={h} className="py-1 text-center">{pars[h] ?? ''}</td>
                ))}
                <td />
              </tr>
            )}
            {lines.map((l) => {
              const rp = round.players.find((p) => p.playerId === l.playerId)!
              const card = cardOf(rp)
              const p = player(l.playerId)
              return (
                <tr key={l.playerId} className="border-t border-line">
                  <td className="py-2 pl-3">
                    <span className="flex items-center gap-2">
                      {p && <Avatar player={p} size={22} />}
                      <span className="truncate font-bold text-ink">{name(l.playerId)}</span>
                    </span>
                  </td>
                  {slice.map((h) => {
                    const v = card[h]
                    const par = pars?.[h]
                    const style = v != null && par != null ? SCORE_MARK[scoreKind(v, par)] : 'font-bold text-ink'
                    return (
                      <td key={h} className="py-2 text-center">
                        {v == null ? <span className="text-ink-faint">–</span> : <span className={`inline-flex h-6 w-6 items-center justify-center ${style}`}>{v}</span>}
                      </td>
                    )
                  })}
                  <td className="py-2 pr-3 text-right">
                    <span className="block text-headline font-extrabold leading-tight text-ink">{l.thru ? toParLabel(l) : '–'}</span>
                    <span className="text-caption text-ink-faint">{l.thru ? (l.thru === 18 ? 'F' : `thru ${l.thru}`) : 'not started'}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {bets.length > 0 && (
        <>
          <SectionLabel>The money</SectionLabel>
          <div className="flex flex-wrap gap-2 px-1">
            {bets.map((bet) => {
              const live = settleFromCard(bet, round, course)
              const status = live ? betStatus(live.detail, (pid) => data.players.find((p) => p.id === pid)?.name) : null
              return (
                <span key={bet.id} className="rounded-full bg-card px-3 py-1.5 text-footnote font-semibold text-ink ring-1 ring-line">
                  {bet.name}
                  {status && <span className="font-normal text-ink-dim">: {status}</span>}
                </span>
              )
            })}
          </div>
        </>
      )}

      {feed.length > 0 && (
        <>
          <SectionLabel>What's happening</SectionLabel>
          <Card className="divide-y divide-line overflow-hidden">
            {feed.map((m, i) => (
              <MomentRow key={i} m={m} name={name(m.playerId)} />
            ))}
          </Card>
        </>
      )}

      {!imIn && (
        <>
          <SectionLabel>Chirp at them</SectionLabel>
          <div className="flex gap-2 px-1">
            {round.players.map((rp) => {
              const p = player(rp.playerId)
              const on = chirpAt === rp.playerId
              return (
                <button
                  key={rp.playerId}
                  type="button"
                  onClick={() => setChirpAt(on ? null : rp.playerId)}
                  aria-pressed={on}
                  className={`flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-footnote font-bold transition ${on ? 'bg-ink text-white' : 'bg-card text-ink-dim ring-1 ring-line-strong'}`}
                >
                  {p && <Avatar player={p} size={22} />}
                  {name(rp.playerId)}
                  {p?.chirpsOff && <span className="font-normal opacity-70">(muted)</span>}
                </button>
              )
            })}
          </div>
          {writing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                send(custom)
              }}
              className="mt-2.5 flex gap-2 px-1"
            >
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                maxLength={140}
                autoFocus
                placeholder={chirpAt ? `Something for ${name(chirpAt)}` : 'Pick who first'}
                className="min-w-0 flex-1 rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-body text-ink focus:border-green focus:outline-none"
              />
              <button type="submit" disabled={!chirpAt || !custom.trim()} className="rounded-xl bg-green px-4 text-footnote font-bold text-white disabled:opacity-40">
                Send
              </button>
            </form>
          ) : (
            <div className="mt-2.5 grid grid-cols-4 gap-2 px-1">
              {CHIRPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={!chirpAt}
                  onClick={() => send(c)}
                  className="rounded-xl bg-card py-2.5 text-footnote font-bold text-ink ring-1 ring-line-strong transition active:scale-95 disabled:opacity-40"
                >
                  {c}
                </button>
              ))}
              <button
                type="button"
                disabled={!chirpAt}
                onClick={() => setWriting(true)}
                className="rounded-xl bg-card py-2.5 text-footnote font-bold text-ink ring-1 ring-line-strong transition active:scale-95 disabled:opacity-40"
              >
                Custom
              </button>
            </div>
          )}
          {!chirpAt && <p className="mt-1.5 px-1 text-caption text-ink-faint">Pick who it's for, then the chirp.</p>}
        </>
      )}

      {chirps.length > 0 && (
        <Card className="mt-3 divide-y divide-line overflow-hidden">
          {chirps.slice(0, 12).map((c) => (
            <div key={c.id} className="flex items-start gap-2.5 px-4 py-2.5 text-footnote">
              {player(c.fromId) && <Avatar player={player(c.fromId)!} size={22} />}
              <p className="min-w-0 flex-1 text-ink">
                <span className="font-bold">{c.fromId === data.currentUserId ? 'You' : name(c.fromId)}</span>
                <span className="text-ink-dim"> to {name(c.toId)}: </span>
                {c.text}
              </p>
              <span className="shrink-0 text-caption text-ink-faint">{ago(c.at)}</span>
            </div>
          ))}
        </Card>
      )}

      {!imIn && me && (
        <Card className="mt-6 flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-body font-bold text-ink">Pushes from this round</p>
            <p className="text-caption text-ink-faint">At the turn and when the lead changes.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!muted}
            aria-label="Pushes from this round"
            onClick={() => setRoundMuted(round.id, !muted)}
            className={`h-7 w-12 shrink-0 rounded-full p-1 transition ${!muted ? 'bg-green' : 'bg-line-strong'}`}
          >
            <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${!muted ? 'translate-x-5' : ''}`} />
          </button>
        </Card>
      )}
      <div className="h-6" />
    </div>
  )
}

function MomentRow({ m, name }: { m: Moment; name: string }) {
  const tag =
    m.kind === 'eagle'
      ? { t: 'Eagle', c: 'bg-green-soft text-green' }
      : m.kind === 'birdie'
        ? { t: 'Birdie', c: 'bg-green-soft text-green' }
        : m.kind === 'lead'
          ? { t: 'Lead', c: 'bg-gold-soft text-gold' }
          : { t: String(m.score), c: 'bg-ink/[0.06] text-ink' }
  const text =
    m.kind === 'lead'
      ? `${name} takes the lead on ${m.hole + 1}`
      : m.kind === 'blowup'
        ? `${name} on ${m.hole + 1}${m.score === 8 ? '. Snowman.' : '.'}`
        : `${name} on ${m.hole + 1}`
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 text-footnote text-ink">
      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-caption font-extrabold ${tag.c}`}>{tag.t}</span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
    </div>
  )
}

/** "now", "4m", "1h". */
function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  return mins < 1 ? 'now' : mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`
}

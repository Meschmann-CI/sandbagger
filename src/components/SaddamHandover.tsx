import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useNavigate } from '../lib/nav'
import { useStore } from '../data/store'
import { roundStandings, saddamHistory } from '../lib/stats'
import { fmt1, round1 } from '../types'
import { todayISO } from '../lib/dates'
import { Confetti, buzz, reducedMotion } from './Delight'
import { SaddamIcon } from './ui'

// The moment the trophy moves. Everyone gets it once, full screen, the
// first time they open the app after the Saddam changes hands: it drops
// in, gold confetti, and a button straight to the trash talk.
//
// "Seen" is remembered per phone against the change itself, so a new
// winner shows again and a reload doesn't. The very first time the app
// runs on a phone it just notes the current holder, rather than
// celebrating a handover from months ago. Never on the scoring screen:
// nobody wants a takeover between putts.

const seenKey = (groupId: string) => `sandbagger-saddam-seen:${groupId}`
const DAY = 86_400_000
const fromISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}
const daysBetween = (a: string, b: string) => Math.max(0, Math.round((fromISO(b) - fromISO(a)) / DAY))
/** Handovers older than this pass quietly: news, not a party. */
const FRESH_DAYS = 45

export default function SaddamHandover() {
  const { data } = useStore()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [fire, setFire] = useState(0)
  const [copied, setCopied] = useState(false)

  const history = saddamHistory(data)
  const latest = history[history.length - 1]
  const previous = history[history.length - 2]
  const key = latest ? `${latest.playerId}:${latest.roundId ?? latest.date}` : null
  const onCard = /^\/rounds\/[^/]+\/card/.test(pathname)

  useEffect(() => {
    if (!key || onCard || open) return
    let seen: string | null = null
    try {
      seen = localStorage.getItem(seenKey(data.group.id))
    } catch {
      return
    }
    if (seen == null) {
      try {
        localStorage.setItem(seenKey(data.group.id), key)
      } catch {
        /* nothing to remember with */
      }
      return
    }
    if (seen === key || daysBetween(latest!.date, todayISO()) > FRESH_DAYS) return
    setOpen(true)
    setFire((n) => n + 1)
    buzz([30, 60, 90])
  }, [key, onCard, open, data.group.id, latest])

  if (!open || !latest) return null

  const close = () => {
    try {
      localStorage.setItem(seenKey(data.group.id), key!)
    } catch {
      /* it'll show once more, which is fine */
    }
    setOpen(false)
  }

  const me = data.currentUserId
  const name = (id: string) => data.players.find((p) => p.id === id)?.name ?? 'Someone'
  const mine = latest.playerId === me
  const round = latest.roundId ? data.rounds.find((r) => r.id === latest.roundId) : undefined
  const standings = round ? roundStandings(round) : []
  const margin = standings.length > 1 ? round1(standings[1].netScore - standings[0].netScore) : null
  const heldFor = previous ? daysBetween(previous.date, latest.date) : null

  const how = latest.byHand
    ? `Handed over${latest.note ? `: ${latest.note}` : ' by the group'}.`
    : `Won at ${latest.courseName}${margin ? ` by ${fmt1(margin)}` : ''}.`
  const before = previous
    ? previous.playerId === me
      ? ` You had it for ${heldFor} day${heldFor === 1 ? '' : 's'}.`
      : ` ${name(previous.playerId)} had it for ${heldFor} day${heldFor === 1 ? '' : 's'}.`
    : ''

  const trash = mine
    ? `The Saddam is mine. ${how.replace(/\.$/, '')}. Come and get it.`
    : `${name(latest.playerId)} has the Saddam. Enjoy it while it lasts.`

  const talk = async () => {
    const text = `${trash} (Sandbagger)`
    try {
      if (navigator.share) {
        await navigator.share({ text })
        return
      }
    } catch {
      // Cancelled the share sheet: fall through to copying.
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      /* nothing more to try */
    }
  }

  const motion = !reducedMotion()

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="The Saddam changes hands"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-forest px-8 text-center text-on-forest"
      style={{ animation: 'fade 0.35s ease-out both' }}
    >
      <Confetti fire={fire} originY={0.3} />
      <div className={`rounded-[36px] bg-cream p-2 shadow-[0_0_0_8px_rgba(239,227,200,0.14),0_22px_50px_rgba(0,0,0,0.35)] ${motion ? 'trophy-drop' : ''}`}>
        <SaddamIcon size={128} />
      </div>
      <p className={`mt-7 text-body font-semibold text-on-forest/75 ${motion ? 'lift-in' : ''}`} style={{ animationDelay: '0.55s' }}>
        The Saddam changes hands
      </p>
      <h1 className={`mt-1 text-hero font-extrabold leading-none ${motion ? 'lift-in' : ''}`} style={{ animationDelay: '0.65s' }}>
        {mine ? 'It’s yours.' : name(latest.playerId)}
      </h1>
      <p className={`mt-3 max-w-[280px] text-body text-on-forest/80 ${motion ? 'lift-in' : ''}`} style={{ animationDelay: '0.75s' }}>
        {how}
        {before}
      </p>
      <div className={`mt-8 flex w-full max-w-[300px] flex-col gap-2.5 ${motion ? 'lift-in' : ''}`} style={{ animationDelay: '0.9s' }}>
        <button onClick={() => void talk()} className="press rounded-2xl bg-cream py-3.5 text-body font-extrabold text-forest">
          {copied ? 'Copied. Go paste it in the chat.' : mine ? 'Let them know' : 'Talk your trash'}
        </button>
        {round && (
          <button
            onClick={() => {
              close()
              navigate(`/rounds/${round.id}`)
            }}
            className="rounded-2xl border border-on-forest/25 py-3 text-body font-bold text-on-forest"
          >
            See the round
          </button>
        )}
        <button onClick={close} className="py-2 text-footnote font-bold text-on-forest/65">
          Close
        </button>
      </div>
    </div>,
    document.body,
  )
}

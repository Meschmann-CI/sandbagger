import { useEffect, useState } from 'react'
import { useNavigate } from '../lib/nav'
import { useLogSheet } from '../components/logSheet'
import { useMembers, useStore } from '../data/store'
import { HANDICAP_NUDGE_AFTER, holeStats, playerStats, roundsAtCurrentHandicap, saddamDays, shortDate } from '../lib/stats'
import { badgesFor, indexHistory, shelfOrder } from '../lib/badges'
import { Medal } from '../components/Medal'
import { TrophySheet } from '../components/TrophySheet'
import { setSoundOn, soundOn } from '../lib/sound'
import { todayISO } from '../lib/dates'
import CourseScene from '../components/CourseScene'
import RoundScene from '../components/RoundScene'
import { disablePush, enablePush, pushEnabled, pushSupported } from '../lib/push'
import { canSeeTrip, fmt1, isSoloRound, round1 } from '../types'
import { supabase } from '../lib/supabase'
import EditGolfer from '../components/EditGolfer'
import { Avatar, AvatarStack, Card, Meta, PrimaryButton, RowButton, SaddamBadge, SaddamIcon, SectionLabel } from '../components/ui'
import { useConfirm } from '../components/Confirm'
import { CountUp } from '../components/Delight'
import { Icon, IconTile } from '../components/icons'

// You. Your index, your numbers, your phone's settings. The group roster
// used to live at the bottom of this screen and the Courses and
// head-to-head links in the middle of it; they have their own places
// now, so this is only the personal stuff.

// Dismissing the nudge is remembered against the index it was about, so
// saying "still right" quiets it until the number actually changes.
const nudgeKey = (playerId: string, handicap: number) => `sandbagger-hcp-ok:${playerId}:${handicap.toFixed(1)}`

export default function Profile() {
  const { data, cloud, syncError, updatePlayer, resetToSample } = useStore()
  const confirm = useConfirm()
  const members = useMembers()
  const navigate = useNavigate()
  const { open: openLog } = useLogSheet()
  const me = data.players.find((p) => p.id === data.currentUserId)!
  const myTrips = data.trips.filter((t) => canSeeTrip(t, me.id)).length
  const stats = playerStats(data, me.id)
  const game = holeStats(data, me.id)
  const [editingMe, setEditingMe] = useState(false)
  const [trophy, setTrophy] = useState<string | null>(null)
  const [editingHcp, setEditingHcp] = useState(false)
  const [hcpDraft, setHcpDraft] = useState('')
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try {
      return !!localStorage.getItem(nudgeKey(data.currentUserId, me.handicap))
    } catch {
      return false
    }
  })

  const today = todayISO()
  const myReigns = saddamDays(data, today).get(me.id)
  const badges = badgesFor(data, me.id, today)
  const earnedCount = badges.filter((b) => b.earned).length
  const shameCount = badges.filter((b) => b.earned && b.kind === 'shame').length
  const yearRounds = data.rounds.filter((r) => r.date.startsWith(today.slice(0, 4)) && r.players.some((p) => p.playerId === me.id && p.gross != null)).length
  // The index at each round posted, for the line on the card, and how far
  // it has moved since the first round this season.
  const history = indexHistory(data, me.id, me.handicap)
  const indexPoints = history.slice(-8).map((p) => p.index)
  const seasonStart = history.find((p) => p.date.startsWith(today.slice(0, 4)))
  const indexMove = seasonStart ? round1(me.handicap - seasonStart.index) : null

  const roundsAtIndex = roundsAtCurrentHandicap(data, me.id)
  const showHandicapNudge = !nudgeDismissed && !editingHcp && roundsAtIndex >= HANDICAP_NUDGE_AFTER

  const dismissHandicapNudge = () => {
    try {
      localStorage.setItem(nudgeKey(me.id, me.handicap), '1')
    } catch {
      // private mode; the nudge just comes back next visit
    }
    setNudgeDismissed(true)
  }

  // The steppers move the draft, not the record — the old version fired a
  // network write on every tenth-of-a-stroke tap.
  const nudgeDraft = (delta: number) =>
    setHcpDraft((current) => round1(Math.min(54, Math.max(0, (Number(current) || 0) + delta))).toFixed(1))

  const saveHandicap = () => {
    const value = Number(hcpDraft)
    if (!Number.isFinite(value)) return
    updatePlayer({ ...me, handicap: round1(Math.min(54, Math.max(0, value))) })
    setEditingHcp(false)
  }

  return (
    <div className="rise">
      {/* The player card: who you are, your index as the hero with its
          trend beside it, and four numbers. Your home course's scene
          across the top, so everyone's card looks a little different
          without anyone picking a theme. */}
      <div className="relative mt-4 overflow-hidden rounded-3xl bg-forest text-on-forest shadow-[0_10px_30px_rgba(28,70,50,0.25)]">
        <div className="relative h-24">
          <CourseScene course={me.homeCourse || me.name} light="morning" className="h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent from-30% to-forest" />
          {!editingMe && (
            <button
              onClick={() => setEditingMe(true)}
              className="absolute right-3 top-3 rounded-full bg-black/25 px-3 py-1 text-footnote font-bold text-white backdrop-blur-sm active:bg-black/35"
            >
              Edit
            </button>
          )}
        </div>
        <div className="relative -mt-10 px-5 pb-5">
          <div className="flex items-end gap-3">
            <span className="relative rounded-full shadow-[0_0_0_3px_var(--color-forest),0_0_0_5px_var(--color-cream-deep)]">
              <Avatar player={me} size={64} />
              {stats.saddamHeld && (
                <span className="absolute -bottom-1 -right-1">
                  <SaddamBadge size={18} />
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1 pb-0.5">
              <h1 className="truncate text-title font-bold leading-tight">{me.name}</h1>
              <Meta
                className="text-footnote text-on-forest/70"
                parts={[me.homeCourse || 'No home course set', me.venmo && `Venmo @${me.venmo}`]}
              />
            </div>
          </div>

          <div className="mt-4 flex items-end justify-between gap-4">
            <button
              type="button"
              onClick={() => {
                setHcpDraft(me.handicap.toFixed(1))
                setEditingHcp(true)
              }}
              className="text-left"
              aria-label={`Handicap index ${fmt1(me.handicap)}. Update it`}
            >
              <span className="block text-caption font-semibold uppercase tracking-[0.16em] text-on-forest/70">Handicap index</span>
              <CountUp id="you-index" value={me.handicap} format={(n) => n.toFixed(1)} className="block text-hero font-extrabold leading-[0.95]" />
              {indexMove != null && indexMove !== 0 ? (
                <span className={`block text-footnote font-bold ${indexMove < 0 ? 'text-[#bfe2c9]' : 'text-on-forest/70'}`}>
                  {indexMove < 0 ? '↓' : '↑'} {fmt1(Math.abs(indexMove))} this season
                </span>
              ) : (
                <span className="block text-footnote font-bold text-on-forest/70">Tap to update</span>
              )}
            </button>
            {indexPoints.length >= 3 && <IndexLine points={indexPoints} />}
          </div>

          <div className="mt-4 grid grid-cols-4 border-t border-on-forest/15 pt-3.5">
            {[
              { value: String(stats.rounds), label: 'Rounds' },
              { value: stats.bestGross != null ? String(stats.bestGross) : '—', label: 'Best' },
              { value: String(myReigns?.days ?? 0), label: 'Saddam days' },
              { value: `${stats.money > 0 ? '+' : stats.money < 0 ? '−' : ''}$${Math.abs(Math.round(stats.money))}`, label: 'All-time', tone: stats.money > 0 ? 'text-[#bfe2c9]' : '' },
            ].map((x) => (
              <div key={x.label} className="min-w-0">
                <p className={`text-headline font-extrabold tabular-nums ${x.tone ?? ''}`}>{x.value}</p>
                <p className="whitespace-nowrap text-caption font-semibold text-on-forest/65">{x.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editingMe && (
        <Card className="mt-3">
          <EditGolfer player={me} cloud={cloud} onDone={() => setEditingMe(false)} />
        </Card>
      )}

      {/* Updating the index. Typed, not stepped: getting from 18.0 to
          12.4 at a tenth per tap is fifty-six taps. The −/+ are for fine
          tuning, and they move a local draft rather than writing on every
          press. */}
      {editingHcp && (
        <Card className="mt-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-footnote font-semibold uppercase tracking-wider text-ink-faint">Handicap index</p>
              <input
                value={hcpDraft}
                onChange={(e) => setHcpDraft(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                autoFocus
                aria-label="Handicap index"
                className="mt-1 w-28 rounded-xl border border-line-strong bg-card px-3 py-2 text-large font-extrabold text-ink tabular-nums focus:border-green focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => nudgeDraft(-0.1)}
                aria-label="Lower handicap by a tenth"
                className="h-11 w-11 rounded-xl bg-ink/[0.06] text-headline font-bold text-ink active:scale-95"
              >
                −
              </button>
              <button
                onClick={() => nudgeDraft(0.1)}
                aria-label="Raise handicap by a tenth"
                className="h-11 w-11 rounded-xl bg-ink/[0.06] text-headline font-bold text-ink active:scale-95"
              >
                +
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-3.5 pt-3.5 border-t border-line">
            <PrimaryButton onClick={saveHandicap} disabled={!hcpDraft.trim()} className="flex-1 !py-2.5">
              Save index
            </PrimaryButton>
            <button onClick={() => setEditingHcp(false)} className="px-4 text-footnote font-bold text-ink-faint">
              Cancel
            </button>
          </div>
        </Card>
      )}

      {/* GHIN stays the source of truth — this only points out that the
          number here hasn't moved in a while. */}
      {showHandicapNudge && (
        <Card className="mt-3 p-4 border-gold/40 bg-gold-soft/50 flex items-start gap-3">
          <IconTile name="trend" tone="gold" size={34} />
          <div className="flex-1 min-w-0">
            <p className="text-footnote font-bold text-ink">
              You've played {roundsAtIndex} rounds at {fmt1(me.handicap)}
            </p>
            <p className="text-footnote text-ink-dim mt-1">
              If GHIN has moved your index since then, update it here so net scores and bets stay honest.
            </p>
            <div className="flex gap-4 mt-2.5">
              <button
                onClick={() => {
                  setHcpDraft(me.handicap.toFixed(1))
                  setEditingHcp(true)
                }}
                className="text-footnote font-bold text-green"
              >
                Update it
              </button>
              <button onClick={dismissHandicapNudge} className="text-footnote font-bold text-ink-faint">
                Still right
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* The trophy shelf: what you've earned (the good, the odd, the
          shameful), then the next ones to chase. The whole case is a tap away. */}
      <SectionLabel
        action={
          <button onClick={() => navigate('/trophies')} className="text-footnote font-bold text-green">
            See all {badges.length}
          </button>
        }
      >
        Trophy case
      </SectionLabel>
      {/* No hover on a phone: each medal opens a sheet with what it takes. */}
      <div className="grid grid-cols-4 gap-x-2 gap-y-4 px-1">
        {shelfOrder(badges).slice(0, 8).map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setTrophy(b.key)}
            aria-label={`${b.label}${b.earned ? ', earned' : ', not earned yet'}`}
            className="flex flex-col items-center gap-1.5 text-center transition active:scale-95"
          >
            <Medal badge={b} />
            <span className={`text-caption font-bold leading-tight ${b.earned ? 'text-ink' : 'text-ink-faint'}`}>{b.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 px-1 text-footnote text-ink-dim">
        {earnedCount} of {badges.length} earned
        {shameCount > 0 && ` · ${shameCount} you'd rather not talk about`}
      </p>
      {trophy && badges.find((b) => b.key === trophy) && (
        <TrophySheet
          badge={badges.find((b) => b.key === trophy)!}
          onClose={() => setTrophy(null)}
          onRound={(id) => {
            setTrophy(null)
            navigate(`/rounds/${id}`)
          }}
        />
      )}

      {/* The year in review, once there's a year worth reviewing */}
      {yearRounds >= 3 && (
        <button
          type="button"
          onClick={() => navigate(`/wrapped/${today.slice(0, 4)}`, { transition: 'fade' })}
          className="press mt-6 flex w-full items-center gap-3.5 overflow-hidden rounded-2xl bg-[linear-gradient(120deg,#1c4632,#2f6fa3)] p-4 text-left text-on-forest shadow-[0_8px_22px_rgba(28,70,50,0.22)]"
        >
          <span className="shrink-0 rounded-xl bg-cream p-1">
            <SaddamIcon size={36} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-body font-bold">Your {today.slice(0, 4)}, wrapped</span>
            <span className="block text-footnote text-on-forest/75">{yearRounds} rounds, your best, your rival, the money</span>
          </span>
          <Icon name="chevronRight" size={18} className="shrink-0 text-on-forest/70" />
        </button>
      )}

      {/* What the hole-by-hole cards and course pars add up to. Only
          holes with both a score and a known par count, so the rates
          can't be gamed by an uncarded 88. */}
      {game.holes > 0 ? (
        <>
          <SectionLabel>Your game · {game.holes} holes</SectionLabel>
          <Card className="p-4">
            <div className="grid grid-cols-3 divide-x divide-line mb-4">
              {([3, 4, 5] as const).map((par) => (
                <div key={par} className="text-center">
                  <p className="text-title font-extrabold text-ink tabular-nums">
                    {game.avgByPar[par] != null ? game.avgByPar[par]!.toFixed(2) : '—'}
                  </p>
                  <p className="text-caption font-semibold uppercase tracking-wider text-ink-faint mt-0.5">on par {par}s</p>
                </div>
              ))}
            </div>
            {(() => {
              const buckets = [
                { label: 'Birdie+', count: game.counts.albatross + game.counts.eagle + game.counts.birdie, cls: 'bg-green' },
                { label: 'Par', count: game.counts.par, cls: 'bg-green/40' },
                { label: 'Bogey', count: game.counts.bogey, cls: 'bg-line-strong' },
                { label: 'Double+', count: game.counts.double + game.counts.worse, cls: 'bg-ink-faint/45' },
              ]
              return (
                <>
                  <div className="flex h-3 overflow-hidden rounded-full">
                    {buckets.map(
                      (b) =>
                        b.count > 0 && (
                          <div key={b.label} className={b.cls} style={{ width: `${(100 * b.count) / game.holes}%` }} />
                        ),
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
                    {buckets.map((b) => (
                      <span key={b.label} className="inline-flex items-center gap-1.5 text-caption text-ink-dim">
                        <span className={`h-2.5 w-2.5 rounded-full ${b.cls}`} />
                        <span className="font-bold">{b.label}</span>
                        <span className="tabular-nums text-ink-faint">
                          {b.count} · {Math.round((100 * b.count) / game.holes)}%
                        </span>
                      </span>
                    ))}
                  </div>
                </>
              )
            })()}
          </Card>
        </>
      ) : (
        <Card className="mt-3 p-4">
          <p className="text-footnote text-ink-dim">
            <span className="font-bold text-ink">Want the real breakdown?</span> Score rounds hole by hole and fill in
            course pars, and this turns into your par-3/4/5 averages and birdie-to-blowup rates.
          </p>
        </Card>
      )}

      {/* My recent rounds */}
      <SectionLabel
        action={
          <button onClick={() => openLog()} className="text-footnote font-bold text-green">
            + Log a round
          </button>
        }
      >
        Your last {stats.last5.length === 1 ? 'round' : `${stats.last5.length} rounds`}
      </SectionLabel>
      {stats.last5.length === 0 ? (
        <Card className="p-5 text-center text-footnote text-ink-dim">Nothing logged yet. Get out there.</Card>
      ) : (
        <Card className="divide-y divide-line">
          {stats.last5.map(({ round, gross }) => (
            <RowButton key={round.id} onClick={() => navigate(`/rounds/${round.id}`, { shared: round.id })} className="flex items-center gap-3 px-3.5 py-2.5">
              <span data-shared={round.id} className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                <RoundScene round={round} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-body font-bold text-ink truncate">{round.courseName}</p>
                <p className="text-caption text-ink-faint tabular-nums">
                  {shortDate(round.date)}
                  {isSoloRound(round) && ' · solo'}
                </p>
              </div>
              {gross == null ? (
                <span className="text-footnote font-bold text-flag shrink-0">Add score</span>
              ) : (
                <p className="text-headline font-extrabold text-ink tabular-nums">{gross}</p>
              )}
            </RowButton>
          ))}
        </Card>
      )}

      <SectionLabel>This phone</SectionLabel>
      {/* Notifications: only meaningful in cloud mode, and on an iPhone
          only once the app is on the home screen. */}
      {cloud ? (
        <PushToggle playerId={me.id} />
      ) : (
        <Card className="p-4 text-footnote text-ink-dim">Notifications switch on once the app is online.</Card>
      )}
      <SoundToggle />

      {/* Trips have no tab; this and the row on Home are the way in. */}
      <SectionLabel>Trips</SectionLabel>
      <Card onClick={() => navigate('/trips')} className="p-4 flex items-center gap-3.5">
        <IconTile name="suitcase" tone="sand" size={38} />
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold text-ink">Your trips</p>
          <p className="text-footnote text-ink-dim mt-0.5">
            {myTrips === 0 ? 'None yet. Plan the first one.' : `${myTrips} trip${myTrips === 1 ? '' : 's'} · plans, costs, the archive`}
          </p>
        </div>
        <Icon name="chevronRight" size={18} className="text-ink-faint" />
      </Card>

      <SectionLabel>The group</SectionLabel>
      <Card onClick={() => navigate('/group')} className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body font-bold text-ink">{data.group.name}</p>
          <p className="text-footnote text-ink-dim mt-0.5">
            {members.length} golfer{members.length === 1 ? '' : 's'} · roster, emails, invite code
          </p>
        </div>
        <AvatarStack players={members} />
      </Card>

      {cloud && (
        <>
          <SectionLabel>Account</SectionLabel>
          <Card className="p-4 flex items-center justify-between gap-3">
            <p className="text-footnote text-ink-dim">
              Everything syncs across everyone's phones.
              {syncError && <span className="block text-flag font-semibold mt-0.5">Last sync failed: {syncError}</span>}
            </p>
            <button
              onClick={async () => {
                await supabase?.auth.signOut()
                window.location.reload()
              }}
              className="text-footnote font-bold text-flag shrink-0"
            >
              Sign out
            </button>
          </Card>
        </>
      )}

      {!cloud && (
        <div className="mt-8 mb-4 text-center">
          <button
            onClick={async () => {
              const ok = await confirm({
                title: 'Reset back to the sample data?',
                body: 'Every round, trip, and bet stored in this browser is replaced with the demo set.',
                confirmLabel: 'Reset everything',
                danger: true,
              })
              if (ok) resetToSample()
            }}
            className="text-footnote font-bold text-ink-faint"
          >
            Reset to sample data
          </button>
        </div>
      )}
      <div className="h-6" />
    </div>
  )
}

// The push toggle. iOS only allows the permission prompt from a tap, and
// only for apps on the home screen — so this is a button, not a switch
// flipped on by default, and it explains itself when it can't work yet.
function PushToggle({ playerId }: { playerId: string }) {
  const [state, setState] = useState<'checking' | 'unsupported' | 'off' | 'on' | 'denied'>('checking')

  useEffect(() => {
    if (!pushSupported()) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }
    void pushEnabled().then((on) => setState(on ? 'on' : 'off'))
  }, [])

  const turnOn = async () => {
    setState('checking')
    const result = await enablePush(playerId)
    setState(result === 'on' ? 'on' : result === 'denied' ? 'denied' : 'off')
  }

  const turnOff = async () => {
    setState('checking')
    await disablePush()
    setState('off')
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-footnote font-bold text-ink">Notifications</p>
          <p className="text-footnote text-ink-dim mt-0.5">
            {state === 'on'
              ? 'On for this phone — rounds, results, and money.'
              : state === 'denied'
                ? 'Blocked in iOS Settings. Allow notifications for Sandbagger there, then come back.'
                : state === 'unsupported'
                  ? 'Add the app to your home screen first — iPhones only allow notifications for installed apps.'
                  : 'Hear about posted rounds, settled bets, and money coming your way.'}
          </p>
        </div>
        {(state === 'off' || state === 'on') && (
          <button
            onClick={() => void (state === 'on' ? turnOff() : turnOn())}
            className={`shrink-0 rounded-xl px-4 py-2 text-footnote font-bold transition active:scale-95 ${
              state === 'on' ? 'bg-ink/[0.06] text-ink-dim' : 'bg-green text-white'
            }`}
          >
            {state === 'on' ? 'Turn off' : 'Turn on'}
          </button>
        )}
      </div>
    </Card>
  )
}

/** The handicap index over the last few rounds, drawn so a falling index (getting better) climbs. */
function IndexLine({ points }: { points: number[] }) {
  const W = 112
  const H = 46
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const span = hi - lo || 1
  const xy = points.map((v, i) => [4 + (i * (W - 8)) / (points.length - 1), 5 + ((v - lo) / span) * (H - 10)] as const)
  const last = xy[xy.length - 1]
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" aria-label={`Index over the last ${points.length} rounds: ${points.join(', ')}`}>
      <polyline
        points={xy.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none"
        stroke="var(--color-cream)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <circle cx={last[0]} cy={last[1]} r="3.4" fill="var(--color-cream)" />
    </svg>
  )
}

/** Sound on or off for this phone: the music in Wrapped and the little cues. */
function SoundToggle() {
  const [on, setOn] = useState(soundOn)
  return (
    <Card className="mt-3 flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-body font-bold text-ink">Sounds</p>
        <p className="text-footnote text-ink-dim">Music in Season Wrapped, and a chime for a new best or a trophy.</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Sounds"
        onClick={() => {
          setSoundOn(!on)
          setOn(!on)
        }}
        className={`h-7 w-12 shrink-0 rounded-full p-1 transition ${on ? 'bg-green' : 'bg-line-strong'}`}
      >
        <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
      </button>
    </Card>
  )
}

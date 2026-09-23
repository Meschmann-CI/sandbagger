import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMembers, useStore } from '../data/store'
import { HANDICAP_NUDGE_AFTER, holeStats, playerStats, roundsAtCurrentHandicap, shortDate } from '../lib/stats'
import { disablePush, enablePush, pushEnabled, pushSupported } from '../lib/push'
import { fmt1, isSoloRound, round1 } from '../types'
import { supabase } from '../lib/supabase'
import EditGolfer from '../components/EditGolfer'
import { Avatar, Card, MoneyBadge, Pill, PrimaryButton, RowButton, SaddamBadge, SectionLabel } from '../components/ui'
import { useConfirm } from '../components/Confirm'

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
  const me = data.players.find((p) => p.id === data.currentUserId)!
  const stats = playerStats(data, me.id)
  const game = holeStats(data, me.id)
  const [editingMe, setEditingMe] = useState(false)
  const [editingHcp, setEditingHcp] = useState(false)
  const [hcpDraft, setHcpDraft] = useState('')
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try {
      return !!localStorage.getItem(nudgeKey(data.currentUserId, me.handicap))
    } catch {
      return false
    }
  })

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
      <header className="pt-6 pb-2 px-1 flex items-center gap-4">
        <div className="relative">
          <Avatar player={me} size={64} />
          {stats.saddamHeld && (
            <span className="absolute -bottom-1 -right-1">
              <SaddamBadge size={18} />
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[24px] font-extrabold tracking-tight text-ink truncate">{me.name}</h1>
          <p className="text-[13px] text-ink-dim truncate">
            {me.homeCourse ? `Home course: ${me.homeCourse}` : 'No home course set'}
            {me.venmo && ` · @${me.venmo}`}
          </p>
          {stats.saddamHeld && <Pill tone="gold">Holder of the Saddam</Pill>}
        </div>
        {!editingMe && (
          <button onClick={() => setEditingMe(true)} className="text-[13px] font-bold text-green shrink-0">
            Edit
          </button>
        )}
      </header>

      {editingMe && (
        <Card className="mt-2">
          <EditGolfer player={me} cloud={cloud} onDone={() => setEditingMe(false)} />
        </Card>
      )}

      {/* Handicap. Typed, not stepped: getting from 18.0 to 12.4 at a
          tenth per tap is fifty-six taps. The −/+ are for fine tuning,
          and they move a local draft rather than writing on every press. */}
      <Card className="mt-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">Handicap index</p>
            {editingHcp ? (
              <input
                value={hcpDraft}
                onChange={(e) => setHcpDraft(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                autoFocus
                aria-label="Handicap index"
                className="mt-1 w-28 rounded-xl border border-line-strong bg-card px-3 py-2 text-[24px] font-extrabold text-ink tabular-nums focus:border-green focus:outline-none"
              />
            ) : (
              <p className="text-[26px] font-extrabold text-ink tabular-nums leading-tight">{fmt1(me.handicap)}</p>
            )}
          </div>
          {editingHcp ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => nudgeDraft(-0.1)}
                aria-label="Lower handicap by a tenth"
                className="h-11 w-11 rounded-xl bg-paper border border-line-strong text-xl font-bold text-ink active:scale-95"
              >
                −
              </button>
              <button
                onClick={() => nudgeDraft(0.1)}
                aria-label="Raise handicap by a tenth"
                className="h-11 w-11 rounded-xl bg-paper border border-line-strong text-xl font-bold text-ink active:scale-95"
              >
                +
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setHcpDraft(me.handicap.toFixed(1))
                setEditingHcp(true)
              }}
              className="text-[13px] font-bold text-green"
            >
              Update
            </button>
          )}
        </div>
        {editingHcp && (
          <div className="flex gap-2 mt-3.5 pt-3.5 border-t border-line">
            <PrimaryButton onClick={saveHandicap} disabled={!hcpDraft.trim()} className="flex-1 !py-2.5">
              Save index
            </PrimaryButton>
            <button onClick={() => setEditingHcp(false)} className="px-4 text-[13px] font-bold text-ink-faint">
              Cancel
            </button>
          </div>
        )}
      </Card>

      {/* GHIN stays the source of truth — this only points out that the
          number here hasn't moved in a while. */}
      {showHandicapNudge && (
        <Card className="mt-3 p-4 border-gold/40 bg-gold-soft/50 flex items-start gap-3">
          <span className="text-[18px] mt-0.5">📈</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-bold text-ink">
              You've played {roundsAtIndex} rounds at {fmt1(me.handicap)}
            </p>
            <p className="text-[12.5px] text-ink-dim mt-1">
              If GHIN has moved your index since then, update it here so net scores and bets stay honest.
            </p>
            <div className="flex gap-4 mt-2.5">
              <button
                onClick={() => {
                  setHcpDraft(me.handicap.toFixed(1))
                  setEditingHcp(true)
                }}
                className="text-[12.5px] font-bold text-green"
              >
                Update it
              </button>
              <button onClick={dismissHandicapNudge} className="text-[12.5px] font-bold text-ink-faint">
                Still right
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Stat grid */}
      <div className="grid grid-cols-3 gap-3 mt-3">
        <Card className="p-3.5 text-center">
          <p className="text-[22px] font-extrabold text-ink tabular-nums">{stats.rounds}</p>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint mt-0.5">Rounds</p>
        </Card>
        <Card className="p-3.5 text-center">
          <p className="text-[22px] font-extrabold text-ink tabular-nums">{stats.bestGross ?? '—'}</p>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint mt-0.5">Best</p>
        </Card>
        <Card className="p-3.5 text-center">
          <p className="text-[22px] font-extrabold text-ink tabular-nums">{stats.avgGross ? stats.avgGross.toFixed(1) : '—'}</p>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint mt-0.5">Average</p>
        </Card>
      </div>

      <Card className="mt-3 p-4 flex items-center justify-between">
        <p className="text-[13.5px] font-bold text-ink">All-time money</p>
        <MoneyBadge amount={stats.money} className="text-[16px]" />
      </Card>

      {/* What the hole-by-hole cards and course pars add up to. Only
          holes with both a score and a known par count, so the rates
          can't be gamed by an uncarded 88. */}
      {game.holes > 0 ? (
        <>
          <SectionLabel>Your Game · {game.holes} holes</SectionLabel>
          <div className="grid grid-cols-3 gap-3">
            {([3, 4, 5] as const).map((par) => (
              <Card key={par} className="p-3.5 text-center">
                <p className="text-[22px] font-extrabold text-ink tabular-nums">
                  {game.avgByPar[par] != null ? game.avgByPar[par]!.toFixed(2) : '—'}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mt-0.5">on par {par}s</p>
              </Card>
            ))}
          </div>
          <Card className="mt-3 p-4">
            {(() => {
              const buckets = [
                { label: 'Birdie+', count: game.counts.albatross + game.counts.eagle + game.counts.birdie, cls: 'bg-green' },
                { label: 'Par', count: game.counts.par, cls: 'bg-green/40' },
                { label: 'Bogey', count: game.counts.bogey, cls: 'bg-line-strong' },
                { label: 'Double+', count: game.counts.double + game.counts.worse, cls: 'bg-flag/60' },
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
                      <span key={b.label} className="inline-flex items-center gap-1.5 text-[11px] text-ink-dim">
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
          <p className="text-[13px] text-ink-dim">
            <span className="font-bold text-ink">Want the real breakdown?</span> Score rounds hole by hole and fill in
            course pars, and this turns into your par-3/4/5 averages and birdie-to-blowup rates.
          </p>
        </Card>
      )}

      {/* My recent rounds */}
      <SectionLabel
        action={
          <button onClick={() => navigate('/log')} className="text-[12.5px] font-bold text-green">
            + Log a round
          </button>
        }
      >
        My Last {stats.last5.length === 1 ? 'Round' : `${stats.last5.length} Rounds`}
      </SectionLabel>
      {stats.last5.length === 0 ? (
        <Card className="p-5 text-center text-[13.5px] text-ink-dim">Nothing logged yet. Get out there.</Card>
      ) : (
        <Card className="divide-y divide-line">
          {stats.last5.map(({ round, gross }) => (
            <RowButton key={round.id} onClick={() => navigate(`/rounds/${round.id}`)} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-ink truncate">{round.courseName}</p>
                <p className="text-[11.5px] text-ink-faint tabular-nums">
                  {shortDate(round.date)}
                  {isSoloRound(round) && ' · solo'}
                </p>
              </div>
              {gross == null ? (
                <span className="text-[12px] font-bold text-flag shrink-0">Add score</span>
              ) : (
                <p className="text-[18px] font-extrabold text-ink tabular-nums">{gross}</p>
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
        <Card className="p-4 text-[12.5px] text-ink-dim">Notifications switch on once the app is online.</Card>
      )}

      <SectionLabel>The group</SectionLabel>
      <Card onClick={() => navigate('/group')} className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14.5px] font-bold text-ink">{data.group.name}</p>
          <p className="text-[12.5px] text-ink-dim mt-0.5">
            {members.length} golfer{members.length === 1 ? '' : 's'} · roster, emails, invite code
          </p>
        </div>
        <div className="flex -space-x-1.5 shrink-0">
          {members.slice(0, 4).map((p) => (
            <span key={p.id} className="rounded-full ring-2 ring-card">
              <Avatar player={p} size={24} />
            </span>
          ))}
        </div>
      </Card>

      {cloud && (
        <>
          <SectionLabel>Account</SectionLabel>
          <Card className="p-4 flex items-center justify-between gap-3">
            <p className="text-[13px] text-ink-dim">
              Everything syncs across everyone's phones.
              {syncError && <span className="block text-flag font-semibold mt-0.5">Last sync failed: {syncError}</span>}
            </p>
            <button
              onClick={async () => {
                await supabase?.auth.signOut()
                window.location.reload()
              }}
              className="text-[12.5px] font-bold text-flag shrink-0"
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
            className="text-[12px] font-bold text-ink-faint"
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
          <p className="text-[13.5px] font-bold text-ink">Notifications</p>
          <p className="text-[12px] text-ink-dim mt-0.5">
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
            className={`shrink-0 rounded-xl px-4 py-2 text-[13px] font-bold transition active:scale-95 ${
              state === 'on' ? 'border border-line-strong bg-card text-ink-dim' : 'bg-green text-white'
            }`}
          >
            {state === 'on' ? 'Turn off' : 'Turn on'}
          </button>
        )}
      </div>
    </Card>
  )
}

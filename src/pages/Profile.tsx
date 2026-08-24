import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMembers, useStore } from '../data/store'
import { HANDICAP_NUDGE_AFTER, playerStats, roundsAtCurrentHandicap, shortDate } from '../lib/stats'
import { courseSlug, hasPars } from '../lib/courses'
import { normalizeVenmo } from '../lib/venmo'
import { deriveInitials, fmt1, isSoloRound, round1, type Player } from '../types'
import { supabase } from '../lib/supabase'
import { Avatar, Card, MoneyBadge, Pill, PrimaryButton, RowButton, SaddamBadge, SectionLabel } from '../components/ui'
import { useConfirm } from '../components/Confirm'

// Dismissing the nudge is remembered against the index it was about, so
// saying "still right" quiets it until the number actually changes.
const nudgeKey = (playerId: string, handicap: number) => `sandbagger-hcp-ok:${playerId}:${handicap.toFixed(1)}`

export default function Profile() {
  const { data, cloud, syncError, updatePlayer, setCurrentUser, addPlayer, resetToSample } = useStore()
  const confirm = useConfirm()
  const members = useMembers()
  const navigate = useNavigate()
  const me = data.players.find((p) => p.id === data.currentUserId)!
  const stats = playerStats(data, me.id)
  const [editingHcp, setEditingHcp] = useState(false)
  const [hcpDraft, setHcpDraft] = useState('')
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try {
      return !!localStorage.getItem(nudgeKey(data.currentUserId, me.handicap))
    } catch {
      return false
    }
  })

  // Courses played that still have no par entered.
  const coursesNeedingPar = new Set(
    data.rounds.map((r) => courseSlug(r.courseName)).filter((slug) => !hasPars(data.courses.find((c) => c.slug === slug))),
  ).size

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
  const [addingMember, setAddingMember] = useState(false)
  const [newName, setNewName] = useState('')
  const [newHcp, setNewHcp] = useState('')
  const [newCourse, setNewCourse] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

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
          <h1 className="text-[24px] font-extrabold tracking-tight text-ink">{me.name}</h1>
          <p className="text-[13px] text-ink-dim">
            {me.homeCourse ? `Home course: ${me.homeCourse}` : 'No home course set'}
          </p>
          {stats.saddamHeld && <Pill tone="gold">Holder of the Saddam</Pill>}
        </div>
      </header>

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
            <button onClick={() => { setHcpDraft(me.handicap.toFixed(1)); setEditingHcp(true) }} className="text-[13px] font-bold text-green">
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
                onClick={() => { setHcpDraft(me.handicap.toFixed(1)); setEditingHcp(true) }}
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

      {/* Head-to-head, tucked here rather than front and center */}
      <SectionLabel>Bragging Rights</SectionLabel>
      <Card onClick={() => navigate('/h2h')} className="p-4 flex items-center justify-between">
        <div>
          <p className="text-[14.5px] font-bold text-ink">Head-to-head records</p>
          <p className="text-[12.5px] text-ink-dim mt-0.5">Lifetime records, streaks, and the Saddam</p>
        </div>
        <span className="text-[13px] font-bold text-green">Open →</span>
      </Card>

      <SectionLabel>Courses</SectionLabel>
      <Card onClick={() => navigate('/courses')} className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14.5px] font-bold text-ink">Scorecards</p>
          <p className="text-[12.5px] text-ink-dim mt-0.5">
            {coursesNeedingPar === 0
              ? 'Par is in for every course you’ve played'
              : `${coursesNeedingPar} course${coursesNeedingPar === 1 ? '' : 's'} without par yet`}
          </p>
        </div>
        {coursesNeedingPar > 0 ? (
          <Pill tone="gold">{coursesNeedingPar}</Pill>
        ) : (
          <span className="text-[13px] font-bold text-green shrink-0">Open →</span>
        )}
      </Card>

      {/* The group roster */}
      <SectionLabel
        action={
          !addingMember ? (
            <button onClick={() => setAddingMember(true)} className="text-[12.5px] font-bold text-green">+ Add golfer</button>
          ) : undefined
        }
      >
        {data.group.name} · {members.length} golfers
      </SectionLabel>

      {addingMember && (
        <Card className="p-4 mb-3 space-y-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Dave Brooks"
              autoFocus
              className="w-full rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">
              Email {cloud ? '(so they can sign in)' : '(optional)'}
            </label>
            <input
              type="email"
              inputMode="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="dave@example.com"
              className="w-full rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">Handicap</label>
              <input
                value={newHcp}
                onChange={(e) => setNewHcp(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                placeholder="16.9"
                className="w-full rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-faint tabular-nums focus:border-green focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">Home course</label>
              <input
                value={newCourse}
                onChange={(e) => setNewCourse(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <PrimaryButton
              onClick={() => {
                addPlayer({ name: newName, handicap: Number(newHcp) || 18, homeCourse: newCourse, email: newEmail })
                setNewName('')
                setNewHcp('')
                setNewCourse('')
                setNewEmail('')
                setAddingMember(false)
              }}
              disabled={!newName.trim()}
              className="flex-1 !py-2.5"
            >
              Add to group
            </PrimaryButton>
            <button onClick={() => setAddingMember(false)} className="px-4 text-[13px] font-bold text-ink-faint">Cancel</button>
          </div>
          <p className="text-[11px] text-ink-faint">
            {cloud
              ? "They get a profile right away. When they sign in with that email, it becomes theirs."
              : 'They get their own profile right away.'}
          </p>
        </Card>
      )}

      <Card className="divide-y divide-line">
        {members.map((p) =>
          editingId === p.id ? (
            <EditGolfer key={p.id} player={p} cloud={cloud} onDone={() => setEditingId(null)} />
          ) : (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar player={p} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-ink truncate">
                  {p.name}
                  {p.id === me.id && <span className="text-ink-faint font-semibold"> (you)</span>}
                </p>
                <p className="text-[11.5px] text-ink-faint truncate">
                  <span className="tabular-nums">Hcp {fmt1(p.handicap)}</span>
                  {p.homeCourse && ` · ${p.homeCourse}`}
                  {p.venmo && ` · @${p.venmo}`}
                </p>
                {cloud && (
                  <p className="text-[11.5px] mt-0.5 truncate">
                    {p.email ? (
                      <span className="text-green font-semibold">{p.email}</span>
                    ) : (
                      <span className="text-flag font-semibold">No email — can't sign in yet</span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {p.id === me.id && (
                  <span className="text-[11px] font-bold uppercase tracking-wider text-green">You</span>
                )}
                <button onClick={() => setEditingId(p.id)} className="text-[12.5px] font-bold text-green">
                  Edit
                </button>
                {!cloud && p.id !== me.id && (
                  <button onClick={() => setCurrentUser(p.id)} className="text-[12px] font-bold text-ink-faint">
                    Switch to
                  </button>
                )}
              </div>
            </div>
          ),
        )}
      </Card>
      {cloud && members.some((p) => !p.email) && (
        <p className="text-[11.5px] text-ink-dim px-2 mt-2">
          Add an email to each golfer before you send them the link. When they sign in with that exact address, this profile
          becomes theirs — history and all. Without it they'd end up with a second, empty profile.
        </p>
      )}
      {!cloud && (
        <p className="text-[11px] text-ink-faint px-2 mt-2">
          "Switch to" stands in for real logins until the app is online — handy for checking what each golfer sees.
        </p>
      )}

      {cloud && (
        <>
          <SectionLabel>Account</SectionLabel>
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-ink">Invite code</p>
                <p className="text-[12px] text-ink-dim">Anyone with this can join the group.</p>
              </div>
              <span className="rounded-lg bg-paper border border-line px-3 py-1.5 text-[14px] font-extrabold tracking-[0.15em] text-ink shrink-0">
                {data.group.inviteCode}
              </span>
            </div>
            <div className="pt-3 border-t border-line flex items-center justify-between">
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
            </div>
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

// Editing an existing golfer, mainly so the organizer can attach the email
// they'll sign in with. Matching that address is what hands them this
// profile and its history instead of creating a second, empty one.
function EditGolfer({ player, cloud, onDone }: { player: Player; cloud: boolean; onDone: () => void }) {
  const { updatePlayer } = useStore()
  const [name, setName] = useState(player.name)
  const [email, setEmail] = useState(player.email ?? '')
  const [handicap, setHandicap] = useState(player.handicap.toFixed(1))
  const [homeCourse, setHomeCourse] = useState(player.homeCourse ?? '')
  const [venmo, setVenmo] = useState(player.venmo ?? '')
  const [initials, setInitials] = useState(player.initials)
  // Track it so typing a surname updates the avatar, but a deliberate
  // override survives further edits to the name.
  const [initialsEdited, setInitialsEdited] = useState(false)

  const onNameChange = (value: string) => {
    setName(value)
    if (!initialsEdited) setInitials(deriveInitials(value))
  }

  const field =
    'w-full rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none'
  const label = 'block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5'

  const save = () => {
    if (!name.trim()) return
    updatePlayer({
      ...player,
      name: name.trim(),
      initials: (initials.trim() || deriveInitials(name)).toUpperCase().slice(0, 3),
      email: email.trim() || undefined,
      handicap: round1(Number(handicap) || player.handicap),
      homeCourse: homeCourse.trim() || undefined,
    })
    onDone()
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        {/* Preview, so the avatar you're about to save is the one you see */}
        <Avatar player={{ ...player, name, initials: initials || deriveInitials(name) }} size={32} />
        <p className="text-[14px] font-extrabold text-ink">Editing {player.name}</p>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2.5">
        <div>
          <label className={label}>Name</label>
          <input value={name} onChange={(e) => onNameChange(e.target.value)} className={field} autoFocus />
        </div>
        <div className="w-20">
          <label className={label}>Initials</label>
          <input
            value={initials}
            onChange={(e) => {
              setInitialsEdited(true)
              setInitials(e.target.value.toUpperCase().slice(0, 3))
            }}
            maxLength={3}
            className={`${field} text-center font-bold tracking-wider`}
          />
        </div>
      </div>
      {cloud && (
        <div>
          <label className={label}>Sign-in email</label>
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="them@example.com"
            className={field}
          />
          <p className="text-[11px] text-ink-faint mt-1.5">
            Must match the address they sign in with, or they'll get a fresh empty profile instead of this one.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={label}>Handicap</label>
          <input
            value={handicap}
            onChange={(e) => setHandicap(e.target.value.replace(/[^\d.]/g, ''))}
            inputMode="decimal"
            className={`${field} tabular-nums`}
          />
        </div>
        <div>
          <label className={label}>Home course</label>
          <input value={homeCourse} onChange={(e) => setHomeCourse(e.target.value)} placeholder="Optional" className={field} />
        </div>
      </div>
      <div>
        <label className={label}>Venmo</label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-bold text-ink-faint">@</span>
          <input
            value={venmo}
            onChange={(e) => setVenmo(normalizeVenmo(e.target.value))}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={`${field} pl-7`}
          />
        </div>
        <p className="text-[11px] text-ink-faint mt-1.5">
          Just the username, so settling up a trip is one tap. Nothing gets linked and no account is connected.
        </p>
      </div>
      <div className="flex gap-2">
        <PrimaryButton onClick={save} disabled={!name.trim()} className="flex-1 !py-2.5">
          Save
        </PrimaryButton>
        <button onClick={onDone} className="px-4 text-[13px] font-bold text-ink-faint">
          Cancel
        </button>
      </div>
    </div>
  )
}

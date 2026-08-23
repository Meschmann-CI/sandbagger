import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMembers, useStore } from '../data/store'
import { playerStats, shortDate } from '../lib/stats'
import { fmt1, isGroupRound, round1, type Player } from '../types'
import { supabase } from '../lib/supabase'
import { Avatar, Card, MoneyBadge, Pill, PrimaryButton, SaddamBadge, SectionLabel } from '../components/ui'

export default function Profile() {
  const { data, cloud, syncError, adjustHandicap, setCurrentUser, addPlayer, resetToSample } = useStore()
  const members = useMembers()
  const navigate = useNavigate()
  const me = data.players.find((p) => p.id === data.currentUserId)!
  const stats = playerStats(data, me.id)
  const [editingHcp, setEditingHcp] = useState(false)
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

      {/* Handicap */}
      <Card className="mt-3 p-4 flex items-center justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">Handicap index</p>
          <p className="text-[26px] font-extrabold text-ink tabular-nums leading-tight">{fmt1(me.handicap)}</p>
        </div>
        {editingHcp ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => adjustHandicap(me.id, -0.1)}
              className="h-11 w-11 rounded-xl bg-paper border border-line-strong text-xl font-bold text-ink active:scale-95"
            >
              −
            </button>
            <button
              onClick={() => adjustHandicap(me.id, 0.1)}
              className="h-11 w-11 rounded-xl bg-paper border border-line-strong text-xl font-bold text-ink active:scale-95"
            >
              +
            </button>
            <button onClick={() => setEditingHcp(false)} className="ml-1 text-[13px] font-bold text-green">
              Done
            </button>
          </div>
        ) : (
          <button onClick={() => setEditingHcp(true)} className="text-[13px] font-bold text-green">
            Update
          </button>
        )}
      </Card>

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
            <div key={round.id} onClick={() => navigate(`/rounds/${round.id}`)} className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-paper">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-ink truncate">{round.courseName}</p>
                <p className="text-[11.5px] text-ink-faint tabular-nums">
                  {shortDate(round.date)}
                  {!isGroupRound(round) && ' · solo'}
                </p>
              </div>
              <p className="text-[18px] font-extrabold text-ink tabular-nums">{gross}</p>
            </div>
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
            onClick={() => {
              if (confirm('Reset everything back to the sample data?')) resetToSample()
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

  const field =
    'w-full rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none'
  const label = 'block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5'

  const save = () => {
    if (!name.trim()) return
    updatePlayer({
      ...player,
      name: name.trim(),
      email: email.trim() || undefined,
      handicap: round1(Number(handicap) || player.handicap),
      homeCourse: homeCourse.trim() || undefined,
    })
    onDone()
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Avatar player={player} size={32} />
        <p className="text-[14px] font-extrabold text-ink">Editing {player.name}</p>
      </div>
      <div>
        <label className={label}>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={field} autoFocus />
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

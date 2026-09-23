import { useState } from 'react'
import { useMembers, useStore } from '../data/store'
import { useGoBack } from '../lib/nav'
import { fmt1 } from '../types'
import EditGolfer from '../components/EditGolfer'
import { Avatar, Card, Pill, PrimaryButton, SectionLabel } from '../components/ui'

// The roster: who's in the group, how they sign in, and how a new golfer
// gets added. Lived at the bottom of Profile for a long time, under
// everything personal; it's a page of its own now because "add Pat's
// email" shouldn't mean scrolling past your own par-3 average.

export default function Group() {
  const { data, cloud, addPlayer, setCurrentUser } = useStore()
  const members = useMembers()
  const goBack = useGoBack('/profile')
  const me = data.players.find((p) => p.id === data.currentUserId)!
  const guests = data.players.filter((p) => p.guest)

  const [addingMember, setAddingMember] = useState(false)
  const [newName, setNewName] = useState('')
  const [newHcp, setNewHcp] = useState('')
  const [newCourse, setNewCourse] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const field =
    'w-full rounded-lg border border-line-strong bg-card px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none'
  const label = 'block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5'

  return (
    <div className="rise">
      <header className="pt-4 pb-2 px-1">
        <button onClick={() => goBack()} className="text-[13px] font-bold text-ink-faint mb-2">
          ← Back
        </button>
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink">{data.group.name}</h1>
        <p className="text-[13px] text-ink-dim">
          {members.length} golfer{members.length === 1 ? '' : 's'}
          {guests.length > 0 && ` · ${guests.length} guest${guests.length === 1 ? '' : 's'}`}
        </p>
      </header>

      {cloud && (
        <Card className="mt-2 p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-ink">Invite code</p>
            <p className="text-[12px] text-ink-dim">Anyone with this can join the group.</p>
          </div>
          <span className="rounded-lg bg-paper border border-line px-3 py-1.5 text-[14px] font-extrabold tracking-[0.15em] text-ink shrink-0">
            {data.group.inviteCode}
          </span>
        </Card>
      )}

      <SectionLabel
        action={
          !addingMember ? (
            <button onClick={() => setAddingMember(true)} className="text-[12.5px] font-bold text-green">
              + Add golfer
            </button>
          ) : undefined
        }
      >
        Members
      </SectionLabel>

      {addingMember && (
        <Card className="p-4 mb-3 space-y-3">
          <div>
            <label className={label}>Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Dave Brooks" autoFocus className={field} />
          </div>
          <div>
            <label className={label}>Email {cloud ? '(so they can sign in)' : '(optional)'}</label>
            <input
              type="email"
              inputMode="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="dave@example.com"
              className={field}
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={label}>Handicap</label>
              <input
                value={newHcp}
                onChange={(e) => setNewHcp(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                placeholder="16.9"
                className={`${field} tabular-nums`}
              />
            </div>
            <div>
              <label className={label}>Home course</label>
              <input value={newCourse} onChange={(e) => setNewCourse(e.target.value)} placeholder="Optional" className={field} />
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
            <button onClick={() => setAddingMember(false)} className="px-4 text-[13px] font-bold text-ink-faint">
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-ink-faint">
            {cloud
              ? 'They get a profile right away. When they sign in with that email, it becomes theirs.'
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
          Add an email to each golfer before you send them the link. When they sign in with that exact address, this
          profile becomes theirs — history and all. Without it they'd end up with a second, empty profile.
        </p>
      )}
      {!cloud && (
        <p className="text-[11px] text-ink-faint px-2 mt-2">
          "Switch to" stands in for real logins until the app is online — handy for checking what each golfer sees.
        </p>
      )}

      {/* Guests: editable (name, handicap, Venmo for settling up) but
          visibly not members. */}
      {guests.length > 0 && (
        <>
          <SectionLabel>Guests</SectionLabel>
          <Card className="divide-y divide-line">
            {guests.map((p) =>
              editingId === p.id ? (
                <EditGolfer key={p.id} player={p} cloud={cloud} onDone={() => setEditingId(null)} />
              ) : (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar player={p} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-ink truncate">{p.name}</p>
                    <p className="text-[11.5px] text-ink-faint truncate">
                      <span className="tabular-nums">Hcp {fmt1(p.handicap)}</span>
                      {p.venmo && ` · @${p.venmo}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <Pill>Guest</Pill>
                    <button onClick={() => setEditingId(p.id)} className="text-[12.5px] font-bold text-green">
                      Edit
                    </button>
                  </div>
                </div>
              ),
            )}
          </Card>
          <p className="text-[11px] text-ink-faint px-2 mt-2">
            Guests play rounds and settle bets, but stay off the leaderboard, the head-to-head records, and the Saddam.
          </p>
        </>
      )}
      <div className="h-6" />
    </div>
  )
}

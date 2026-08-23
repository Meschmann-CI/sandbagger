import { useState } from 'react'
import { requireSupabase } from '../lib/supabase'
import { deriveInitials } from '../types'
import { seedCloudGroup } from '../data/cloudSeed'
import { Card, PrimaryButton } from '../components/ui'

// Shown when someone is signed in but has no player profile yet: either
// they're starting the group, joining one, or waiting to be added.

type Mode = 'choose' | 'create' | 'join'

const randomCode = () =>
  Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')

export default function Setup({ email, groupExists, onReady }: { email: string | null; groupExists: boolean; onReady: () => void }) {
  const [mode, setMode] = useState<Mode>('choose')
  const [name, setName] = useState('')
  const [handicap, setHandicap] = useState('')
  const [homeCourse, setHomeCourse] = useState('')
  const [groupName, setGroupName] = useState('')
  const [withHistory, setWithHistory] = useState(true)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const field =
    'w-full rounded-xl border border-line-strong bg-card px-4 py-3 text-[15px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none'
  const label = 'block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5'

  const signOut = async () => {
    await requireSupabase().auth.signOut()
    window.location.reload()
  }

  const createGroup = async () => {
    setBusy(true)
    setError(null)
    try {
      const client = requireSupabase()
      const { data: groupId, error: rpcError } = await client.rpc('create_group_with_owner', {
        group_name: groupName.trim() || 'Our Golf Group',
        invite_code: randomCode(),
        player_name: name.trim(),
        player_initials: deriveInitials(name),
        player_handicap: Number(handicap) || 18,
        player_home_course: homeCourse.trim() || null,
      })
      if (rpcError) throw new Error(rpcError.message)

      if (withHistory) {
        const { data: me, error: meError } = await client.from('players').select('id').eq('group_id', groupId).limit(1).single()
        if (meError) throw new Error(meError.message)
        await seedCloudGroup(client, { groupId: groupId as string, ownerPlayerId: me.id, ownerName: name })
      }
      onReady()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const joinGroup = async () => {
    setBusy(true)
    setError(null)
    try {
      const { error: rpcError } = await requireSupabase().rpc('join_group_by_code', {
        code: code.trim(),
        player_name: name.trim(),
        player_initials: deriveInitials(name),
        player_handicap: Number(handicap) || 18,
      })
      if (rpcError) throw new Error(rpcError.message)
      onReady()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md min-h-dvh px-5 py-10 rise">
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">⛳</div>
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink">
          {mode === 'create' ? 'Start your group' : mode === 'join' ? 'Join a group' : 'One more step'}
        </h1>
        {email && <p className="text-[13px] text-ink-dim mt-1">Signed in as {email}</p>}
      </div>

      {mode === 'choose' && (
        <div className="space-y-3">
          {groupExists && (
            <Card className="p-5">
              <p className="text-[15px] font-extrabold text-ink">Waiting on an invite?</p>
              <p className="text-[13.5px] text-ink-dim mt-1.5">
                A group already exists. Ask whoever set it up to add {email ? <span className="font-bold text-ink">{email}</span> : 'your email'} as a
                golfer, then sign in again and you'll drop straight in.
              </p>
            </Card>
          )}
          <Card onClick={() => setMode('join')} className="p-5">
            <p className="text-[15px] font-extrabold text-ink">I have an invite code</p>
            <p className="text-[13.5px] text-ink-dim mt-1">Join an existing group with its six-character code.</p>
          </Card>
          <Card onClick={() => setMode('create')} className="p-5">
            <p className="text-[15px] font-extrabold text-ink">Start a new group</p>
            <p className="text-[13.5px] text-ink-dim mt-1">You'll be the organizer and can add everyone else.</p>
          </Card>
          <button onClick={() => void signOut()} className="w-full text-[12.5px] font-bold text-ink-faint py-2">
            Sign out
          </button>
        </div>
      )}

      {mode === 'create' && (
        <Card className="p-5 space-y-3.5">
          <div>
            <label className={label}>Group name</label>
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Sunday Foursome" className={field} autoFocus />
          </div>
          <div>
            <label className={label}>Your name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={label}>Your handicap</label>
              <input
                value={handicap}
                onChange={(e) => setHandicap(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                placeholder="12.4"
                className={`${field} tabular-nums`}
              />
            </div>
            <div>
              <label className={label}>Home course</label>
              <input value={homeCourse} onChange={(e) => setHomeCourse(e.target.value)} placeholder="Optional" className={field} />
            </div>
          </div>

          <button onClick={() => setWithHistory((v) => !v)} className="flex items-start gap-3 w-full text-left pt-1">
            <span className={`mt-0.5 h-6 w-6 rounded-md border-2 flex items-center justify-center shrink-0 ${withHistory ? 'border-green bg-green' : 'border-line-strong'}`}>
              {withHistory && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 12.5 L9.5 17.5 L19.5 6.5" />
                </svg>
              )}
            </span>
            <span>
              <span className="block text-[14px] font-bold text-ink">Load sample data</span>
              <span className="block text-[12.5px] text-ink-dim mt-0.5">
                A worked example: one past trip with its itinerary and cost split, one in the planning stage, and a season of
                rounds. Handy for a look around — delete it whenever.
              </span>
            </span>
          </button>

          <div className="flex gap-2 pt-1">
            <PrimaryButton onClick={() => void createGroup()} disabled={!name.trim() || busy} className="flex-1 !py-3">
              {busy ? 'Setting up…' : 'Create group'}
            </PrimaryButton>
            <button onClick={() => setMode('choose')} className="px-4 text-[13px] font-bold text-ink-faint">Back</button>
          </div>
          {error && <p className="text-[12.5px] text-flag font-semibold">{error}</p>}
        </Card>
      )}

      {mode === 'join' && (
        <Card className="p-5 space-y-3.5">
          <div>
            <label className={label}>Invite code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="FORE24"
              className={`${field} tracking-[0.2em] font-bold`}
              autoFocus
            />
          </div>
          <div>
            <label className={label}>Your name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={field} />
          </div>
          <div>
            <label className={label}>Your handicap</label>
            <input
              value={handicap}
              onChange={(e) => setHandicap(e.target.value.replace(/[^\d.]/g, ''))}
              inputMode="decimal"
              placeholder="16.9"
              className={`${field} tabular-nums`}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <PrimaryButton onClick={() => void joinGroup()} disabled={!code.trim() || !name.trim() || busy} className="flex-1 !py-3">
              {busy ? 'Joining…' : 'Join group'}
            </PrimaryButton>
            <button onClick={() => setMode('choose')} className="px-4 text-[13px] font-bold text-ink-faint">Back</button>
          </div>
          {error && <p className="text-[12.5px] text-flag font-semibold">{error}</p>}
        </Card>
      )}
    </div>
  )
}

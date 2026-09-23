import { useState } from 'react'
import { useStore } from '../data/store'
import { deriveInitials, round1, type Player } from '../types'
import { normalizeVenmo } from '../lib/venmo'
import { Avatar, PrimaryButton } from './ui'

// Editing a golfer: your own details from the You tab, or anyone's from
// the Group page (mainly so the organizer can attach the email they'll
// sign in with — matching that address is what hands them this profile
// and its history instead of creating a second, empty one).

export default function EditGolfer({ player, cloud, onDone }: { player: Player; cloud: boolean; onDone: () => void }) {
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
      venmo: venmo.trim() || undefined,
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
          Just the username, so settling up is one tap. Nothing gets linked and no account is connected.
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

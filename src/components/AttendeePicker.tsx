import { useMembers, useStore } from '../data/store'
import { Avatar } from './ui'

// Who's on the trip. This doubles as the privacy control: golfers who
// aren't on the list never see the trip at all.
export default function AttendeePicker({
  selected,
  onChange,
  lockedId,
}: {
  selected: string[]
  onChange: (ids: string[]) => void
  lockedId?: string // the creator, who can't remove themselves
}) {
  const members = useMembers()
  const { data } = useStore()

  const toggle = (id: string) => {
    if (id === lockedId) return
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  return (
    <div className="space-y-2">
      {members.map((p) => {
        const on = selected.includes(p.id)
        const locked = p.id === lockedId
        return (
          <button
            key={p.id}
            onClick={() => toggle(p.id)}
            disabled={locked}
            className={`w-full flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition ${
              on ? 'border-green/50 bg-green-soft/50' : 'border-line opacity-60'
            } ${locked ? 'cursor-default' : 'active:scale-[0.99]'}`}
          >
            <Avatar player={p} size={32} />
            <div className="flex-1 text-left min-w-0">
              <p className="text-[14px] font-bold text-ink truncate">
                {p.name}
                {p.id === data.currentUserId && <span className="text-ink-faint font-semibold"> (you)</span>}
              </p>
              <p className="text-[11.5px] text-ink-faint tabular-nums">Hcp {p.handicap.toFixed(1)}</p>
            </div>
            {locked ? (
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">Organizer</span>
            ) : (
              <span className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'border-green bg-green' : 'border-line-strong'}`}>
                {on && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.5 12.5 L9.5 17.5 L19.5 6.5" />
                  </svg>
                )}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

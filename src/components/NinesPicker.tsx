import type { Course } from '../types'

// Which two nines, on a 27-hole course: every pairing in both orders,
// one tap each. Front first, so "Meadows → Lakes" is Meadows out and
// Lakes in. Nothing picked means the course's first two, which is how
// the card's own 18 reads, so that one shows as picked.

export default function NinesPicker({
  course,
  value,
  onChange,
}: {
  course: Course | undefined
  value: [string, string] | undefined
  onChange: (nines: [string, string]) => void
}) {
  const nines = course?.nines
  if (!nines || nines.length < 2) return null
  const pairs: [string, string][] = nines.flatMap((a) => nines.filter((b) => b !== a).map((b) => [a.name, b.name] as [string, string]))
  const current = value ?? [nines[0].name, nines[1].name]
  const same = (p: [string, string]) => p[0].toLowerCase() === current[0].toLowerCase() && p[1].toLowerCase() === current[1].toLowerCase()
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which nines, front first">
      {pairs.map((p) => {
        const on = same(p)
        return (
          <button
            key={p.join('|')}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(p)}
            className={`rounded-full border px-3.5 py-2 text-footnote font-bold transition active:scale-95 ${
              on ? 'border-forest bg-forest text-on-forest' : 'border-line-strong bg-card text-ink-dim'
            }`}
          >
            {p[0]} → {p[1]}
          </button>
        )
      })}
    </div>
  )
}

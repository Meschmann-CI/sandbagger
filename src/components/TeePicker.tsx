import { useState } from 'react'
import type { Course } from '../types'
import { Icon } from './icons'

// Which tees, as a dropdown instead of a blank box. The course's own tee
// sets come first when the card is on file (with the yardage under the
// field once one's picked), then the colours most courses use, then Other for the
// combo tees and the courses that name theirs after birds. The tee name
// is what picks the rating and slope for strokes (teeFor), so offering
// the course's exact names saves a mismatch.

const COMMON = ['Black', 'Blue', 'White', 'Gold', 'Red', 'Green']
const OTHER = '__other__'

export default function TeePicker({
  value,
  onChange,
  course,
  className,
}: {
  value: string
  onChange: (tee: string) => void
  course?: Course
  className: string
}) {
  const own = (course?.tees ?? []).filter((t) => (t.gender ?? 'M') === 'M')
  const known = new Set(own.map((t) => t.name.toLowerCase()))
  const common = COMMON.filter((c) => !known.has(c.toLowerCase()))
  const listed = [...own.map((t) => t.name), ...common].map((n) => n.toLowerCase())
  // A tee typed in by hand (or saved on an old round) that isn't in the
  // list opens straight into the text box, so it isn't silently lost.
  const [typing, setTyping] = useState(() => value.trim() !== '' && !listed.includes(value.trim().toLowerCase()))

  if (typing) {
    return (
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Blue/White"
          autoFocus={value === ''}
          aria-label="Tees"
          className={`${className} pr-10`}
        />
        <button
          type="button"
          onClick={() => {
            setTyping(false)
            onChange('')
          }}
          aria-label="Back to the list of tees"
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-faint"
        >
          <Icon name="chevronLeft" size={16} strokeWidth={2.2} className="rotate-[-90deg]" />
        </button>
      </div>
    )
  }

  const selected = own.find((t) => t.name.toLowerCase() === value.trim().toLowerCase())?.name
    ?? common.find((c) => c.toLowerCase() === value.trim().toLowerCase())
    ?? ''

  const yards = own.find((t) => t.name === selected)?.yards

  return (
    <div className="relative">
      {/* Yardage under the field rather than in the option, where a
          half-width box would cut it off. */}
      {yards != null && (
        <p className="absolute left-1 top-full mt-1 text-caption text-ink-faint tabular-nums">{yards.toLocaleString()} yds</p>
      )}
      <select
        value={selected}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setTyping(true)
            onChange('')
          } else onChange(e.target.value)
        }}
        aria-label="Tees"
        className={`${className} appearance-none pr-10`}
        style={selected ? undefined : { color: 'var(--color-ink-faint)' }}
      >
        <option value="">Pick tees</option>
        {own.length > 0 && (
          <optgroup label={course?.name ? `At ${course.name}` : 'This course'}>
            {own.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={own.length > 0 ? 'Other colours' : 'Common tees'}>
          {common.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </optgroup>
        <option value={OTHER}>Other…</option>
      </select>
      <Icon
        name="chevronLeft"
        size={16}
        strokeWidth={2.2}
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rotate-[-90deg] text-ink-faint"
      />
    </div>
  )
}

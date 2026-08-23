function Star({ fill, size }: { fill: number; size: number }) {
  // fill: 0 = empty, 1 = full, fractions render a partial star
  const id = `star-${Math.random().toString(36).slice(2, 9)}`
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id={id}>
          <stop offset={`${fill * 100}%`} stopColor="#e0a418" />
          <stop offset={`${fill * 100}%`} stopColor="#e7e5dc" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.6 L14.9 9 L21.6 9.7 L16.6 14.2 L18 20.8 L12 17.4 L6 20.8 L7.4 14.2 L2.4 9.7 L9.1 9 Z"
        fill={`url(#${id})`}
        stroke="#c9a43e"
        strokeWidth="0.7"
      />
    </svg>
  )
}

export function StarRating({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} size={size} fill={Math.max(0, Math.min(1, value - i))} />
      ))}
    </span>
  )
}

export function StarPicker({ value, onChange, size = 30 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i === value ? 0 : i)}
          aria-label={`${i} star${i === 1 ? '' : 's'}`}
          className="active:scale-90 transition-transform"
        >
          <Star size={size} fill={value >= i ? 1 : 0} />
        </button>
      ))}
    </span>
  )
}

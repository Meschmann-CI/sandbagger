import type { ReactNode } from 'react'

// One drawn icon set for the whole app, on the same 24-unit grid, 1.9
// stroke and round caps as the tab bar. These replaced emoji, which
// render differently on every phone and never matched the line icons
// sitting next to them.

const PATHS = {
  // A flag in the cup: courses, tee times, golf costs.
  flag: (
    <>
      <path d="M8 20V4" />
      <path d="M8 4l8 3-8 3" fill="currentColor" />
      <ellipse cx="12" cy="20" rx="7" ry="1.8" />
    </>
  ),
  camera: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="3" />
      <path d="M8.5 7l1.5-3h4l1.5 3" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />,
  meal: (
    <>
      <path d="M6 3v5a3 3 0 0 0 6 0V3" />
      <path d="M9 3v18" />
      <path d="M18 21V3c-2 1.5-3.2 4-3.2 7v3.5H18" />
    </>
  ),
  house: (
    <>
      <path d="M3 11.5 L12 4 L21 11.5" />
      <path d="M5.5 10 V20 H18.5 V10" />
      <path d="M10 20 V14.5 H14 V20" />
    </>
  ),
  plane: (
    <path d="M12 2.5c.9 0 1.5.9 1.5 2v4.8l7.5 4.7v2.2l-7.5-2.4v4.4l2.2 1.8v1.8L12 21l-3.7.8V20l2.2-1.8v-4.4L3 16.2V14l7.5-4.7V4.5c0-1.1.6-2 1.5-2z" />
  ),
  pin: (
    <>
      <path d="M12 21 C12 21 5 14.5 5 9.5 A7 7 0 0 1 19 9.5 C19 14.5 12 21 12 21 Z" />
      <circle cx="12" cy="9.5" r="2.4" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  cash: (
    <>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>
  ),
  ghost: (
    <>
      <path d="M5 20V10a7 7 0 0 1 14 0v10l-2.4-1.6L14.3 20 12 18.4 9.7 20l-2.4-1.6z" />
      <circle cx="9.5" cy="10.5" r=".9" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="10.5" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  flame: (
    <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.3 3.6-8.3.8 1.7 1.7 2.6 2.9 3.1C12.3 6.7 13.5 4.4 15.6 3c-.3 3.2 2.9 5.9 2.9 11.2 0 3.9-2.7 6.8-6.5 6.8z" />
  ),
  // Out of the box: sharing a result.
  share: (
    <>
      <path d="M12 3.5v11" />
      <path d="M8 7.5l4-4 4 4" />
      <path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
    </>
  ),
  // A cold run, on Head-to-Head only.
  snowflake: (
    <>
      <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
      <path d="M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
      <path d="M12 13v4M9 20.5h6M10 17h4v3.5h-4z" />
    </>
  ),
  suitcase: (
    <>
      <rect x="4" y="8" width="16" height="12" rx="2.5" />
      <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M4 13h16" />
    </>
  ),
  // A card with a pencil: a score still to write down.
  pencil: (
    <>
      <path d="M13 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
      <path d="M17.6 3.6a1.8 1.8 0 0 1 2.6 2.6l-7.1 7.1-3.3.9.9-3.3z" />
    </>
  ),
  trend: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  // Two clubs crossed: a rivalry.
  clash: (
    <>
      <path d="M5 4l12.5 12.5" />
      <path d="M19 4L6.5 16.5" />
      <path d="M17.5 16.5l-1.2 3.3 3.4-1.1M6.5 16.5l1.2 3.3-3.4-1.1" />
    </>
  ),
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.5" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.5a2 2 0 0 1 3.4 0l7.6 13a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17.2" r=".8" fill="currentColor" stroke="none" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.9,
  className = '',
  label,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
  /** Only for an icon that stands alone with no text saying the same thing. */
  label?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {PATHS[name]}
    </svg>
  )
}

const TILE_TONES = {
  green: 'bg-green-soft text-green',
  gold: 'bg-gold-soft text-gold',
  sky: 'bg-sky-soft text-sky',
  sand: 'bg-sand-soft text-sand',
  flag: 'bg-flag-soft text-flag',
  forest: 'bg-forest text-on-forest',
  cream: 'bg-cream text-forest',
  plain: 'bg-paper text-ink-dim border border-line',
}

/** An icon in a soft round tile: the lead-in for prompt cards and list rows. */
export function IconTile({ name, tone = 'green', size = 40 }: { name: IconName; tone?: keyof typeof TILE_TONES; size?: number }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${TILE_TONES[tone]}`} style={{ width: size, height: size }}>
      <Icon name={name} size={Math.round(size * 0.5)} />
    </span>
  )
}

/**
 * Venmo's "V", drawn for the Pay and Request buttons so they read as
 * Venmo at a glance. Filled, unlike the line icons above, because the
 * real mark is solid. Sits on Venmo's blue (VENMO_BLUE).
 */
export const VENMO_BLUE = '#008CFF'
export function VenmoMark({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M19.3 3c.7 1.2 1 2.4 1 3.9 0 4.9-4.2 11.2-7.6 15.6H5L1.9 4.2l6.8-.6 1.7 13.5c1.6-2.6 3.5-6.6 3.5-9.4 0-1.5-.3-2.5-.7-3.3z"
      />
    </svg>
  )
}

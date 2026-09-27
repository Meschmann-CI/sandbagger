import type { Badge } from '../lib/badges'
import { SaddamIcon } from './ui'
import { Icon } from './icons'

/**
 * One trophy as a medal: struck gold for the brags, tarnished for the
 * ones nobody wants, sky for the odd ones, plain gray with a lock until
 * it's earned. A little number on the rim when it's been earned more
 * than once.
 */
export function Medal({ badge, size = 52 }: { badge: Badge; size?: number }) {
  const tone = !badge.earned ? 'medal-locked' : badge.kind === 'shame' ? 'medal-shame' : badge.kind === 'odd' ? 'medal-odd' : ''
  return (
    <span className="relative inline-flex">
      <span className={`medal ${tone}`} style={{ width: size, height: size }}>
        {!badge.earned ? (
          <Icon name="lock" size={Math.round(size * 0.34)} strokeWidth={2} />
        ) : badge.icon === 'saddam' ? (
          <SaddamIcon size={Math.round(size * 0.66)} />
        ) : badge.icon ? (
          <Icon name={badge.icon} size={Math.round(size * 0.42)} strokeWidth={2.1} />
        ) : (
          <span style={{ fontSize: badge.mark.length > 2 ? size * 0.24 : size * 0.3 }}>{badge.mark}</span>
        )}
      </span>
      {badge.earned && badge.count > 1 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-caption font-extrabold text-white ring-2 ring-paper tabular-nums">
          {badge.count}
        </span>
      )}
    </span>
  )
}

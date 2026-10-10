import { useState } from 'react'
import { courseBrand, type CourseBrand } from '../lib/courseBrands'
import CourseScene from './CourseScene'

// A course's logo on white, the way it sits at the top of a paper card.
// Logos come in every shape, so the height is fixed and the width follows:
// square marks stay square, wordmarks run wider. If the file fails to
// load, nothing shows: a broken-image icon is worse than no logo.
export function CourseLogo({
  brand,
  name,
  size = 44,
  className = '',
}: {
  brand: CourseBrand
  name: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!brand.logo || failed) return null
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg px-1.5 py-1 ring-1 ring-line ${className}`}
      style={{ height: size, minWidth: size, maxWidth: size * (brand.wide ? 6 : 2.6), backgroundColor: brand.dark ? brand.color : '#fff' }}
    >
      <img
        src={brand.logo}
        alt={`${name} logo`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-auto max-w-full object-contain"
      />
    </span>
  )
}

/** A course's square tile in a list: its logo when it has one that fits
 *  a square, its drawn scene when it doesn't. */
export function CourseTile({ name, className = '' }: { name: string; className?: string }) {
  const brand = courseBrand(name)
  const [failed, setFailed] = useState(false)
  if (!brand?.logo || brand.wide || failed) return <CourseScene course={name} className={className} />
  return (
    <span
      className={`grid place-items-center p-1 ring-1 ring-inset ring-line ${className}`}
      style={{ backgroundColor: brand.dark ? brand.color : '#fff' }}
    >
      <img
        src={brand.logo}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="max-h-full max-w-full object-contain"
      />
    </span>
  )
}

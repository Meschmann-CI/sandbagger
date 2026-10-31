import type { BagClub } from '../types'
import { clubShort, sortBag } from '../lib/bag'

// The bag as flight arcs (Matt, 2026-10-30, after an Arccos graphic): every
// club leaves one tee on the left and lands on a yardage line at the
// distance its owner typed, with the club and the number under the landing
// spot. Linear in yards, so the gaps and overlaps between clubs are the
// point of the picture. Wedges fly a little higher than woods, as they do.
// Same geometry as BagArcs in the Swift app's BagView.swift.

const W = 320
const GROUND = 96
const TEE_X = 10
const RIGHT = 306

/** Woods forest, hybrids sky, irons green, wedges gold: the app's own colours. */
function arcColor(code: string): string {
  if (code === 'D' || code.endsWith('W')) return '#1c4632'
  if (code.endsWith('H')) return '#2f6fa3'
  if (code.endsWith('I')) return '#1c7c4a'
  return '#b98a24'
}

export default function BagArcs({ bag }: { bag: BagClub[] }) {
  const swings = sortBag(bag).filter((c) => c.club !== 'P' && c.yards != null && c.yards > 0)
  if (swings.length < 2) return null
  const max = Math.max(...swings.map((c) => c.yards!))
  const x = (yards: number) => TEE_X + (yards / max) * (RIGHT - TEE_X)
  // Labels alternate between two rows so neighbours ten yards apart still read.
  const H = swings.length > 6 ? 150 : 128

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="How far each club goes">
      <line x1={TEE_X} y1={GROUND} x2={RIGHT + 4} y2={GROUND} stroke="#d6d3c6" strokeWidth="1" />
      {swings.map((c, i) => {
        const xl = x(c.yards!)
        // Apex: 38% of the way up for the longest club, up to 68% for the shortest,
        // peaking late and dropping steeply, the way a ball flies.
        const apex = GROUND * (0.38 + 0.3 * (1 - c.yards! / max))
        const dx = xl - TEE_X
        const color = arcColor(c.club)
        const second = swings.length > 6 && i % 2 === 1
        const ty = GROUND + (second ? 34 : 14)
        return (
          <g key={c.id}>
            <path d={`M ${TEE_X} ${GROUND} C ${TEE_X + 0.42 * dx} ${GROUND - 1.25 * apex} ${TEE_X + 0.84 * dx} ${GROUND - 1.05 * apex} ${xl} ${GROUND}`} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
            <circle cx={xl} cy={GROUND} r="3" fill="#ffffff" stroke={color} strokeWidth="1.6" />
            {second && <line x1={xl} y1={GROUND + 4} x2={xl} y2={ty - 10} stroke="#d6d3c6" strokeWidth="1" />}
            <text x={xl} y={ty} textAnchor="middle" fontSize="9" fontWeight="700" fill={color}>
              {clubShort(c.club)}
            </text>
            <text x={xl} y={ty + 10} textAnchor="middle" fontSize="9" fontWeight="600" fill="#4a554d" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {c.yards}
            </text>
          </g>
        )
      })}
      <circle cx={TEE_X} cy={GROUND} r="2.5" fill="#182019" />
    </svg>
  )
}

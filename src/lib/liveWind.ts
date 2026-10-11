import { useEffect, useState } from 'react'
import type { LngLat } from './courseMap'

// The wind right now at the course, for the arrow on the hole map. Open-
// Meteo again (free, no key): current speed, direction and gusts at the
// green. Asked for while a round is open and on screen, every ten
// minutes, since wind is the one bit of weather that changes your club.

export interface Wind {
  mph: number
  gustMph: number
  /** Where it blows from, degrees clockwise from north (the way forecasts say it). */
  fromDeg: number
}

const EVERY = 10 * 60_000
const memo = new Map<string, { at: number; wind: Wind | null }>()

async function fetchWind(at: LngLat): Promise<Wind | null> {
  const q = new URLSearchParams({
    latitude: at[1].toFixed(3),
    longitude: at[0].toFixed(3),
    current: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'mph',
  })
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`)
  if (!r.ok) return null
  const j = (await r.json()) as { current?: { wind_speed_10m?: number; wind_direction_10m?: number; wind_gusts_10m?: number } }
  const c = j.current
  if (c?.wind_speed_10m == null || c.wind_direction_10m == null) return null
  return { mph: Math.round(c.wind_speed_10m), gustMph: Math.round(c.wind_gusts_10m ?? c.wind_speed_10m), fromDeg: c.wind_direction_10m }
}

/** The current wind at `at`, or null (no place, offline, or not asked for). */
export function useLiveWind(at: LngLat | null): Wind | null {
  const key = at ? `${at[0].toFixed(2)},${at[1].toFixed(2)}` : null
  const [wind, setWind] = useState<Wind | null>(() => (key ? (memo.get(key)?.wind ?? null) : null))
  useEffect(() => {
    if (!key || !at) return
    let live = true
    const load = async () => {
      if (document.visibilityState !== 'visible') return
      const hit = memo.get(key)
      if (hit && Date.now() - hit.at < EVERY) {
        setWind(hit.wind)
        return
      }
      try {
        const w = await fetchWind(at)
        memo.set(key, { at: Date.now(), wind: w })
        if (live) setWind(w)
      } catch {
        // Offline on the course: the arrow just isn't there.
      }
    }
    void load()
    const id = setInterval(load, EVERY)
    document.addEventListener('visibilitychange', load)
    return () => {
      live = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', load)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return wind
}

/**
 * The wind as it plays on a hole facing `holeBearing` (degrees clockwise
 * from north, tee to green): which way the arrow points on a map drawn
 * tee-at-the-bottom, and the words a golfer would use.
 */
export function windOnHole(wind: Wind, holeBearing: number): { arrowDeg: number; words: string } {
  const toward = (wind.fromDeg + 180) % 360
  // Relative to "up the hole": 0 is straight downwind, 180 straight into you.
  let d = toward - holeBearing
  d = ((((d + 180) % 360) + 360) % 360) - 180
  const a = Math.abs(d)
  const across = d > 0 ? 'left to right' : 'right to left'
  const words = a <= 30 ? 'helping' : a >= 150 ? 'into you' : a <= 60 ? `helping, ${across}` : a >= 120 ? `into you, ${across}` : across
  return { arrowDeg: d, words }
}

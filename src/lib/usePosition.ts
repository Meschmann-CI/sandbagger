import { useEffect, useState } from 'react'
import type { LngLat } from './courseMap'

// Where this phone is, for distances. Only while it's wanted and the app
// is on screen: watching the GPS with the app in a pocket costs battery
// for nothing (and iOS pauses a web app's location then anyway).

export interface Position {
  at: LngLat | null
  /** Metres either way, as the phone reports it. */
  accuracy: number | null
  error: string | null
}

const KEY = 'bandit-distances-on'

/** Whether this golfer turned distances on. Remembered on the phone, so the prompt comes once. */
export function distancesWanted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
export function setDistancesWanted(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // Not remembered; it asks again next time.
  }
}

export function usePosition(on: boolean): Position {
  const [pos, setPos] = useState<Position>({ at: null, accuracy: null, error: null })
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    if (!on || !visible) return
    if (!('geolocation' in navigator)) {
      setPos((p) => ({ ...p, error: 'This phone won’t share its location with the app.' }))
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ at: [p.coords.longitude, p.coords.latitude], accuracy: p.coords.accuracy, error: null }),
      (err) =>
        setPos((p) => ({
          ...p,
          error: err.code === err.PERMISSION_DENIED ? 'Location is off for Bandit. Turn it on in Settings to get distances.' : 'Can’t get a GPS fix right now.',
        })),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [on, visible])

  return pos
}

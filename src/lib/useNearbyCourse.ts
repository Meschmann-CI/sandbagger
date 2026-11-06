import { useEffect, useMemo, useState } from 'react'
import type { AppData } from '../types'
import { cachedCourseMap, loadCourseMap, type LngLat } from './courseMap'
import { distancesWanted, usePosition } from './usePosition'
import { nearestCourse, spotFrom, type CourseSpot, type NearbyCourse } from './suggest'

// The course this phone is standing at, for the Log sheet to pick on its
// own (Matt, 2026-11-06). Only courses with a hole map can be found,
// and only while `on`: the GPS runs while the sheet's first step is up.
// It never asks iOS for location itself: it waits for a golfer who turned
// distances on, or whose phone already allows the app its location.

/** Each course's hole centres, once read; null once it's known the course has no map. */
const spots = new Map<string, LngLat[] | null>()
const asked = new Set<string>()

/** Whether the app may read the GPS without a prompt: distances were turned on, or iOS already allows it. */
function useGeoAllowed(): boolean {
  const [allowed, setAllowed] = useState(distancesWanted)
  useEffect(() => {
    if (allowed || typeof navigator === 'undefined' || !navigator.permissions?.query) return
    let live = true
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((s) => {
        if (live && s.state === 'granted') setAllowed(true)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [allowed])
  return allowed
}

export function useNearbyCourse(data: AppData, on: boolean): NearbyCourse | null {
  const allowed = useGeoAllowed()
  const pos = usePosition(on && allowed)
  const at = pos.at
  const [loaded, setLoaded] = useState(0)

  // The group's copy of each map this phone doesn't have, once a fix is
  // in: one fetch per course per session, and only when there's a
  // position to compare it to. The phone's own copies are read below.
  useEffect(() => {
    if (!on || !at) return
    let live = true
    for (const c of data.courses) {
      if (spots.has(c.id) || asked.has(c.id) || cachedCourseMap(c.id)) continue
      asked.add(c.id)
      void loadCourseMap(c.id).then((m) => {
        spots.set(c.id, m ? spotFrom(m) : null)
        if (live) setLoaded((n) => n + 1)
      })
    }
    return () => {
      live = false
    }
  }, [on, at, data.courses])

  return useMemo(() => {
    if (!at) return null
    const candidates: CourseSpot[] = []
    for (const c of data.courses) {
      let points = spots.get(c.id)
      if (points === undefined) {
        const map = cachedCourseMap(c.id)
        if (map) spots.set(c.id, (points = spotFrom(map)))
      }
      if (points?.length) candidates.push({ course: c, points })
    }
    return nearestCourse(at, candidates)
    // `loaded` counts maps that arrived after the fix, so the answer is worked out again then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, data.courses, loaded])
}

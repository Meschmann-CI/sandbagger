import { useEffect, useState } from 'react'
import { cachedCourseMap, loadCourseMap, type CourseMap } from './courseMap'

/**
 * A course's hole map: this phone's copy at once, then the group's if it
 * changed. Undefined while there's nothing yet; null once it's known
 * there's no map.
 */
export function useCourseMap(courseId: string | undefined): { map: CourseMap | null | undefined; reload: () => void } {
  const [map, setMap] = useState<CourseMap | null | undefined>(() => (courseId ? (cachedCourseMap(courseId) ?? undefined) : null))
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!courseId) {
      setMap(null)
      return
    }
    let live = true
    const cached = cachedCourseMap(courseId)
    if (cached) setMap(cached)
    loadCourseMap(courseId).then((m) => live && setMap(m))
    return () => {
      live = false
    }
  }, [courseId, n])
  return { map, reload: () => setN((x) => x + 1) }
}

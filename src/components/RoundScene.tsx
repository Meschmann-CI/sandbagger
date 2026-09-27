import { useStore } from '../data/store'
import type { Round } from '../types'
import { useRoundWeather } from '../lib/weather'
import CourseScene, { lightFor } from './CourseScene'

/**
 * A round's picture when it has no photo: its course, in the round's own
 * light, painted with the weather that day once it's known. The same
 * picture on every list and on the round page, so it can grow from one
 * into the other.
 */
export default function RoundScene({ round, className = 'h-full w-full' }: { round: Round; className?: string }) {
  const { data } = useStore()
  const weather = useRoundWeather(data, round)
  return <CourseScene course={round.courseName} light={lightFor(round.id)} weather={weather} className={className} />
}

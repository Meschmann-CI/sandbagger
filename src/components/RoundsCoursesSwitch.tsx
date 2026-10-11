import { useLocation } from 'react-router-dom'
import { useNavigate } from '../lib/nav'
import { Segmented } from './ui'

// Rounds and courses share a tab: every round is at a course, and each
// course lists its rounds. One switch at the top of both pages moves
// between them, replacing the page rather than stacking it, so Back
// still leaves the tab.
export function RoundsCoursesSwitch() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const on = pathname.startsWith('/courses') ? 'courses' : 'rounds'
  return (
    <Segmented
      label="Rounds or courses"
      options={[
        ['rounds', 'Rounds'],
        ['courses', 'Courses'],
      ]}
      value={on}
      onChange={(v) => navigate(`/${v}`, { replace: true })}
    />
  )
}

import { useLocation } from 'react-router-dom'
import { useNavigate } from '../lib/nav'

// Rounds and courses share a tab: every round is at a course, and each
// course lists its rounds. One switch at the top of both pages moves
// between them, replacing the page rather than stacking it, so Back
// still leaves the tab.
export function RoundsCoursesSwitch() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const on = pathname.startsWith('/courses') ? 'courses' : 'rounds'
  return (
    <div role="tablist" aria-label="Rounds or courses" className="flex overflow-hidden rounded-xl border border-line-strong">
      {(['rounds', 'courses'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={on === v}
          onClick={() => on !== v && navigate(`/${v}`, { replace: true })}
          className={`flex-1 py-2.5 text-footnote font-bold capitalize ${on === v ? 'bg-forest text-on-forest' : 'bg-card text-ink-dim'}`}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

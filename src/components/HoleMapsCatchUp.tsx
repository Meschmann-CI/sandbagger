import { useEffect, useState, useSyncExternalStore } from 'react'
import { useStore } from '../data/store'
import { coursesWithMaps } from '../lib/courseMap'
import { mapJobState, onMapJobChange, queueMaps, skippedMaps } from '../lib/mapJobs'
import { IconTile } from './icons'
import { Card } from './ui'

// Getting every course's hole map in one go. The run itself lives in
// lib/mapJobs, outside this card, so it carries on while you're on
// another screen and this card picks its progress back up when you
// return. OpenStreetMap asks for one search a second, so it's slow on
// purpose; courses it can't map are remembered and not tried again here
// (each course's own map page can still try).

export function HoleMapsCatchUp() {
  const { data } = useStore()
  const job = useSyncExternalStore(onMapJobChange, mapJobState)
  const [have, setHave] = useState<Set<string> | null>(null)

  useEffect(() => {
    let live = true
    coursesWithMaps(data.courses.map((c) => c.id)).then((s) => live && setHave(s))
    return () => {
      live = false
    }
  }, [data.courses])

  if (!have) return null
  const mapped = new Set([...have, ...job.done])
  const skipped = new Set(skippedMaps(data.group.id))
  const missing = data.courses.filter((c) => !mapped.has(c.id))
  const todo = missing.filter((c) => !skipped.has(c.id))
  if (missing.length === 0 && !job.running) return null

  const report = !job.running
    ? [
        job.added.length > 0 && `Mapped ${job.added.length}.`,
        job.missed.length > 0 && `No usable map for ${job.missed.join(', ')}.`,
        job.busy.length > 0 && `OpenStreetMap was too busy for ${job.busy.join(', ')}. Tap again later for ${job.busy.length === 1 ? 'it' : 'those'}.`,
      ]
        .filter(Boolean)
        .join(' ')
    : null

  return (
    <div className="mt-3">
      <Card className="flex items-center gap-3 px-4 py-3.5">
        <IconTile name="pin" tone="sky" size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold text-ink">Hole maps</p>
          <p className="text-footnote text-ink-dim">
            {job.running
              ? `${job.at} of ${job.of}: ${job.current ?? '…'}`
              : todo.length > 0
                ? `${mapped.size} of ${data.courses.length} courses mapped. ${todo.length} to try.`
                : `${mapped.size} of ${data.courses.length} courses mapped. OpenStreetMap doesn't have the rest.`}
          </p>
        </div>
        {(todo.length > 0 || job.running) && (
          <button
            type="button"
            onClick={() => queueMaps(todo)}
            disabled={job.running}
            className="shrink-0 rounded-xl bg-green px-4 py-2 text-footnote font-bold text-white active:scale-95 transition disabled:opacity-50"
          >
            {job.running ? 'Mapping' : 'Get them'}
          </button>
        )}
      </Card>
      {report && <p className="mt-2 px-1 text-footnote text-ink-dim">{report}</p>}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useStore } from '../data/store'
import { coursesWithMaps, fetchCourseMap, saveCourseMap } from '../lib/courseMap'
import { IconTile } from './icons'
import { Card } from './ui'

// Getting every course's hole map in one go. OpenStreetMap has no daily
// cap like the course directory, but it asks for one search a second, so
// this walks the list slowly. Courses it can't map (not traced, or holes
// that don't match the card) are remembered on this phone and not tried
// again; each course's own map page can still try.

export function HoleMapsCatchUp() {
  const { data } = useStore()
  const skippedKey = `bandit-maps-skipped:v1:${data.group.id}`
  const [skipped, setSkipped] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(skippedKey) ?? '[]')
    } catch {
      return []
    }
  })
  const [have, setHave] = useState<Set<string> | null>(null)
  const [running, setRunning] = useState<{ at: number; of: number; name: string } | null>(null)
  const [report, setReport] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    coursesWithMaps(data.courses.map((c) => c.id)).then((s) => live && setHave(s))
    return () => {
      live = false
    }
  }, [data.courses])

  if (!have) return null
  const missing = data.courses.filter((c) => !have.has(c.id))
  const todo = missing.filter((c) => !skipped.includes(c.id))
  if (missing.length === 0) return null

  const run = async () => {
    const added: string[] = []
    const missed: string[] = []
    // A busy map server isn't the course's fault: those are left to try
    // again, and the run carries on after a breather.
    const busy: string[] = []
    const done = new Set(have)
    for (let i = 0; i < todo.length; i++) {
      const c = todo[i]
      setRunning({ at: i + 1, of: todo.length, name: c.name })
      try {
        const r = await fetchCourseMap(c)
        if (r.map) {
          await saveCourseMap(c, r.map, false)
          added.push(c.name)
          done.add(c.id)
          setHave(new Set(done))
        } else {
          missed.push(c.name)
          setSkipped((s) => {
            const next = [...s, c.id]
            try {
              localStorage.setItem(skippedKey, JSON.stringify(next))
            } catch {
              // Not remembered; it's tried again next time.
            }
            return next
          })
        }
      } catch {
        busy.push(c.name)
        await new Promise((r) => setTimeout(r, 15000))
      }
      await new Promise((r) => setTimeout(r, 1200))
    }
    setRunning(null)
    setReport(
      [
        added.length > 0 && `Mapped ${added.length}.`,
        missed.length > 0 && `No usable map for ${missed.join(', ')}.`,
        busy.length > 0 && `OpenStreetMap was too busy for ${busy.join(', ')}. Tap again later for ${busy.length === 1 ? 'it' : 'those'}.`,
      ]
        .filter(Boolean)
        .join(' '),
    )
  }

  const mapped = data.courses.length - missing.length
  return (
    <div className="mt-3">
      <Card className="flex items-center gap-3 px-4 py-3.5">
        <IconTile name="pin" tone="sky" size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold text-ink">Hole maps</p>
          <p className="text-footnote text-ink-dim">
            {running
              ? `${running.at} of ${running.of}: ${running.name}…`
              : todo.length > 0
                ? `${mapped} of ${data.courses.length} courses mapped. ${todo.length} to try.`
                : `${mapped} of ${data.courses.length} courses mapped. OpenStreetMap doesn't have the rest.`}
          </p>
        </div>
        {todo.length > 0 && (
          <button
            type="button"
            onClick={() => void run()}
            disabled={!!running}
            className="shrink-0 rounded-xl bg-green px-4 py-2 text-footnote font-bold text-white active:scale-95 transition disabled:opacity-50"
          >
            {running ? 'Mapping' : 'Get them'}
          </button>
        )}
      </Card>
      {report && <p className="mt-2 px-1 text-footnote text-ink-dim">{report}</p>}
    </div>
  )
}

import { useState } from 'react'
import { useStore } from '../data/store'
import { hasPars } from '../lib/courses'
import { directorySupported, fetchDirectoryCourse, mergeTees, pickMatch, searchDirectory } from '../lib/courseLookup'
import { IconTile } from './icons'
import { Card } from './ui'

// Catching the group's courses up to every tee's hole-by-hole yards, a
// batch at a time. The directory's free plan is 35 requests a day for the
// whole group and each course takes two (a search, then the card), so a
// tap does sixteen. Courses the directory can't match plainly, or has no
// yards for, are remembered on this phone and not searched again; they
// can still be pulled in by hand from the course's Edit card.

const BATCH = 16

export function TeeYardsCatchUp() {
  const { data, saveCourse } = useStore()
  // Versioned: when the matcher improves, everything it gave up on gets
  // one more try.
  const skippedKey = `sandbagger-tee-yards-skipped:v2:${data.group.id}`
  const [skipped, setSkipped] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(skippedKey) ?? '[]')
    } catch {
      return []
    }
  })
  const [running, setRunning] = useState<{ at: number; of: number } | null>(null)
  const [report, setReport] = useState<string | null>(null)

  const hasTeeYards = (c: (typeof data.courses)[number]) => !!c.tees?.some((t) => t.holeYards?.some((y) => y != null))
  const missing = data.courses.filter((c) => !hasTeeYards(c))
  const todo = missing.filter((c) => !skipped.includes(c.slug))
  if (!directorySupported() || missing.length === 0) return null

  const run = async () => {
    const batch = todo.slice(0, BATCH)
    const updated: string[] = []
    const unclear: string[] = []
    const noYards: string[] = []
    let stoppedBy: string | null = null
    const skip = (slug: string) => {
      setSkipped((s) => {
        const next = [...s, slug]
        try {
          localStorage.setItem(skippedKey, JSON.stringify(next))
        } catch {
          // Storage refused: it'll just be searched again next time.
        }
        return next
      })
    }
    for (let i = 0; i < batch.length; i++) {
      const c = batch[i]
      setRunning({ at: i + 1, of: batch.length })
      try {
        const match = pickMatch(c.name, c.town, (await searchDirectory(c.name)).results)
        if (!match) {
          unclear.push(c.name)
          skip(c.slug)
          continue
        }
        const dc = await fetchDirectoryCourse(match.id)
        if (!dc.tees.some((t) => t.holeYards?.some((y) => y != null))) {
          noYards.push(c.name)
          skip(c.slug)
          continue
        }
        // The group's own pars, index and default rating stay; the
        // directory fills only what's missing, and brings its tees.
        saveCourse(
          c.name,
          hasPars(c) || !dc.hasCard ? c.pars : dc.pars,
          c.strokeIndex ?? (dc.hasCard ? dc.strokeIndex : undefined),
          undefined,
          {
            tees: mergeTees(c.tees, dc.tees),
            yards: c.yards ?? (dc.hasCard ? dc.yards : undefined),
            yardsTee: c.yards ? c.yardsTee : (dc.yardsTee ?? undefined),
            town: c.town ?? dc.town ?? undefined,
          },
        )
        updated.push(c.name)
      } catch (err) {
        stoppedBy = (err as Error).message
        break
      }
    }
    setRunning(null)
    setReport(
      [
        updated.length > 0 && `Updated ${updated.length}.`,
        unclear.length > 0 && `Couldn't tell which directory course is ${unclear.join(', ')}; pull ${unclear.length === 1 ? 'it' : 'them'} in from Edit card.`,
        noYards.length > 0 && `The directory has no hole yards for ${noYards.join(', ')}.`,
        stoppedBy && `Stopped: ${stoppedBy}`,
      ]
        .filter(Boolean)
        .join(' '),
    )
  }

  const have = data.courses.length - missing.length
  return (
    <div className="mt-6">
      <Card className="flex items-center gap-3 px-4 py-3.5">
        <IconTile name="flag" tone="green" size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold text-ink">Every tee's yardage</p>
          <p className="text-footnote text-ink-dim">
            {running
              ? `Pulling ${running.at} of ${running.of}…`
              : todo.length > 0
                ? `${have} of ${data.courses.length} courses have it. ${todo.length} to pull, ${BATCH} a day.`
                : `${have} of ${data.courses.length} courses have it. The rest need pulling in by hand.`}
          </p>
        </div>
        {todo.length > 0 && (
          <button
            type="button"
            onClick={() => void run()}
            disabled={!!running}
            className="shrink-0 rounded-xl bg-green px-4 py-2 text-footnote font-bold text-white active:scale-95 transition disabled:opacity-50"
          >
            {running ? 'Pulling' : 'Pull'}
          </button>
        )}
      </Card>
      {report && <p className="mt-2 px-1 text-footnote text-ink-dim">{report}</p>}
    </div>
  )
}

// Turns a course data file into SQL that loads it into a group's
// courses table, without trampling anything entered by hand.
//
//   node scripts/import-courses.mjs data/courses/nyc_public_golf_courses.json <group-uuid> > /tmp/courses.sql
//
// Then run the SQL against the project (Supabase SQL editor, or the MCP
// execute_sql tool). Safe to re-run: it upserts on (group_id, slug).
//
// Merge rules, per course:
//   - pars / stroke index: kept if the row already has all 18, else filled.
//   - rating / slope (the default tee): kept if set, else the men's White
//     tee, else the men's tee nearest 6,100 yards — about what a mixed
//     foursome plays.
//   - tees / town: always written; the file is the better source.
//   - nine-hole courses are skipped: the app scores eighteen.
//
// Expected record shape (what the NYC scrape produced):
//   { name, town, holes, par: number[18], hcp: number[18],
//     tees: [{ tee, gender, yards, rating, slope }] }

import { readFileSync } from 'node:fs'

const [, , file, groupId] = process.argv
if (!file || !groupId) {
  console.error('usage: node scripts/import-courses.mjs <file.json> <group-uuid>')
  process.exit(1)
}

// Same normalisation as courseSlug() in src/lib/courses.ts.
const slug = (name) => name.trim().toLowerCase().replace(/\s+/g, ' ')
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const arr = (xs) => `'{${xs.join(',')}}'::smallint[]`

const courses = JSON.parse(readFileSync(file, 'utf8'))
const lines = []
const skipped = []

for (const c of courses) {
  if (c.holes !== 18 || c.par?.length !== 18 || c.hcp?.length !== 18) {
    skipped.push(`${c.name} (${c.holes} holes)`)
    continue
  }
  const mens = c.tees.filter((t) => (t.gender ?? 'M') === 'M' && t.rating && t.slope)
  const byWhite = mens.find((t) => /^white/i.test(t.tee))
  const nearest = [...mens].sort((a, b) => Math.abs(a.yards - 6100) - Math.abs(b.yards - 6100))[0]
  const def = byWhite ?? nearest
  // Men's sets only. The app never plays strokes off a women's set for
  // this group, and the JSON is a third the size without them.
  const tees = c.tees
    .filter((t) => (t.gender ?? 'M') === 'M')
    .map((t) => ({ name: t.tee, yards: t.yards ?? undefined, rating: t.rating, slope: t.slope }))

  // Per-hole yards come for one tee set in the file; keep whichever the
  // row already has, since nobody re-measures a course.
  const yards = Array.isArray(c.yards) && c.yards.length === 18 ? arr(c.yards) : 'null'
  const yardsTee = c.yards_tee ? q(c.yards_tee) : 'null'

  lines.push(`insert into courses (group_id, name, slug, pars, stroke_index, rating, slope, tees, town, yards, yards_tee)
values (${q(groupId)}, ${q(c.name)}, ${q(slug(c.name))}, ${arr(c.par)}, ${arr(c.hcp)}, ${def ? def.rating : 'null'}, ${def ? def.slope : 'null'}, ${q(JSON.stringify(tees))}::jsonb, ${q(c.town)}, ${yards}, ${yardsTee})
on conflict (group_id, slug) do update set
  pars = case when (select count(*) from unnest(courses.pars) p where p is not null) = 18 then courses.pars else excluded.pars end,
  stroke_index = case when (select count(*) from unnest(courses.stroke_index) s where s is not null) = 18 then courses.stroke_index else excluded.stroke_index end,
  rating = coalesce(courses.rating, excluded.rating),
  slope = coalesce(courses.slope, excluded.slope),
  tees = excluded.tees,
  town = excluded.town,
  yards = coalesce(courses.yards, excluded.yards),
  yards_tee = coalesce(courses.yards_tee, excluded.yards_tee);`)
}

process.stdout.write(lines.join('\n\n') + '\n')
console.error(`${lines.length} courses; skipped ${skipped.length}: ${skipped.join(', ') || 'none'}`)

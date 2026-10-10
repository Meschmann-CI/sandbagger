// Builds src/lib/trophyArt.ts from the Claude Design trophy handoff.
// Usage, from the repo root: node scripts/make-trophy-art.mjs ../design/sandbagger-trophies .
import fs from 'node:fs'
import path from 'node:path'

const [handoff, app] = process.argv.slice(2)
const js = fs.readFileSync(path.join(handoff, 'sandbagger-badges.js'), 'utf8')
const trophies = JSON.parse(fs.readFileSync(path.join(handoff, 'trophies.json'), 'utf8'))
const badgesTs = fs.readFileSync(path.join(app, 'src/lib/badges.ts'), 'utf8')

// The constant blocks, copied as they are (plain object literals).
const block = (name, next) => {
  const i = js.indexOf(`export const ${name} =`)
  const j = js.indexOf(next, i)
  if (i < 0 || j < 0) throw new Error('block ' + name)
  return js.slice(i, j).trimEnd()
}
const shapes = block('SHAPES', 'const SILVER')
const silverAndColors = block('COLORS', '// 24x24').replace('export const COLORS =', 'export const COLORS: Record<ArtShelf | \'locked\', ArtColors> =')
const silver = js.slice(js.indexOf('const SILVER'), js.indexOf('export const COLORS')).trimEnd()
const icons = block('ICONS', 'let uid')

// The app's trophy keys, matched to the design's by name.
const appTrophies = []
const re = /key:\s*'([^']+)',\s*\n?\s*kind:\s*'(\w+)',\s*\n?\s*label:\s*(?:(['"`])(.*?)\3|saddam \?)/g
let m
while ((m = re.exec(badgesTs))) appTrophies.push({ key: m[1], label: m[4] || 'The Saddam' })
const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, '')
const byName = new Map(appTrophies.map((a) => [norm(a.label), a.key]))
byName.set(norm('Road Trip'), 'trip')

const art = trophies.map((t) => {
  const key = byName.get(norm(t.name))
  if (!key) throw new Error('no app key for ' + t.name)
  const spec = { shelf: t.shelf }
  if (t.num) spec.num = t.num
  if (t.sub) spec.sub = t.sub
  if (!t.num && t.icon) spec.icon = t.icon
  const props = Object.entries(spec).map(([k, v]) => `${k}: '${v}'`).join(', ')
  return `  ${/^[a-z]\w*$/i.test(key) ? key : `'${key}'`}: { ${props} },`
})

const out = `// Trophy artwork, from the Claude Design handoff (design/sandbagger-trophies
// beside the repo; regenerate with scripts/make-trophy-art.mjs rather
// than editing by hand). Six shelves, six shapes: a rosette for the
// legendary one, a crest for the brags, a ball for the group ones, a
// diamond for the odd ones, a locker plate for the locker room and a divot
// for the ones nobody wants. Every face has the dimple texture and a soft
// sheen; locked ones are pencil gray in the same shape.

export type ArtShelf = 'legend' | 'brag' | 'group' | 'odd' | 'locker' | 'nobody'
export interface ArtColors {
  rim1: string
  rim2: string
  rim3: string
  face1: string
  face2: string
  glyph: string
}
export interface TrophyArt {
  shelf: ArtShelf
  /** A key in ICONS, unless the trophy shows a numeral. */
  icon?: string
  /** The numeral on the face, which wins over an icon. */
  num?: string
  /** The small caps line above the numeral. */
  sub?: string
}

${shapes.replace('export const SHAPES =', 'export const SHAPES: Record<ArtShelf, string> =')}

${silver}
${silverAndColors}

// 24x24 stroke icons (round caps and joins, stroke 2.1).
${icons.replace('export const ICONS =', 'export const ICONS: Record<string, string> =')}

/** Each trophy's artwork, keyed by the app's trophy key (lib/badges.ts). */
export const TROPHY_ART: Record<string, TrophyArt> = {
${art.join('\n')}
}
`
// The repo's style: no semicolons.
fs.writeFileSync(path.join(app, 'src/lib/trophyArt.ts'), out.replace(/;\n/g, '\n'))
console.log('wrote', trophies.length, 'trophies')

import { supabase } from './supabase'
import type { Course } from '../types'

// Hole maps: each course's holes as drawn shapes, for the drawing on the
// Hole view and the distances on it.
//
// The shapes come from OpenStreetMap, where volunteers have traced most
// of the group's courses hole by hole: greens, fairways, bunkers, tees,
// water, trees, and a line per hole from tee to green. The app pulls a
// course once (Nominatim finds it, Overpass hands over everything inside
// it), keeps only what the drawing needs, and stores it in course_maps.
// Rounds then read the stored copy, saved on the phone too, so nothing
// on the course depends on OpenStreetMap being up (it often isn't) or on
// there being signal.

/** [longitude, latitude], rounded to 6 places (about 10cm). */
export type LngLat = [number, number]

/** f fairway, g green, b bunker, t tee, w water, r trees. */
export type FeatureKind = 'f' | 'g' | 'b' | 't' | 'w' | 'r'

export interface MapFeature {
  k: FeatureKind
  p: LngLat[]
}

export interface MapHole {
  /** 1-18, or 1-9 within its nine on a 27-hole course. */
  n: number
  /** Which nine, on a 27-hole course: one of the course's nine names. */
  nine?: string
  par?: number
  /** Tee to green, with any dogleg bends. May be missing for a hole only its green is known for. */
  line?: LngLat[]
  /** The green's outline, when it's mapped. */
  green?: LngLat[]
  /** The middle of the green. */
  centre: LngLat
}

export interface CourseMap {
  source: 'osm'
  /** The OpenStreetMap element it came from, and its name there. */
  osm?: { type: string; id: number; name?: string }
  fetchedAt: string
  holes: MapHole[]
  features: MapFeature[]
  /** Greens someone marked by standing on them, keyed "n" or "nine n". Wins over the map's own. */
  marked?: Record<string, LngLat>
}

// ---------- Geometry ----------

const R = 6371008.8
const rad = (d: number) => (d * Math.PI) / 180
export const YARDS_PER_METRE = 1.0936133

/** Metres between two points. */
export function metres(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}
export const yards = (a: LngLat, b: LngLat) => Math.round(metres(a, b) * YARDS_PER_METRE)

/** A flat metre grid around `origin`: good to a few centimetres across a golf hole. */
export function projector(origin: LngLat) {
  const kx = (Math.PI / 180) * R * Math.cos(rad(origin[1]))
  const ky = (Math.PI / 180) * R
  return {
    to: (p: LngLat): [number, number] => [(p[0] - origin[0]) * kx, (p[1] - origin[1]) * ky],
    from: (x: number, y: number): LngLat => [origin[0] + x / kx, origin[1] + y / ky],
  }
}

export function centroid(ring: LngLat[]): LngLat {
  let x = 0, y = 0
  for (const p of ring) { x += p[0]; y += p[1] }
  return [x / ring.length, y / ring.length]
}

function inRingXY(pt: [number, number], ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function inRing(pt: LngLat, ring: LngLat[]): boolean {
  const pr = projector(pt)
  return inRingXY([0, 0], ring.map(pr.to))
}

function segDist(p: [number, number], a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Metres from a point to the nearest part of a polyline. */
export function distToLine(pt: LngLat, line: LngLat[]): number {
  const pr = projector(pt)
  const xy = line.map(pr.to)
  if (xy.length === 1) return Math.hypot(xy[0][0], xy[0][1])
  let best = Infinity
  for (let i = 1; i < xy.length; i++) best = Math.min(best, segDist([0, 0], xy[i - 1], xy[i]))
  return best
}

// Douglas-Peucker on the metre grid: a bunker traced with 60 points
// draws the same with 12 at phone size, and the map stays small.
function simplify(ring: LngLat[], tol = 0.9): LngLat[] {
  if (ring.length <= 4) return ring
  const pr = projector(ring[0])
  const xy = ring.map(pr.to)
  const keep = new Uint8Array(ring.length)
  keep[0] = keep[ring.length - 1] = 1
  const stack: [number, number][] = [[0, ring.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let max = 0, at = -1
    for (let i = a + 1; i < b; i++) {
      const d = segDist(xy[i], xy[a], xy[b])
      if (d > max) { max = d; at = i }
    }
    if (max > tol && at > 0) {
      keep[at] = 1
      stack.push([a, at], [at, b])
    }
  }
  return ring.filter((_, i) => keep[i])
}

const round6 = (p: LngLat): LngLat => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6]
const tidy = (ring: LngLat[]) => {
  const open = ring.length > 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring
  return simplify(open).map(round6)
}

// ---------- Which hole, for a round ----------

/** The middle of a hole's green: marked by the group, else the map's. */
export function greenCentre(map: CourseMap, hole: MapHole): LngLat {
  return map.marked?.[holeKey(hole)] ?? hole.centre
}
export const holeKey = (h: Pick<MapHole, 'n' | 'nine'>) => (h.nine ? `${h.nine} ${h.n}` : String(h.n))

/**
 * The map's hole for hole index `i` (0-17) of a round. On a 27-hole
 * course the round's two nines say which nine each half comes from.
 */
export function mapHoleFor(map: CourseMap, i: number, nines?: [string, string] | null): MapHole | undefined {
  const nine = nines ? nines[i < 9 ? 0 : 1] : undefined
  const n = nines ? (i % 9) + 1 : i + 1
  const found = nine
    ? map.holes.find((h) => h.nine?.toLowerCase() === nine.toLowerCase() && h.n === n)
    : map.holes.find((h) => !h.nine && h.n === n)
  if (found) return found
  // A green the group marked by standing on it: distances, no drawing.
  const marked = map.marked?.[holeKey({ n, nine })]
  return marked ? { n, nine, centre: marked } : undefined
}

/** The key a round's hole `i` is marked under. */
export const markKey = (i: number, nines?: [string, string] | null) =>
  holeKey({ n: nines ? (i % 9) + 1 : i + 1, nine: nines ? nines[i < 9 ? 0 : 1] : undefined })

/** A map with nothing traced, for a course whose greens get marked as it's played. */
export const emptyCourseMap = (): CourseMap => ({ source: 'osm', fetchedAt: new Date().toISOString(), holes: [], features: [], marked: {} })

/** Whether there's a drawing for this hole, or only a green to measure to. */
export const drawable = (h: MapHole | undefined) => !!h && (!!h.line || !!h.green)

/** How far from the green you can be and still be "on this hole" for drawing and distances. */
export const ON_HOLE_METRES = 650

/** The tee end of a hole: its line's start, or a point short of the green when only the green is known. */
export function teeOf(map: CourseMap, hole: MapHole): LngLat {
  if (hole.line && hole.line.length >= 2) return hole.line[0]
  const c = greenCentre(map, hole)
  return [c[0], c[1] - 0.0015]
}

// ---------- Distances ----------

export interface GreenYards {
  front: number | null
  middle: number
  back: number | null
}

/** Front, middle and back of the green, along the line from `from` to its middle. */
export function greenYards(map: CourseMap, hole: MapHole, from: LngLat): GreenYards {
  const c = greenCentre(map, hole)
  const middle = yards(from, c)
  if (!hole.green || map.marked?.[holeKey(hole)]) return { front: null, middle, back: null }
  const pr = projector(from)
  const ring = hole.green.map(pr.to)
  const [cx, cy] = pr.to(c)
  const len = Math.hypot(cx, cy)
  if (len < 1) return { front: null, middle, back: null }
  const ux = cx / len, uy = cy / len
  let front: number | null = null, back: number | null = null
  // Walk the line through the green half a metre at a time.
  for (let d = Math.max(0, len - 80); d <= len + 80; d += 0.5) {
    if (inRingXY([ux * d, uy * d], ring)) {
      if (front == null) front = d
      back = d
    }
  }
  return {
    front: front != null ? Math.round(front * YARDS_PER_METRE) : null,
    middle,
    back: back != null ? Math.round(back * YARDS_PER_METRE) : null,
  }
}

export interface Hazard {
  kind: 'b' | 'w'
  /** Yards to reach it and to carry it, along the line to the green. */
  reach: number
  carry: number
  /** Where to put its label. */
  at: LngLat
}

/** Bunkers and water in play between `from` and the green: near the line, ahead of you, short of the green. */
export function hazardsInPlay(map: CourseMap, hole: MapHole, from: LngLat, corridor = 30): Hazard[] {
  const c = greenCentre(map, hole)
  const pr = projector(from)
  const [cx, cy] = pr.to(c)
  const len = Math.hypot(cx, cy)
  if (len < 30) return []
  const ux = cx / len, uy = cy / len
  const out: Hazard[] = []
  for (const f of map.features) {
    if (f.k !== 'b' && f.k !== 'w') continue
    let lo = Infinity, hi = -Infinity, near = false
    for (const p of f.p) {
      const [x, y] = pr.to(p)
      const along = x * ux + y * uy
      const off = Math.abs(-x * uy + y * ux)
      if (off <= corridor && along > 15 && along < len - 8) {
        near = true
        lo = Math.min(lo, along)
        hi = Math.max(hi, along)
      }
    }
    if (!near) continue
    // Greenside bunkers aren't a carry; the green's own numbers cover them.
    if (f.k === 'b' && hole.green && metres(centroid(f.p), c) < 30) continue
    out.push({ kind: f.k, reach: Math.round(lo * YARDS_PER_METRE), carry: Math.round(hi * YARDS_PER_METRE), at: centroid(f.p) })
  }
  return out.sort((a, b) => a.reach - b.reach).slice(0, 4)
}

// ---------- Pulling a course from OpenStreetMap ----------

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']

interface NominatimHit {
  osm_type: string
  osm_id: number
  category?: string
  class?: string
  type: string
  name?: string
  boundingbox: [string, string, string, string]
  geojson?: { type: string; coordinates: unknown }
}

async function nominatim(q: string): Promise<NominatimHit[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&polygon_geojson=1&polygon_threshold=0.00005&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`OpenStreetMap's search answered ${res.status}`)
  const hits = (await res.json()) as NominatimHit[]
  return hits.filter((h) => (h.category ?? h.class) === 'leisure' && h.type === 'golf_course')
}

interface OsmElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  geometry?: { lat: number; lon: number }[]
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[]
}

// Overpass is free and often overloaded: a busy server, or a few
// queries in a row from one phone, gets a refusal. Three passes over the
// servers, waiting longer each time, before giving up.
async function overpass(query: string): Promise<OsmElement[]> {
  let last = ''
  const order = [...OVERPASS, ...OVERPASS, ...OVERPASS]
  for (const [i, url] of order.entries()) {
    if (i > 0 && i % OVERPASS.length === 0) await new Promise((r) => setTimeout(r, i === OVERPASS.length ? 8000 : 20000))
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      })
      const text = await res.text()
      if (!res.ok || !text.trim().startsWith('{')) {
        last = `${res.status}`
        continue
      }
      return (JSON.parse(text) as { elements: OsmElement[] }).elements
    } catch (err) {
      last = (err as Error).message
    }
  }
  throw new Error(`OpenStreetMap's map server is busy (${last}). Try again in a few minutes.`)
}

const GENERIC = new Set(['the', 'golf', 'club', 'clubs', 'course', 'courses', 'country', 'links', 'park', 'state', 'resort', 'at', 'and', 'of', 'gc', 'cc'])
const words = (s: string) => s.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !GENERIC.has(w))

/**
 * Places this course might be, best guess first, found lazily: by name
 * and town, by name alone, then by the club's own words ("Bethpage golf"
 * finds the state park that holds Blue, Green, Red and Yellow; only
 * Black has an entry of its own). An outline comes before a lone pin.
 */
async function* candidates(course: Course): AsyncGenerator<NominatimHit> {
  const plain = course.name.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
  // "Cobbs Creek" alone finds the park and the creek before the golf club,
  // while "Bethpage Black golf" finds nothing. So both, name first.
  const golfy = /golf|country club|links/i.test(plain) ? plain : `${plain} golf`
  const key = words(plain)
  const where = course.town ? `, ${course.town}` : ''
  const tries = [
    `${course.name}${where}`,
    `${plain}${where}`,
    `${golfy}${where}`,
    where ? course.name : null,
    where ? golfy : null,
    key.length > 1 ? `${key.slice(0, 2).join(' ')} golf${where}` : null,
    key.length ? `${key[0]} golf${where}` : null,
    // A town can sink a search ("bethpage golf, Farmingdale, NY" finds
    // nothing; the park's address is elsewhere). The card check below
    // stops a same-named course in another state getting through.
    key.length > 1 ? `${key.slice(0, 2).join(' ')} golf course` : null,
    key.length ? `${key[0]} golf course` : null,
  ].filter((q, i, all): q is string => !!q && all.indexOf(q) === i)
  const seen = new Set<string>()
  const pins: NominatimHit[] = []
  for (const q of tries) {
    const hits = await nominatim(q)
    for (const h of hits) {
      const id = `${h.osm_type}/${h.osm_id}`
      if (seen.has(id)) continue
      seen.add(id)
      // Not worth a map download if it shares no word with ours.
      if (h.name && key.length && !words(h.name).some((w) => key.includes(w))) continue
      if (h.osm_type === 'node') pins.push(h)
      else yield h
    }
    await new Promise((r) => setTimeout(r, 1100)) // Nominatim asks for one request a second
  }
  yield* pins
}

const ring = (g?: { lat: number; lon: number }[]): LngLat[] => (g ?? []).map((p) => [p.lon, p.lat] as LngLat)

function outerRings(geojson: NominatimHit['geojson']): LngLat[][] {
  if (!geojson) return []
  if (geojson.type === 'Polygon') return [(geojson.coordinates as LngLat[][])[0]]
  if (geojson.type === 'MultiPolygon') return (geojson.coordinates as LngLat[][][]).map((p) => p[0])
  return []
}

const holeNumber = (ref?: string) => {
  const m = (ref ?? '').match(/(\d+)\s*$/)
  return m ? Number(m[1]) : null
}
// "Black - 4" names its course in the ref when golf:course:name is missing.
const refCourse = (ref?: string) => {
  const m = (ref ?? '').match(/^(.*?)[\s\-–:#]*\d+\s*$/)
  return m && m[1].trim() ? m[1].trim() : ''
}

export interface FetchResult {
  map?: CourseMap
  /** Why there's no map, in words for the course page. */
  problem?: string
}

/**
 * Pulls one of the group's courses from OpenStreetMap and turns it into
 * a CourseMap. Each place the search turns up is checked against the
 * course's own card (pars and hole lengths), and the next is tried when
 * it doesn't match: a same-named course in another state, or a facility
 * with two courses in one outline (Pelham Bay and Split Rock), can't
 * hand this one the wrong holes.
 */
export async function fetchCourseMap(course: Course): Promise<FetchResult> {
  let problem: string | undefined
  let tried = 0
  for await (const hit of candidates(course)) {
    const r = await mapFromHit(course, hit)
    if (r.map) return r
    problem ??= r.problem
    if (++tried >= 3) break
  }
  return { problem: problem ?? 'OpenStreetMap doesn’t have this course by that name.' }
}

/** Every yardage the card prints for round hole n (1-18) or a nine's hole, across its tees. */
function cardYards(course: Course, n: number, nine?: string): number[] {
  if (nine) {
    const ns = course.nines?.find((x) => x.name === nine)
    return (ns?.tees ?? []).map((t) => t.holeYards[n - 1]).filter((y): y is number => y != null)
  }
  const ys = [course.yards?.[n - 1], ...(course.tees ?? []).map((t) => t.holeYards?.[n - 1])]
  return ys.filter((y): y is number => y != null)
}

const lineYards = (line: LngLat[]) => line.slice(1).reduce((s, p, i) => s + metres(line[i], p), 0) * YARDS_PER_METRE

async function mapFromHit(course: Course, hit: NominatimHit): Promise<FetchResult> {
  const [s, n, w, e] = hit.boundingbox.map(Number)
  // About 150m round an outline; about 1.5km round a lone pin, with the
  // course names on the holes (or the par check) sorting out the rest.
  const pad = hit.osm_type === 'node' ? 0.014 : 0.0015
  const bbox = `${s - pad},${w - pad},${n + pad},${e + pad}`
  const els = await overpass(`[out:json][timeout:60];
(
  way["golf"](${bbox});
  relation["golf"](${bbox});
  node["golf"="pin"](${bbox});
  way["natural"="water"](${bbox});
  relation["natural"="water"](${bbox});
  way["natural"="wood"](${bbox});
  way["landuse"="forest"](${bbox});
);
out geom;`)

  // ---- The holes ----
  const outline = outerRings(hit.geojson)
  const insideCourse = (p: LngLat) => !outline.length || outline.some((r) => inRing(p, r))
  type Raw = { group: string; num: number; par?: number; line: LngLat[] }
  let raw: Raw[] = els
    .filter((el) => el.type === 'way' && el.tags?.golf === 'hole' && el.geometry && el.geometry.length >= 2)
    .map((el) => ({
      group: el.tags!['golf:course:name']?.trim() || refCourse(el.tags!.ref),
      num: holeNumber(el.tags!.ref) ?? 0,
      par: Number(el.tags!.par) || undefined,
      line: ring(el.geometry).map(round6),
    }))
    .filter((h) => h.num > 0)

  // Several courses in one place: keep the one(s) this course is.
  const groups = [...new Set(raw.map((h) => h.group))]
  const nineNames = (course.nines ?? []).map((x) => x.name.toLowerCase())
  if (groups.some(Boolean)) {
    const ours = words(course.name)
    const keep = groups.filter((g) => {
      const gl = g.toLowerCase()
      if (nineNames.length) return nineNames.some((x) => gl.includes(x) || x.includes(gl))
      const gw = words(g)
      return gw.length > 0 && gw.every((x) => ours.includes(x))
    })
    if (keep.length) raw = raw.filter((h) => keep.includes(h.group))
    else if (groups.length > 1) {
      // Names that don't say which: fall back to the outline below.
      raw = raw.filter((h) => insideCourse(h.line[Math.floor(h.line.length / 2)]))
    }
  } else {
    raw = raw.filter((h) => insideCourse(h.line[Math.floor(h.line.length / 2)]))
  }

  const greens = els.filter((el) => el.type === 'way' && el.tags?.golf === 'green' && el.geometry).map((el) => ring(el.geometry))
  const pins = els.filter((el) => el.type === 'node' && el.tags?.golf === 'pin' && el.lat != null).map((el) => [el.lon!, el.lat!] as LngLat)

  const holes: MapHole[] = []
  const seen = new Set<string>()
  for (const h of raw.sort((a, b) => a.num - b.num)) {
    const nine = nineNames.length ? (course.nines ?? []).find((x) => h.group.toLowerCase().includes(x.name.toLowerCase()))?.name : undefined
    const num = nine ? ((h.num - 1) % 9) + 1 : h.num
    const key = holeKey({ n: num, nine })
    if (seen.has(key) || (!nine && num > 18)) continue
    seen.add(key)
    const end = h.line[h.line.length - 1]
    const green = greens.find((g) => inRing(end, g)) ?? greens.filter((g) => metres(centroid(g), end) < 35).sort((a, b) => metres(centroid(a), end) - metres(centroid(b), end))[0]
    const pin = pins.find((p) => (green ? inRing(p, green) : metres(p, end) < 15))
    holes.push({
      n: num,
      nine,
      par: h.par,
      line: h.line,
      green: green ? tidy(green) : undefined,
      centre: round6(pin ?? (green ? centroid(green) : end)),
    })
  }

  if (holes.length === 0) {
    return { problem: greens.length ? 'OpenStreetMap has the greens here but not which hole is which.' : 'OpenStreetMap has the course outline but none of its holes.' }
  }

  // Do these holes play like our card? Each hole scores a point for a
  // matching par and one for a length near any tee's yardage on the card,
  // and loses one for each that's off. Pars alone can't tell Pelham Bay
  // from Split Rock (twelve of eighteen are the same); lengths can.
  const ourPar = (h: MapHole) => {
    if (h.nine) return course.nines?.find((x) => x.name === h.nine)?.pars[h.n - 1] ?? null
    return course.pars?.[h.n - 1] ?? null
  }
  let agree = 0, disagree = 0
  for (const h of holes) {
    let score = 0
    const par = ourPar(h)
    if (h.par != null && par != null) score += h.par === par ? 1 : -1
    const ys = cardYards(course, h.n, h.nine)
    if (h.line && ys.length) {
      const len = lineYards(h.line)
      score += ys.some((y) => Math.abs(y - len) <= Math.max(30, y * 0.12)) ? 1 : -1
    }
    if (score > 0) agree++
    else if (score < 0) disagree++
  }
  if (agree + disagree >= 6 && agree / (agree + disagree) < 0.8) {
    return { problem: `OpenStreetMap's holes here don't match your card (${agree} of ${agree + disagree} holes agree), so they're probably another course's.` }
  }

  // ---- The shapes around them ----
  const lines = holes.flatMap((h) => (h.line ? [h.line] : []))
  const nearHoles = (p: LngLat[]) => {
    const c = centroid(p)
    return lines.some((l) => distToLine(c, l) < 60)
  }
  const kindOf = (t: Record<string, string>): FeatureKind | null => {
    switch (t.golf) {
      case 'fairway': return 'f'
      case 'green': return 'g'
      case 'bunker': return 'b'
      case 'tee': return 't'
      case 'water_hazard':
      case 'lateral_water_hazard': return 'w'
    }
    if (t.natural === 'water') return 'w'
    if (t.natural === 'wood' || t.landuse === 'forest') return 'r'
    return null
  }
  const features: MapFeature[] = []
  for (const el of els) {
    const k = el.tags ? kindOf(el.tags) : null
    if (!k) continue
    const rings = el.type === 'way' ? [ring(el.geometry)] : (el.members ?? []).filter((m) => m.role === 'outer').map((m) => ring(m.geometry))
    for (const r of rings) {
      if (r.length < 3 || !nearHoles(r)) continue
      features.push({ k, p: tidy(r) })
    }
  }
  // Draw order: trees and water under the grass, sand on top.
  const order: FeatureKind[] = ['r', 'w', 'f', 't', 'g', 'b']
  features.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k))

  return {
    map: {
      source: 'osm',
      osm: { type: hit.osm_type, id: hit.osm_id, name: hit.name },
      fetchedAt: new Date().toISOString(),
      holes,
      features,
    },
  }
}

// ---------- Keeping it ----------
//
// The stored copy lives in course_maps (cloud) and in this phone's
// storage either way, so a round on the back nine draws with no signal.

// Stored packed: every point as whole decimetres east and north of one
// origin, each after the first as a step from the one before. A point
// costs about eight characters instead of twenty-two, which is what lets
// a phone keep a few dozen courses.
interface PackedHole {
  n: number
  nine?: string
  par?: number
  line?: number[]
  green?: number[]
  centre: number[]
}
interface PackedMap {
  v: 2
  o: LngLat
  source: 'osm'
  osm?: CourseMap['osm']
  fetchedAt: string
  holes: PackedHole[]
  f: [FeatureKind, number[]][]
  marked?: Record<string, LngLat>
}

function pack(map: CourseMap): PackedMap {
  const o = map.holes[0]?.centre ?? [0, 0]
  const pr = projector(o)
  const enc = (pts: LngLat[]) => {
    const out: number[] = []
    let px = 0, py = 0
    for (const p of pts) {
      const [x, y] = pr.to(p)
      const ix = Math.round(x * 10), iy = Math.round(y * 10)
      out.push(ix - px, iy - py)
      px = ix
      py = iy
    }
    return out
  }
  return {
    v: 2,
    o,
    source: map.source,
    osm: map.osm,
    fetchedAt: map.fetchedAt,
    holes: map.holes.map((h) => ({ n: h.n, nine: h.nine, par: h.par, line: h.line && enc(h.line), green: h.green && enc(h.green), centre: enc([h.centre]) })),
    f: map.features.map((x) => [x.k, enc(x.p)]),
    marked: map.marked,
  }
}

function unpack(raw: CourseMap | PackedMap): CourseMap {
  if ((raw as PackedMap).v !== 2) return raw as CourseMap
  const m = raw as PackedMap
  const pr = projector(m.o)
  const dec = (d: number[]): LngLat[] => {
    const out: LngLat[] = []
    let x = 0, y = 0
    for (let i = 0; i + 1 < d.length; i += 2) {
      x += d[i]
      y += d[i + 1]
      out.push(round6(pr.from(x / 10, y / 10)))
    }
    return out
  }
  return {
    source: m.source,
    osm: m.osm,
    fetchedAt: m.fetchedAt,
    holes: m.holes.map((h) => ({ n: h.n, nine: h.nine, par: h.par, line: h.line && dec(h.line), green: h.green && dec(h.green), centre: dec(h.centre)[0] })),
    features: m.f.map(([k, d]) => ({ k, p: dec(d) })),
    marked: m.marked,
  }
}

const LOCAL = (courseId: string) => `bandit-map-${courseId}`
const memo = new Map<string, CourseMap | null>()

function readLocal(courseId: string): CourseMap | null {
  try {
    const raw = localStorage.getItem(LOCAL(courseId))
    return raw ? unpack(JSON.parse(raw)) : null
  } catch {
    return null
  }
}
function writeLocal(courseId: string, map: CourseMap | null) {
  try {
    if (map) localStorage.setItem(LOCAL(courseId), JSON.stringify(pack(map)))
    else localStorage.removeItem(LOCAL(courseId))
  } catch {
    // Storage full: the map still works this session from memory.
  }
}

/** Size of a map as stored, in kilobytes. For checking. */
export const packedKb = (map: CourseMap) => Math.round(JSON.stringify(pack(map)).length / 1024)

/** This phone's copy straight away, or null. */
export const cachedCourseMap = (courseId: string): CourseMap | null => memo.get(courseId) ?? readLocal(courseId)

/** The stored map: this phone's copy, refreshed from the group's when online. */
export async function loadCourseMap(courseId: string): Promise<CourseMap | null> {
  const local = cachedCourseMap(courseId)
  if (!supabase) return local
  try {
    const { data, error } = await supabase.from('course_maps').select('map').eq('course_id', courseId).maybeSingle()
    if (error) return local
    const map = data?.map ? unpack(data.map as PackedMap) : null
    memo.set(courseId, map)
    writeLocal(courseId, map)
    return map
  } catch {
    return local
  }
}

/**
 * Saves a map for the group. `keepOnPhone` false is for pulling every
 * course in one go: the phone only needs copies of courses it plays, and
 * a round there fetches its own.
 */
export async function saveCourseMap(course: Course, map: CourseMap, keepOnPhone = true): Promise<void> {
  memo.set(course.id, map)
  if (keepOnPhone || !supabase) writeLocal(course.id, map)
  if (!supabase) return
  const { error } = await supabase
    .from('course_maps')
    .upsert({ course_id: course.id, group_id: course.groupId, map: pack(map), updated_at: new Date().toISOString() }, { onConflict: 'course_id' })
  if (error) throw new Error(`Couldn’t save the hole map: ${error.message}`)
}

// ---------- Without anyone asking ----------
//
// A course gets its map on its own: when it's added, and the first time
// a round opens at a course that still has none. Once per course per
// phone, quietly; a course OpenStreetMap can't map keeps the "Get it"
// and "Mark greens as we play" options on its map page.

const TRIED = (courseId: string) => `bandit-map-tried:${courseId}`
const inFlight = new Set<string>()

/** Fetches and saves a course's map in the background. Resolves true if one was saved. */
export async function autoFetchCourseMap(course: Course): Promise<boolean> {
  try {
    if (inFlight.has(course.id) || localStorage.getItem(TRIED(course.id))) return false
    localStorage.setItem(TRIED(course.id), new Date().toISOString())
  } catch {
    return false
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  inFlight.add(course.id)
  try {
    if (await loadCourseMap(course.id)) return false // someone else's phone got it first
    const r = await fetchCourseMap(course)
    if (!r.map) return false
    await saveCourseMap(course, r.map)
    return true
  } catch {
    // Busy or offline: let a later round try again.
    try {
      localStorage.removeItem(TRIED(course.id))
    } catch {
      // nothing to undo
    }
    return false
  } finally {
    inFlight.delete(course.id)
  }
}

/** Which courses have a stored map, for the course list. Cloud: one light query. */
export async function coursesWithMaps(courseIds: string[]): Promise<Set<string>> {
  if (!supabase) return new Set(courseIds.filter((id) => !!readLocal(id)))
  const { data } = await supabase.from('course_maps').select('course_id')
  return new Set((data ?? []).map((r: { course_id: string }) => r.course_id))
}

export const OSM_CREDIT = '© OpenStreetMap contributors'

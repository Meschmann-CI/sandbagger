// Looks a course up in GolfCourseAPI (golfcourseapi.com).
//
// Two calls, each one request against the API:
//   { q: "bethpage" }  → up to eight matches: id, name, town, and whether
//                        the directory has a scorecard for it
//   { id: "49wvt3sr" } → the course in the shape the app stores: pars,
//                        stroke index, yardage, every tee's rating and
//                        slope, and the town (which also switches on the
//                        weather painting for its rounds)
//
// The API key stays here, as the secret GOLFCOURSE_API_KEY; the key
// holder's terms don't allow handing it to other people's phones. The
// free plan allows 35 requests a day for the whole group, so the app
// only searches when someone asks it to, and a course fetched once is
// saved in our own courses table and never fetched again.
//
// Signed-in golfers only: verify_jwt at the gateway, plus a user check
// here, because the anon key is itself a valid JWT.

import { createClient } from 'npm:@supabase/supabase-js@2'

const API = 'https://api.golfcourseapi.com/v1'
const HOLES = 18
// The default tee, same rule as the scanner and the data import: the
// men's White, else the men's set nearest this length.
const TYPICAL_YARDS = 6100

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: BodyInit | null, init: ResponseInit = {}) =>
  new Response(body, { ...init, headers: { ...CORS, ...(init.headers ?? {}) } })
const json = (data: unknown, status = 200) =>
  reply(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

interface ApiLocation {
  city?: string
  state?: string
  country?: string
}
interface ApiHole {
  par?: number
  yardage?: number
  handicap?: number
}
interface ApiTee {
  tee_name?: string
  course_rating?: number
  slope_rating?: number
  total_yards?: number
  number_of_holes?: number
  par_total?: number
  holes?: ApiHole[]
}
interface ApiCourse {
  id: string | number
  club_name?: string
  course_name?: string
  location?: ApiLocation
  tees?: { male?: ApiTee[] | number; female?: ApiTee[] | number }
}

// "Cobbs Creek Golf Club" + "Olde" → "Cobbs Creek Olde". When either name
// already carries the other ("Bethpage State Park" + "Bethpage Black",
// "Pelham Bay and Split Rock" + "Split Rock"), the course name alone.
const SUFFIX = / (golf & country club|golf and country club|golf club|golf course|golf links|country club|gc|cc)$/i
function displayName(c: ApiCourse) {
  const club = (c.club_name ?? '').trim()
  const course = (c.course_name ?? '').trim()
  if (!course) return club
  if (!club) return course
  const base = club.replace(SUFFIX, '').trim()
  const lc = course.toLowerCase()
  const lb = base.toLowerCase()
  if (lc === club.toLowerCase() || lc.includes(lb) || lb.includes(lc.replace(SUFFIX, '')) || lc.includes(lb.split(/\s+/)[0])) return course
  return `${base} ${course}`
}

function town(l?: ApiLocation) {
  if (!l?.city) return null
  if (l.state && (!l.country || /united states|usa/i.test(l.country))) return `${l.city}, ${l.state}`
  return [l.city, l.country].filter(Boolean).join(', ')
}

const count = (v: ApiTee[] | number | undefined) => (Array.isArray(v) ? v.length : typeof v === 'number' ? v : 0)
const pad = <T,>(xs: T[]) => Array.from({ length: HOLES }, (_, i) => xs[i] ?? null)

async function api(path: string, key: string) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}` } })
  if (res.status === 429) throw Object.assign(new Error("The course directory's daily limit is used up. Try again tomorrow, or add the course by hand."), { status: 429 })
  if (res.status === 401) throw Object.assign(new Error('The course directory turned the key down. Check the GOLFCOURSE_API_KEY secret.'), { status: 502 })
  if (res.status === 404) throw Object.assign(new Error('That course is no longer in the directory.'), { status: 404 })
  if (!res.ok) throw Object.assign(new Error(`The course directory answered ${res.status}.`), { status: 502 })
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply('ok')
  if (req.method !== 'POST') return reply('POST only', { status: 405 })

  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await asCaller.auth.getUser()
  if (!auth?.user) return reply('Sign in first', { status: 401 })

  const key = Deno.env.get('GOLFCOURSE_API_KEY')
  if (!key) return reply('The course directory is not set up yet (no GOLFCOURSE_API_KEY secret).', { status: 503 })

  let body: { q?: string; id?: string | number }
  try {
    body = await req.json()
  } catch {
    return reply('Bad JSON', { status: 400 })
  }

  try {
    if (typeof body.q === 'string') {
      const q = body.q.trim()
      if (q.length < 3) return reply('Type at least three letters', { status: 400 })
      const data = (await api(`/search?search_query=${encodeURIComponent(q)}`, key)) as { courses?: ApiCourse[] }
      const results = (data.courses ?? []).slice(0, 8).map((c) => ({
        id: String(c.id),
        name: displayName(c),
        town: town(c.location),
        hasCard: count(c.tees?.male) + count(c.tees?.female) > 0,
      }))
      return json({ results })
    }

    if (body.id != null) {
      const id = String(body.id)
      if (!/^[\w-]{1,40}$/.test(id)) return reply('Bad id', { status: 400 })
      const data = (await api(`/courses/${id}`, key)) as { course?: ApiCourse }
      const c = data.course
      if (!c) return reply('Not found', { status: 404 })
      const male = Array.isArray(c.tees?.male) ? c.tees!.male : []
      const female = Array.isArray(c.tees?.female) ? c.tees!.female : []
      const full = (t: ApiTee) => (t.holes?.length ?? 0) >= HOLES
      // The card comes off the default men's tee (above); a
      // women's-only listing is better than nothing.
      const pool = (male.filter(full).length ? male.filter(full) : female.filter(full))
      const card =
        pool.find((t) => /^white/i.test(t.tee_name ?? '')) ??
        [...pool].sort((a, b) => Math.abs((a.total_yards ?? 0) - TYPICAL_YARDS) - Math.abs((b.total_yards ?? 0) - TYPICAL_YARDS))[0]
      const tees = [
        ...male.map((t) => ({ t, gender: 'M' as const })),
        ...female.map((t) => ({ t, gender: 'W' as const })),
      ]
        .filter(({ t }) => t.tee_name && t.course_rating && t.slope_rating)
        .map(({ t, gender }) => ({
          name: t.tee_name!.trim(),
          yards: t.total_yards ?? undefined,
          rating: Number(t.course_rating),
          slope: Math.round(Number(t.slope_rating)),
          gender,
        }))
      const holes = card?.holes ?? []
      return json({
        course: {
          id: String(c.id),
          name: displayName(c),
          town: town(c.location),
          pars: pad(holes.map((h) => h.par ?? null)),
          strokeIndex: pad(holes.map((h) => h.handicap ?? null)),
          yards: pad(holes.map((h) => h.yardage ?? null)),
          yardsTee: card?.tee_name?.trim() ?? null,
          rating: card?.course_rating ?? null,
          slope: card?.slope_rating ? Math.round(card.slope_rating) : null,
          tees,
          hasCard: !!card,
        },
      })
    }

    return reply('Send q or id', { status: 400 })
  } catch (err) {
    const e = err as Error & { status?: number }
    return reply(e.message, { status: e.status ?? 502 })
  }
})

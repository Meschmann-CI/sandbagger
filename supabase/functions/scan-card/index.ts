// Reads a photographed scorecard.
//
// Two modes. `card` transcribes what's PRINTED — course name, each
// tee's rating and slope, per-hole par, stroke index and yardage — for
// the course editor to pre-fill. `scores` reads what's HANDWRITTEN —
// each row's name and eighteen numbers — for the live card to pre-fill
// at the end of a round nobody scored on a phone. Both go through a
// tool whose schema is the answer's shape, so the reply is data rather
// than prose to parse, and both are checked before they're returned.
// Nothing is saved here: the golfer reviews and taps Save.
//
// Signed-in golfers only (verify_jwt at the gateway, plus a user check
// here, because the anon key is itself a valid JWT), and no more than
// DAILY_CAP scans per account per day. Secrets: the Anthropic key as
// ANTHROPIC_API_KEY (or sandbag-api-key).

import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MODEL = 'claude-opus-5'
const HOLES = 18
const DAILY_CAP = 20

const env = Deno.env.toObject()
const apiKeyName = ['ANTHROPIC_API_KEY', 'SANDBAG_API_KEY', 'sandbag-api-key'].find((k) => env[k]) ??
  Object.keys(env).find((k) => /^(sandbag|anthropic)[-_]?api[-_]?key$/i.test(k))
const apiKey = apiKeyName ? env[apiKeyName] : undefined
if (!apiKey) throw new Error('No Anthropic key secret found (looked for ANTHROPIC_API_KEY / sandbag-api-key)')
const anthropic = new Anthropic({ apiKey })

// Nullable everywhere a card can be blank or unreadable — a guess is
// worse than a gap, since a gap shows up in the editor and a guess
// doesn't.
const RECORD_CARD = {
  name: 'record_card',
  description:
    'Record everything printed on the scorecard in the photo. Use null for anything not printed or not legible. Never guess a number.',
  input_schema: {
    type: 'object',
    required: ['name', 'town', 'holes', 'tees', 'notes'],
    properties: {
      name: { type: ['string', 'null'], description: 'The course name as printed. For a club with several courses, include the course (e.g. "Bethpage Black").' },
      town: { type: ['string', 'null'], description: 'Town and state if printed, e.g. "Farmingdale, NY".' },
      holes: {
        type: 'array',
        description: 'Exactly 18 entries, holes 1 through 18 in order.',
        items: {
          type: 'object',
          required: ['hole', 'par', 'strokeIndex', 'yards'],
          properties: {
            hole: { type: 'integer' },
            par: { type: ['integer', 'null'], description: "Men's par for the hole." },
            strokeIndex: {
              type: ['integer', 'null'],
              description: "The hole's handicap ranking 1-18 (row labelled Handicap, Hcp, Hdcp, HDCP, S.I., or Stroke Index). Men's row if there are separate men's and women's rows.",
            },
            yards: { type: ['integer', 'null'], description: "Yards from the longest men's tee that has a full row." },
          },
        },
      },
      tees: {
        type: 'array',
        description: 'One entry per tee box printed on the card, longest first.',
        items: {
          type: 'object',
          required: ['name', 'gender', 'yards', 'rating', 'slope', 'holeYards'],
          properties: {
            name: { type: 'string', description: 'Tee name as printed: Blue, White, Gold, Black, Back, Middle...' },
            gender: { type: 'string', enum: ['M', 'W'], description: "M unless the rating/slope is explicitly the women's set." },
            yards: { type: ['integer', 'null'], description: 'Total yards for this tee.' },
            rating: { type: ['number', 'null'], description: 'Course rating, e.g. 70.6.' },
            slope: { type: ['integer', 'null'], description: 'Slope, 55-155.' },
            holeYards: {
              type: ['array', 'null'],
              description: 'The 18 per-hole yardages for this tee if the card prints a row for it, else null.',
              items: { type: ['integer', 'null'] },
            },
          },
        },
      },
      notes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Short notes on anything uncertain: glare over a row, a cut-off hole, two handicap rows and which one was used.',
      },
    },
  },
} as const

const RECORD_SCORES = {
  name: 'record_scores',
  description:
    'Record the HANDWRITTEN scores on the filled-in scorecard, one entry per player row. Use null for a blank or illegible hole. Never guess a number.',
  input_schema: {
    type: 'object',
    required: ['rows', 'notes'],
    properties: {
      rows: {
        type: 'array',
        description: 'One entry per row that has handwritten scores, top to bottom.',
        items: {
          type: 'object',
          required: ['name', 'scores', 'total'],
          properties: {
            name: { type: ['string', 'null'], description: 'The name written or printed at the start of the row, as it appears. Null if there is none.' },
            scores: {
              type: 'array',
              description: 'Exactly 18 entries, holes 1 through 18. The strokes written for each hole, or null.',
              items: { type: ['integer', 'null'] },
            },
            total: { type: ['integer', 'null'], description: 'The 18-hole total if one is written, else null.' },
          },
        },
      },
      notes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Short notes on anything uncertain: a crossed-out number, a hole that might be a 7 or a 1, a row with no name.',
      },
    },
  },
} as const

const SYSTEM_CARD = `You transcribe golf scorecards from photos for a small group's scorekeeping app.
Read only what is printed on the card. Do not infer or fill in values that are not legible; use null.
Cards print par, a handicap/stroke-index row, and one yardage row per tee. Stroke index is a ranking: each number 1 to 18 appears once across the 18 holes. If the card has separate men's and women's handicap rows, use the men's for strokeIndex and say so in notes.
Ignore any handwritten scores; only the printed layout matters.
Always respond by calling the record_card tool exactly once.`

const SYSTEM_SCORES = `You read the handwritten scores off a filled-in golf scorecard photo for a small group's scorekeeping app.
Each player's row starts with a name (handwritten or printed) followed by one number per hole, 1 through 18, usually with an OUT total after hole 9, an IN total after 18, and a TOTAL. Report the 18 per-hole numbers in order and the written total if there is one.
Ignore the printed rows (par, handicap, yardage) and any row with no handwritten numbers. Circles and squares around a number are decoration; the number inside is the score.
Do not guess. A blank hole, a crossed-out number with no replacement, or a digit you cannot read is null, and say so in notes.
Always respond by calling the record_scores tool exactly once.`

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const int = (v: unknown, lo: number, hi: number): number | null => {
  const n = num(v)
  return n != null && Number.isInteger(n) && n >= lo && n <= hi ? n : null
}

// Browsers send a preflight OPTIONS before a cross-origin POST with a
// JSON body and an Authorization header. Without these headers the
// request never leaves the browser, and supabase-js reports it as
// "Failed to send a request to the Edge Function".
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: BodyInit | null, init: ResponseInit = {}) =>
  new Response(body, { ...init, headers: { ...CORS, ...(init.headers ?? {}) } })
const json = (data: unknown, status = 200) =>
  reply(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply('ok')
  if (req.method !== 'POST') return reply('POST only', { status: 405 })

  // The gateway checked the JWT is valid; make sure it's a person, not
  // the app's public anon key.
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await asCaller.auth.getUser()
  if (!auth?.user) return reply('Sign in first', { status: 401 })

  let body: { data?: string; mediaType?: string; mode?: string }
  try {
    body = await req.json()
  } catch {
    return reply('Bad JSON', { status: 400 })
  }
  const data = typeof body.data === 'string' ? body.data : ''
  const mediaType = body.mediaType === 'image/png' ? 'image/png' : 'image/jpeg'
  const mode = body.mode === 'scores' ? 'scores' : 'card'
  if (data.length < 1000) return reply('No image', { status: 400 })
  if (data.length > 8_000_000) return reply('Image too large', { status: 413 })

  // A sane ceiling per account per day. Each scan costs real money on
  // the group's key; a stuck retry loop shouldn't be able to run it up.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const today = new Date().toISOString().slice(0, 10)
  const { data: usage } = await admin.from('scan_usage').select('count').eq('user_id', auth.user.id).eq('day', today).maybeSingle()
  const used = usage?.count ?? 0
  if (used >= DAILY_CAP) {
    return json({ error: `That's ${DAILY_CAP} scans today, which is plenty. It resets tomorrow.` }, 429)
  }
  await admin.from('scan_usage').upsert({ user_id: auth.user.id, day: today, count: used + 1 }, { onConflict: 'user_id,day' })

  const tool = mode === 'scores' ? RECORD_SCORES : RECORD_CARD
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: mode === 'scores' ? SYSTEM_SCORES : SYSTEM_CARD,
    tools: [tool],
    tool_choice: { type: 'auto', disable_parallel_tool_use: true },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: mode === 'scores' ? 'Read the handwritten scores with record_scores.' : 'Transcribe this scorecard with record_card.' },
        ],
      },
    ],
  })

  const call = response.content.find((b) => b.type === 'tool_use' && b.name === tool.name)
  if (!call || call.type !== 'tool_use') {
    const said = response.content.find((b) => b.type === 'text')
    return json(
      { error: said && said.type === 'text' ? said.text.slice(0, 300) : 'Could not read a scorecard in that photo.' }, 422)
  }
  const raw = call.input as Record<string, unknown>
  const notes = Array.isArray(raw.notes) ? (raw.notes as unknown[]).filter((n) => typeof n === 'string').slice(0, 8) : []

  if (mode === 'scores') {
    const rawRows = Array.isArray(raw.rows) ? (raw.rows as Record<string, unknown>[]) : []
    const warnings: string[] = []
    const rows = rawRows
      .map((r) => {
        const scores = Array.isArray(r.scores) ? (r.scores as unknown[]).slice(0, HOLES).map((s) => int(s, 1, 20)) : []
        while (scores.length < HOLES) scores.push(null)
        return {
          name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : null,
          scores,
          total: int(r.total, 18, 200),
        }
      })
      .filter((r) => r.scores.some((s) => s != null))
    for (const r of rows) {
      const filled = r.scores.filter((s): s is number => s != null)
      const sum = filled.reduce((s, x) => s + x, 0)
      const label = r.name ?? 'an unnamed row'
      if (filled.length < HOLES) warnings.push(`${label}: ${HOLES - filled.length} hole${HOLES - filled.length === 1 ? '' : 's'} couldn't be read.`)
      if (r.total != null && filled.length === HOLES && sum !== r.total) warnings.push(`${label}: the holes add up to ${sum} but the written total is ${r.total}.`)
    }
    if (rows.length === 0) warnings.push('No handwritten scores were found.')
    return json({ rows, notes, warnings, usage: response.usage })
  }

  // Tidy what came back into exactly the editor's shape, and say what
  // doesn't add up. The golfer sees the warnings above the card.
  const rawHoles = Array.isArray(raw.holes) ? (raw.holes as Record<string, unknown>[]) : []
  const holes = Array.from({ length: HOLES }, (_, i) => {
    const h = rawHoles.find((x) => int(x.hole, 1, HOLES) === i + 1) ?? rawHoles[i] ?? {}
    return { hole: i + 1, par: int(h.par, 3, 6), strokeIndex: int(h.strokeIndex, 1, HOLES), yards: int(h.yards, 50, 800) }
  })
  const rawTees = Array.isArray(raw.tees) ? (raw.tees as Record<string, unknown>[]) : []
  const tees = rawTees
    .filter((t) => typeof t.name === 'string' && t.name.trim())
    .map((t) => {
      const holeYards = Array.isArray(t.holeYards) ? (t.holeYards as unknown[]).slice(0, HOLES).map((y) => int(y, 50, 800)) : null
      return {
        name: (t.name as string).trim(),
        gender: t.gender === 'W' ? 'W' : 'M',
        yards: int(t.yards, 1000, 8500),
        rating: num(t.rating) != null && (num(t.rating) as number) >= 50 && (num(t.rating) as number) <= 90 ? num(t.rating) : null,
        slope: int(t.slope, 55, 155),
        holeYards: holeYards && holeYards.length === HOLES && holeYards.some((y) => y != null) ? holeYards : undefined,
      }
    })

  const warnings: string[] = []
  const pars = holes.map((h) => h.par)
  const parsIn = pars.filter((p) => p != null).length
  if (parsIn < HOLES) warnings.push(`Par is missing on ${HOLES - parsIn} hole${HOLES - parsIn === 1 ? '' : 's'}.`)
  const total = pars.reduce<number>((s, p) => s + (p ?? 0), 0)
  if (parsIn === HOLES && (total < 60 || total > 76)) warnings.push(`Pars add up to ${total}, which doesn't look like a real course.`)
  const si = holes.map((h) => h.strokeIndex).filter((n): n is number => n != null)
  if (si.length > 0 && si.length < HOLES) warnings.push(`Stroke index is missing on ${HOLES - si.length} hole${HOLES - si.length === 1 ? '' : 's'}.`)
  if (new Set(si).size !== si.length) warnings.push('The stroke index repeats a number — one of those holes is wrong.')
  if (tees.length === 0) warnings.push('No tee ratings were readable.')

  return json({
    card: {
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : null,
      town: typeof raw.town === 'string' && raw.town.trim() ? raw.town.trim() : null,
      holes,
      tees,
      notes,
    },
    warnings,
    usage: response.usage,
  })
})

// Reads a photographed scorecard into the shape the course editor uses.
//
// The app shrinks the photo and posts it here; this asks Claude to
// transcribe what's printed — course name, each tee's rating and slope,
// and per-hole par, stroke index and yardage — through a tool whose
// schema is the answer's shape, so the reply is data rather than prose
// to parse. Nothing is saved here: the editor pre-fills and the golfer
// checks it against the card before tapping Add.
//
// Signed-in golfers only (verify_jwt at the gateway, plus a user check
// here, because the anon key is itself a valid JWT). Secrets: the
// Anthropic key as ANTHROPIC_API_KEY (or SANDBAG_API_KEY).

import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MODEL = 'claude-opus-5'
const HOLES = 18

// The secret was saved under the key's console label ("sandbag-api-key"),
// so accept any spelling that names it rather than insist on one.
const env = Deno.env.toObject()
const apiKeyName = ['ANTHROPIC_API_KEY', 'SANDBAG_API_KEY', 'sandbag-api-key'].find((k) => env[k]) ??
  Object.keys(env).find((k) => /^(sandbag|anthropic)[-_]?api[-_]?key$/i.test(k))
const apiKey = apiKeyName ? env[apiKeyName] : undefined
if (!apiKey) throw new Error('No Anthropic key secret found (looked for ANTHROPIC_API_KEY / sandbag-api-key)')
const anthropic = new Anthropic({ apiKey })

// The answer's shape. Nullable everywhere a card can be blank or
// unreadable — a guess is worse than a gap, since a gap shows up in the
// editor and a guess doesn't.
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
            yards: { type: ['integer', 'null'], description: 'Yards from the longest men\'s tee that has a full row.' },
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

const SYSTEM = `You transcribe golf scorecards from photos for a small group's scorekeeping app.
Read only what is printed on the card. Do not infer or fill in values that are not legible; use null.
Cards print par, a handicap/stroke-index row, and one yardage row per tee. Stroke index is a ranking: each number 1 to 18 appears once across the 18 holes. If the card has separate men's and women's handicap rows, use the men's for strokeIndex and say so in notes.
Ignore any handwritten scores; only the printed layout matters.
Always respond by calling the record_card tool exactly once.`

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

  let body: { data?: string; mediaType?: string }
  try {
    body = await req.json()
  } catch {
    return reply('Bad JSON', { status: 400 })
  }
  const data = typeof body.data === 'string' ? body.data : ''
  const mediaType = body.mediaType === 'image/png' ? 'image/png' : 'image/jpeg'
  if (data.length < 1000) return reply('No image', { status: 400 })
  if (data.length > 8_000_000) return reply('Image too large', { status: 413 })

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: SYSTEM,
    tools: [RECORD_CARD],
    tool_choice: { type: 'auto', disable_parallel_tool_use: true },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: 'Transcribe this scorecard with record_card.' },
        ],
      },
    ],
  })

  const call = response.content.find((b) => b.type === 'tool_use' && b.name === RECORD_CARD.name)
  if (!call || call.type !== 'tool_use') {
    const said = response.content.find((b) => b.type === 'text')
    return json(
      { error: said && said.type === 'text' ? said.text.slice(0, 300) : 'Could not read a scorecard in that photo.' }, 422)
  }

  // Tidy what came back into exactly the editor's shape, and say what
  // doesn't add up. The golfer sees the warnings above the card.
  const raw = call.input as Record<string, unknown>
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
  const notes = Array.isArray(raw.notes) ? (raw.notes as unknown[]).filter((n) => typeof n === 'string').slice(0, 6) : []

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

// A link anyone can open to watch a round, no account, no app: the group
// text gets "https://thesandbagger.netlify.app/#/watch/<round>.<token>"
// and whoever taps it sees the last three holes and where everyone
// stands, refreshed as the cards fill in. GameBook and the side-bet apps
// make followers install the app first; the wives and the guy who
// skipped shouldn't have to.
//
// Two calls:
//   POST { round_id, site? }, signed in and a member of the round's
//        group → { url }. The token is an HMAC of the round id keyed on
//        the service role key, so it can't be guessed and never expires
//        (the round's scores are the only thing it opens).
//   GET ?r=<round_id>&t=<token>, no sign-in → the round as the public
//        page draws it: first names, the cards, the course's pars. The
//        gateway runs this function with verify_jwt off; the POST does
//        its own check.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const reply = (body: BodyInit | null, init: ResponseInit = {}) =>
  new Response(body, { ...init, headers: { ...CORS, ...(init.headers ?? {}) } })
const json = (data: unknown, status = 200) =>
  reply(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const DEFAULT_SITE = 'https://thesandbagger.netlify.app'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function tokenFor(roundId: string): Promise<string> {
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`bandit-watch:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(roundId.toLowerCase())))
  return Array.from(sig.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply('ok')

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const roundId = url.searchParams.get('r') ?? ''
    const token = url.searchParams.get('t') ?? ''
    if (!UUID.test(roundId) || !/^[0-9a-f]{24}$/.test(token)) return reply('Bad link', { status: 400 })
    if (token !== (await tokenFor(roundId))) return reply('That link is not one of ours', { status: 403 })

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: round } = await admin.from('rounds').select('id, group_id, played_on, course_name, tee, nines').eq('id', roundId).maybeSingle()
    if (!round) return reply('That round is gone', { status: 404 })
    const [{ data: scores }, { data: course }] = await Promise.all([
      admin.from('round_players').select('player_id, gross, holes').eq('round_id', roundId),
      admin.from('courses').select('name, pars, stroke_index, nines').eq('group_id', round.group_id).ilike('name', round.course_name).maybeSingle(),
    ])
    const ids = (scores ?? []).map((s: { player_id: string }) => s.player_id)
    const { data: people } = ids.length ? await admin.from('players').select('id, name, initials, color').in('id', ids) : { data: [] }
    return json({
      round: {
        id: round.id,
        courseName: round.course_name,
        date: round.played_on,
        tee: round.tee ?? undefined,
        nines: Array.isArray(round.nines) && round.nines.length === 2 ? round.nines : undefined,
        players: (scores ?? []).map((s: { player_id: string; gross: number | null; holes: (number | null)[] | null }) => ({
          playerId: s.player_id,
          gross: s.gross,
          holes: Array.isArray(s.holes) && s.holes.length ? s.holes : undefined,
        })),
      },
      // First names only: this page is for whoever has the link.
      players: (people ?? []).map((p: { id: string; name: string; initials: string; color: string }) => ({
        id: p.id,
        name: String(p.name).split(' ')[0],
        initials: p.initials,
        color: p.color,
      })),
      course: course ? { name: course.name, pars: course.pars ?? [], strokeIndex: course.stroke_index ?? undefined, nines: course.nines ?? undefined } : null,
    })
  }

  if (req.method !== 'POST') return reply('GET or POST', { status: 405 })

  // Minting a link: a signed-in golfer who can see the round.
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await asCaller.auth.getUser()
  if (!auth?.user) return reply('Sign in first', { status: 401 })
  const { data: callerPlayerId } = await asCaller.rpc('claim_my_player')
  if (!callerPlayerId) return reply('Join a group first', { status: 403 })

  let body: { round_id?: string; site?: string }
  try {
    body = await req.json()
  } catch {
    return reply('Bad JSON', { status: 400 })
  }
  const roundId = String(body.round_id ?? '')
  if (!UUID.test(roundId)) return reply('Bad round', { status: 400 })
  // RLS: only a member of the round's group sees the row.
  const { data: round } = await asCaller.from('rounds').select('id').eq('id', roundId).maybeSingle()
  if (!round) return reply('Not your round', { status: 404 })

  const site = typeof body.site === 'string' && /^https:\/\/[\w.-]+$/.test(body.site) ? body.site : DEFAULT_SITE
  const token = await tokenFor(roundId)
  return json({ url: `${site}/#/watch/${roundId.toLowerCase()}.${token}` })
})

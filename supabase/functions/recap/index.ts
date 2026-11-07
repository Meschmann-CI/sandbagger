// The call: a reverent broadcaster's account of one round, written once
// when the last score lands and kept on the round (rounds.recap). It
// follows the round as it went (the early lead, the changes, the hole
// that undid someone, the momentum) and lands on the winner, with a
// quip or two at the expense of whoever messed up (Matt, 2026-11-06).
//
// The phone sends the facts (src/lib/recapFacts.ts; the iPhone app builds
// the same shape from BanditCore), never free text from the group, so the
// call can only say what the scorecard says. The function checks the
// caller can see the round, writes the text with `recap is null` so two
// phones asking at once produce one call, and answers with whatever is
// on the row. Asking again for a round that has one costs nothing.
//
// Signed-in members only (verify_jwt at the gateway, plus the user and
// player checks here). Secrets: the Anthropic key as ANTHROPIC_API_KEY
// (or sandbag-api-key), the same one scan-card uses.

import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

const MODEL = 'claude-opus-5-5'
const MAX_FACTS = 24_000

const env = Deno.env.toObject()
const apiKeyName = ['ANTHROPIC_API_KEY', 'SANDBAG_API_KEY', 'sandbag-api-key'].find((k) => env[k]) ??
  Object.keys(env).find((k) => /^(sandbag|anthropic)[-_]?api[-_]?key$/i.test(k))
const apiKey = apiKeyName ? env[apiKeyName] : undefined
if (!apiKey) throw new Error('No Anthropic key secret found (looked for ANTHROPIC_API_KEY / sandbag-api-key)')
const anthropic = new Anthropic({ apiKey })

const SYSTEM = `You are the voice of a Sunday afternoon golf broadcast: reverent, unhurried, a little wry. You are calling a round among a small group of friends who play together every week and have played for years.

Write the call of the round from the facts you are given, as it unfolded: who led early, where the lead changed hands, the hole that undid someone, the stretch where the momentum turned, and then the finish, landing on the winner by net score with the respect a champion deserves. One or two quips at the expense of whoever messed up a hole or blew a lead, in the manner of a broadcaster who likes these people. Never cruel, never about anyone's character, only what the scorecard and the facts say.

Rules:
- 130 to 190 words, one or two paragraphs. No headings, no lists, no em dashes, no hashtags, no emoji.
- First names only, as given. Refer to the group's standing trophy as "the Saddam" exactly as the facts describe it: it is the prize everyone wants, won outright, and the holder is the reigning champion.
- Use only the facts given. If hole-by-hole scores are missing, call the round from the totals and say nothing about individual holes. Never invent a hole, a shot, a score or weather.
- Net score decides the winner. Mention the gross only where it tells the story (a personal best, a blow-up).
- If a chirp from a spectator is given, you may quote at most one, short, attributed to who sent it.
- End on the winner, in one sentence, as the broadcast signs off.`

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: BodyInit | null, init: ResponseInit = {}) =>
  new Response(body, { ...init, headers: { ...CORS, ...(init.headers ?? {}) } })
const json = (data: unknown, status = 200) =>
  reply(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply('ok')
  if (req.method !== 'POST') return reply('POST only', { status: 405 })

  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await asCaller.auth.getUser()
  if (!auth?.user) return reply('Sign in first', { status: 401 })
  const { data: callerPlayerId } = await asCaller.rpc('claim_my_player')
  if (!callerPlayerId) return reply('Join a group first', { status: 403 })

  let body: { roundId?: string; facts?: unknown }
  try {
    body = await req.json()
  } catch {
    return reply('Bad JSON', { status: 400 })
  }
  const roundId = typeof body.roundId === 'string' && UUID.test(body.roundId) ? body.roundId : null
  if (!roundId) return reply('No round', { status: 400 })

  // The round has to be one the caller can see (the policies decide).
  const { data: round } = await asCaller.from('rounds').select('id, recap').eq('id', roundId).maybeSingle()
  if (!round) return reply('No such round', { status: 404 })
  if (round.recap && typeof round.recap === 'object' && typeof (round.recap as { text?: unknown }).text === 'string') {
    return json({ recap: round.recap, fresh: false })
  }

  const facts = body.facts && typeof body.facts === 'object' ? body.facts : null
  if (!facts) return reply('No facts', { status: 400 })
  const factsText = JSON.stringify(facts)
  if (factsText.length > MAX_FACTS) return reply('Too much', { status: 413 })

  let text: string
  try {
    // Opus 5.5 always thinks first, and the thinking counts against
    // max_tokens. The first version allowed 600, the thinking used all of
    // it, and the answer came back with no text (2026-11-07). The call
    // itself is about 250 tokens; the rest is room to think. Low effort
    // keeps the wait on the phone short.
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [{ role: 'user', content: `The round, as data:\n${factsText}\n\nCall it.` }],
    })
    text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
      .trim()
    if (!text) {
      console.error('recap: no text', response.stop_reason, JSON.stringify(response.usage))
      const why = response.stop_reason === 'refusal' ? 'The booth declined to call this one.' : 'The booth had nothing to say.'
      return json({ error: `${why} Try again in a minute.` }, 422)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: `The booth is dark right now (${message.slice(0, 120)}). Try again in a minute.` }, 502)
  }
  text = text.replace(/—/g, ',').slice(0, 1600)

  // First writer wins: a second phone asking at the same moment gets the
  // first one's call back rather than a different one.
  const recap = { text, at: new Date().toISOString() }
  const { data: written } = await asCaller.from('rounds').update({ recap }).eq('id', roundId).is('recap', null).select('recap')
  if (written && written.length > 0) return json({ recap, fresh: true })
  const { data: again } = await asCaller.from('rounds').select('recap').eq('id', roundId).maybeSingle()
  return json({ recap: again?.recap ?? recap, fresh: false })
})

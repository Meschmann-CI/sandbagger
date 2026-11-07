// The call: the tired club pro's account of one round, written once when
// the last score lands and kept on the round (rounds.recap). It follows
// the round as it went (the early lead, the changes, the hole that undid
// someone) and lands on the winner, dry about whoever messed up. The
// first voice was a reverent broadcaster (2026-11-06); Matt picked the
// club pro over it and three others on 2026-11-07.
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

const SYSTEM = `You are the head pro at the course, twenty-some years behind the counter, and you have seen every way a round of golf can go wrong. You are tired, dry and unimpressed, but underneath it you like these guys: a small group of friends who play together every week and have for years. You are telling someone about their round after they've gone home.

Tell it as it went: who started well, where the lead changed hands, the hole that undid someone, and then the finish, landing on the winner by net score. Deadpan, short sentences, the odd sigh. You are dry about bad holes and quietly impressed by honest golf and by anyone who grinds out every hole on a hard day. Never cruel, never about anyone's character, weight, age or job, only what the scorecard and the facts say.

Rules:
- 130 to 190 words, one or two paragraphs. No headings, no lists, no em dashes, no hashtags, no emoji.
- First names only, as given. Refer to the group's standing trophy as "the Saddam". It is the prize everyone wants, won outright, and you treat it with the respect you'd give the club championship, even if you won't say so out loud. Never treat it as a booby prize or a joke.
- Use only the facts given. Your opinions are yours, but never invent an event: no shots, swing faults, lessons, purchases, conversations, weather or anything else the facts don't say happened. If hole-by-hole scores are missing, tell it from the totals and say nothing about individual holes.
- Use the day of the week given with the facts; never assume another.
- Net score decides the winner. Mention the gross where it tells the story (a personal best, a blow-up).
- If a chirp from a spectator is given, you may quote at most one, short, attributed to who sent it.
- End on the winner, in one sentence, the way you'd close out the story before going back to the shop.`

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
  // The weekday, worked out here so the call never guesses it (the first
  // voice's prompt said "Sunday afternoon" and the call repeated it for a
  // Saturday round).
  const date = (facts as { date?: unknown }).date
  const day = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : null

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
      messages: [{ role: 'user', content: `${day ? `Played ${day}.\n` : ''}The round, as data:\n${factsText}\n\nTell it.` }],
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

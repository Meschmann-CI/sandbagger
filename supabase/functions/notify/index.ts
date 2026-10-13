// Sends a web-push notification to golfers in the caller's group.
//
// The caller must be a signed-in member (verify_jwt is on), and the
// recipients are resolved to their claimed player, then intersected with
// the caller's own group — so nobody can push to a group they're not in.
// Dead subscriptions (uninstalled app, expired endpoint) are pruned as
// they bounce.
//
// Deploy with the Supabase CLI or the dashboard. Needs one secret set on
// the project first: VAPID_PRIVATE_KEY, the private half of the pair
// whose public half is in src/lib/push.ts. It used to be pasted straight
// into this file; a private key in source is a private key in every
// clone of the repo.
//
// The native iPhone app (bandit-swift) files APNs device tokens in
// `apns_tokens` instead, and those go straight to Apple. That half stays
// off until four more secrets are set, all from the Apple Developer
// account (Certificates, Identifiers & Profiles → Keys, with Apple Push
// Notifications enabled): APNS_KEY (the whole .p8 file), APNS_KEY_ID,
// APNS_TEAM_ID, and APNS_BUNDLE_ID (com.eschmann.bandit). Without them,
// web push carries on exactly as before.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { importPKCS8, SignJWT } from 'npm:jose@5.9.6'

// VAPID identifies this app to Apple's and Google's push services.
const VAPID_PUBLIC = 'BO8kfsPTCDy14HUTMeCacvLk_pmdSUWxqAIXG0sQJySuymKCO465tFlcl2egpzDH-pJHgFAKM62P8NwiacRk15E'
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')
if (!VAPID_PRIVATE) throw new Error('VAPID_PRIVATE_KEY secret is not set on this project')
webpush.setVapidDetails('mailto:MEschmann@corporateinsight.com', VAPID_PUBLIC, VAPID_PRIVATE)

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

  let payload: { toPlayerIds?: string[]; title?: string; body?: string; url?: string }
  try {
    payload = await req.json()
  } catch {
    return reply('Bad JSON', { status: 400 })
  }
  const title = (payload.title ?? '').slice(0, 80)
  const body = (payload.body ?? '').slice(0, 200)
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/'
  const to = Array.isArray(payload.toPlayerIds) ? payload.toPlayerIds.slice(0, 20) : []
  if (!title || to.length === 0) return reply('Nothing to send', { status: 400 })

  // Who is calling, as a player? Same resolution the app itself uses.
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: callerPlayerId, error: claimErr } = await asCaller.rpc('claim_my_player')
  if (claimErr || !callerPlayerId) return reply('No player for caller', { status: 403 })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: caller } = await admin.from('players').select('group_id').eq('id', callerPlayerId).single()
  if (!caller) return reply('No player for caller', { status: 403 })

  // Recipients: requested players, but only inside the caller's group,
  // and never the caller themselves.
  const { data: recipients } = await admin
    .from('players')
    .select('id')
    .eq('group_id', caller.group_id)
    .in('id', to)
    .neq('id', callerPlayerId)
  const ids = (recipients ?? []).map((r) => r.id)
  if (ids.length === 0) return json({ sent: 0 })

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('player_id', ids)

  let sent = 0
  const dead: string[] = []
  const message = JSON.stringify({ title, body, url })
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message)
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // Gone or never-valid: the device unsubscribed or the app was
        // deleted. Keeping the row just makes every future send slower.
        if (status === 404 || status === 410) dead.push(s.id)
      }
    }),
  )
  if (dead.length > 0) await admin.from('push_subscriptions').delete().in('id', dead)

  // The native app's phones, straight to Apple.
  const apns = await sendApns(admin, ids, { title, body, url })

  return json({ sent: sent + apns.sent, pruned: dead.length + apns.pruned })
})

// ---------- APNs, for the native iPhone app ----------

// A key pasted into the dashboard can arrive with its line breaks as
// literal \n; PEM parsing ignores real whitespace but not those.
const APNS_KEY = Deno.env.get('APNS_KEY')?.replaceAll('\\n', '\n').trim()
const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID')
const APNS_TEAM_ID = Deno.env.get('APNS_TEAM_ID')
const APNS_BUNDLE_ID = Deno.env.get('APNS_BUNDLE_ID')
const apnsReady = !!(APNS_KEY && APNS_KEY_ID && APNS_TEAM_ID && APNS_BUNDLE_ID)

// Apple wants a fresh-ish provider token: no older than an hour, and not
// minted more than once every twenty minutes. One per warm instance, kept
// for 40 minutes, sits inside both.
let providerToken: { jwt: string; at: number } | null = null
async function apnsJwt(): Promise<string> {
  if (providerToken && Date.now() - providerToken.at < 40 * 60_000) return providerToken.jwt
  const key = await importPKCS8(APNS_KEY!, 'ES256')
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: APNS_KEY_ID! })
    .setIssuer(APNS_TEAM_ID!)
    .setIssuedAt()
    .sign(key)
  providerToken = { jwt, at: Date.now() }
  return jwt
}

async function sendApns(
  admin: ReturnType<typeof createClient>,
  playerIds: string[],
  msg: { title: string; body: string; url: string },
): Promise<{ sent: number; pruned: number }> {
  if (!apnsReady || playerIds.length === 0) return { sent: 0, pruned: 0 }
  // A missing table (the SQL not pasted yet) reads as nobody to send to.
  const { data: tokens, error } = await admin.from('apns_tokens').select('id, token, environment').in('player_id', playerIds)
  if (error || !tokens?.length) return { sent: 0, pruned: 0 }

  let jwt: string
  try {
    jwt = await apnsJwt()
  } catch {
    return { sent: 0, pruned: 0 }
  }
  const payload = JSON.stringify({
    aps: { alert: { title: msg.title, ...(msg.body ? { body: msg.body } : {}) }, sound: 'default' },
    url: msg.url,
  })
  let sent = 0
  const dead: string[] = []
  await Promise.all(
    tokens.map(async (t: { id: string; token: string; environment: string }) => {
      const host = t.environment === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'
      try {
        const res = await fetch(`https://${host}/3/device/${t.token}`, {
          method: 'POST',
          headers: {
            authorization: `bearer ${jwt}`,
            'apns-topic': APNS_BUNDLE_ID!,
            'apns-push-type': 'alert',
            'apns-priority': '10',
          },
          body: payload,
        })
        if (res.ok) {
          sent++
        } else {
          // 410: the app was deleted. 400 BadDeviceToken: a token from the
          // other environment or never valid. Either way it will never work.
          const reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason
          if (res.status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') dead.push(t.id)
        }
      } catch {
        // Apple unreachable this time; try again on the next message.
      }
    }),
  )
  if (dead.length > 0) await admin.from('apns_tokens').delete().in('id', dead)
  return { sent, pruned: dead.length }
}

// Reads a page's Open Graph tags so the app can show the house photo
// from a booking link. Runs server-side because browsers can't read
// cross-origin pages directly.
//
// It is a fetch proxy, so it has to be a narrow one: only the app may
// call it, it only fetches public hostnames (never an IP literal or
// localhost, at any redirect hop), and it reads no more of the page than
// the <head> it needs. Each call costs a Netlify invocation.

const CACHE_SECONDS = 86400
const SITE = 'https://thesandbagger.netlify.app'
const MAX_BYTES = 400_000 // preview tags live in <head>; no need for a whole listing page
const MAX_HOPS = 5
const TIMEOUT_MS = 9000

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function pickMeta(html, names) {
  for (const name of names) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, 'i'),
    ]
    for (const re of patterns) {
      const match = html.match(re)
      if (match) return decodeEntities(match[1])
    }
  }
  return undefined
}

const json = (body, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })

// The site itself, its Netlify deploy previews and branch deploys
// (https://deploy-preview-12--thesandbagger.netlify.app), or a local dev
// server. A same-origin GET carries no Origin header, so Referer counts.
function callerAllowed(request) {
  const from = request.headers.get('origin') || request.headers.get('referer')
  if (!from) return false
  let u
  try {
    u = new URL(from)
  } catch {
    return false
  }
  if (u.origin === SITE) return true
  if (u.protocol === 'https:' && u.hostname.endsWith('--thesandbagger.netlify.app')) return true
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')) return true
  return false
}

// Anything that could reach the function's own network. Every IP literal
// is refused, which covers loopback (127/8, ::1), private (10/8,
// 172.16/12, 192.168/16, fc00::/7) and link-local (169.254/16) without
// having to enumerate them; booking sites have hostnames. The WHATWG URL
// parser already turns the odd spellings (0x7f000001, 2130706433,
// 127.1) into dotted form, so the one IPv4 pattern catches those too.
function blockedHost(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (!h) return true
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa')) return true
  if (h.startsWith('[')) return true // IPv6 literal, including ::1 and IPv4-mapped ones
  if (/^\d+(\.\d+){3}$/.test(h)) return true // IPv4 literal
  if (/^(0x[0-9a-f]+|\d+)$/.test(h)) return true // a bare number the parser left alone
  return false
}

// Reads at most `limit` bytes of the body and lets the rest go.
async function readHead(res, limit) {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let text = ''
  let bytes = 0
  try {
    while (bytes < limit) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      text += decoder.decode(value, { stream: true })
    }
  } finally {
    // Stop the download; the connection is released either way.
    reader.cancel().catch(() => {})
  }
  return text.slice(0, limit)
}

export default async (request) => {
  if (!callerAllowed(request)) return json({ error: 'Forbidden' }, 403)

  const target = new URL(request.url).searchParams.get('url')
  if (!target) return json({ error: 'Missing url' }, 400)

  let parsed
  try {
    parsed = new URL(target)
  } catch {
    return json({ error: 'Bad url' }, 400)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return json({ error: 'Unsupported protocol' }, 400)
  }
  if (blockedHost(parsed.hostname)) return json({ error: 'Blocked host' }, 400)

  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS)
    const headers = {
      // Some booking sites serve a stub page to unknown agents.
      'User-Agent': 'Mozilla/5.0 (compatible; SandbaggerBot/1.0; +link-preview)',
      Accept: 'text/html,application/xhtml+xml',
    }

    // Redirects are followed by hand so every hop gets the same host
    // check: a public URL that bounces to an internal address is the
    // usual way round a proxy's front-door filter.
    let url = parsed
    let res
    for (let hop = 0; ; hop++) {
      res = await fetch(url.toString(), { headers, redirect: 'manual', signal })
      const location = res.headers.get('location')
      if (res.status < 300 || res.status >= 400 || !location) break
      if (hop >= MAX_HOPS) return json({ error: 'Too many redirects' }, 502)
      let next
      try {
        next = new URL(location, url)
      } catch {
        return json({ error: 'Bad redirect' }, 502)
      }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') return json({ error: 'Unsupported protocol' }, 400)
      if (blockedHost(next.hostname)) return json({ error: 'Blocked host' }, 400)
      if (res.body) res.body.cancel().catch(() => {})
      url = next
    }
    if (!res.ok) return json({ error: `Upstream ${res.status}` }, 502)

    const html = await readHead(res, MAX_BYTES)
    const image = pickMeta(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'])
    const rawTitle = pickMeta(html, ['og:title', 'twitter:title']) || (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]
    const siteName = pickMeta(html, ['og:site_name']) || url.hostname.replace(/^www\./, '')

    return json(
      {
        image: image ? new URL(image, url).toString() : undefined,
        title: rawTitle ? decodeEntities(rawTitle.trim()).slice(0, 200) : undefined,
        siteName,
      },
      200,
      { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` },
    )
  } catch (err) {
    return json({ error: String((err && err.message) || err) }, 504)
  }
}

export const config = { path: '/api/link-preview' }

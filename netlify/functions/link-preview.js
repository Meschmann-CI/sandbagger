// Reads a page's Open Graph tags so the app can show the house photo
// from a booking link. Runs server-side because browsers can't read
// cross-origin pages directly.

const CACHE_SECONDS = 86400

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

export default async (request) => {
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

  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        // Some booking sites serve a stub page to unknown agents.
        'User-Agent': 'Mozilla/5.0 (compatible; SandbaggerBot/1.0; +link-preview)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
    })
    if (!res.ok) return json({ error: `Upstream ${res.status}` }, 502)

    // Preview tags live in <head>; no need to read a whole listing page.
    const html = (await res.text()).slice(0, 400_000)
    const image = pickMeta(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'])
    const rawTitle = pickMeta(html, ['og:title', 'twitter:title']) || (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]
    const siteName = pickMeta(html, ['og:site_name']) || parsed.hostname.replace(/^www\./, '')

    return json(
      {
        image: image ? new URL(image, parsed).toString() : undefined,
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

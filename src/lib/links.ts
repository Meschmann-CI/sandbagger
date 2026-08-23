// Link helpers: site icons load directly in the browser, but reading a
// page's preview image needs a server (sites block cross-origin reads),
// so that part goes through the Netlify function in netlify/functions.

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function hostOf(raw?: string): string | null {
  if (!raw) return null
  try {
    return new URL(normalizeUrl(raw)).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

// Course and restaurant icons: the site's own favicon, fetched by domain.
export function faviconFor(raw?: string, size = 64): string | null {
  const host = hostOf(raw)
  return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}` : null
}

export interface LinkPreview {
  image?: string
  title?: string
  siteName?: string
}

// Returns null when the preview service isn't reachable — that's the
// normal case in local dev, where the photo picker takes over.
export async function fetchLinkPreview(raw: string): Promise<LinkPreview | null> {
  const url = normalizeUrl(raw)
  if (!url) return null
  try {
    const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as LinkPreview
    return data.image || data.title ? data : null
  } catch {
    return null
  }
}

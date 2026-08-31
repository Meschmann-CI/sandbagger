// Sandbagger's service worker.
//
// The point of this is the back nine. Cell service on a course is bad
// enough that the app has to open and work with no network at all, then
// catch up in the parking lot. This half handles reads — the app shell
// and its assets. Writes are queued separately, in src/data/outbox.ts.
//
// Bump VERSION to retire every old cache on the next activate. Needed
// whenever a static file changes name or contents.
const VERSION = 'v3'
const SHELL = `sandbagger-shell-${VERSION}`
const ASSETS = `sandbagger-assets-${VERSION}`

// Manrope, so the app looks like itself offline rather than falling back
// to the system font.
const FONT_HOSTS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/', '/index.html']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** Serve from cache, and refresh the copy in the background. */
async function cacheFirst(event, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(event.request)
  const network = fetch(event.request)
    .then((response) => {
      // Opaque responses (no-cors font files) report status 0 but are
      // still worth keeping.
      if (response.ok || response.type === 'opaque') void cache.put(event.request, response.clone())
      return response
    })
    .catch(() => hit)
  if (hit) {
    event.waitUntil(network)
    return hit
  }
  return network
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin

  // Supabase reads must never come from cache — a stale leaderboard that
  // looks live is worse than an honest failure.
  if (!sameOrigin && !FONT_HOSTS.includes(url.origin)) return

  // The app is hash-routed, so every deep link is a request for '/'.
  // Serve the shell from cache the moment the network is unavailable.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          event.waitUntil(caches.open(SHELL).then((cache) => cache.put('/', copy)))
          return response
        })
        .catch(async () => (await caches.match('/')) ?? (await caches.match('/index.html'))),
    )
    return
  }

  // Vite fingerprints built assets, so a cache hit is always the right file.
  event.respondWith(cacheFirst(event, sameOrigin ? ASSETS : SHELL))
})

// ---------- Push ----------
// The payload is JSON from the notify Edge Function:
// { title, body, url } — url is the in-app path to open on tap.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // A malformed payload still owes the user a visible notification —
    // userVisibleOnly was promised at subscribe time.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Sandbagger', {
      body: data.body || '',
      icon: '/sandbagger-icon-180.png',
      badge: '/sandbagger-icon-180.png',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  // The app is hash-routed, so any deep link is the root document plus a
  // fragment. Focus an open window if there is one; open one if not.
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const target = `${self.location.origin}/#${url}`
      for (const win of wins) {
        if (win.url.startsWith(self.location.origin)) {
          win.navigate(target)
          return win.focus()
        }
      }
      return clients.openWindow(target)
    }),
  )
})

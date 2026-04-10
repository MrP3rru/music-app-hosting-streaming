// ─── Music Radio PWA — Service Worker ────────────────────────────────────────
// Strategia:
//  • HTML        → network-first  (żeby deploy od razu obowiązywał)
//  • JS/CSS/img  → cache-first    (po 1. wizycie Netlify nie jest w ogóle odpytywane)
//  • wszystko cross-origin        → przeźroczysty bypass (streamy, Firebase, API)

const CACHE = 'music-radio-v2'

// Rozszerzenia do cache'owania (tylko same-origin)
const CACHEABLE = /\.(js|css|png|svg|ico|webp|jpg|jpeg|woff2?|ttf|webmanifest)$/i

// ─── Install: pre-cache app shell ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(['/radio.html', '/manifest.webmanifest', '/favicon.svg'])
    )
  )
})

// ─── Activate: wyczyść stare cache'e ─────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Tylko GET
  if (request.method !== 'GET') return
  // Tylko http/https
  if (!url.protocol.startsWith('http')) return
  // Tylko same-origin — wszystko cross-origin (streamy, Firebase, radio-browser API) idzie przez sieć bez ingerencji
  if (url.origin !== self.location.origin) return

  const isHTML = request.destination === 'document' || url.pathname.endsWith('.html')

  if (isHTML) {
    // Network-first dla HTML — deploy od razu widoczny, fallback na cache gdy offline
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()))
          return res
        })
        .catch(() => caches.match(request))
    )
  } else {
    // Cache-first dla JS / CSS / obrazków — raz pobrane = zero requestów do Netlify
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          if (res.ok && CACHEABLE.test(url.pathname)) {
            caches.open(CACHE).then((c) => c.put(request, res.clone()))
          }
          return res
        })
      })
    )
  }
})

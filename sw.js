/* PlayRealm service worker.
   Same-origin files only: network first, cache as the fallback. Online you always get the
   latest files (nothing goes stale while you edit); offline every game still loads. If the
   network hangs, the cached copy is used after a few seconds instead of waiting forever.
   The page sends the list of files to pre-cache (see js/pwa.js), so there is no hand-kept
   file list to forget when a game is added.
   */
'use strict';

const CACHE = 'playrealm-feed697ceb';
const NETWORK_WAIT_MS = 4000;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('playrealm-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const skip = () => false;

/* Pre-cache: fetch only what is missing; normal page loads keep the rest fresh. */
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type !== 'precache' || !Array.isArray(msg.urls)) return;
  const urls = msg.urls.filter((u) => {
    try {
      const url = new URL(u, self.location.href);
      return url.origin === self.location.origin && !skip(url);
    } catch (e) { return false; }
  });
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all(urls.map((url) =>
      cache.match(url).then((hit) => hit || fetch(url).then((res) => (res.ok ? cache.put(url, res) : null)))
        .catch(() => null))))
  );
});

function fromCache(req) {
  return caches.match(req, { ignoreSearch: true }).then((hit) =>
    hit || (req.mode === 'navigate' ? caches.match('./', { ignoreSearch: true }) : undefined));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || skip(url)) return;

  const network = fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      const stored = caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      // Keep the worker alive until the copy is stored. If the cached copy has already been
      // served, the event is over and cannot be extended: the write still runs.
      try { event.waitUntil(stored); } catch (e) { /* ignore */ }
    }
    return res;
  });
  // A slow network must not hold up a page that is already cached.
  const slow = new Promise((resolve) => setTimeout(resolve, NETWORK_WAIT_MS)).then(() => fromCache(req));

  event.respondWith(
    Promise.race([network.catch(() => undefined), slow])
      .then((res) => res || fromCache(req))
      .then((res) => res || network)
      .catch(() => new Response('Offline', { status: 503, statusText: 'Offline' }))
  );
});

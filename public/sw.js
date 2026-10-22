/* ON MART QC — service worker
   Network-first for the app shell so updates land immediately,
   cache fallback so the inspector can keep working with no signal.

   The version below must be bumped on every release. Changing it
   throws away the previous cache, which is what makes a new deploy
   actually reach a browser that has been running the old files. */
const CACHE = 'onmart-qc-v8-20261022d';

const SHELL = [
  '/qc.html',
  '/manifest.webmanifest', '/icon-192.png', '/icon-512.png',
  '/apple-touch-icon.png', '/logo.png',
  '/NotoSansKhmer-Regular.woff2', '/NotoSansKhmer-Bold.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* A page can ask the waiting worker to take over at once. */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* Code and markup must never come back stale: the request goes to the
   network with the HTTP cache bypassed, so a fresh deploy is picked up
   on the next load. Pictures and fonts keep the ordinary path. */
function isCode(pathname) {
  return pathname.endsWith('.js') || pathname.endsWith('.html') || pathname === '/';
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;   // never cache data

  const fresh = isCode(url.pathname)
    ? fetch(req, { cache: 'no-store' })
    : fetch(req);

  e.respondWith(
    fresh
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('/qc.html')))
  );
});

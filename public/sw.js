// HÓVIRÁG szolgáltatás-munkás: offline megnyitás és mentett adatok megtekintése.
// Hálózat-első stratégia: online mindig a friss változatot kapod, offline az utoljára látottat.
const CACHE = 'hovirag-v1';
const SHELL = ['/', '/app.js', '/style.css', '/manifest.webmanifest', '/icons/icon-192.png'];
const API_OK = [/^\/api\/workers$/, /^\/api\/workers\/\d+\/entries$/, /^\/api\/templates$/, /^\/api\/calendar$/];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

async function networkFirst(req, isApi) {
  try {
    const res = await fetch(req);
    if (res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
    return res;
  } catch {
    const hit = await caches.match(req);
    if (hit) return hit;
    if (isApi) return new Response(JSON.stringify({ error: 'Nincs kapcsolat, és ehhez az oldalhoz még nincs mentett adat.' }), { status: 503, headers: { 'content-type': 'application/json' } });
    return Response.error();
  }
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/api/')) {
      if (API_OK.some((r) => r.test(url.pathname))) e.respondWith(networkFirst(req, true));
      return;
    }
    e.respondWith(networkFirst(req, false));
  } else if (/(^|\.)(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req));
  }
});

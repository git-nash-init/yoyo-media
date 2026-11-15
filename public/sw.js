/* YoYo Videos service worker (hand-written, no build step).
 *
 * - Navigations: network-first; fall back to the cached copy of that page, then /offline.
 * - Thumbnails, previews, avatars, posters, /_next/static and /brand: stale-while-revalidate, size-capped.
 * - Never cached: full videos, any other /api route, /admin, /account, /checkout, non-GET requests.
 *
 * Bump VERSION to invalidate every cache on the next visit.
 */
const VERSION = "v3";
const PREFIX = "yoyo-";
const PAGES = `${PREFIX}pages-${VERSION}`;
const STATIC = `${PREFIX}static-${VERSION}`;
const MEDIA = `${PREFIX}media-${VERSION}`;
const CURRENT = [PAGES, STATIC, MEDIA];

const OFFLINE_URL = "/offline";
const PRECACHE_STATIC = ["/brand/icon.svg", "/brand/placeholder-thumb.svg", "/brand/placeholder-avatar.svg"];

const LIMITS = { [PAGES]: 40, [STATIC]: 160, [MEDIA]: 120 };

const MEDIA_RE = /^\/api\/media\/(thumb|preview|channel|model|series)\//;
// Private or sensitive areas: the worker does not touch these at all.
const NEVER_RE = /^\/(admin|account|checkout)(\/|$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(STATIC);
      await Promise.all(
        PRECACHE_STATIC.map((url) => staticCache.add(new Request(url, { cache: "reload" })).catch(() => {})),
      );

      // Precache the offline page plus the build assets it references, so it renders with styles.
      try {
        const res = await fetch(new Request(OFFLINE_URL, { cache: "reload", credentials: "same-origin" }));
        if (res.ok && !res.redirected) {
          const pages = await caches.open(PAGES);
          await pages.put(OFFLINE_URL, res.clone());
          const html = await res.text();
          const assets = Array.from(new Set(html.match(/\/_next\/static\/[^"'\\\s<>)]+/g) || [])).slice(0, 60);
          await Promise.all(assets.map((url) => staticCache.add(url).catch(() => {})));
        }
      } catch {
        // Installed while offline or the server is down: the inline fallback below still works.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && !CURRENT.includes(k)).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.disable().catch(() => {});
      }
      await self.clients.claim();
    })(),
  );
});

async function trim(cacheName) {
  const max = LIMITS[cacheName];
  if (!max) return;
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const extra = keys.length - max;
  for (let i = 0; i < extra; i++) {
    // Keep the offline page no matter how old it is.
    if (new URL(keys[i].url).pathname === OFFLINE_URL) continue;
    await cache.delete(keys[i]);
  }
}

function cacheable(response) {
  // Only complete, same-origin, successful responses. 206 partial responses cannot be stored.
  // (Pages are rendered per request and sent with no-store, so that header is deliberately not consulted:
  // the copy kept here is only ever used when the network is unreachable.)
  return !!response && response.status === 200 && response.type === "basic" && !response.redirected;
}

function offlineFallback() {
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>Offline · YoYo Videos</title></head>" +
    '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0e0f;color:#ececea;font-family:system-ui,sans-serif;text-align:center;padding:24px">' +
    '<div style="max-width:420px"><h1 style="font-size:22px;margin:0 0 8px">You\'re offline</h1>' +
    '<p style="color:#9b9a96;line-height:1.6;margin:0 0 20px">This page has not been saved on this device yet. Check your connection, then try again.</p>' +
    '<a href="" style="display:inline-block;background:#d63a1a;color:#fff;font-weight:500;text-decoration:none;padding:12px 24px;border-radius:8px">Try again</a>' +
    "</div></body></html>";
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

async function handleNavigation(event) {
  const request = event.request;
  try {
    const response = await fetch(request);
    if (cacheable(response)) {
      const copy = response.clone();
      event.waitUntil(
        caches
          .open(PAGES)
          .then((cache) => cache.put(request.url, copy))
          .then(() => trim(PAGES))
          .catch(() => {}),
      );
    }
    return response;
  } catch {
    const pages = await caches.open(PAGES);
    const cached = (await pages.match(request.url)) || (await pages.match(request.url, { ignoreSearch: true }));
    if (cached) return cached;
    return (await pages.match(OFFLINE_URL)) || offlineFallback();
  }
}

async function staleWhileRevalidate(event, cacheName) {
  const request = event.request;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (cacheable(response)) {
        const copy = response.clone();
        return cache
          .put(request, copy)
          .then(() => trim(cacheName))
          .catch(() => {})
          .then(() => response);
      }
      return response;
    });
  if (cached) {
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  return refresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  // Private areas and everything under /api (except public images/previews below) go straight to the network.
  if (NEVER_RE.test(path)) return;
  if (path.startsWith("/api/") && !MEDIA_RE.test(path)) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (MEDIA_RE.test(path)) {
    // Range requests (how <video> loads clips) get partial responses that cannot be cached; let them through.
    if (request.headers.has("range")) return;
    event.respondWith(staleWhileRevalidate(event, MEDIA));
    return;
  }

  if (path.startsWith("/_next/static/") || path.startsWith("/brand/")) {
    event.respondWith(staleWhileRevalidate(event, STATIC));
    return;
  }
  // Everything else (RSC payloads, images, etc.): default browser behaviour.
});

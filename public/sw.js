/**
 * aggroNATION service worker (FID-2026-0904-023 stream M) — deliberately
 * minimal: static assets cache-first, everything else network-first with an
 * offline fallback for navigations. No content caching (the site's honesty
 * contract — ISR + the CDN already own content freshness; a stale-content
 * SW would fight it).
 */

const CACHE_NAME = "aggronation-static-v1";
const OFFLINE_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Static assets: cache-first (immutable build output).
  if (url.pathname.startsWith("/_next/static")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Navigations: network-first, cached home as the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(
          (cached) =>
            cached ??
            new Response("Offline — reconnect to browse the index.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            }),
        ),
      ),
    );
  }
});

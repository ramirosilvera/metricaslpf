/*
 * Service worker mínimo de Matiz.
 *
 * Objetivo: hacer la app instalable (PWA) y dar un "app shell" offline, sin
 * arriesgar los datos del usuario (placard, auth, fotos), que viven en
 * Supabase y nunca deben servirse desde caché.
 *
 *  - Navegaciones HTML -> network-first (online siempre ves lo último;
 *    offline cae al HTML cacheado).
 *  - Assets estáticos con hash (css/js/img/fuentes) -> stale-while-revalidate.
 *  - TODO lo demás -> passthrough puro (no se llama respondWith). Cubre
 *    cualquier request a Supabase (API REST, Auth, Storage) y cualquier
 *    origen cruzado.
 */
const CACHE = "matiz-shell-v1";

const STATIC_ASSET = /\.(css|js|mjs|png|svg|ico|webp|jpg|jpeg|woff2?)(\?|$)/i;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // nunca tocar Supabase/otros orígenes

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/metricaslpf/"))),
    );
    return;
  }

  if (STATIC_ASSET.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            caches.open(CACHE).then((c) => c.put(request, res.clone()));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});

/*
 * Service worker mínimo de Métricas LPF.
 *
 * Objetivo: hacer la app instalable (PWA) y dar un "app shell" offline, SIN
 * arriesgar la carga de datos. Por eso es deliberadamente conservador:
 *
 *  - Navegaciones HTML -> network-first (online siempre ves lo último; offline
 *    cae al HTML cacheado).
 *  - Assets estáticos con hash (css/js/img/fuentes) -> stale-while-revalidate.
 *  - TODO lo demás -> passthrough puro (no se llama respondWith), o sea el
 *    navegador lo maneja como si el SW no existiera. Esto cubre:
 *      · datos que se auto-actualizan  (/data/, /data-parquet/, *.json, *.csv)
 *      · DuckDB-WASM  (*.wasm, *.worker.js, cualquier ruta con "duckdb")
 *      · *.parquet
 *      · cualquier origen cruzado (Cloudflare chat, extensions.duckdb.org, etc.)
 *
 * Resultado: nunca se sirve dato/WASM viejo desde caché; si algo falla, el peor
 * caso es que el SW no aporte (comportamiento idéntico a no tenerlo).
 */
// lpf-v1: se sube la versión al rebrand LPF para purgar el app-shell/CSS verde
// del Mundial cacheado en dispositivos (el handler de 'activate' borra las
// caches que no sean esta), así el layout viejo no queda pegado en el navegador.
const CACHE = "lpf-shell-v1";

// Rutas que el SW NO debe tocar bajo ninguna circunstancia.
const BYPASS = /\/(data|data-parquet)\/|\.(parquet|wasm|json|csv)(\?|$)|duckdb|\.worker\./i;
const STATIC_ASSET = /\.(css|js|mjs|png|svg|ico|webp|jpg|jpeg|woff2?)(\?|$)/i;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Solo mismo origen; todo lo cross-origin pasa de largo.
  if (url.origin !== self.location.origin) return;
  // Datos, WASM, workers y parquet: nunca desde caché.
  if (BYPASS.test(url.pathname)) return;

  // Navegaciones (HTML): network-first con fallback offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || (await caches.match(new URL("./", self.location).href)) || Response.error();
        }
      })(),
    );
    return;
  }

  // Assets estáticos con hash: stale-while-revalidate.
  if (STATIC_ASSET.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
  }
});

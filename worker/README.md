# Asistente de IA — Worker (proxy Gemini)

## Function-calling (consultas reales a Supabase)

El asistente no solo responde con texto "grounded" por el system prompt:
puede invocar 5 funciones RPC de Supabase (`get_team_summary`,
`get_team_matches`, `get_player_ranking`, `get_physical_leaders`,
`get_tactical_leaders`) para responder con números reales -- resumen de
una selección, ranking de jugadores por distancia/sprints/pases/tackles,
etc. Gemini decide cuándo necesita un dato concreto; el Worker ejecuta esa
función específica contra Supabase (con la clave `anon`, protegida por RLS
de solo lectura -- nunca SQL libre) y le devuelve el resultado antes de que
Gemini arme la respuesta final. Si `SUPABASE_URL`/`SUPABASE_ANON_KEY` no
están configuradas, el asistente sigue funcionando en modo texto-solamente
(sin esas herramientas).

## Por qué existe esto

El sitio es 100% estático (GitHub Pages). Una clave de API paga/prepaga
(como la de Gemini) **nunca** puede viajar en el JavaScript que se sirve al
navegador: cualquier visitante la vería con "ver código fuente" y podría
gastar el prepago. Este Worker es la única pieza de "backend" del proyecto:
un proxy gratuito (Cloudflare Workers, free tier) que guarda la clave como
secreto del lado del servidor y expone un único endpoint POST que el sitio
llama para chatear.

Nada de esto tiene costo: Cloudflare Workers free tier alcanza de sobra
para el tráfico de un proyecto de este tamaño (100.000 requests/día).

## Qué se carga como GitHub Secret (y por qué)

Se cargan **3 secrets** en GitHub (Settings del repo → Secrets and variables →
Actions → Secrets), nunca en el código:

| Secret | Qué es | Dónde se usa |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Token de Cloudflare con permiso para publicar Workers | `.github/workflows/deploy-worker.yml`, para hacer `wrangler deploy` |
| `CLOUDFLARE_ACCOUNT_ID` | ID de tu cuenta de Cloudflare | idem |
| `GEMINI_API_KEY` | Tu clave de Gemini (la prepaga) | el mismo workflow la sube como *secreto de Cloudflare* (`wrangler secret put`), así el Worker la lee en runtime sin que quede en ningún archivo del repo |

Además se carga **1 repository variable** (no secret, porque es pública igual
al terminar en el bundle del sitio): `PUBLIC_CHAT_API_URL`, la URL del Worker
ya deployado (algo como `https://metricasmundial2026-chat.<tu-subdominio>.workers.dev`).

## Setup manual (una sola vez)

1. **Crear cuenta gratuita en Cloudflare** (si no tenés): https://dash.cloudflare.com/sign-up

2. **Obtener el Account ID**: en el dashboard de Cloudflare, cualquier sitio o
   la página principal muestra "Account ID" en la barra lateral derecha.
   Copiarlo → va en el secret `CLOUDFLARE_ACCOUNT_ID`.

3. **Crear un API Token**: dashboard → ícono de perfil (arriba a la derecha) →
   "My Profile" → "API Tokens" → "Create Token" → usar la plantilla
   **"Edit Cloudflare Workers"** → Continue → Create Token. Copiarlo (solo se
   muestra una vez) → va en el secret `CLOUDFLARE_API_TOKEN`.

4. **Cargar los 3 secrets en GitHub**: en el repo, Settings → Secrets and
   variables → Actions → pestaña "Secrets" → "New repository secret", uno por
   uno:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `GEMINI_API_KEY` (tu clave prepaga de Gemini, de https://aistudio.google.com/apikey)

5. **Disparar el deploy del Worker**: el workflow `Deploy Worker (asistente IA)`
   corre solo automáticamente si tocás algo dentro de `worker/`. Como los
   secrets se cargan después de que el código ya está en el repo, hay que
   dispararlo manualmente una vez: pestaña "Actions" del repo → "Deploy Worker
   (asistente IA)" → "Run workflow".

6. **Copiar la URL del Worker**: al terminar el run, en los logs del paso
   "Deploy a Cloudflare Workers" aparece la URL publicada (formato
   `https://metricasmundial2026-chat.<subdominio>.workers.dev`). También se ve
   en el dashboard de Cloudflare → Workers & Pages.

7. **Cargar la URL como repository variable en GitHub**: Settings → Secrets
   and variables → Actions → pestaña **"Variables"** (no "Secrets") → "New
   repository variable" → nombre `PUBLIC_CHAT_API_URL`, valor la URL del
   paso anterior.

8. **Volver a deployar el sitio**: pestaña "Actions" → "Deploy a GitHub Pages"
   → "Run workflow" (o simplemente esperar al próximo push). A partir de ahí
   el botón de chat 💬 aparece en la esquina inferior derecha del sitio.

Listo — no hace falta tocar código para nada de esto.

## Rate limiting (opcional)

Por defecto el Worker admite hasta 15 mensajes por hora por IP usando
Cloudflare Workers KV. Si no se configura el namespace KV, el Worker igual
funciona (sin ese límite adicional). Para activarlo:

```bash
cd worker
npx wrangler kv namespace create RATE_LIMIT
```

Copiar el `id` que devuelve y descomentar/completar el bloque `[[kv_namespaces]]`
en `wrangler.toml`, después volver a correr el workflow de deploy del Worker.

## Desarrollo local

```bash
cd worker
npm install
npx wrangler dev
```

Wrangler pide login la primera vez (`npx wrangler login`) y permite setear
secretos locales con `npx wrangler secret put GEMINI_API_KEY`.

## Cambiar el modelo de Gemini

Editar `GEMINI_MODEL` en `wrangler.toml` (por defecto `gemini-flash-latest`,
el alias que Google mantiene apuntando al modelo flash vigente -- el más
barato/rápido, recomendado para mantener el uso del prepago bajo, y evita
tener que actualizar el nombre a mano cada vez que Google rota modelos).

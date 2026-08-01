# Métricas LPF

Herramienta de análisis abierto de la Liga Profesional Argentina: resultados y
tabla de posiciones, estadística táctica por partido y rendimiento individual
de jugadores por temporada, con datos 100% reales y verificables.

**100% gratuito, sin backend, sin base de datos tradicional.** GitHub Pages +
Astro (sitio estático) + Parquet versionado en git como fuente de verdad + JSON
pre-agregados para el frontend + GitHub Actions como motor ETL. Para consultas
libres, un explorador SQL corre DuckDB-WASM en el navegador directo sobre los
Parquet publicados.

## Estructura del repo

```
data/
  raw/        snapshots crudos tal cual se descargan (JSON)
  warehouse/  Parquet limpio y validado -- la fuente de verdad
  schemas/    (reservado para esquemas adicionales)
etl/          scripts Python: fetch, transformación, agregación, validación
site/         sitio Astro (React para los charts interactivos)
worker/       proxy serverless (Cloudflare Worker) para el asistente de IA -- ver worker/README.md
supabase/     migraciones SQL (schema + RPCs) para la base que usa el asistente de IA
.github/workflows/  actualización de datos (cron), deploy a GitHub Pages y deploy del Worker
tests/        tests de humo del pipeline (pytest)
```

## Cómo correr todo en local

```bash
# 1. Datos
pip install -r etl/requirements.txt
python etl/pipeline.py --skip-scrape   # reconstruye desde los datos ya versionados
# (sin --skip-scrape corre fetch_espn_lpf.py y fetch_fotmob_lpf.py de nuevo)

# 2. Sitio
cd site
npm install
npm run dev       # http://localhost:4321/metricaslpf/
npm run build      # genera site/dist/
```

## Estado real de los datos (ver también `/fuentes/` en el sitio)

- **Tabla, resultados y estadística táctica por partido** (posesión-proxy,
  remates, pases, faltas, córners, offsides, atajadas): datos reales de
  **ESPN**, API pública sin key, cargados partido a partido para toda la
  temporada en curso (`etl/fetch_espn_lpf.py`).
- **Rendimiento individual de jugadores**: datos reales de **FotMob** (37
  categorías: goles, xG, xA, pases, tackles, atajadas, tarjetas y más), API
  pública sin key (`etl/fetch_fotmob_lpf.py`). Es un acumulado de TEMPORADA,
  no de partido -- ESPN no publica estadística individual por partido para
  esta competición (el endpoint viene vacío en todas las pruebas realizadas).
- **Sin dato físico/GPS**: no existe una fuente gratuita de distancia, sprints
  o velocidad punta para ninguna liga, LPF incluida -- es data propietaria de
  cada club vía su proveedor de hardware, nunca publicada. Se investigó a
  fondo (fbref/WhoScored/SofaScore bloquean scraping; API-Football, ESPN,
  FotMob y los sitios de AFA/Liga Profesional no lo publican) y se documenta
  como fuente faltante en vez de omitirlo en silencio.

El sitio nunca muestra un dato inventado: mientras una fuente no tenga datos
reales cargados, la sección correspondiente queda marcada explícitamente como
"pendiente" (ver el banner de estado en cada página, y el detalle completo por
fuente en `/fuentes/`).

## Metodología

Antes de leer cualquier gráfico, ver **`/metodologia/`** en el sitio (o
`site/src/pages/metodologia.astro`): qué mide cada fuente y qué no mide, cómo
leer las escalas de normalización, sesgos y variables de confusión propias de
fútbol de clubes, y métricas engañosas vs. robustas.

## Asistente de IA

El sitio incluye un chat opcional (botón 💬 abajo a la derecha) que responde
preguntas sobre las métricas y cómo interpretarlas, usando Gemini con
function-calling contra una base Supabase (Postgres) que espeja el warehouse
Parquet -- la única pieza del proyecto con base de datos, y de solo lectura vía
RPCs con RLS (nunca SQL libre). Como el sitio es estático, la clave de la API
de Gemini nunca viaja al navegador: hay un proxy serverless gratuito
(Cloudflare Workers) que la guarda del lado del servidor. Ver
**`worker/README.md`** para el setup manual (secrets de GitHub necesarios) --
son unos pocos pasos de una sola vez, sin tocar código. Si no se configura, el
sitio funciona igual y el botón de chat simplemente no aparece.

## Licencia de los datos

- ESPN y FotMob: APIs públicas sin key, uso no documentado formalmente pero
  ampliamente usado en proyectos de datos deportivos -- revisar ToS antes de
  escalar el volumen de requests.

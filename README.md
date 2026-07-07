# Métricas Mundial 2026

Análisis abierto del rendimiento físico y táctico en el Mundial 2026, centrado en
poner a prueba (no confirmar) la hipótesis de que la Selección Argentina tiene una
desventaja física frente a otras selecciones.

**100% gratuito, sin backend, sin base de datos tradicional.** GitHub Pages +
Astro (sitio estático) + Parquet versionado en git como fuente de verdad + JSON
pre-agregados para el frontend + GitHub Actions como motor ETL. Para consultas
libres, un explorador SQL corre DuckDB-WASM en el navegador directo sobre los
Parquet publicados.

## Estructura del repo

```
data/
  raw/        snapshots crudos tal cual se descargan/scrapean (JSON, HTML)
  warehouse/  Parquet limpio y validado -- la fuente de verdad
  schemas/    (reservado para esquemas adicionales)
etl/          scripts Python: scraping, transformación, agregación, validación
site/         sitio Astro (React para los charts interactivos)
.github/workflows/  actualización de datos (cron) y deploy a GitHub Pages
tests/        tests de humo del pipeline (pytest)
```

## Cómo correr todo en local

```bash
# 1. Datos
pip install -r etl/requirements.txt
python etl/pipeline.py --skip-scrape   # reconstruye desde los datos ya versionados
# (sin --skip-scrape intenta correr los scrapers de FIFA Training Centre / Transfermarkt también)

# 2. Sitio
cd site
npm install
npm run dev       # http://localhost:4321/metricasmundial2026/
npm run build      # genera site/dist/
```

## Estado real de los datos (ver también etl/README.md)

- **Contexto táctico** (posesión-proxy, pases, remates, formaciones, minutos
  jugados): datos reales de **StatsBomb Open Data**, cargados para los partidos
  de Argentina en los Mundiales 2018 y 2022.
- **Métricas físicas** (distancia, alta intensidad, sprints) de **FIFA Training
  Centre**: el scraper está escrito pero no pudo probarse contra el sitio real
  desde el entorno donde se armó este scaffold (bloqueado por la política de red
  de ese entorno). Corre de verdad la primera vez en GitHub Actions.
- **Edad de plantel** (Transfermarkt): mismo caso, y además falta completar el
  mapeo de URLs por selección en `etl/scrape_transfermarkt_squads.py`.

El sitio nunca muestra un dato inventado: mientras una fuente no tenga datos
reales cargados, la sección correspondiente queda marcada explícitamente como
"pendiente" (ver el banner de estado en cada página).

## Metodología

Antes de leer cualquier gráfico, ver **`/metodologia/`** en el sitio (o
`site/src/pages/metodologia.astro`): sesgos conocidos, variables de confusión,
métricas engañosas vs. robustas, y cómo se valida la hipótesis dado el tamaño de
muestra chico de un solo torneo.

## Licencia de los datos

- StatsBomb Open Data: uso no comercial, ver
  [LICENSE](https://github.com/statsbomb/open-data/blob/master/LICENSE.pdf).
- FIFA Training Centre / Transfermarkt: fuentes públicas, scraping respetuoso
  (rate-limited, User-Agent identificable) — revisar ToS antes de escalar el
  volumen de requests.

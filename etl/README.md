# ETL — Métricas Mundial 2026

Pipeline sin backend: todo corre como scripts Python disparados por
GitHub Actions (o a mano en local), lee/escribe archivos planos (JSON
crudo → CSV tidy → Parquet → JSON agregado), y el resultado se sirve
como sitio estático.

## Orden de ejecución

```
fetch_statsbomb_open_data.py  ─┐
scrape_fifa_training_centre.py ─┼─► build_statsbomb_features.py ─► build_warehouse.py ─► validate.py ─► build_aggregates.py
scrape_transfermarkt_squads.py ┘
```

`pipeline.py` corre todo en orden. En CI se usa así (ver
`.github/workflows/update-data.yml`):

```bash
pip install -r etl/requirements.txt
python etl/pipeline.py --allow-scrape-failures
```

`--allow-scrape-failures` evita que el pipeline entero se caiga si, por
ejemplo, FIFA todavía no publicó el reporte físico de un partido reciente
— se publica igual lo que ya está validado, y el fallo puntual queda
registrado en `data/raw/*/_failed.*` para revisión.

## Estado real al momento de armar este scaffold

- **StatsBomb (contexto táctico)**: datos reales ya cargados para los
  partidos de Argentina en los Mundiales 2018 y 2022 (11 partidos). Se
  puede ampliar a otras selecciones/torneos corriendo
  `fetch_statsbomb_open_data.py --season 2022 --team "<selección>"`.
- **FIFA Training Centre (métricas físicas)**: el scraper está escrito
  pero **no pudo probarse contra el HTML real** porque el entorno donde
  se desarrolló este proyecto bloquea la salida de red hacia ese dominio.
  Va a correr por primera vez de verdad en GitHub Actions. Si la
  estructura de la página no matchea lo esperado, el script falla de
  forma visible (no inventa datos) y hay que ajustar
  `_parse_physical_table()` mirando el HTML real.
- **Transfermarkt (edad de plantel)**: mismo caso — scraper escrito, sin
  probar contra HTML real, y además falta completar `TEAM_SQUAD_URLS`
  con las URLs de las 48 selecciones de 2026 antes de la primera corrida.

## Por qué Parquet + JSON y no una base de datos

`data/warehouse/*.parquet` es la fuente de verdad, versionada en git,
consultable con DuckDB/pandas por cualquiera que clone el repo. Los
`site/public/data/*.json` son vistas pre-agregadas para que el frontend
no tenga que hacer joins en el cliente. Para consultas ad-hoc más ricas,
el sitio expone un explorador SQL con DuckDB-WASM que lee los Parquet
directo desde GitHub Pages/CDN — sin backend, sin servidor de base de
datos.

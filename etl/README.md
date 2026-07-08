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
- **FIFA Training Centre (métricas físicas)**: confirmado en corridas
  reales en GitHub Actions que el Match Report Hub no tiene tablas HTML —
  linkea a PDFs oficiales "PMSR" (`PMSR-M19-ARG-V-ALG.pdf`, uno por
  partido ya jugado, para las 3 fases publicadas hasta ahora: hub
  principal + sub-hub de knockout stage). El scraper ya descubre esos PDFs
  automáticamente y arma con ellos un registro propio de partidos 2026
  (`matches_fifa2026.csv`, se mergea con los partidos de StatsBomb en
  `matches.parquet`). Ya viene corriendo en producción vía `update-data.yml`
  con cobertura incremental (procesa unos pocos PDFs por corrida, prioriza
  los partidos de Argentina, y cachea lo ya procesado entre corridas).
  Cada PDF trae, además de la página física, ~130 tablas de estadística
  táctica por jugador (pases, presión, duelos, ofertas de recepción) que el
  scraper extrae en la misma pasada -- sin descargas extra -- y publica en
  `tactical_player_match_stats.csv` (único dato táctico real que existe hoy
  para el Mundial 2026, ya que StatsBomb todavía no publicó eventos de este
  torneo).
- **Transfermarkt (edad/valor de mercado de plantel)**: el scraper
  *descubre* las 48 selecciones del Mundial 2026 recorriendo la página de
  participantes del torneo (no depende de un mapeo hardcodeado de URLs por
  selección), y de cada plantel extrae edad (calculada al inicio del
  torneo, no "hoy") y valor de mercado. Como con FIFA, no se pudo probar
  contra HTML real desde el sandbox de desarrollo — vuelca
  `_discovery_status.json` y `raw_hub.html` en la primera corrida real
  para poder ajustar el parsing si la estructura no coincide.

## Por qué Parquet + JSON y no una base de datos

`data/warehouse/*.parquet` es la fuente de verdad, versionada en git,
consultable con DuckDB/pandas por cualquiera que clone el repo. Los
`site/public/data/*.json` son vistas pre-agregadas para que el frontend
no tenga que hacer joins en el cliente. Para consultas ad-hoc más ricas,
el sitio expone un explorador SQL con DuckDB-WASM que lee los Parquet
directo desde GitHub Pages/CDN — sin backend, sin servidor de base de
datos.

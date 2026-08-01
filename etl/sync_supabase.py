"""Sincroniza el warehouse Parquet hacia Supabase (schema metricas_mundial),
que pasa a ser la base de datos canónica del proyecto.

Dual-write a propósito: site/public/data/*.json y el Parquet publicado en
site/public/data-parquet/ (para el explorador DuckDB-WASM) se siguen
generando igual que antes -- el sitio estático no depende de que Supabase
esté despierto para cargar. Supabase habilita lo nuevo: que el asistente de
IA pueda hacer function-calling con datos reales, y a futuro, queries en
vivo desde el sitio.

Necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (nunca la clave anon --
las políticas RLS de estas tablas son de solo lectura para anon/authenticated;
solo el service role, que bypassea RLS, puede escribir). Si no están
seteadas, se saltea sin romper el pipeline, igual que los scrapers opcionales.

Todas las tablas sincronizan en modo REPLACE (delete-all + insert), no upsert
por PK. Motivo: la transformación Mundial 2026 -> LPF cambió el universo de
entidades por completo (48 selecciones -> 30 clubes de otro país). Un upsert
por PK nunca hubiera borrado las filas viejas (claves distintas, sin
conflicto) -- quedaban conviviendo selecciones del Mundial y clubes de LPF en
la misma tabla para siempre. Se detectó exactamente eso corriendo en
producción (matches/team_profile/squad_market_value con miles de filas
Mundial nunca limpiadas) y se limpió a mano una vez; de acá en más el modo
REPLACE lo previene solo en cada corrida.

El delete-all necesita un filtro explícito (PostgREST no permite un DELETE sin
WHERE), y ese filtro tiene que apuntar a una columna que exista en la tabla y
sea NOT NULL -- no todas las tablas tienen un "id" serrogate, varias usan una
clave natural/compuesta como PK. Por eso TABLES lleva, por tabla, el nombre de
la columna a usar en el filtro `?<col>=not.is.null` (matchea todo sin
arriesgar un delete accidental sin filtro).

Uso:
    python etl/sync_supabase.py
"""
from __future__ import annotations

import os
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent
WAREHOUSE = ROOT / "data" / "warehouse"
SCHEMA = "metricas_mundial"
CHUNK_SIZE = 500
REQUEST_TIMEOUT_S = 30

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# (archivo en data/warehouse/, tabla en Supabase, columna NOT NULL para el
# filtro del delete-all) -- todas opcionales, se saltean si el Parquet todavía
# no existe. Todas en modo REPLACE (ver docstring del módulo).
#
# physical_match_stats / physical_player_match_stats NO están acá: no existe
# dato físico/GPS gratuito para LPF y build_warehouse.py ya no genera esos
# Parquet (ver docstring de fetch_espn_lpf.py) -- se limpiaron a mano una vez
# en Supabase, no van a volver a poblarse.
TABLES = [
    ("matches.parquet", "matches", "match_id"),
    ("team_match_stats_tactical.parquet", "team_match_stats_tactical", "match_id"),
    ("player_match_appearances.parquet", "player_match_appearances", "match_id"),
    ("tactical_player_match_stats.parquet", "tactical_player_match_stats", "id"),
    ("squads.parquet", "squad_market_value", "team"),
    ("team_profile.parquet", "team_profile", "team"),
    ("standings.parquet", "standings", "team"),
    ("player_season_stats.parquet", "player_season_stats", "id"),
    ("goal_events.parquet", "goal_events", "id"),
    ("derived_team_metrics.parquet", "derived_team_metrics", "team"),
    ("derived_team_style.parquet", "derived_team_style", "team"),
    ("derived_player_metrics.parquet", "derived_player_metrics", "player_name"),
]


def _records(df: pd.DataFrame) -> list[dict]:
    """Igual que build_aggregates._records: NaN/NaT -> None antes de mandar
    JSON, porque Postgres/PostgREST no entiende el NaN de pandas.

    Además, un entero con algún NaN en la columna (ej. jersey_number con
    algunos jugadores sin dorsal) pierde el dtype entero en pandas y pasa a
    float64 -- valores como 42 quedan en 42.0 y se serializan como "42.0",
    que Postgres rechaza para columnas integer/bigint (su parser no acepta
    punto decimal, aunque el valor sea entero). Los floats sin parte
    fraccionaria se bajan a int acá: es seguro también para columnas
    numeric/double precision, que aceptan literales enteros sin problema.
    """
    records = df.astype(object).where(df.notna(), None).to_dict(orient="records")
    for row in records:
        for key, value in row.items():
            if isinstance(value, float) and value.is_integer():
                row[key] = int(value)
    return records


def _base_headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        # Content-Profile le dice a PostgREST en qué schema está la tabla --
        # sin esto busca en "public" en vez de metricas_mundial.
        "Content-Profile": SCHEMA,
    }


def _delete_all(table: str, filter_col: str) -> None:
    # PostgREST exige un filtro para borrar; `<col>=not.is.null` matchea todo
    # (la columna es NOT NULL -- PK o parte de una). Evita un DELETE sin WHERE
    # accidental sin asumir que la tabla tiene un "id" serrogate (la mayoría no
    # lo tiene: usan clave natural/compuesta).
    url = f"{SUPABASE_URL}/rest/v1/{table}?{filter_col}=not.is.null"
    headers = {**_base_headers(), "Prefer": "return=minimal"}
    resp = requests.delete(url, headers=headers, timeout=REQUEST_TIMEOUT_S)
    if not resp.ok:
        raise RuntimeError(f"{table} (delete): HTTP {resp.status_code} -- {resp.text[:500]}")


def _upsert(table: str, rows: list[dict], filter_col: str) -> None:
    # Borrar todo ANTES de mirar si hay filas nuevas -- una tabla que hoy tiene
    # 0 filas reales (ej. tactical_player_match_stats, siempre vacía para LPF)
    # igual tiene que vaciarse de datos viejos en cada corrida, no solo cuando
    # hay algo para insertar.
    _delete_all(table, filter_col)
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {**_base_headers(), "Prefer": "return=minimal"}
    for i in range(0, len(rows), CHUNK_SIZE):
        chunk = rows[i : i + CHUNK_SIZE]
        resp = requests.post(url, json=chunk, headers=headers, timeout=REQUEST_TIMEOUT_S)
        if not resp.ok:
            raise RuntimeError(f"{table}: HTTP {resp.status_code} -- {resp.text[:500]}")


def sync():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configurados -- se saltea la sincronizacion.")
        return

    for filename, table, filter_col in TABLES:
        path = WAREHOUSE / filename
        if not path.exists():
            continue
        rows = _records(pd.read_parquet(path))
        _upsert(table, rows, filter_col)
        print(f"  {table}: {len(rows)} filas sincronizadas (reemplazo)")


if __name__ == "__main__":
    sync()

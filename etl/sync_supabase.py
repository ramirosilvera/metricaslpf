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

# Sentinela: la tabla no tiene clave natural única (solo un id serrogate), así
# que un upsert por merge-duplicates duplicaría filas en cada corrida. Para esas
# se hace reemplazo total: borrar todo e insertar de nuevo (idempotente).
REPLACE = "__replace__"

# (archivo en data/warehouse/, tabla en Supabase, conflict) -- todas opcionales,
# se saltean si el Parquet todavía no existe. Todas en modo REPLACE (ver
# docstring del módulo) salvo que en el futuro alguna tabla vuelva a tener un
# universo de entidades estable entre corridas.
#
# physical_match_stats / physical_player_match_stats NO están acá: no existe
# dato físico/GPS gratuito para LPF y build_warehouse.py ya no genera esos
# Parquet (ver docstring de fetch_espn_lpf.py) -- se limpiaron a mano una vez
# en Supabase, no van a volver a poblarse.
TABLES = [
    ("matches.parquet", "matches", REPLACE),
    ("team_match_stats_tactical.parquet", "team_match_stats_tactical", REPLACE),
    ("player_match_appearances.parquet", "player_match_appearances", REPLACE),
    ("tactical_player_match_stats.parquet", "tactical_player_match_stats", REPLACE),
    ("squads.parquet", "squad_market_value", REPLACE),
    ("team_profile.parquet", "team_profile", REPLACE),
    ("standings.parquet", "standings", REPLACE),
    ("player_season_stats.parquet", "player_season_stats", REPLACE),
    ("goal_events.parquet", "goal_events", REPLACE),
    ("derived_team_metrics.parquet", "derived_team_metrics", REPLACE),
    ("derived_team_style.parquet", "derived_team_style", REPLACE),
    ("derived_player_metrics.parquet", "derived_player_metrics", REPLACE),
]


def _records(df: pd.DataFrame) -> list[dict]:
    """Igual que build_aggregates._records: NaN/NaT -> None antes de mandar
    JSON, porque Postgres/PostgREST no entiende el NaN de pandas."""
    return df.astype(object).where(df.notna(), None).to_dict(orient="records")


def _base_headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        # Content-Profile le dice a PostgREST en qué schema está la tabla --
        # sin esto busca en "public" en vez de metricas_mundial.
        "Content-Profile": SCHEMA,
    }


def _delete_all(table: str) -> None:
    # PostgREST exige un filtro para borrar; `id=gte.0` matchea todo (los id son
    # bigserial >= 1). Evita un DELETE sin WHERE accidental.
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=gte.0"
    headers = {**_base_headers(), "Prefer": "return=minimal"}
    resp = requests.delete(url, headers=headers, timeout=REQUEST_TIMEOUT_S)
    if not resp.ok:
        raise RuntimeError(f"{table} (delete): HTTP {resp.status_code} -- {resp.text[:500]}")


def _upsert(table: str, rows: list[dict], conflict: str | None = None) -> None:
    # REPLACE: borrar todo ANTES de mirar si hay filas nuevas -- una tabla que
    # hoy tiene 0 filas reales (ej. tactical_player_match_stats, siempre vacía
    # para LPF) igual tiene que vaciarse de datos viejos en cada corrida, no
    # solo cuando hay algo para insertar.
    if conflict == REPLACE:
        _delete_all(table)
        if not rows:
            return
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        headers = {**_base_headers(), "Prefer": "return=minimal"}
    else:
        if not rows:
            return
        # on_conflict explícito cuando la clave natural NO es la PK (id surrogate
        # + UNIQUE aparte); si no, merge-duplicates concilia por PK y nunca dedup.
        params = f"?on_conflict={conflict}" if conflict else ""
        url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
        headers = {**_base_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"}
    for i in range(0, len(rows), CHUNK_SIZE):
        chunk = rows[i : i + CHUNK_SIZE]
        resp = requests.post(url, json=chunk, headers=headers, timeout=REQUEST_TIMEOUT_S)
        if not resp.ok:
            raise RuntimeError(f"{table}: HTTP {resp.status_code} -- {resp.text[:500]}")


def sync():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configurados -- se saltea la sincronizacion.")
        return

    for filename, table, conflict in TABLES:
        path = WAREHOUSE / filename
        if not path.exists():
            continue
        rows = _records(pd.read_parquet(path))
        _upsert(table, rows, conflict)
        modo = "reemplazo" if conflict == REPLACE else (f"upsert on {conflict}" if conflict else "upsert (PK)")
        print(f"  {table}: {len(rows)} filas sincronizadas ({modo})")


if __name__ == "__main__":
    sync()

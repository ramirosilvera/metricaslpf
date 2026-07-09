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

# (archivo en data/warehouse/, nombre de la tabla en Supabase) -- todas
# opcionales, se saltean si el Parquet todavía no existe.
TABLES = [
    ("matches.parquet", "matches"),
    ("team_match_stats_tactical.parquet", "team_match_stats_tactical"),
    ("player_match_appearances.parquet", "player_match_appearances"),
    ("physical_match_stats.parquet", "physical_match_stats"),
    ("physical_player_match_stats.parquet", "physical_player_match_stats"),
    ("tactical_player_match_stats.parquet", "tactical_player_match_stats"),
    ("squads.parquet", "squad_market_value"),
    ("team_profile.parquet", "team_profile"),
    ("goal_events.parquet", "goal_events"),
    ("derived_team_metrics.parquet", "derived_team_metrics"),
    ("derived_team_style.parquet", "derived_team_style"),
    ("derived_player_metrics.parquet", "derived_player_metrics"),
]


def _records(df: pd.DataFrame) -> list[dict]:
    """Igual que build_aggregates._records: NaN/NaT -> None antes de mandar
    JSON, porque Postgres/PostgREST no entiende el NaN de pandas."""
    return df.astype(object).where(df.notna(), None).to_dict(orient="records")


def _upsert(table: str, rows: list[dict]) -> None:
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        # Content-Profile le dice a PostgREST en qué schema está la tabla --
        # sin esto busca en "public" en vez de metricas_mundial.
        "Content-Profile": SCHEMA,
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    for i in range(0, len(rows), CHUNK_SIZE):
        chunk = rows[i : i + CHUNK_SIZE]
        resp = requests.post(url, json=chunk, headers=headers, timeout=REQUEST_TIMEOUT_S)
        if not resp.ok:
            raise RuntimeError(f"{table}: HTTP {resp.status_code} -- {resp.text[:500]}")


def sync():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configurados -- se saltea la sincronizacion.")
        return

    for filename, table in TABLES:
        path = WAREHOUSE / filename
        if not path.exists():
            continue
        rows = _records(pd.read_parquet(path))
        _upsert(table, rows)
        print(f"  {table}: {len(rows)} filas sincronizadas")


if __name__ == "__main__":
    sync()

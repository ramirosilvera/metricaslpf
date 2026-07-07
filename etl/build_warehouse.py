"""Consolida las tablas procesadas (CSV de distintas fuentes) en el
warehouse Parquet versionado en data/warehouse/. Esta es la "fuente de
verdad" del proyecto: todo lo que consume el sitio sale, en última
instancia, de estos Parquet.

Fuentes que combina (cada una opcional -- si no existe el CSV, se saltea):
  - data/raw/statsbomb/_processed/*.csv        (contexto táctico, real)
  - data/raw/fifa_training_centre/_processed/*.csv (métricas físicas)
  - data/raw/transfermarkt/_processed/*.csv    (edad de planteles)

Uso:
    python etl/build_warehouse.py
"""
from __future__ import annotations

from pathlib import Path

import duckdb
import pandas as pd

from schemas import (
    MatchesSchema,
    TeamMatchStatsSchema,
    PlayerAppearancesSchema,
    PhysicalMatchStatsSchema,
    SquadsSchema,
)

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
WAREHOUSE = ROOT / "data" / "warehouse"


def _read_csv_if_exists(path: Path) -> pd.DataFrame | None:
    if path.exists() and path.stat().st_size > 0:
        return pd.read_csv(path, dtype=str).convert_dtypes()
    return None


def build():
    WAREHOUSE.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()

    # --- matches ---
    matches = _read_csv_if_exists(RAW / "statsbomb" / "_processed" / "matches.csv")
    if matches is not None:
        matches = matches.astype({"match_id": "int64", "home_score": "int64", "away_score": "int64"})
        matches = MatchesSchema.validate(matches)
        con.register("matches_df", matches)
        con.execute(f"COPY matches_df TO '{WAREHOUSE / 'matches.parquet'}' (FORMAT PARQUET)")
        print(f"matches.parquet: {len(matches)} filas")

    # --- team_match_stats (StatsBomb: contexto táctico) ---
    team_stats = _read_csv_if_exists(RAW / "statsbomb" / "_processed" / "team_match_stats.csv")
    if team_stats is not None:
        num_cols = ["passes_attempted", "passes_completed", "shots_total", "shots_on_target", "goals", "fouls_committed"]
        team_stats = team_stats.astype({"match_id": "int64", **{c: "int64" for c in num_cols}})
        team_stats["possession_share_proxy"] = team_stats["possession_share_proxy"].astype(float)
        team_stats["pass_accuracy_pct"] = pd.to_numeric(team_stats["pass_accuracy_pct"], errors="coerce")
        team_stats = TeamMatchStatsSchema.validate(team_stats)
        con.register("team_stats_df", team_stats)
        con.execute(f"COPY team_stats_df TO '{WAREHOUSE / 'team_match_stats_tactical.parquet'}' (FORMAT PARQUET)")
        print(f"team_match_stats_tactical.parquet: {len(team_stats)} filas")

    # --- player_match_appearances ---
    appearances = _read_csv_if_exists(RAW / "statsbomb" / "_processed" / "player_match_appearances.csv")
    if appearances is not None:
        appearances = appearances.astype({"match_id": "int64", "minutes_played": "int64"})
        appearances = PlayerAppearancesSchema.validate(appearances)
        con.register("app_df", appearances)
        con.execute(f"COPY app_df TO '{WAREHOUSE / 'player_match_appearances.parquet'}' (FORMAT PARQUET)")
        print(f"player_match_appearances.parquet: {len(appearances)} filas")

    # --- physical_match_stats (FIFA Training Centre) ---
    physical = _read_csv_if_exists(RAW / "fifa_training_centre" / "_processed" / "physical_match_stats.csv")
    if physical is not None:
        physical = physical.astype({"match_id": "int64"})
        for c in ["total_distance_km", "high_intensity_distance_m", "sprint_distance_m", "sprint_count", "top_speed_kmh"]:
            physical[c] = pd.to_numeric(physical[c], errors="coerce")
        physical = PhysicalMatchStatsSchema.validate(physical)
        con.register("phys_df", physical)
        con.execute(f"COPY phys_df TO '{WAREHOUSE / 'physical_match_stats.parquet'}' (FORMAT PARQUET)")
        print(f"physical_match_stats.parquet: {len(physical)} filas")
    else:
        print("physical_match_stats: sin datos todavia (pendiente de la primera corrida del scraper en GitHub Actions)")

    # --- squads (Transfermarkt: edad de plantel) ---
    squads = _read_csv_if_exists(RAW / "transfermarkt" / "_processed" / "squads.csv")
    if squads is not None:
        squads = SquadsSchema.validate(squads)
        con.register("squads_df", squads)
        con.execute(f"COPY squads_df TO '{WAREHOUSE / 'squads.parquet'}' (FORMAT PARQUET)")
        print(f"squads.parquet: {len(squads)} filas")
    else:
        print("squads: sin datos todavia (pendiente de la primera corrida del scraper en GitHub Actions)")

    con.close()


if __name__ == "__main__":
    build()

"""Valida los Parquet del warehouse contra los esquemas de schemas.py.
Se corre en CI antes de aceptar datos nuevos -- si algo no cumple el
esquema, el pipeline falla y no se publica nada roto.

Uso:
    python etl/validate.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from schemas import (
    MatchesSchema,
    TeamMatchStatsSchema,
    PlayerAppearancesSchema,
    TacticalPlayerMatchStatsSchema,
    SquadsSchema,
    TeamProfileSchema,
    GoalEventsSchema,
    DerivedTeamMetricsSchema,
    DerivedTeamStyleSchema,
    DerivedPlayerMetricsSchema,
    StandingsSchema,
    PlayerSeasonStatsSchema,
)

WAREHOUSE = Path(__file__).resolve().parent.parent / "data" / "warehouse"

# physical_match_stats/physical_player_match_stats NO están acá a propósito:
# no existen para Métricas LPF (sin fuente gratuita de datos GPS, ver
# build_warehouse.py) -- nunca se generan, así que no hay nada que validar.
CHECKS = [
    ("matches.parquet", MatchesSchema),
    ("team_match_stats_tactical.parquet", TeamMatchStatsSchema),
    ("player_match_appearances.parquet", PlayerAppearancesSchema),
    ("tactical_player_match_stats.parquet", TacticalPlayerMatchStatsSchema),
    ("squads.parquet", SquadsSchema),
    ("team_profile.parquet", TeamProfileSchema),
    ("goal_events.parquet", GoalEventsSchema),
    ("standings.parquet", StandingsSchema),
    ("player_season_stats.parquet", PlayerSeasonStatsSchema),
    ("derived_team_metrics.parquet", DerivedTeamMetricsSchema),
    ("derived_team_style.parquet", DerivedTeamStyleSchema),
    ("derived_player_metrics.parquet", DerivedPlayerMetricsSchema),
]


def main() -> int:
    ok = True
    for filename, schema in CHECKS:
        path = WAREHOUSE / filename
        if not path.exists():
            print(f"SKIP  {filename} (no existe todavia)")
            continue
        df = pd.read_parquet(path)
        try:
            schema.validate(df, lazy=True)
            print(f"OK    {filename} ({len(df)} filas)")
        except Exception as exc:  # pandera.errors.SchemaErrors
            ok = False
            print(f"FALLO {filename}\n{exc}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

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
    PhysicalMatchStatsSchema,
    PhysicalPlayerMatchStatsSchema,
    SquadsSchema,
)

WAREHOUSE = Path(__file__).resolve().parent.parent / "data" / "warehouse"

CHECKS = [
    ("matches.parquet", MatchesSchema),
    ("team_match_stats_tactical.parquet", TeamMatchStatsSchema),
    ("player_match_appearances.parquet", PlayerAppearancesSchema),
    ("physical_match_stats.parquet", PhysicalMatchStatsSchema),
    ("physical_player_match_stats.parquet", PhysicalPlayerMatchStatsSchema),
    ("squads.parquet", SquadsSchema),
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

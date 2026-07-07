"""Tests de humo del pipeline ETL. Corren rápido y no dependen de red:
usan los datos ya versionados en data/raw y data/warehouse.
"""
import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "etl"))

WAREHOUSE = ROOT / "data" / "warehouse"


def test_matches_parquet_exists_and_has_rows():
    df = pd.read_parquet(WAREHOUSE / "matches.parquet")
    assert len(df) > 0
    assert df["match_id"].is_unique


def test_team_match_stats_possession_in_range():
    df = pd.read_parquet(WAREHOUSE / "team_match_stats_tactical.parquet")
    assert (df["possession_share_proxy"] >= 0).all()
    assert (df["possession_share_proxy"] <= 1).all()


def test_possession_proxy_sums_to_one_per_match():
    df = pd.read_parquet(WAREHOUSE / "team_match_stats_tactical.parquet")
    totals = df.groupby("match_id")["possession_share_proxy"].sum()
    assert (totals.round(2) == 1.0).all()


def test_player_minutes_within_match_bounds():
    df = pd.read_parquet(WAREHOUSE / "player_match_appearances.parquet")
    assert (df["minutes_played"] >= 0).all()
    assert (df["minutes_played"] <= 130).all()


def test_player_minutes_aggregate_has_no_duplicate_players():
    agg_path = ROOT / "site" / "public" / "data" / "player_minutes_ranking.json"
    if not agg_path.exists():
        pytest.skip("build_aggregates.py no corrio todavia")
    import json

    rows = json.loads(agg_path.read_text())
    keys = [(r["team"], r["player_id"]) for r in rows]
    assert len(keys) == len(set(keys)), "un mismo jugador aparece mas de una vez (bug de agrupacion)"


def test_schemas_validate():
    from schemas import MatchesSchema, TeamMatchStatsSchema, PlayerAppearancesSchema

    MatchesSchema.validate(pd.read_parquet(WAREHOUSE / "matches.parquet"))
    TeamMatchStatsSchema.validate(pd.read_parquet(WAREHOUSE / "team_match_stats_tactical.parquet"))
    PlayerAppearancesSchema.validate(pd.read_parquet(WAREHOUSE / "player_match_appearances.parquet"))

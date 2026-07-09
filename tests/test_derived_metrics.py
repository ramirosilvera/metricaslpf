"""Tests unitarios de la lógica de transformación de métricas derivadas y de
la serialización a Supabase/JSON. A diferencia de test_warehouse.py (que hace
smoke tests sobre los Parquet ya publicados), estos ejercitan las funciones
puras con datos sintéticos conocidos, para atrapar regresiones en la
matemática de z-score/percentil y en el manejo de NaN -- las dos piezas cuyo
error se publicaría en silencio como un número corrupto en el sitio.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "etl"))

from build_derived_metrics import _zscore_percentile, _squad_metrics  # noqa: E402
from sync_supabase import _records  # noqa: E402


def _df(metric, values, season="2026"):
    return pd.DataFrame({"metric": metric, "season": season, "value": values})


def test_zscore_matches_manual_calculation():
    # valores [1,2,3,4,5] -> mean 3, std muestral sqrt(2.5)=1.58114
    df = _df("m", [1.0, 2.0, 3.0, 4.0, 5.0])
    out = _zscore_percentile(df, "value", ["metric", "season"])
    z = dict(zip(df["value"], out["z_score"]))
    assert z[3.0] == 0.0
    assert z[5.0] == round((5 - 3) / np.std([1, 2, 3, 4, 5], ddof=1), 2)
    assert z[1.0] == -z[5.0]


def test_percentile_is_rank_and_within_bounds():
    df = _df("m", [10.0, 20.0, 30.0, 40.0, 50.0])
    out = _zscore_percentile(df, "value", ["metric", "season"])
    pct = dict(zip(df["value"], out["percentile"]))
    assert pct[50.0] == 100.0  # el mayor -> percentil 100
    assert pct[10.0] == 20.0   # 1 de 5 -> 20
    assert (out["percentile"] >= 0).all() and (out["percentile"] <= 100).all()


def test_zscore_constant_group_is_nan_not_zero_division():
    # std == 0 debe convertirse en NaN (replace(0, nan)), no romper ni dar inf
    df = _df("m", [4.0, 4.0, 4.0])
    out = _zscore_percentile(df, "value", ["metric", "season"])
    assert out["z_score"].isna().all()
    assert not np.isinf(out["z_score"].fillna(0)).any()


def test_zscore_isolated_per_group():
    # dos métricas con escalas muy distintas: el z-score de cada una se calcula
    # dentro de su grupo, no mezclando ambas
    df = pd.concat([_df("chica", [1.0, 2.0, 3.0]), _df("grande", [1000.0, 2000.0, 3000.0])], ignore_index=True)
    out = _zscore_percentile(df, "value", ["metric", "season"])
    chica = out[out["metric"] == "chica"]["z_score"].tolist()
    grande = out[out["metric"] == "grande"]["z_score"].tolist()
    assert chica == grande  # misma forma relativa dentro de cada grupo


def test_zscore_separates_seasons():
    df = pd.concat([_df("m", [1.0, 2.0, 3.0], season="2018"), _df("m", [1.0, 2.0, 3.0], season="2026")], ignore_index=True)
    out = _zscore_percentile(df, "value", ["metric", "season"])
    assert len(out["z_score"].dropna()) == 6  # ambas temporadas producen z válidos


def test_squad_metrics_labels_season_2026():
    squads = pd.DataFrame(
        {
            "team": ["Argentina", "Argentina", "Brazil"],
            "age_years": [28.0, 30.0, 26.0],
            "market_value_eur": [1.0e6, 3.0e6, 2.0e6],
        }
    )
    out = _squad_metrics(squads)
    assert (out["season"] == "2026").all()
    arg = out[out["team"] == "Argentina"].iloc[0]
    assert arg["edad_promedio"] == 29.0


def test_records_converts_nan_and_nat_to_none():
    # PostgREST/JSON no entienden el NaN de pandas -> deben viajar como None
    df = pd.DataFrame(
        {
            "a": [1.0, np.nan],
            "b": ["x", None],
            "c": pd.to_datetime(["2026-06-11", None]),
        }
    )
    rows = _records(df)
    assert rows[1]["a"] is None
    assert rows[1]["b"] is None
    assert rows[1]["c"] is None
    assert rows[0]["a"] == 1.0
    assert rows[0]["b"] == "x"


def test_records_empty_dataframe():
    assert _records(pd.DataFrame(columns=["a", "b"])) == []

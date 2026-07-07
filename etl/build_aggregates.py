"""Lee el warehouse Parquet (data/warehouse/) y genera los JSON pequeños y
específicos que consume el sitio Astro (site/public/data/*.json). El
frontend nunca hace joins pesados en el cliente: consume estos agregados
ya resueltos.

Uso:
    python etl/build_aggregates.py
"""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
WAREHOUSE = ROOT / "data" / "warehouse"
OUT = ROOT / "site" / "public" / "data"
PARQUET_OUT = ROOT / "site" / "public" / "data-parquet"


def _publish_parquet_for_explorer() -> None:
    """Copia el warehouse Parquet a site/public/ para que el explorador SQL
    (DuckDB-WASM) lo pueda leer por HTTP desde el propio sitio estático."""
    PARQUET_OUT.mkdir(parents=True, exist_ok=True)
    for path in WAREHOUSE.glob("*.parquet"):
        shutil.copy(path, PARQUET_OUT / path.name)
        print(f"  data-parquet/{path.name}")


def _records(df: pd.DataFrame) -> list[dict]:
    """to_dict(orient='records') pero reemplazando NaN/NaT por None antes --
    json.dumps por defecto escribe NaN como token literal, que no es JSON
    válido y rompe JSON.parse() en el navegador."""
    return df.astype(object).where(df.notna(), None).to_dict(orient="records")


def _write_json(name: str, payload) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str, allow_nan=False))
    print(f"  {name}")


def build():
    con = duckdb.connect()
    has_matches = (WAREHOUSE / "matches.parquet").exists()
    has_tactical = (WAREHOUSE / "team_match_stats_tactical.parquet").exists()
    has_appearances = (WAREHOUSE / "player_match_appearances.parquet").exists()
    has_physical = (WAREHOUSE / "physical_match_stats.parquet").exists()
    has_squads = (WAREHOUSE / "squads.parquet").exists()

    print("Generando agregados en site/public/data/ ...")

    if has_matches:
        matches = con.execute(f"SELECT * FROM read_parquet('{WAREHOUSE / 'matches.parquet'}')").df()
        _write_json("matches.json", _records(matches))

    if has_matches and has_tactical:
        matches = con.execute(f"SELECT * FROM read_parquet('{WAREHOUSE / 'matches.parquet'}')").df()
        tactical = con.execute(f"SELECT * FROM read_parquet('{WAREHOUSE / 'team_match_stats_tactical.parquet'}')").df()

        merged = tactical.merge(matches[["match_id", "season", "stage", "match_date"]], on="match_id", how="left")

        team_season_summary = (
            merged.groupby(["team", "season"])
            .agg(
                partidos=("match_id", "count"),
                posesion_promedio_proxy=("possession_share_proxy", "mean"),
                precision_pases_promedio=("pass_accuracy_pct", "mean"),
                remates_promedio=("shots_total", "mean"),
                remates_al_arco_promedio=("shots_on_target", "mean"),
                goles_totales=("goals", "sum"),
                faltas_promedio=("fouls_committed", "mean"),
            )
            .reset_index()
            .round(3)
        )
        _write_json("team_season_summary.json", _records(team_season_summary))

        # boxplot: distribución de posesión-proxy por team-season (un punto por partido)
        boxplot_rows = merged[["team", "season", "match_id", "possession_share_proxy"]].dropna()
        _write_json("boxplot_possession_proxy.json", _records(boxplot_rows))

        # serie temporal: evolución partido a partido dentro de cada torneo
        timeline = merged.sort_values(["team", "season", "match_date"])[
            ["team", "season", "match_date", "stage", "possession_share_proxy", "pass_accuracy_pct", "shots_total"]
        ]
        _write_json("timeline_tactical.json", _records(timeline))

        # radar normalizado (percentil 0-100 dentro del propio dataset) por team-season
        radar_metrics = ["posesion_promedio_proxy", "precision_pases_promedio", "remates_promedio", "remates_al_arco_promedio"]
        radar_df = team_season_summary.copy()
        for m in radar_metrics:
            rank = radar_df[m].rank(pct=True) * 100
            radar_df[f"{m}_percentil"] = rank.round(1)
        _write_json(
            "radar_team_season.json",
            _records(radar_df[["team", "season"] + [f"{m}_percentil" for m in radar_metrics]]),
        )

    if has_appearances:
        appearances = con.execute(
            f"SELECT * FROM read_parquet('{WAREHOUSE / 'player_match_appearances.parquet'}')"
        ).df()
        # agrupar solo por jugador -- la posicion puede variar de partido a
        # partido (ej. un central que juega de lateral un dia) y agruparla
        # tambien duplicaba jugadores en el ranking
        most_common_position = (
            appearances.groupby(["team", "player_id"])["position"]
            .agg(lambda s: s.dropna().iloc[0] if s.notna().any() else None)
            .rename("position")
        )
        player_minutes = (
            appearances.groupby(["team", "player_id", "player_name"])
            .agg(partidos=("match_id", "count"), minutos_totales=("minutes_played", "sum"))
            .join(most_common_position, on=["team", "player_id"])
            .reset_index()
            .sort_values("minutos_totales", ascending=False)
        )
        _write_json("player_minutes_ranking.json", _records(player_minutes))

    if has_physical:
        physical = con.execute(f"SELECT * FROM read_parquet('{WAREHOUSE / 'physical_match_stats.parquet'}')").df()
        _write_json("physical_match_stats.json", _records(physical))
    else:
        _write_json(
            "physical_match_stats.json",
            {
                "status": "pending_first_scrape",
                "note": (
                    "Todavia no hay datos fisicos cargados. Se completan corriendo "
                    "etl/scrape_fifa_training_centre.py en GitHub Actions (requiere red sin "
                    "restricciones; no corre en el entorno de desarrollo sandboxed)."
                ),
                "rows": [],
            },
        )

    if has_squads:
        squads = con.execute(f"SELECT * FROM read_parquet('{WAREHOUSE / 'squads.parquet'}')").df()
        _write_json("squads.json", _records(squads))
    else:
        _write_json(
            "squads.json",
            {
                "status": "pending_first_scrape",
                "note": (
                    "Todavia no hay edades de plantel cargadas. Se completan corriendo "
                    "etl/scrape_transfermarkt_squads.py (requiere completar TEAM_SQUAD_URLS "
                    "y correrlo en GitHub Actions)."
                ),
                "rows": [],
            },
        )

    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "tactical_context": {
                "provider": "StatsBomb Open Data",
                "license": "https://github.com/statsbomb/open-data/blob/master/LICENSE.pdf (uso no comercial)",
                "coverage": "Mundial 2018 y 2022 -- partidos de Argentina cargados como semilla inicial",
                "status": "ok" if has_tactical else "missing",
            },
            "physical_performance": {
                "provider": "FIFA Training Centre",
                "coverage": "Mundial 2026 (en curso)",
                "status": "ok" if has_physical else "pending_first_scrape",
            },
            "squad_ages": {
                "provider": "Transfermarkt",
                "status": "ok" if has_squads else "pending_first_scrape",
            },
        },
    }
    _write_json("meta.json", meta)
    con.close()

    print("Publicando Parquet para el explorador SQL en site/public/data-parquet/ ...")
    _publish_parquet_for_explorer()


if __name__ == "__main__":
    build()

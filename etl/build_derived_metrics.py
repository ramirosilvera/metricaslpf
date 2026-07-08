"""Métricas derivadas: percentiles, z-scores y un clustering simple de
estilo de juego, calculados sobre lo que ya está en el warehouse (no
scrapea nada nuevo).

Metodología (a propósito simple y transparente, ver /metodologia/ en el
sitio):
  - Percentil y z-score de cada métrica se calculan DENTRO de la misma
    temporada (comparar posesión de 2026 contra 2026, no contra 2018),
    porque las fuentes/condiciones cambian entre torneos.
  - El "estilo de juego" es un k-means sobre 5 métricas tácticas
    estandarizadas (posesión, precisión de pase, remates, remates al
    arco, faltas). Es una heurística descriptiva, no una clasificación
    validada tácticamente -- con pocos partidos por selección, sirve para
    agrupar equipos parecidos, no para etiquetar "el" estilo real de cada uno.

Uso:
    python etl/build_derived_metrics.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from schemas import DerivedPlayerMetricsSchema, DerivedTeamMetricsSchema, DerivedTeamStyleSchema

ROOT = Path(__file__).resolve().parent.parent
WAREHOUSE = ROOT / "data" / "warehouse"

# Etiquetas por rank de posesión promedio dentro del cluster (de mayor a
# menor). Si hay menos/mas clusters que etiquetas, se completa con "Estilo N".
STYLE_LABELS = [
    "Posesión dominante",
    "Posesión alta, directo al arco",
    "Equilibrado",
    "Bloque bajo / transición",
]


def _read_parquet_if_exists(name: str) -> pd.DataFrame | None:
    path = WAREHOUSE / name
    return pd.read_parquet(path) if path.exists() else None


def _zscore_percentile(df: pd.DataFrame, value_col: str, group_cols: list[str]) -> pd.DataFrame:
    out = df.copy()
    grouped = out.groupby(group_cols)[value_col]
    mean = grouped.transform("mean")
    std = grouped.transform("std").replace(0, np.nan)
    out["z_score"] = ((out[value_col] - mean) / std).round(2)
    out["percentile"] = grouped.rank(pct=True).mul(100).round(1)
    return out


def _team_season_tactical(matches: pd.DataFrame, tactical: pd.DataFrame) -> pd.DataFrame:
    merged = tactical.merge(matches[["match_id", "season"]], on="match_id", how="left")
    return (
        merged.groupby(["team", "season"])
        .agg(
            posesion_promedio_proxy=("possession_share_proxy", "mean"),
            precision_pases_promedio=("pass_accuracy_pct", "mean"),
            remates_promedio=("shots_total", "mean"),
            remates_al_arco_promedio=("shots_on_target", "mean"),
            faltas_promedio=("fouls_committed", "mean"),
        )
        .reset_index()
    )


def _team_season_physical(matches: pd.DataFrame, physical: pd.DataFrame, physical_players: pd.DataFrame | None) -> pd.DataFrame:
    merged = physical.merge(matches[["match_id", "season"]], on="match_id", how="left")
    agg = (
        merged.groupby(["team", "season"])
        .agg(
            distancia_promedio_km=("total_distance_km", "mean"),
            sprints_promedio=("sprint_count", "mean"),
            velocidad_punta_kmh=("top_speed_kmh", "max"),
        )
        .reset_index()
    )
    if physical_players is not None:
        pp = physical_players.merge(matches[["match_id", "season"]], on="match_id", how="left")
        pp["alta_intensidad_m"] = pp["zone4_m"] + pp["zone5_m"]
        hi = pp.groupby(["team", "season"])["alta_intensidad_m"].mean().rename("alta_intensidad_promedio_m").reset_index()
        agg = agg.merge(hi, on=["team", "season"], how="left")
    return agg


def _squad_metrics(squads: pd.DataFrame) -> pd.DataFrame:
    # El plantel de Transfermarkt es el actual (Mundial 2026) -- no tiene
    # sentido por temporada como lo tactico/fisico, se anota como "2026".
    agg = (
        squads.groupby("team")
        .agg(edad_promedio=("age_years", "mean"), valor_plantel_promedio_eur=("market_value_eur", "mean"))
        .reset_index()
    )
    agg["season"] = "2026"
    return agg


def _to_long(df: pd.DataFrame, metric_cols: list[str]) -> pd.DataFrame:
    long = df.melt(id_vars=["team", "season"], value_vars=metric_cols, var_name="metric", value_name="value")
    return long.dropna(subset=["value"])


def _style_clusters(team_season: pd.DataFrame) -> pd.DataFrame:
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler

    feature_cols = ["posesion_promedio_proxy", "precision_pases_promedio", "remates_promedio", "remates_al_arco_promedio", "faltas_promedio"]
    df = team_season.dropna(subset=feature_cols).reset_index(drop=True)
    if len(df) < 4:
        print("  muy pocos team-season con datos tacticos completos -- se saltea el clustering")
        return pd.DataFrame(columns=["team", "season", "cluster_id", "cluster_label"])

    k = min(4, len(df))
    X = StandardScaler().fit_transform(df[feature_cols])
    labels = KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(X)
    df["cluster_id"] = labels

    # ordenar los clusters por posesion promedio (desc) para asignar
    # etiquetas legibles de forma consistente
    order = df.groupby("cluster_id")["posesion_promedio_proxy"].mean().sort_values(ascending=False).index.tolist()
    label_by_cluster = {
        cluster_id: STYLE_LABELS[i] if i < len(STYLE_LABELS) else f"Estilo {i + 1}"
        for i, cluster_id in enumerate(order)
    }
    df["cluster_label"] = df["cluster_id"].map(label_by_cluster)
    return df[["team", "season", "cluster_id", "cluster_label"]]


def _player_physical_metrics(physical_players: pd.DataFrame) -> pd.DataFrame:
    physical_players = physical_players.copy()
    physical_players["alta_intensidad_m"] = physical_players["zone4_m"] + physical_players["zone5_m"]
    agg = (
        physical_players.groupby(["player_name", "team"])
        .agg(
            position=("player_name", "size"),  # placeholder, se reemplaza abajo
            distancia_promedio_km=("total_distance_m", lambda s: (s / 1000).mean()),
            alta_intensidad_promedio_m=("alta_intensidad_m", "mean"),
            sprints_promedio=("sprint_count", "mean"),
            velocidad_punta_kmh=("top_speed_kmh", "max"),
        )
        .reset_index()
    )
    agg = agg.drop(columns=["position"])
    return agg


def build():
    matches = _read_parquet_if_exists("matches.parquet")
    tactical = _read_parquet_if_exists("team_match_stats_tactical.parquet")
    physical = _read_parquet_if_exists("physical_match_stats.parquet")
    physical_players = _read_parquet_if_exists("physical_player_match_stats.parquet")
    squads = _read_parquet_if_exists("squads.parquet")

    team_metric_frames = []
    team_season_tactical = None

    if matches is not None and tactical is not None:
        team_season_tactical = _team_season_tactical(matches, tactical)
        team_metric_frames.append(_to_long(
            team_season_tactical,
            ["posesion_promedio_proxy", "precision_pases_promedio", "remates_promedio", "remates_al_arco_promedio", "faltas_promedio"],
        ))

    if matches is not None and physical is not None:
        team_season_physical = _team_season_physical(matches, physical, physical_players)
        cols = ["distancia_promedio_km", "sprints_promedio", "velocidad_punta_kmh"]
        if "alta_intensidad_promedio_m" in team_season_physical.columns:
            cols.append("alta_intensidad_promedio_m")
        team_metric_frames.append(_to_long(team_season_physical, cols))

    if squads is not None and not squads.empty:
        squad_agg = _squad_metrics(squads)
        team_metric_frames.append(_to_long(squad_agg, ["edad_promedio", "valor_plantel_promedio_eur"]))

    if team_metric_frames:
        team_long = pd.concat(team_metric_frames, ignore_index=True)
        team_long = _zscore_percentile(team_long, "value", ["metric", "season"])
        team_long = DerivedTeamMetricsSchema.validate(team_long)
        team_long.to_parquet(WAREHOUSE / "derived_team_metrics.parquet", index=False)
        print(f"derived_team_metrics.parquet: {len(team_long)} filas")
    else:
        print("derived_team_metrics: sin datos suficientes todavia")

    if team_season_tactical is not None:
        style = _style_clusters(team_season_tactical)
        style = DerivedTeamStyleSchema.validate(style)
        style.to_parquet(WAREHOUSE / "derived_team_style.parquet", index=False)
        print(f"derived_team_style.parquet: {len(style)} filas")

    if physical_players is not None and not physical_players.empty:
        player_metrics = _player_physical_metrics(physical_players)
        player_long = player_metrics.melt(
            id_vars=["player_name", "team"],
            value_vars=["distancia_promedio_km", "alta_intensidad_promedio_m", "sprints_promedio", "velocidad_punta_kmh"],
            var_name="metric",
            value_name="value",
        ).dropna(subset=["value"])
        player_long = _zscore_percentile(player_long, "value", ["metric"])
        player_long = DerivedPlayerMetricsSchema.validate(player_long)
        player_long.to_parquet(WAREHOUSE / "derived_player_metrics.parquet", index=False)
        print(f"derived_player_metrics.parquet: {len(player_long)} filas")
    else:
        print("derived_player_metrics: sin datos fisicos por jugador todavia")


if __name__ == "__main__":
    build()

"""Esquemas Pandera para validar las tablas del warehouse antes de publicarlas.

Si un dato nuevo (scrapeado o descargado) no cumple el esquema, el pipeline
debe fallar visiblemente en CI en vez de publicar datos corruptos en el sitio.
"""
from __future__ import annotations

import pandera.pandas as pa
from pandera.pandas import Column, DataFrameSchema, Check

MatchesSchema = DataFrameSchema(
    {
        "match_id": Column(int, unique=True),
        "competition": Column(str),
        "season": Column(str),
        "stage": Column(str),
        "match_date": Column(str),
        "home_team": Column(str),
        "away_team": Column(str),
        "home_score": Column(int, Check.ge(0)),
        "away_score": Column(int, Check.ge(0)),
    },
    strict=False,
    coerce=True,
)

TeamMatchStatsSchema = DataFrameSchema(
    {
        "match_id": Column(int),
        "team": Column(str),
        "possession_share_proxy": Column(float, Check.in_range(0, 1), nullable=True),
        "passes_attempted": Column(int, Check.ge(0)),
        "passes_completed": Column(int, Check.ge(0)),
        "shots_total": Column(int, Check.ge(0)),
    },
    strict=False,
    coerce=True,
)

PlayerAppearancesSchema = DataFrameSchema(
    {
        "match_id": Column(int),
        "team": Column(str),
        "player_id": Column(str),
        "player_name": Column(str),
        "minutes_played": Column(int, Check.in_range(0, 130)),
    },
    strict=False,
    coerce=True,
)

# Esquema para las métricas físicas (FIFA Training Centre). Se define ahora
# aunque todavía no haya datos cargados, para que build_warehouse.py y el
# scraper compartan el mismo contrato de columnas desde el día uno.
PhysicalMatchStatsSchema = DataFrameSchema(
    {
        "match_id": Column(int),
        "team": Column(str),
        "total_distance_km": Column(float, Check.in_range(80, 140), nullable=True),
        "high_intensity_distance_m": Column(float, Check.in_range(0, 20000), nullable=True),
        "sprint_distance_m": Column(float, Check.in_range(0, 8000), nullable=True),
        "sprint_count": Column(float, Check.ge(0), nullable=True),
        "top_speed_kmh": Column(float, Check.in_range(15, 40), nullable=True),
        "source": Column(str),
        "source_url": Column(str, nullable=True),
        "retrieved_at": Column(str),
    },
    strict=False,
    coerce=True,
)

SquadsSchema = DataFrameSchema(
    {
        "team": Column(str),
        "player_name": Column(str),
        "birth_date": Column(str, nullable=True),
        "position": Column(str, nullable=True),
        "club": Column(str, nullable=True),
        "source": Column(str),
        "retrieved_at": Column(str),
    },
    strict=False,
    coerce=True,
)

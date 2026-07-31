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
        "stage": Column(str, nullable=True),
        "match_date": Column(str, nullable=True),
        "home_team": Column(str),
        "away_team": Column(str),
        "home_score": Column("Int64", Check.ge(0), nullable=True),
        "away_score": Column("Int64", Check.ge(0), nullable=True),
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
        # rango ancho a propósito: partidos con tiempo suplementario (120 min,
        # +33% sobre 90) empujan la distancia de equipo bastante por encima
        # de lo típico en tiempo reglamentario (~100-120km). Ya se vio un
        # partido de octavos con prorroga en 160.49km, asi que el margen
        # queda holgado para el resto de la fase eliminatoria (puede haber
        # mas partidos a 120 min todavia).
        "total_distance_km": Column(float, Check.in_range(80, 185), nullable=True),
        "high_intensity_distance_m": Column(float, Check.in_range(0, 25000), nullable=True),
        "sprint_distance_m": Column(float, Check.in_range(0, 10000), nullable=True),
        "sprint_count": Column(float, Check.ge(0), nullable=True),
        "top_speed_kmh": Column(float, Check.in_range(15, 40), nullable=True),
        "source": Column(str),
        "source_url": Column(str, nullable=True),
        "retrieved_at": Column(str),
    },
    strict=False,
    coerce=True,
)

# Métricas físicas por JUGADOR y partido -- la unidad de análisis real que
# reportan los PDF "PMSR" de FIFA Training Centre (zonas de velocidad 1-5,
# sprints, velocidad punta). PhysicalMatchStatsSchema (arriba) se sigue
# llenando como agregado por equipo derivado de esta tabla.
PhysicalPlayerMatchStatsSchema = DataFrameSchema(
    {
        "match_id": Column(int),
        "team": Column(str),
        "jersey_number": Column("Int64", nullable=True),
        "player_name": Column(str),
        # idem: hasta ~18km es plausible para un jugador de campo en un
        # partido con prorroga (120 min) de alta intensidad
        "total_distance_m": Column(float, Check.in_range(0, 18000), nullable=True),
        "zone1_m": Column(float, Check.ge(0), nullable=True),
        "zone2_m": Column(float, Check.ge(0), nullable=True),
        "zone3_m": Column(float, Check.ge(0), nullable=True),
        "zone4_m": Column(float, Check.ge(0), nullable=True),
        "zone5_m": Column(float, Check.ge(0), nullable=True),
        "high_speed_runs_count": Column(float, Check.ge(0), nullable=True),
        "sprint_count": Column(float, Check.ge(0), nullable=True),
        "top_speed_kmh": Column(float, Check.in_range(0, 40), nullable=True),
        "source": Column(str),
        "source_url": Column(str, nullable=True),
        "retrieved_at": Column(str),
    },
    strict=False,
    coerce=True,
)

# Estadística táctica por jugador y partido del Mundial 2026 (FIFA Training
# Centre, mismos PDF PMSR que la página física -- 3 secciones del reporte:
# distribución de pases, ofertas de recepción, y acciones fuera de posesión.
# Todas las columnas numéricas son nullable porque una sección puede faltar
# en algún PDF sin que se descarte la fila entera.
TacticalPlayerMatchStatsSchema = DataFrameSchema(
    {
        "match_id": Column(int),
        "team": Column(str),
        "jersey_number": Column("Int64", nullable=True),
        "player_name": Column(str),
        "passes_attempted": Column("Int64", nullable=True),
        "passes_completed": Column("Int64", nullable=True),
        "pass_completion_pct": Column(float, Check.in_range(0, 100), nullable=True),
        "switches_of_play": Column("Int64", nullable=True),
        "crosses_attempted": Column("Int64", nullable=True),
        "crosses_completed": Column("Int64", nullable=True),
        "line_breaks_attempted": Column("Int64", nullable=True),
        "line_breaks_completed": Column("Int64", nullable=True),
        "line_break_completion_pct": Column(float, Check.in_range(0, 100), nullable=True),
        "ball_progressions": Column("Int64", nullable=True),
        "take_ons": Column("Int64", nullable=True),
        "step_ins": Column("Int64", nullable=True),
        "attempts_at_goal": Column("Int64", nullable=True),
        "goals": Column("Int64", Check.ge(0), nullable=True),
        "total_offers": Column("Int64", nullable=True),
        "offers_in_front": Column("Int64", nullable=True),
        "offers_in_between": Column("Int64", nullable=True),
        "offers_out_to_in": Column("Int64", nullable=True),
        "offers_in_to_out": Column("Int64", nullable=True),
        "offers_in_behind": Column("Int64", nullable=True),
        "offers_no_movement": Column("Int64", nullable=True),
        "offers_received": Column("Int64", nullable=True),
        "tackles_made": Column("Int64", nullable=True),
        "tackles_won": Column("Int64", nullable=True),
        "blocks": Column("Int64", nullable=True),
        "interceptions": Column("Int64", nullable=True),
        "pressing_direct": Column("Int64", nullable=True),
        "pressing_indirect": Column("Int64", nullable=True),
        "duels_won_aerial": Column("Int64", nullable=True),
        "duels_won_physical": Column("Int64", nullable=True),
        "possession_contests_won": Column("Int64", nullable=True),
        "clearances": Column("Int64", nullable=True),
        "loose_ball_receptions": Column("Int64", nullable=True),
        "pushing_on": Column("Int64", nullable=True),
        "pushing_on_into_pressing": Column("Int64", nullable=True),
        "possession_regains": Column("Int64", nullable=True),
        "possession_interrupted": Column("Int64", nullable=True),
        "source": Column(str),
        "source_url": Column(str, nullable=True),
        "retrieved_at": Column(str),
    },
    strict=False,
    coerce=True,
)

DerivedTeamMetricsSchema = DataFrameSchema(
    {
        "team": Column(str),
        "season": Column(str),
        "metric": Column(str),
        "value": Column(float, nullable=True),
        "z_score": Column(float, nullable=True),
        "percentile": Column(float, Check.in_range(0, 100), nullable=True),
    },
    strict=False,
    coerce=True,
)

DerivedTeamStyleSchema = DataFrameSchema(
    {
        "team": Column(str),
        "season": Column(str),
        "cluster_id": Column(int, nullable=True),
        "cluster_label": Column(str, nullable=True),
    },
    strict=False,
    coerce=True,
)

DerivedPlayerMetricsSchema = DataFrameSchema(
    {
        "player_name": Column(str),
        "team": Column(str),
        "metric": Column(str),
        "value": Column(float, nullable=True),
        "z_score": Column(float, nullable=True),
        "percentile": Column(float, Check.in_range(0, 100), nullable=True),
    },
    strict=False,
    coerce=True,
)

SquadsSchema = DataFrameSchema(
    {
        "team": Column(str),
        "player_name": Column(str),
        "birth_date": Column(str, nullable=True),
        # edad calculada al inicio del torneo (no "hoy"), para que el dato no
        # cambie según cuándo corra el scraper
        "age_years": Column(float, Check.in_range(14, 50), nullable=True),
        # market_value_eur queda nullable/None desde que la fuente primaria
        # pasó a ser 26worldcup (Wikipedia, ver fetch_26worldcup_squads.py):
        # no tiene valor de mercado. Sigue siendo un dato real y sourced --
        # no se rellena con un número inventado.
        "market_value_eur": Column(float, Check.ge(0), nullable=True),
        "position": Column(str, nullable=True),
        "club": Column(str, nullable=True),
        # columnas nuevas que aporta 26worldcup/Wikipedia y que Transfermarkt
        # no tenía -- todas nullable para no romper si algún jugador viene
        # incompleto en la fuente.
        "jersey_number": Column("Int64", Check.in_range(1, 99), nullable=True),
        "caps": Column("Int64", Check.ge(0), nullable=True),
        "career_goals": Column("Int64", Check.ge(0), nullable=True),
        # "boolean" (no bool de Python/numpy) -- el nullable de pandas admite
        # pd.NA. Con bool a secas, una columna 100% nula (ninguna fuente LPF
        # expone flag de capitán) revienta la coerción de Pandera: numpy bool
        # no puede representar nulos, ni siquiera con nullable=True declarado.
        "captain": Column("boolean", nullable=True),
        "wc2026_apps": Column("Int64", Check.in_range(0, 7), nullable=True),
        "wc2026_goals": Column("Int64", Check.ge(0), nullable=True),
        "wc2026_yellow": Column("Int64", Check.ge(0), nullable=True),
        "wc2026_red": Column("Int64", Check.ge(0), nullable=True),
        "source": Column(str),
        "retrieved_at": Column(str),
    },
    strict=False,
    coerce=True,
)

# Perfil de selección: ranking FIFA (+ anterior, útil como covariable para
# análisis posteriores) y ubicación del campo base -- de 26worldcup/teams.json
# (a su vez sourced de la API pública de FIFA, no de Wikipedia; ver docstring
# de fetch_26worldcup_squads.py). No existía una tabla de rankings/perfil de
# selección antes de esto en el warehouse.
TeamProfileSchema = DataFrameSchema(
    {
        "team": Column(str, unique=True),
        "fifa_code": Column(str, nullable=True),
        "group": Column(str, nullable=True),
        "fifa_ranking": Column("Int64", Check.in_range(1, 250), nullable=True),
        "fifa_ranking_prev": Column("Int64", Check.in_range(1, 250), nullable=True),
        "base_camp_city": Column(str, nullable=True),
        "base_camp_facility": Column(str, nullable=True),
        "base_camp_country": Column(str, nullable=True),
        "base_camp_lat": Column(float, Check.in_range(-90, 90), nullable=True),
        "base_camp_lon": Column(float, Check.in_range(-180, 180), nullable=True),
        "source": Column(str),
        "retrieved_at": Column(str),
    },
    strict=False,
    coerce=True,
)

# Eventos de gol (goleador, minuto, penal/en contra) del Mundial 2026 --
# openfootball/worldcup.json (CC0, ver etl/fetch_openfootball_2026.py). Es la
# primera tabla del proyecto a nivel de EVENTO de gol (hasta ahora solo había
# resultados de partido y estadística agregada por jugador/equipo). El
# resultado final de cada partido ya se cruzó contra matches.parquet
# (FIFA Training Centre) antes de llegar acá -- ver _score_discrepancies.json
# si hubo alguna diferencia entre fuentes.
GoalEventsSchema = DataFrameSchema(
    {
        "match_id": Column(int),
        # convención de box-score (igual que matches.home_score/away_score):
        # "team" es la selección a cuyo marcador cuenta el gol. Para un gol
        # en contra (own_goal=True) el jugador pertenece al EQUIPO RIVAL de
        # "team" -- así lo separa la propia fuente (goals1/goals2 por lado
        # que se beneficia, no por lado del jugador). No confundir "team" con
        # "selección del jugador" en filas con own_goal=True.
        "team": Column(str),
        "player_name": Column(str),
        # minuto "base" (ej. "90+4" -> 90). 130 en vez de 120 para dejar
        # margen a descuento largo en la segunda mitad de la prórroga.
        "minute": Column("Int64", Check.in_range(0, 130), nullable=True),
        # minutos de descuento sumados al minuto base (ej. "90+4" -> 4). Nulo
        # si el gol fue en tiempo reglamentario/prórroga sin descuento.
        "minute_stoppage": Column("Int64", Check.ge(0), nullable=True),
        # texto crudo tal cual lo publica la fuente (ej. "90+4") -- se
        # conserva para no perder precision al mostrarlo en el sitio.
        "minute_display": Column(str, nullable=True),
        "own_goal": Column(bool),
        "penalty": Column(bool),
        "source": Column(str),
        "source_url": Column(str, nullable=True),
        "retrieved_at": Column(str),
    },
    strict=False,
    coerce=True,
)

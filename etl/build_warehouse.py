"""Consolida las tablas procesadas (CSV de distintas fuentes) en el
warehouse Parquet versionado en data/warehouse/. Esta es la "fuente de
verdad" del proyecto: todo lo que consume el sitio sale, en última
instancia, de estos Parquet.

Fuentes que combina (cada una opcional -- si no existe el CSV, se saltea):
  - data/raw/statsbomb/_processed/*.csv        (contexto táctico, real)
  - data/raw/fifa_training_centre/_processed/*.csv (métricas físicas)
  - data/raw/26worldcup/_processed/squads.csv  (edad/plantel -- fuente
    primaria desde que Transfermarkt bloquea el scraping con 403; ver
    fetch_26worldcup_squads.py)
  - data/raw/transfermarkt/_processed/squads.csv (edad de planteles --
    fallback si algún día Transfermarkt deja de bloquear el scraping;
    el paso "squads" más abajo prueba 26worldcup primero)
  - data/raw/26worldcup/_processed/team_profile.csv (ranking FIFA, campo base)
  - data/raw/openfootball/_processed/goal_events.csv (goleador/minuto/penal
    de cada gol del Mundial 2026, CC0; ver fetch_openfootball_2026.py)

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
    PhysicalPlayerMatchStatsSchema,
    TacticalPlayerMatchStatsSchema,
    SquadsSchema,
    TeamProfileSchema,
    GoalEventsSchema,
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

    # --- matches (Métricas LPF: ESPN -- temporada actual, fuente primaria --
    # + API-Football como histórico opcional (2022-2024, ver docstring del
    # fetcher); se conservan las fuentes del Mundial como fallback por si algún
    # CSV viejo sigue presente, pero en LPF no se generan) ---
    matches_sources = [
        _read_csv_if_exists(RAW / "espn" / "_processed" / "matches.csv"),
        _read_csv_if_exists(RAW / "api_football" / "_processed" / "matches.csv"),
        _read_csv_if_exists(RAW / "statsbomb" / "_processed" / "matches.csv"),
        _read_csv_if_exists(RAW / "fifa_training_centre" / "_processed" / "matches_fifa2026.csv"),
    ]
    matches_sources = [m for m in matches_sources if m is not None]
    if matches_sources:
        matches = pd.concat(matches_sources, ignore_index=True)
        matches["match_id"] = matches["match_id"].astype("int64")
        matches["home_score"] = pd.to_numeric(matches["home_score"], errors="coerce").astype("Int64")
        matches["away_score"] = pd.to_numeric(matches["away_score"], errors="coerce").astype("Int64")
        matches = MatchesSchema.validate(matches)
        con.register("matches_df", matches)
        con.execute(f"COPY matches_df TO '{WAREHOUSE / 'matches.parquet'}' (FORMAT PARQUET)")
        print(f"matches.parquet: {len(matches)} filas")

    # --- team_match_stats (Métricas LPF: ESPN por partido -- remates,
    # posesión, pases/precisión, faltas, córners, offsides, atajadas y proxy de
    # peligrosidad; API-Football/StatsBomb como fallback) ---
    team_stats = _read_csv_if_exists(RAW / "espn" / "_processed" / "team_match_stats.csv")
    if team_stats is None:
        team_stats = _read_csv_if_exists(RAW / "api_football" / "_processed" / "team_match_stats.csv")
    if team_stats is None:
        team_stats = _read_csv_if_exists(RAW / "statsbomb" / "_processed" / "team_match_stats.csv")
    if team_stats is not None:
        num_cols = ["passes_attempted", "passes_completed", "shots_total", "shots_on_target", "goals", "fouls_committed"]
        for c in num_cols:
            if c not in team_stats.columns:
                team_stats[c] = 0
            # pd.to_numeric antes de castear a int64: algunas fuentes escriben
            # el conteo como "1.0" (float-string), que .astype("int64") directo
            # rechaza -- to_numeric lo interpreta bien como float primero.
            team_stats[c] = pd.to_numeric(team_stats[c], errors="coerce").fillna(0)
        team_stats = team_stats.astype({"match_id": "int64", **{c: "int64" for c in num_cols}})
        team_stats["possession_share_proxy"] = pd.to_numeric(team_stats["possession_share_proxy"], errors="coerce").astype(float)
        team_stats["pass_accuracy_pct"] = pd.to_numeric(team_stats.get("pass_accuracy_pct"), errors="coerce")
        team_stats = TeamMatchStatsSchema.validate(team_stats)
        con.register("team_stats_df", team_stats)
        con.execute(f"COPY team_stats_df TO '{WAREHOUSE / 'team_match_stats_tactical.parquet'}' (FORMAT PARQUET)")
        print(f"team_match_stats_tactical.parquet: {len(team_stats)} filas")

    # --- player_match_appearances (LPF: ESPN por partido -- suele venir vacío
    # para esta competición, ver docstring del fetcher; API-Football/StatsBomb
    # como fallback) ---
    appearances = _read_csv_if_exists(RAW / "espn" / "_processed" / "player_match_appearances.csv")
    if appearances is None:
        appearances = _read_csv_if_exists(RAW / "api_football" / "_processed" / "player_match_appearances.csv")
    if appearances is None:
        appearances = _read_csv_if_exists(RAW / "statsbomb" / "_processed" / "player_match_appearances.csv")
    if appearances is not None:
        appearances["minutes_played"] = pd.to_numeric(appearances["minutes_played"], errors="coerce").fillna(0)
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

    # --- physical_player_match_stats (FIFA Training Centre, por jugador) ---
    physical_players = _read_csv_if_exists(RAW / "fifa_training_centre" / "_processed" / "physical_player_match_stats.csv")
    if physical_players is not None:
        physical_players = physical_players.astype({"match_id": "int64"})
        physical_players["jersey_number"] = pd.to_numeric(physical_players["jersey_number"], errors="coerce").astype("Int64")
        for c in ["total_distance_m", "zone1_m", "zone2_m", "zone3_m", "zone4_m", "zone5_m", "high_speed_runs_count", "sprint_count", "top_speed_kmh"]:
            physical_players[c] = pd.to_numeric(physical_players[c], errors="coerce")
        physical_players = PhysicalPlayerMatchStatsSchema.validate(physical_players)
        con.register("phys_players_df", physical_players)
        con.execute(f"COPY phys_players_df TO '{WAREHOUSE / 'physical_player_match_stats.parquet'}' (FORMAT PARQUET)")
        print(f"physical_player_match_stats.parquet: {len(physical_players)} filas")

    # --- tactical_player_match_stats (LPF: ESPN por jugador -- pases, remates,
    # quites, intercepciones, duelos, gambetas, rating; suele venir vacío para
    # esta competición, ver docstring del fetcher. Los campos propios de FIFA
    # -- offers/line_breaks/pressing -- no existen en esta fuente y quedan
    # nulos. API-Football/FIFA Training Centre como fallback) ---
    tactical_players = _read_csv_if_exists(RAW / "espn" / "_processed" / "tactical_player_match_stats.csv")
    if tactical_players is None:
        tactical_players = _read_csv_if_exists(RAW / "api_football" / "_processed" / "tactical_player_match_stats.csv")
    if tactical_players is None:
        tactical_players = _read_csv_if_exists(RAW / "fifa_training_centre" / "_processed" / "tactical_player_match_stats.csv")
    if tactical_players is not None:
        tactical_players = tactical_players.astype({"match_id": "int64"})
        tactical_players["jersey_number"] = pd.to_numeric(tactical_players.get("jersey_number"), errors="coerce").astype("Int64")
        int_cols = [
            "passes_attempted", "passes_completed", "switches_of_play", "crosses_attempted", "crosses_completed",
            "line_breaks_attempted", "line_breaks_completed", "ball_progressions", "take_ons", "step_ins",
            "attempts_at_goal", "goals", "total_offers", "offers_in_front", "offers_in_between", "offers_out_to_in",
            "offers_in_to_out", "offers_in_behind", "offers_no_movement", "offers_received", "tackles_made",
            "tackles_won", "blocks", "interceptions", "pressing_direct", "pressing_indirect", "duels_won_aerial",
            "duels_won_physical", "possession_contests_won", "clearances", "loose_ball_receptions", "pushing_on",
            "pushing_on_into_pressing", "possession_regains", "possession_interrupted",
        ]
        # Las columnas que la fuente no trae se agregan como nulas para cumplir el
        # contrato del esquema sin inventar valores.
        for c in int_cols:
            if c not in tactical_players.columns:
                tactical_players[c] = pd.NA
            tactical_players[c] = pd.to_numeric(tactical_players[c], errors="coerce").astype("Int64")
        for c in ["pass_completion_pct", "line_break_completion_pct"]:
            if c not in tactical_players.columns:
                tactical_players[c] = pd.NA
            tactical_players[c] = pd.to_numeric(tactical_players[c], errors="coerce")
        tactical_players = TacticalPlayerMatchStatsSchema.validate(tactical_players)
        con.register("tactical_players_df", tactical_players)
        con.execute(f"COPY tactical_players_df TO '{WAREHOUSE / 'tactical_player_match_stats.parquet'}' (FORMAT PARQUET)")
        print(f"tactical_player_match_stats.parquet: {len(tactical_players)} filas")

    # --- squads (fuente-agnóstico: 26worldcup/Wikipedia primero -- ver
    # fetch_26worldcup_squads.py --, Transfermarkt como fallback si algún día
    # deja de devolver 403 en todos los candidatos de URL) ---
    squads_source_path = RAW / "26worldcup" / "_processed" / "squads.csv"
    if not (squads_source_path.exists() and squads_source_path.stat().st_size > 0):
        squads_source_path = RAW / "transfermarkt" / "_processed" / "squads.csv"
    squads = _read_csv_if_exists(squads_source_path)
    if squads is not None:
        squads["age_years"] = pd.to_numeric(squads["age_years"], errors="coerce")
        squads["market_value_eur"] = pd.to_numeric(squads.get("market_value_eur"), errors="coerce")
        int_cols = ["jersey_number", "caps", "career_goals", "wc2026_apps", "wc2026_goals", "wc2026_yellow", "wc2026_red"]
        for c in int_cols:
            if c not in squads.columns:
                squads[c] = pd.NA
            squads[c] = pd.to_numeric(squads[c], errors="coerce").astype("Int64")
        if "captain" not in squads.columns:
            squads["captain"] = pd.NA
        squads["captain"] = (
            squads["captain"].astype(str).str.lower().map({"true": True, "false": False}).astype("boolean")
        )
        squads = SquadsSchema.validate(squads)
        con.register("squads_df", squads)
        con.execute(f"COPY squads_df TO '{WAREHOUSE / 'squads.parquet'}' (FORMAT PARQUET)")
        print(f"squads.parquet: {len(squads)} filas (fuente: {squads_source_path.parent.parent.name})")
    else:
        print("squads: sin datos todavia (correr etl/fetch_26worldcup_squads.py)")

    # --- team_profile (LPF: lista de clubes de la tabla ESPN; sin ranking FIFA
    # ni campo base, que eran propios del Mundial -- quedan nulos) ---
    team_profile = _read_csv_if_exists(RAW / "espn" / "_processed" / "team_profile.csv")
    if team_profile is None:
        team_profile = _read_csv_if_exists(RAW / "api_football" / "_processed" / "team_profile.csv")
    if team_profile is None:
        team_profile = _read_csv_if_exists(RAW / "26worldcup" / "_processed" / "team_profile.csv")
    if team_profile is not None:
        for c in ["fifa_ranking", "fifa_ranking_prev"]:
            team_profile[c] = pd.to_numeric(team_profile[c], errors="coerce").astype("Int64")
        for c in ["base_camp_lat", "base_camp_lon"]:
            team_profile[c] = pd.to_numeric(team_profile[c], errors="coerce")
        team_profile = TeamProfileSchema.validate(team_profile)
        con.register("team_profile_df", team_profile)
        con.execute(f"COPY team_profile_df TO '{WAREHOUSE / 'team_profile.parquet'}' (FORMAT PARQUET)")
        print(f"team_profile.parquet: {len(team_profile)} filas")
    else:
        print("team_profile: sin datos todavia (correr etl/fetch_26worldcup_squads.py)")

    # --- goal_events (openfootball/worldcup.json, CC0 -- primer dato a nivel
    # de evento de gol del proyecto: goleador, minuto, penal/en contra). El
    # resultado final de cada partido ya se cruzó contra matches (arriba,
    # fuente FIFA Training Centre) dentro de fetch_openfootball_2026.py --
    # ver data/raw/openfootball/_score_discrepancies.json si hubo diferencias. ---
    goal_events = _read_csv_if_exists(RAW / "espn" / "_processed" / "goal_events.csv")
    if goal_events is None:
        goal_events = _read_csv_if_exists(RAW / "api_football" / "_processed" / "goal_events.csv")
    if goal_events is None:
        goal_events = _read_csv_if_exists(RAW / "openfootball" / "_processed" / "goal_events.csv")
    if goal_events is not None:
        goal_events["match_id"] = goal_events["match_id"].astype("int64")
        goal_events["minute"] = pd.to_numeric(goal_events["minute"], errors="coerce").astype("Int64")
        goal_events["minute_stoppage"] = pd.to_numeric(goal_events["minute_stoppage"], errors="coerce").astype("Int64")
        goal_events["own_goal"] = goal_events["own_goal"].astype(str).str.lower().map({"true": True, "false": False}).astype(bool)
        goal_events["penalty"] = goal_events["penalty"].astype(str).str.lower().map({"true": True, "false": False}).astype(bool)
        goal_events = GoalEventsSchema.validate(goal_events)
        con.register("goal_events_df", goal_events)
        con.execute(f"COPY goal_events_df TO '{WAREHOUSE / 'goal_events.parquet'}' (FORMAT PARQUET)")
        print(f"goal_events.parquet: {len(goal_events)} filas")
    else:
        print("goal_events: sin datos todavia (correr etl/fetch_openfootball_2026.py)")

    con.close()


if __name__ == "__main__":
    build()

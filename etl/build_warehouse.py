"""Consolida las tablas procesadas (CSV de distintas fuentes) en el
warehouse Parquet versionado en data/warehouse/. Esta es la "fuente de
verdad" del proyecto: todo lo que consume el sitio sale, en última
instancia, de estos Parquet.

Fuente única para Métricas LPF (cada tabla es opcional -- si no existe el CSV,
se saltea): data/raw/espn/_processed/*.csv -- ver fetch_espn_lpf.py para el
detalle de qué trae cada archivo y por qué ESPN es la fuente elegida (fbref
bloqueado por Cloudflare, API-Football gratis no cubre la temporada actual).
data/raw/api_football/_processed/*.csv queda como fallback histórico opcional
(temporadas 2022-2024, no se usa por defecto). Las fuentes del Mundial
(FIFA Training Centre, StatsBomb, openfootball, 26worldcup, Transfermarkt) se
retiraron por completo en la transformación a LPF -- no existe dato físico/GPS
para esta liga en ninguna fuente gratuita (ver docstring de fetch_espn_lpf.py).
data/raw/fotmob/_processed/player_season_stats.csv aporta lo único que ESPN no
tiene: estadística individual por jugador (agregada de temporada, no de
partido -- ver docstring de fetch_fotmob_lpf.py).

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
    TacticalPlayerMatchStatsSchema,
    SquadsSchema,
    TeamProfileSchema,
    GoalEventsSchema,
    PlayerSeasonStatsSchema,
    StandingsSchema,
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
    ]
    matches_sources = [m for m in matches_sources if m is not None and len(m) > 0]
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
    # peligrosidad; API-Football como fallback histórico) ---
    team_stats = _read_csv_if_exists(RAW / "espn" / "_processed" / "team_match_stats.csv")
    if team_stats is None:
        team_stats = _read_csv_if_exists(RAW / "api_football" / "_processed" / "team_match_stats.csv")
    if team_stats is not None and len(team_stats) == 0:
        team_stats = None
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
    # para esta competición, ver docstring del fetcher; API-Football como
    # fallback histórico) ---
    appearances = _read_csv_if_exists(RAW / "espn" / "_processed" / "player_match_appearances.csv")
    if appearances is None:
        appearances = _read_csv_if_exists(RAW / "api_football" / "_processed" / "player_match_appearances.csv")
    if appearances is not None and len(appearances) == 0:
        appearances = None
    if appearances is not None:
        appearances["minutes_played"] = pd.to_numeric(appearances["minutes_played"], errors="coerce").fillna(0)
        appearances = appearances.astype({"match_id": "int64", "minutes_played": "int64"})
        appearances = PlayerAppearancesSchema.validate(appearances)
        con.register("app_df", appearances)
        con.execute(f"COPY app_df TO '{WAREHOUSE / 'player_match_appearances.parquet'}' (FORMAT PARQUET)")
        print(f"player_match_appearances.parquet: {len(appearances)} filas")

    # --- físico (equipo y jugador): NO existe para Métricas LPF. Ninguna fuente
    # gratuita publica datos GPS/tracking (distancia, sprints, velocidad punta)
    # de la Liga Profesional -- es data propietaria de cada club vía su
    # proveedor de hardware (Catapult/STATSports), nunca liberada por las
    # ligas (se investigó a fondo: fbref, WhoScored, SofaScore, API-Football,
    # FotMob, sitios oficiales AFA/LPF -- ninguno la tiene). physical_match_
    # stats.parquet y physical_player_match_stats.parquet directamente no se
    # generan; build_aggregates.py ya maneja su ausencia con un estado
    # explícito, nunca inventando valores.
    print("physical_match_stats / physical_player_match_stats: no existen para Métricas LPF (sin fuente gratuita de datos GPS)")

    # --- tactical_player_match_stats (LPF: ESPN por jugador -- pases, remates,
    # quites, intercepciones, duelos, gambetas, rating; suele venir vacío para
    # esta competición, ver docstring del fetcher. Los campos propios de FIFA
    # -- offers/line_breaks/pressing -- no existen en esta fuente y quedan
    # nulos. API-Football como fallback histórico) ---
    tactical_players = _read_csv_if_exists(RAW / "espn" / "_processed" / "tactical_player_match_stats.csv")
    if tactical_players is None:
        tactical_players = _read_csv_if_exists(RAW / "api_football" / "_processed" / "tactical_player_match_stats.csv")
    if tactical_players is not None and len(tactical_players) == 0:
        tactical_players = None
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

    # --- squads (LPF: plantel real por club vía roster de ESPN -- nombre,
    # posición, edad, dorsal; sin valor de mercado ni estadística individual,
    # que esta fuente no trae. Los CSV de 26worldcup/Transfermarkt eran
    # planteles de SELECCIONES del Mundial -- no aplican al universo de
    # clubes de la LPF, así que no se usan como fallback acá) ---
    squads_source_path = RAW / "espn" / "_processed" / "squads.csv"
    squads = _read_csv_if_exists(squads_source_path)
    if squads is not None and len(squads) == 0:
        squads = None
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
        print("squads: sin datos todavia (correr etl/fetch_espn_lpf.py)")

    # --- team_profile (LPF: lista de clubes de la tabla ESPN; sin ranking FIFA
    # ni campo base, que eran propios del Mundial -- quedan nulos) ---
    team_profile = _read_csv_if_exists(RAW / "espn" / "_processed" / "team_profile.csv")
    if team_profile is None:
        team_profile = _read_csv_if_exists(RAW / "api_football" / "_processed" / "team_profile.csv")
    if team_profile is not None and len(team_profile) == 0:
        team_profile = None
    if team_profile is not None:
        for c in ["fifa_ranking", "fifa_ranking_prev"]:
            team_profile[c] = pd.to_numeric(team_profile[c], errors="coerce").astype("Int64")
        for c in ["base_camp_lat", "base_camp_lon"]:
            team_profile[c] = pd.to_numeric(team_profile[c], errors="coerce")
        # crest_url se agregó después de que ya hubiera CSVs de team_profile
        # commiteados sin esa columna -- se rellena con None en vez de romper
        # una corrida local en modo --skip-scrape contra datos viejos. Un
        # fetch_espn_lpf.py real siempre la trae.
        if "crest_url" not in team_profile.columns:
            team_profile["crest_url"] = None
        team_profile = TeamProfileSchema.validate(team_profile)
        con.register("team_profile_df", team_profile)
        con.execute(f"COPY team_profile_df TO '{WAREHOUSE / 'team_profile.parquet'}' (FORMAT PARQUET)")
        print(f"team_profile.parquet: {len(team_profile)} filas")
    else:
        print("team_profile: sin datos todavia (correr etl/fetch_espn_lpf.py)")

    # --- standings (LPF: tabla de posiciones real de ESPN -- puntos, PJ/PG/PE/PP,
    # goles a favor/en contra, diferencia. Se fetcheaba desde el día uno pero no
    # estaba conectada al warehouse) ---
    standings = _read_csv_if_exists(RAW / "espn" / "_processed" / "standings.csv")
    if standings is not None and len(standings) == 0:
        standings = None
    if standings is not None:
        int_cols = ["posicion", "puntos", "jugados", "ganados", "empatados", "perdidos", "goles_favor", "goles_contra", "diferencia"]
        for c in int_cols:
            standings[c] = pd.to_numeric(standings[c], errors="coerce").astype("Int64")
        standings = StandingsSchema.validate(standings)
        con.register("standings_df", standings)
        con.execute(f"COPY standings_df TO '{WAREHOUSE / 'standings.parquet'}' (FORMAT PARQUET)")
        print(f"standings.parquet: {len(standings)} filas")
    else:
        print("standings: sin datos todavia (correr etl/fetch_espn_lpf.py)")

    # --- goal_events (LPF: ESPN -- goleador, minuto, penal/en contra, filtrado
    # por el flag real scoringPlay para no confundir "Goal Kick" con un gol;
    # ver docstring de fetch_espn_lpf.py. API-Football como fallback histórico) ---
    goal_events = _read_csv_if_exists(RAW / "espn" / "_processed" / "goal_events.csv")
    if goal_events is None:
        goal_events = _read_csv_if_exists(RAW / "api_football" / "_processed" / "goal_events.csv")
    if goal_events is not None and len(goal_events) == 0:
        goal_events = None
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
        print("goal_events: sin datos todavia (correr etl/fetch_espn_lpf.py)")

    # --- player_season_stats (LPF: FotMob -- estadística individual agregada
    # de TEMPORADA, 37 categorías incluyendo xG/xGOT/xA; ver docstring de
    # fetch_fotmob_lpf.py. Es lo único con estadística por jugador real para
    # esta liga, dado que ESPN no publica boxscore por partido acá. Formato
    # largo, no requiere fallback -- FotMob es la única fuente que la tiene) ---
    player_season_stats = _read_csv_if_exists(RAW / "fotmob" / "_processed" / "player_season_stats.csv")
    if player_season_stats is not None and len(player_season_stats) == 0:
        player_season_stats = None
    if player_season_stats is not None:
        for c in ["fotmob_player_id", "fotmob_team_id"]:
            player_season_stats[c] = pd.to_numeric(player_season_stats[c], errors="coerce").astype("Int64")
        for c in ["value", "sub_value", "minutes_played", "matches_played"]:
            player_season_stats[c] = pd.to_numeric(player_season_stats[c], errors="coerce")
        player_season_stats["rank"] = pd.to_numeric(player_season_stats["rank"], errors="coerce").astype("Int64")
        player_season_stats = PlayerSeasonStatsSchema.validate(player_season_stats)
        con.register("player_season_stats_df", player_season_stats)
        con.execute(f"COPY player_season_stats_df TO '{WAREHOUSE / 'player_season_stats.parquet'}' (FORMAT PARQUET)")
        print(f"player_season_stats.parquet: {len(player_season_stats)} filas")
    else:
        print("player_season_stats: sin datos todavia (correr etl/fetch_fotmob_lpf.py)")

    con.close()


if __name__ == "__main__":
    build()

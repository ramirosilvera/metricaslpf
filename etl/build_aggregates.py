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
    has_physical_players = (WAREHOUSE / "physical_player_match_stats.parquet").exists()
    has_squads = (WAREHOUSE / "squads.parquet").exists()
    has_team_profile = (WAREHOUSE / "team_profile.parquet").exists()
    has_goal_events = (WAREHOUSE / "goal_events.parquet").exists()
    has_derived_team_metrics = (WAREHOUSE / "derived_team_metrics.parquet").exists()
    has_derived_team_style = (WAREHOUSE / "derived_team_style.parquet").exists()
    has_derived_player_metrics = (WAREHOUSE / "derived_player_metrics.parquet").exists()

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
        if has_matches:
            matches_for_physical = con.execute(f"SELECT match_id, season, stage, home_team, away_team, match_date FROM read_parquet('{WAREHOUSE / 'matches.parquet'}')").df()
            physical = physical.merge(matches_for_physical, on="match_id", how="left")
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

    # --- Rendimiento fisico COLECTIVO del Mundial 2026 (todas las selecciones) ---
    # El sitio ya tenia el fisico por jugador, pero el fisico a nivel equipo de
    # las 48 selecciones (96 partidos) no se surface-aba en ningun lado salvo la
    # fila de Argentina en la home. Estos dos agregados alimentan el ranking
    # colectivo y la curva de forma partido a partido.
    if has_physical and has_matches:
        phys_team = con.execute(
            f"SELECT * FROM read_parquet('{WAREHOUSE / 'physical_match_stats.parquet'}')"
        ).df()
        m2026 = con.execute(
            f"SELECT match_id, season, stage, match_date, home_team, away_team FROM read_parquet('{WAREHOUSE / 'matches.parquet'}') WHERE season = '2026'"
        ).df()
        pt = phys_team.merge(m2026, on="match_id", how="inner")
        if len(pt):
            pt["rival"] = pt.apply(
                lambda r: r["away_team"] if r["team"] == r["home_team"] else r["home_team"], axis=1
            )
            pt["es_local"] = pt["team"] == pt["home_team"]
            pt = pt.sort_values(["team", "match_date", "match_id"])
            # indice de jornada relativo por seleccion (1 = su primer partido con dato fisico)
            pt["jornada"] = pt.groupby("team").cumcount() + 1

            trend_cols = [
                "team", "match_id", "match_date", "stage", "rival", "es_local", "jornada",
                "total_distance_km", "high_intensity_distance_m", "sprint_count", "top_speed_kmh",
            ]
            _write_json("team_physical_trend.json", _records(pt[trend_cols]))

            # ranking colectivo: promedio por seleccion + percentil dentro de las 48
            team_phys = (
                pt.groupby("team")
                .agg(
                    partidos=("match_id", "nunique"),
                    distancia_promedio_km=("total_distance_km", lambda s: round(s.mean(), 2)),
                    alta_intensidad_promedio_m=("high_intensity_distance_m", lambda s: round(s.mean(), 0)),
                    sprints_promedio=("sprint_count", lambda s: round(s.mean(), 1)),
                    velocidad_punta_kmh=("top_speed_kmh", "max"),
                    distancia_total_km=("total_distance_km", lambda s: round(s.sum(), 1)),
                )
                .reset_index()
            )
            for metric in [
                "distancia_promedio_km", "alta_intensidad_promedio_m", "sprints_promedio", "velocidad_punta_kmh",
            ]:
                team_phys[f"{metric}_percentil"] = (team_phys[metric].rank(pct=True) * 100).round(0)
            team_phys = team_phys.sort_values("distancia_promedio_km", ascending=False)
            _write_json("team_physical_ranking.json", _records(team_phys))
    else:
        _write_json("team_physical_trend.json", {"status": "pending_first_scrape", "rows": []})
        _write_json("team_physical_ranking.json", {"status": "pending_first_scrape", "rows": []})

    if has_physical_players:
        physical_players = con.execute(
            f"SELECT * FROM read_parquet('{WAREHOUSE / 'physical_player_match_stats.parquet'}')"
        ).df()
        physical_players["high_intensity_m"] = physical_players["zone4_m"] + physical_players["zone5_m"]

        # ranking acumulado por jugador (puede sumar varios partidos si ya
        # hay mas de uno cargado para ese jugador)
        player_physical_ranking = (
            physical_players.groupby(["team", "player_name"])
            .agg(
                partidos=("match_id", "nunique"),
                distancia_total_km=("total_distance_m", lambda s: round(s.sum() / 1000, 1)),
                distancia_promedio_km=("total_distance_m", lambda s: round(s.mean() / 1000, 2)),
                alta_intensidad_promedio_m=("high_intensity_m", lambda s: round(s.mean(), 1)),
                sprints_promedio=("sprint_count", "mean"),
                velocidad_punta_kmh=("top_speed_kmh", "max"),
            )
            .reset_index()
            .sort_values("distancia_total_km", ascending=False)
        )
        _write_json("physical_player_ranking.json", _records(player_physical_ranking))

        physical_players_out = physical_players.drop(columns=["high_intensity_m"])
        _write_json("physical_player_match_stats.json", _records(physical_players_out))

        # --- Percentiles NORMALIZADOS POR POSICION (analisis individual justo) ---
        # Un arquero recorre ~5 km y un defensor ~8.3 km por partido: compararlos
        # en la misma escala de percentil es enganoso. Se cruza el fisico por
        # jugador con el plantel (squads) por dorsal+seleccion (match 100%) para
        # traer la posicion, y el percentil se calcula DENTRO de cada posicion.
        if has_squads:
            squads_pos = con.execute(
                f"SELECT team, jersey_number, position, age_years, market_value_eur, club, caps FROM read_parquet('{WAREHOUSE / 'squads.parquet'}')"
            ).df()
            squads_pos = squads_pos.dropna(subset=["jersey_number"]).drop_duplicates(["team", "jersey_number"])
            pl = physical_players.dropna(subset=["jersey_number"]).copy()
            pl = pl.merge(squads_pos, on=["team", "jersey_number"], how="inner")
            if len(pl):
                agg = (
                    pl.groupby(["team", "player_name", "position"])
                    .agg(
                        jersey_number=("jersey_number", "first"),
                        club=("club", "first"),
                        age_years=("age_years", "first"),
                        partidos=("match_id", "nunique"),
                        distancia_promedio_km=("total_distance_m", lambda s: round(s.mean() / 1000, 2)),
                        alta_intensidad_promedio_m=("high_intensity_m", lambda s: round(s.mean(), 0)),
                        sprints_promedio=("sprint_count", lambda s: round(s.mean(), 1)),
                        velocidad_punta_kmh=("top_speed_kmh", "max"),
                    )
                    .reset_index()
                )
                # percentil dentro de la posicion (GK/DF/MF/FW) para cada metrica
                for metric in [
                    "distancia_promedio_km", "alta_intensidad_promedio_m", "sprints_promedio", "velocidad_punta_kmh",
                ]:
                    agg[f"{metric}_pct_pos"] = (
                        agg.groupby("position")[metric].rank(pct=True) * 100
                    ).round(0)
                agg = agg.sort_values(["position", "distancia_promedio_km"], ascending=[True, False])
                _write_json("player_physical_by_position.json", _records(agg))
        else:
            _write_json("player_physical_by_position.json", {"status": "pending_first_scrape", "rows": []})
    else:
        _write_json("physical_player_ranking.json", {"status": "pending_first_scrape", "rows": []})
        _write_json("player_physical_by_position.json", {"status": "pending_first_scrape", "rows": []})

    has_tactical_players = (WAREHOUSE / "tactical_player_match_stats.parquet").exists()
    if has_tactical_players:
        tactical_players = con.execute(
            f"SELECT * FROM read_parquet('{WAREHOUSE / 'tactical_player_match_stats.parquet'}')"
        ).df()
        _write_json("tactical_player_match_stats.json", _records(tactical_players))

        tactical_player_ranking = (
            tactical_players.groupby(["team", "player_name"])
            .agg(
                partidos=("match_id", "nunique"),
                pases_completados_totales=("passes_completed", "sum"),
                precision_pases_promedio=("pass_completion_pct", "mean"),
                progresiones_totales=("ball_progressions", "sum"),
                tackles_ganados_totales=("tackles_won", "sum"),
                intercepciones_totales=("interceptions", "sum"),
                presiones_totales=("pressing_direct", "sum"),
                recuperaciones_totales=("possession_regains", "sum"),
                goles_totales=("goals", "sum"),
            )
            .reset_index()
            .sort_values("pases_completados_totales", ascending=False)
        )
        _write_json("tactical_player_ranking.json", _records(tactical_player_ranking))
    else:
        _write_json("tactical_player_match_stats.json", {"status": "pending_first_scrape", "rows": []})
        _write_json("tactical_player_ranking.json", {"status": "pending_first_scrape", "rows": []})

    if has_squads:
        squads = con.execute(f"SELECT * FROM read_parquet('{WAREHOUSE / 'squads.parquet'}')").df()
        _write_json("squads.json", _records(squads))
    else:
        _write_json(
            "squads.json",
            {
                "status": "pending_first_scrape",
                "note": (
                    "Todavia no hay datos de plantel cargados. Se completan corriendo "
                    "etl/fetch_26worldcup_squads.py (fuente primaria: 26worldcup/Wikipedia; "
                    "Transfermarkt via etl/scrape_transfermarkt_squads.py queda como fallback "
                    "pero bloquea el scraping con HTTP 403)."
                ),
                "rows": [],
            },
        )

    if has_team_profile:
        team_profile = con.execute(f"SELECT * FROM read_parquet('{WAREHOUSE / 'team_profile.parquet'}')").df()
        _write_json("team_profile.json", _records(team_profile))
    else:
        _write_json(
            "team_profile.json",
            {
                "status": "pending_first_scrape",
                "note": "Se completa corriendo etl/fetch_26worldcup_squads.py (ranking FIFA + campo base, de teams.json).",
                "rows": [],
            },
        )

    if has_goal_events:
        goal_events = con.execute(f"SELECT * FROM read_parquet('{WAREHOUSE / 'goal_events.parquet'}')").df()
        if has_matches:
            matches_for_goals = con.execute(
                f"SELECT match_id, season, stage, home_team, away_team, match_date FROM read_parquet('{WAREHOUSE / 'matches.parquet'}')"
            ).df()
            goal_events = goal_events.merge(matches_for_goals, on="match_id", how="left")
        _write_json("goal_events.json", _records(goal_events.sort_values(["match_id", "minute", "minute_stoppage"])))

        # ranking de goleadores -- los goles en contra NO suman al goleador
        # (son gol del rival), pero se muestran aparte para no perder el dato.
        scoring = goal_events[~goal_events["own_goal"]]
        top_scorers = (
            scoring.groupby(["team", "player_name"])
            .agg(
                goles=("player_name", "count"),
                penales=("penalty", "sum"),
                partidos_con_gol=("match_id", "nunique"),
            )
            .reset_index()
            .sort_values(["goles", "player_name"], ascending=[False, True])
        )
        # ojo con la semantica de "team" acá: en goal_events es la selección
        # BENEFICIADA en el marcador (ver GoalEventsSchema.team), no la del
        # jugador -- se renombra a equipo_beneficiado para no sugerir que el
        # jugador (rival) juega para ese equipo.
        own_goals = (
            goal_events[goal_events["own_goal"]]
            .rename(columns={"team": "equipo_beneficiado"})
            .groupby(["equipo_beneficiado", "player_name"])
            .agg(goles_en_contra=("player_name", "count"))
            .reset_index()
        )
        _write_json("goal_scorer_ranking.json", _records(top_scorers))
        if len(own_goals):
            _write_json("own_goals.json", _records(own_goals))
    else:
        _write_json("goal_events.json", {"status": "pending_first_scrape", "rows": []})
        _write_json("goal_scorer_ranking.json", {"status": "pending_first_scrape", "rows": []})

    if has_derived_team_metrics:
        derived_team = con.execute(f"SELECT * FROM read_parquet('{WAREHOUSE / 'derived_team_metrics.parquet'}')").df()
        _write_json("derived_team_metrics.json", _records(derived_team))
    else:
        _write_json("derived_team_metrics.json", {"status": "pending_first_scrape", "rows": []})

    if has_derived_team_style:
        derived_style = con.execute(f"SELECT * FROM read_parquet('{WAREHOUSE / 'derived_team_style.parquet'}')").df()
        _write_json("derived_team_style.json", _records(derived_style))
    else:
        _write_json("derived_team_style.json", {"status": "pending_first_scrape", "rows": []})

    if has_derived_player_metrics:
        derived_player = con.execute(f"SELECT * FROM read_parquet('{WAREHOUSE / 'derived_player_metrics.parquet'}')").df()
        _write_json("derived_player_metrics.json", _records(derived_player))
    else:
        _write_json("derived_player_metrics.json", {"status": "pending_first_scrape", "rows": []})

    discovery_path = ROOT / "data" / "raw" / "fifa_training_centre" / "_discovery_status.json"
    total_matches_2026 = None
    if discovery_path.exists():
        total_matches_2026 = json.loads(discovery_path.read_text()).get("count")
    matches_with_physical = int(physical["match_id"].nunique()) if has_physical else 0

    # --- Cobertura y frescura: números reales computados en vivo sobre el
    # warehouse (nunca hardcodeados) para que cada dato de la UI sea verificable ---
    def _max_ts(df, col: str):
        try:
            v = df[col].dropna().max()
            return str(v) if v is not None else None
        except Exception:
            return None

    # 48 selecciones participan del Mundial 2026 (fuente de verdad: matches.parquet)
    teams_2026_total = (
        int(matches[matches["season"] == "2026"][["home_team", "away_team"]].stack().nunique())
        if has_matches
        else None
    )
    teams_with_physical = int(physical["team"].nunique()) if has_physical else 0
    teams_with_tactical_2026 = int(tactical_players["team"].nunique()) if has_tactical_players else 0
    matches_with_tactical_2026 = int(tactical_players["match_id"].nunique()) if has_tactical_players else 0
    teams_with_squads = int(squads["team"].nunique()) if has_squads else 0
    teams_with_profile = int(team_profile["team"].nunique()) if has_team_profile else 0

    def _pct(part, whole):
        if not whole:
            return None
        return round(min(100, (part / whole) * 100), 1)

    # Contexto táctico StatsBomb (histórico 2018/2022): partidos y torneos cargados
    if has_tactical:
        _ctx = con.execute(
            f"""SELECT count(DISTINCT t.match_id) AS m, list(DISTINCT m.season) AS seasons
                FROM read_parquet('{WAREHOUSE / 'team_match_stats_tactical.parquet'}') t
                JOIN read_parquet('{WAREHOUSE / 'matches.parquet'}') m USING(match_id)"""
        ).fetchone()
        statsbomb_matches, statsbomb_seasons = int(_ctx[0]), sorted(_ctx[1])
    else:
        statsbomb_matches, statsbomb_seasons = 0, []

    # --- Cross-verificación openfootball (CC0) vs. resultado oficial FIFA ---
    # Señal de confianza real: contamos los goles evento-a-evento de openfootball
    # y los comparamos contra el marcador final oficial de cada partido jugado.
    cross_verification = None
    if has_goal_events and has_matches:
        played = matches[(matches["season"] == "2026") & matches["home_score"].notna()].copy()
        goals_per_match = goal_events.groupby("match_id").size()
        checked = int(len(played))
        matched = 0
        for _, r in played.iterrows():
            total_score = int(r["home_score"]) + int(r["away_score"])
            if int(goals_per_match.get(r["match_id"], 0)) == total_score:
                matched += 1
        cross_verification = {
            "description": (
                "Cada gol de openfootball (CC0) se contrastó contra el marcador final "
                "oficial de FIFA Training Centre, partido por partido."
            ),
            "source_a": "openfootball/worldcup.json (goles evento a evento)",
            "source_b": "FIFA Training Centre (marcador final del partido)",
            "matches_checked": checked,
            "matches_matched": matched,
            "discrepancies": checked - matched,
        }

    # Rubro de confianza (honesto, sin inventar un score: se deriva de
    # oficialidad de la fuente + cobertura real).
    #   alta          -> dato oficial (FIFA/StatsBomb) o verificado contra oficial, cobertura alta
    #   media         -> fuente verificada pero cobertura parcial / en backfill
    #   complementaria-> fuente secundaria (Wikipedia) sin contraste oficial disponible
    #   derivada      -> métrica calculada por el proyecto sobre las fuentes de arriba
    confidence_legend = {
        "alta": "Dato oficial (FIFA Training Centre / StatsBomb) o verificado contra fuente oficial, con cobertura alta.",
        "media": "Fuente verificada pero con cobertura parcial o en proceso de carga (backfill).",
        "complementaria": "Fuente secundaria (Wikipedia/mirror comunitario) sin contraste oficial disponible.",
        "derivada": "Métrica calculada por el proyecto sobre las fuentes de arriba (percentiles, z-scores, clustering).",
    }

    generated_at = datetime.now(timezone.utc).isoformat()

    meta = {
        "generated_at": generated_at,
        "confidence_legend": confidence_legend,
        "cross_verification": cross_verification,
        "sources": {
            "tactical_context": {
                "provider": "StatsBomb Open Data",
                "provider_url": "https://github.com/statsbomb/open-data",
                "license": "https://github.com/statsbomb/open-data/blob/master/LICENSE.pdf (uso no comercial)",
                "license_short": "StatsBomb Open Data (uso no comercial)",
                "license_url": "https://github.com/statsbomb/open-data/blob/master/LICENSE.pdf",
                "coverage": "Mundial 2018 y 2022 -- partidos de Argentina cargados como semilla inicial",
                "coverage_detail": (
                    f"{statsbomb_matches} partidos cargados de {', '.join(statsbomb_seasons)}"
                    if statsbomb_seasons
                    else "sin partidos cargados"
                ),
                "method": "Eventos oficiales de StatsBomb; la posesión es un proxy por duración de eventos, no tracking.",
                "confidence": "media",
                "as_of": generated_at,
                "status": "ok" if has_tactical else "missing",
            },
            "physical_performance": {
                "provider": "FIFA Training Centre",
                "provider_url": "https://www.fifatrainingcentre.com/",
                "license": "Datos oficiales FIFA publicados en informes del Mundial 2026",
                "coverage": "Mundial 2026 (en curso)",
                "coverage_detail": (
                    f"{teams_with_physical}/{teams_2026_total} selecciones · {matches_with_physical}/{total_matches_2026} partidos"
                    if teams_2026_total
                    else None
                ),
                "coverage_pct": _pct(matches_with_physical, total_matches_2026),
                "method": "Distancia, alta intensidad, sprints y velocidad punta de los informes físicos oficiales FIFA (GPS/tracking).",
                "confidence": "alta",
                "as_of": (_max_ts(physical, "retrieved_at") or generated_at) if has_physical else generated_at,
                "status": "ok" if has_physical else "pending_first_scrape",
                "matches_loaded": matches_with_physical,
                "matches_total": total_matches_2026,
                "teams_loaded": teams_with_physical,
                "teams_total": teams_2026_total,
            },
            "tactical_2026": {
                "provider": "FIFA Training Centre",
                "provider_url": "https://www.fifatrainingcentre.com/",
                "license": "Datos oficiales FIFA publicados en informes del Mundial 2026",
                "coverage": "pases, presión, duelos y ofertas de recepción por jugador -- Mundial 2026 (en curso)",
                "coverage_detail": (
                    f"{matches_with_tactical_2026}/{total_matches_2026} partidos · {teams_with_tactical_2026}/{teams_2026_total} selecciones (backfill en curso)"
                    if teams_2026_total
                    else None
                ),
                "coverage_pct": _pct(matches_with_tactical_2026, total_matches_2026),
                "method": "Métricas tácticas por jugador de los informes oficiales FIFA; la carga histórica se completa progresivamente.",
                "confidence": "media",
                "as_of": (_max_ts(tactical_players, "retrieved_at") or generated_at) if has_tactical_players else generated_at,
                "status": "ok" if has_tactical_players else "pending_first_scrape",
                "matches_loaded": matches_with_tactical_2026,
                "matches_total": total_matches_2026,
            },
            "squad_ages": {
                "provider": "26worldcup (Wikipedia)",
                "provider_url": "https://github.com/26worldcup/26worldcup.github.io",
                "license": "Código MIT · hechos de Wikipedia (texto CC BY-SA 4.0)",
                "license_url": "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_squads",
                "provider_note": (
                    "Mirror JSON MIT (github.com/26worldcup/26worldcup.github.io) de hechos "
                    "extraidos del articulo de Wikipedia '2026 FIFA World Cup squads' "
                    "(texto CC BY-SA 4.0). No incluye valor de mercado -- Transfermarkt "
                    "(etl/scrape_transfermarkt_squads.py) queda como fallback si algun dia "
                    "deja de bloquear el scraping con HTTP 403."
                ),
                "coverage": "edad, dorsal, caps, goles de carrera, capitania y stats del Mundial 2026 del plantel actual",
                "coverage_detail": (
                    f"{teams_with_squads}/{teams_2026_total} selecciones" if teams_2026_total else None
                ),
                "coverage_pct": _pct(teams_with_squads, teams_2026_total),
                "method": "Hechos objetivos (edad, dorsal, caps) tomados del artículo de Wikipedia vía mirror comunitario.",
                "confidence": "complementaria",
                "as_of": (_max_ts(squads, "retrieved_at") or generated_at) if has_squads else generated_at,
                "status": "ok" if has_squads else "pending_first_scrape",
            },
            "team_profile": {
                "provider": "26worldcup (FIFA public API)",
                "provider_url": "https://github.com/26worldcup/26worldcup.github.io",
                "license": "Código MIT · ranking de la API pública FIFA · campo base de Wikipedia",
                "coverage": "ranking FIFA (actual y anterior) y ubicacion del campo base por seleccion",
                "coverage_detail": (
                    f"{teams_with_profile}/{teams_2026_total} selecciones" if teams_2026_total else None
                ),
                "coverage_pct": _pct(teams_with_profile, teams_2026_total),
                "method": "Ranking de la API pública de FIFA; el campo base proviene de Wikipedia vía el mismo mirror.",
                "confidence": "media",
                "as_of": (_max_ts(team_profile, "retrieved_at") or generated_at) if has_team_profile else generated_at,
                "status": "ok" if has_team_profile else "pending_first_scrape",
            },
            "derived_metrics": {
                "provider": "calculado internamente sobre las fuentes de arriba",
                "coverage": "percentiles y z-scores por temporada, clustering de estilo de juego",
                "coverage_detail": "percentil y z-score por métrica dentro de cada temporada; k-means (5 métricas tácticas) para estilo",
                "method": (
                    "Percentil y z-score se calculan DENTRO de la misma temporada (2026 vs 2026). "
                    "El estilo de juego es un k-means sobre 5 métricas tácticas estandarizadas: "
                    "heurística descriptiva, no una clasificación validada."
                ),
                "confidence": "derivada",
                "as_of": generated_at,
                "status": "ok" if has_derived_team_metrics else "pending_first_scrape",
            },
            "goal_events": {
                "provider": "openfootball/worldcup.json",
                "provider_url": "https://github.com/openfootball/worldcup.json",
                "license": "CC0-1.0 (dominio publico) -- https://github.com/openfootball/worldcup.json",
                "license_short": "CC0-1.0 (dominio público)",
                "license_url": "https://github.com/openfootball/worldcup.json",
                "coverage": "goleador, minuto y flags de penal/gol en contra de cada gol del Mundial 2026",
                "coverage_detail": (
                    f"{int(goal_events['match_id'].nunique())} partidos con goles · verificado {cross_verification['matches_matched']}/{cross_verification['matches_checked']} contra FIFA"
                    if has_goal_events and cross_verification
                    else None
                ),
                "method": "Goles evento a evento; verificados uno a uno contra el marcador final oficial de FIFA Training Centre.",
                "confidence": "alta",
                "cross_checked_against": "resultado final de matches.parquet (FIFA Training Centre)",
                "as_of": (_max_ts(goal_events, "retrieved_at") or generated_at) if has_goal_events else generated_at,
                "status": "ok" if has_goal_events else "pending_first_scrape",
                # partidos con al menos un gol propio (un 0-0 matcheado
                # correctamente no aporta filas acá, no es un partido faltante)
                "matches_with_goals": int(goal_events["match_id"].nunique()) if has_goal_events else 0,
                "matches_played_total": (
                    int(matches[(matches["season"] == "2026") & matches["home_score"].notna()]["match_id"].nunique())
                    if has_goal_events and has_matches
                    else None
                ),
            },
        },
    }
    _write_json("meta.json", meta)
    con.close()

    print("Publicando Parquet para el explorador SQL en site/public/data-parquet/ ...")
    _publish_parquet_for_explorer()


if __name__ == "__main__":
    build()

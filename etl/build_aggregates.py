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
    (DuckDB-WASM) lo pueda leer por HTTP desde el propio sitio estático.

    Espejo COMPLETO del warehouse -- primero borra en destino cualquier
    *.parquet que ya no exista en `data/warehouse/` antes de copiar. Sin este
    borrado, una tabla que dejó de generarse (ej. los datos físicos del
    Mundial 2026 al pivotar el proyecto a la Liga Profesional) quedaba viva
    para siempre en el Explorador SQL -- el resto del sitio mostraba
    correctamente "sin dato" para esa fuente, pero acá se podía seguir
    consultando un dataset de OTRA competencia como si fuera vigente."""
    PARQUET_OUT.mkdir(parents=True, exist_ok=True)
    current = {p.name for p in WAREHOUSE.glob("*.parquet")}
    for stale in PARQUET_OUT.glob("*.parquet"):
        if stale.name not in current:
            stale.unlink()
            print(f"  data-parquet/{stale.name} (borrado -- ya no está en el warehouse)")
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
    has_squads = (WAREHOUSE / "squads.parquet").exists()
    has_team_profile = (WAREHOUSE / "team_profile.parquet").exists()
    has_goal_events = (WAREHOUSE / "goal_events.parquet").exists()
    has_derived_team_metrics = (WAREHOUSE / "derived_team_metrics.parquet").exists()
    has_derived_player_metrics = (WAREHOUSE / "derived_player_metrics.parquet").exists()
    has_player_season_stats = (WAREHOUSE / "player_season_stats.parquet").exists()
    has_standings = (WAREHOUSE / "standings.parquet").exists()

    print("Generando agregados en site/public/data/ ...")

    if has_matches:
        matches = con.execute(f"SELECT * FROM read_parquet('{WAREHOUSE / 'matches.parquet'}')").df()
        _write_json("matches.json", _records(matches))

    if has_matches and has_tactical:
        matches = con.execute(f"SELECT * FROM read_parquet('{WAREHOUSE / 'matches.parquet'}')").df()
        tactical = con.execute(f"SELECT * FROM read_parquet('{WAREHOUSE / 'team_match_stats_tactical.parquet'}')").df()

        merged = tactical.merge(matches[["match_id", "season", "stage", "match_date"]], on="match_id", how="left")

        # "Conceded": lo que le hizo el RIVAL en el mismo partido (remates al arco
        # y goles recibidos) -- self-join por match_id contra la fila del OTRO
        # equipo. Es la única forma de tener una dimensión DEFENSIVA real para
        # LPF (ESPN no publica tackles/intercepciones a nivel equipo).
        conceded = merged[["match_id", "team", "shots_on_target", "goals"]].rename(
            columns={"team": "rival", "shots_on_target": "remates_al_arco_recibidos", "goals": "goles_recibidos"}
        )
        merged = merged.merge(conceded, on="match_id")
        merged = merged[merged["team"] != merged["rival"]].drop(columns=["rival"])

        team_season_summary = (
            merged.groupby(["team", "season"])
            .agg(
                partidos=("match_id", "count"),
                posesion_promedio_proxy=("possession_share_proxy", "mean"),
                precision_pases_promedio=("pass_accuracy_pct", "mean"),
                remates_promedio=("shots_total", "mean"),
                remates_al_arco_promedio=("shots_on_target", "mean"),
                remates_al_arco_recibidos_promedio=("remates_al_arco_recibidos", "mean"),
                goles_totales=("goals", "sum"),
                goles_recibidos_promedio=("goles_recibidos", "mean"),
                faltas_promedio=("fouls_committed", "mean"),
            )
            .reset_index()
            .round(3)
        )
        _write_json("team_season_summary.json", _records(team_season_summary))

        # serie temporal: evolución partido a partido dentro de cada torneo
        timeline = merged.sort_values(["team", "season", "match_date"])[
            ["team", "season", "match_date", "stage", "possession_share_proxy", "pass_accuracy_pct", "shots_total"]
        ]
        _write_json("timeline_tactical.json", _records(timeline))

    # Estadística individual REAL de jugadores de LPF -- FotMob (ver docstring
    # de fetch_fotmob_lpf.py). Es lo único con rendimiento por jugador para
    # esta liga, ya que ESPN no publica boxscore por partido acá (ver
    # player_match_stats en meta.sources más abajo). Formato largo (una fila
    # por jugador+métrica) tal cual sale del warehouse -- 37 categorías,
    # incluye xG/xGOT/xA. Es agregado de TEMPORADA, no de partido: se
    # documenta esa granularidad en meta.sources para no confundirla con las
    # tablas por-partido del resto del proyecto.
    if has_player_season_stats:
        player_season_stats = con.execute(
            f"SELECT * FROM read_parquet('{WAREHOUSE / 'player_season_stats.parquet'}')"
        ).df()
        _write_json("player_season_stats.json", _records(player_season_stats))
    else:
        _write_json(
            "player_season_stats.json",
            {
                "status": "pending_first_scrape",
                "note": "Se completa corriendo etl/fetch_fotmob_lpf.py (FotMob, estadística de temporada por jugador).",
                "rows": [],
            },
        )

    # Físico (distancia, sprints, velocidad punta): NO existe para Métricas LPF.
    # Se investigó a fondo (fbref, WhoScored, SofaScore, API-Football, FotMob,
    # sitios oficiales AFA/LPF) y ninguna fuente gratuita lo publica -- es data
    # propietaria de cada club vía su proveedor de hardware (Catapult/
    # STATSports). status="missing" (no "pending_first_scrape": no es que
    # falte correr algo, es que la fuente no existe).
    _write_json(
        "physical_match_stats.json",
        {
            "status": "missing",
            "note": (
                "No existe una fuente gratuita de datos físicos/GPS (distancia, sprints, velocidad "
                "punta) para la Liga Profesional Argentina. Es data propietaria de cada club vía su "
                "proveedor de hardware (Catapult/STATSports), nunca publicada por las ligas."
            ),
            "rows": [],
        },
    )

    # Físico de equipo y por jugador (distancia, sprints, velocidad punta,
    # percentiles por posición): NO existe para Métricas LPF, ver nota arriba
    # de physical_match_stats.json.
    _PHYSICAL_MISSING = {
        "status": "missing",
        "note": (
            "No existe una fuente gratuita de datos físicos/GPS para la Liga Profesional Argentina."
        ),
        "rows": [],
    }
    _write_json("physical_player_match_stats.json", _PHYSICAL_MISSING)

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

    # Tabla de posiciones real de LPF (ESPN) -- puntos, PJ/PG/PE/PP, goles a
    # favor/en contra, diferencia. Se fetcheaba desde el día uno (ver
    # fetch_espn_lpf.py) pero no estaba conectada al warehouse ni publicada.
    if has_standings:
        standings = con.execute(
            f"SELECT * FROM read_parquet('{WAREHOUSE / 'standings.parquet'}') ORDER BY posicion"
        ).df()
        _write_json("standings.json", _records(standings))
    else:
        _write_json(
            "standings.json",
            {
                "status": "pending_first_scrape",
                "note": "Se completa corriendo etl/fetch_espn_lpf.py (tabla de posiciones de ESPN).",
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
    else:
        _write_json("goal_events.json", {"status": "pending_first_scrape", "rows": []})

    # --- Resumen por partido (vista "Partidos") -------------------------------
    # Una tarjeta por partido jugado, con lo que sí tenemos de ESPN: resultado,
    # goles con minuto, posesión-proxy/remates/pases/faltas de cada equipo
    # (team_match_stats_tactical, real) y una lectura automática. Ya NO incluye
    # físico (no existe para LPF, ver nota arriba). Se reconstruye en cada
    # corrida -> se va actualizando con cada partido nuevo.
    if has_matches and has_tactical and has_goal_events:
        played = matches[(matches["season"] == "2026") & matches["home_score"].notna()].copy()
        ms_team = con.execute(
            f"SELECT match_id, team, possession_share_proxy, shots_total, shots_on_target, "
            f"passes_attempted, passes_completed, fouls_committed, corners, offsides, gk_saves "
            f"FROM read_parquet('{WAREHOUSE / 'team_match_stats_tactical.parquet'}')"
        ).df()
        ms_goals = con.execute(
            f"SELECT match_id, team, player_name, minute, minute_display, own_goal, penalty "
            f"FROM read_parquet('{WAREHOUSE / 'goal_events.parquet'}')"
        ).df()

        def _num(df, col):
            return float(df[col].iloc[0]) if len(df) and pd.notna(df[col].iloc[0]) else None

        def _team_block(mid, t):
            r = ms_team[(ms_team["match_id"] == mid) & (ms_team["team"] == t)]
            posesion = _num(r, "possession_share_proxy")
            return {
                "posesion_pct": round(posesion * 100, 1) if posesion is not None else None,
                "remates": int(_num(r, "shots_total")) if _num(r, "shots_total") is not None else None,
                "remates_al_arco": int(_num(r, "shots_on_target")) if _num(r, "shots_on_target") is not None else None,
                "pases": int(_num(r, "passes_attempted")) if _num(r, "passes_attempted") is not None else None,
                "precision_pases_pct": (
                    round(_num(r, "passes_completed") / _num(r, "passes_attempted") * 100, 1)
                    if _num(r, "passes_attempted") else None
                ),
                "faltas": int(_num(r, "fouls_committed")) if _num(r, "fouls_committed") is not None else None,
                "corners": int(_num(r, "corners")) if _num(r, "corners") is not None else None,
                "offsides": int(_num(r, "offsides")) if _num(r, "offsides") is not None else None,
                "atajadas": int(_num(r, "gk_saves")) if _num(r, "gk_saves") is not None else None,
            }

        summaries = []
        for _, m in played.sort_values(["match_date", "match_id"], ascending=[False, False]).iterrows():
            mid, home, away = m["match_id"], m["home_team"], m["away_team"]
            hs, as_ = int(m["home_score"]), int(m["away_score"])
            h, a = _team_block(mid, home), _team_block(mid, away)

            gm = ms_goals[(ms_goals["match_id"] == mid) & (~ms_goals["own_goal"])].sort_values("minute")
            goleadores = [
                {"player": r.player_name, "team": r.team,
                 "minute": r.minute_display or (str(int(r.minute)) if pd.notna(r.minute) else ""),
                 "penalty": bool(r.penalty)}
                for r in gm.itertuples()
            ]
            og = ms_goals[(ms_goals["match_id"] == mid) & (ms_goals["own_goal"])]
            goles_contra = [{"player": r.player_name, "team": r.team, "minute": r.minute_display or ""} for r in og.itertuples()]

            destacado = None
            if len(gm):
                top = gm.groupby(["player_name", "team"]).size().sort_values(ascending=False)
                (pn, tm), n = top.index[0], int(top.iloc[0])
                destacado = {"player": pn, "team": tm, "note": f"{n} gol{'es' if n > 1 else ''}"}

            # lectura automática: resultado + quién manejó más la pelota + quién remató más
            if hs > as_:
                res = f"{home} venció {hs}-{as_} a {away}"
            elif as_ > hs:
                res = f"{away} venció {as_}-{hs} a {home}"
            else:
                res = f"{home} y {away} empataron {hs}-{as_}"
            bits = [res + "."]
            if h["posesion_pct"] and a["posesion_pct"] and abs(h["posesion_pct"] - a["posesion_pct"]) >= 6:
                pteam, pv = (home, h["posesion_pct"]) if h["posesion_pct"] > a["posesion_pct"] else (away, a["posesion_pct"])
                bits.append(f"{pteam} manejó más la pelota ({pv}% de posesión).")
            if h["remates_al_arco"] is not None and a["remates_al_arco"] is not None and abs(h["remates_al_arco"] - a["remates_al_arco"]) >= 2:
                rteam, rv, ov = (
                    (home, h["remates_al_arco"], a["remates_al_arco"])
                    if h["remates_al_arco"] > a["remates_al_arco"]
                    else (away, a["remates_al_arco"], h["remates_al_arco"])
                )
                bits.append(f"{rteam} remató más al arco rival ({rv} vs {ov} remates al arco).")
            insight = " ".join(bits)

            summaries.append({
                "match_id": int(mid), "match_date": m["match_date"], "stage": m["stage"],
                "home_team": home, "away_team": away, "home_score": hs, "away_score": as_,
                "home": h, "away": a, "goleadores": goleadores, "goles_contra": goles_contra,
                "destacado": destacado, "insight": insight,
            })
        _write_json("match_summaries.json", summaries)
    else:
        _write_json("match_summaries.json", {"status": "pending_first_scrape", "rows": []})

    if has_derived_player_metrics:
        derived_player = con.execute(f"SELECT * FROM read_parquet('{WAREHOUSE / 'derived_player_metrics.parquet'}')").df()
        _write_json("derived_player_metrics.json", _records(derived_player))
    else:
        _write_json("derived_player_metrics.json", {"status": "pending_first_scrape", "rows": []})

    # Total de partidos de la temporada = todos los fixtures que ESPN devolvió
    # (jugados + programados), no un archivo de descubrimiento separado -- ya
    # no existe (era propio del scraper de FIFA Training Centre del Mundial).
    total_matches_season = int(len(matches[matches["season"] == "2026"])) if has_matches else None

    # --- Cobertura y frescura: números reales computados en vivo sobre el
    # warehouse (nunca hardcodeados) para que cada dato de la UI sea verificable ---
    def _max_ts(df, col: str):
        try:
            v = df[col].dropna().max()
            return str(v) if v is not None else None
        except Exception:
            return None

    # matches/team_match_stats/standings (a diferencia de goal_events/squads/
    # team_profile) no traen su propia columna retrieved_at por fila -- ver
    # fetch_espn_lpf.py, MATCHES_COLS/TEAM_STATS_COLS/STANDINGS_COLS. Sin esto
    # su "as_of" en meta.json quedaba SIEMPRE en generated_at (la hora de esta
    # corrida), aunque ESPN llevara semanas sin devolver nada nuevo -- el
    # badge de confianza del sitio mostraba "actualizado hoy" para partidos y
    # tabla mientras el resto de las fuentes sí mostraba honestamente la
    # fecha vieja. fetch_espn_lpf.py deja un sidecar (_fetch_status.json) con
    # la hora real del último fetch exitoso; se usa como as_of de estas dos
    # fuentes en vez de generated_at.
    def _espn_fetched_at() -> str | None:
        path = ROOT / "data" / "raw" / "espn" / "_fetch_status.json"
        try:
            status = json.loads(path.read_text(encoding="utf-8"))
            return status.get("fetched_at")
        except Exception:
            return None

    espn_fetched_at = _espn_fetched_at()

    # 30 clubes participan de la Liga Profesional 2026 (fuente de verdad: matches.parquet)
    teams_season_total = (
        int(matches[matches["season"] == "2026"][["home_team", "away_team"]].stack().nunique())
        if has_matches
        else None
    )
    teams_with_squads = int(squads["team"].nunique()) if has_squads else 0
    teams_with_profile = int(team_profile["team"].nunique()) if has_team_profile else 0
    teams_with_season_stats = int(player_season_stats["team"].nunique()) if has_player_season_stats else 0
    players_with_season_stats = (
        int(player_season_stats[["player_name", "team"]].drop_duplicates().shape[0])
        if has_player_season_stats
        else 0
    )
    categories_with_season_stats = int(player_season_stats["metric"].nunique()) if has_player_season_stats else 0

    def _pct(part, whole):
        if not whole:
            return None
        return round(min(100, (part / whole) * 100), 1)

    # Partidos y torneos con estadística de equipo cargada (ESPN, LPF temporada actual)
    if has_tactical:
        _ctx = con.execute(
            f"""SELECT count(DISTINCT t.match_id) AS m, list(DISTINCT m.season) AS seasons
                FROM read_parquet('{WAREHOUSE / 'team_match_stats_tactical.parquet'}') t
                JOIN read_parquet('{WAREHOUSE / 'matches.parquet'}') m USING(match_id)"""
        ).fetchone()
        espn_stats_matches, espn_stats_seasons = int(_ctx[0]), sorted(_ctx[1])
    else:
        espn_stats_matches, espn_stats_seasons = 0, []

    # --- Consistencia interna de goal_events vs. el marcador final -- ambos
    # salen del mismo proveedor (ESPN), así que esto NO es una verificación
    # cruzada entre fuentes independientes (como sí lo era openfootball vs.
    # FIFA Training Centre en el Mundial): es un chequeo de que los eventos de
    # gol que ESPN reporta partido a partido efectivamente suman el marcador
    # final que el mismo ESPN publica para ese partido. Sigue siendo una señal
    # real y útil (detecta partidos con eventos incompletos), pero se etiqueta
    # con honestidad -- no se presenta como algo que no es. ---
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
                "Consistencia interna: se suman los goles evento a evento que ESPN reporta "
                "para cada partido y se contrastan contra el marcador final que la misma ESPN "
                "publica para ese partido. No es una verificación entre fuentes independientes "
                "(ambos números vienen del mismo proveedor) -- es un chequeo de que los eventos "
                "de gol cargados son consistentes con el resultado, útil para detectar partidos "
                "con eventos incompletos."
            ),
            "source_a": "ESPN (goles evento a evento)",
            "source_b": "ESPN (marcador final del partido)",
            "matches_checked": checked,
            "matches_matched": matched,
            "discrepancies": checked - matched,
        }

    # Rubro de confianza (honesto, sin inventar un score: se deriva de
    # oficialidad de la fuente + cobertura real).
    #   alta          -> dato de partido real de ESPN, cobertura alta
    #   media         -> fuente real pero cobertura parcial / dato agregado no oficial
    #   complementaria-> dato complementario (plantel) sin estadística de rendimiento
    #   derivada      -> métrica calculada por el proyecto sobre las fuentes de arriba
    confidence_legend = {
        "alta": "Dato de partido real (ESPN), con cobertura alta sobre la temporada en curso.",
        "media": "Fuente real pero con cobertura parcial, o dato agregado/proxy (no oficial-oficial).",
        "complementaria": "Dato complementario (ej. plantel) sin estadística de rendimiento asociada.",
        "derivada": "Métrica calculada por el proyecto sobre las fuentes de arriba (percentiles, z-scores, clustering).",
    }

    generated_at = datetime.now(timezone.utc).isoformat()

    meta = {
        "generated_at": generated_at,
        "confidence_legend": confidence_legend,
        "cross_verification": cross_verification,
        "sources": {
            "tactical_context": {
                "provider": "ESPN",
                "provider_url": "https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/",
                "license": "API pública sin key, uso no documentado formalmente (fuente ampliamente usada en proyectos de datos deportivos)",
                "license_short": "ESPN (API pública, sin key)",
                "coverage": "Liga Profesional Argentina, temporada en curso -- estadística de partido por equipo",
                "coverage_detail": (
                    f"{espn_stats_matches} partidos con estadística cargada de {', '.join(espn_stats_seasons)}"
                    if espn_stats_seasons
                    else "sin partidos cargados"
                ),
                "method": "Remates, posesión-proxy, pases y precisión, faltas, córners, offsides y atajadas por equipo y partido.",
                "confidence": "alta",
                "as_of": espn_fetched_at or generated_at,
                "status": "ok" if has_tactical else "missing",
            },
            "physical_performance": {
                "provider": None,
                "coverage": "No disponible para ninguna liga sin datos GPS propios publicados",
                "coverage_detail": None,
                "coverage_pct": None,
                "method": (
                    "No existe una fuente gratuita de datos físicos/GPS (distancia, sprints, velocidad "
                    "punta) para la Liga Profesional Argentina. Es data propietaria de cada club vía su "
                    "proveedor de hardware (Catapult/STATSports), nunca publicada por las ligas. Se "
                    "investigó a fondo: fbref, WhoScored y SofaScore bloquean el acceso automatizado "
                    "(Cloudflare); API-Football, ESPN, FotMob y los sitios oficiales de AFA/Liga "
                    "Profesional no publican este dato para ninguna competición."
                ),
                "confidence": None,
                "as_of": generated_at,
                "status": "missing",
            },
            "player_match_stats": {
                "provider": "ESPN",
                "provider_url": "https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/",
                "license": "API pública sin key",
                "coverage": "Estadística individual por partido (pases, remates, quites, rating)",
                "coverage_detail": "0 partidos -- ESPN no puebla esta sección para esta competición",
                "method": "boxscore.players del endpoint de resumen de partido; vino vacío en todas las pruebas realizadas.",
                "confidence": None,
                "as_of": generated_at,
                "status": "missing",
            },
            "player_season_stats": {
                "provider": "FotMob",
                "provider_url": f"https://www.fotmob.com/api/data/leagues?id={112}",
                "license": "API pública sin key ni login, uso no documentado formalmente (misma API que usa el sitio fotmob.com)",
                "license_short": "FotMob (API pública, sin key)",
                "coverage": "Estadística individual agregada de TEMPORADA (no de partido): goles, asistencias, xG, xGOT, xA, remates, pases, tackles, intercepciones, atajadas, tarjetas y más.",
                "coverage_detail": (
                    f"{players_with_season_stats} jugadores de {teams_with_season_stats}/{teams_season_total} "
                    f"clubes · {categories_with_season_stats} categorías de estadística"
                    if has_player_season_stats and teams_season_total
                    else None
                ),
                "coverage_pct": _pct(teams_with_season_stats, teams_season_total),
                "method": (
                    "37 categorías de líderes de estadística por liga, cada una con su lista completa de "
                    "temporada (no solo el top-3 visible en la web). Es la única fuente gratuita encontrada "
                    "con rendimiento real por jugador para esta liga -- ESPN no publica boxscore por partido "
                    "acá (ver player_match_stats arriba). Al ser agregado de TEMPORADA y no de partido, no es "
                    "directamente comparable con las tablas por-partido del resto del proyecto."
                ),
                "confidence": "media",
                "as_of": (_max_ts(player_season_stats, "retrieved_at") or generated_at) if has_player_season_stats else generated_at,
                "status": "ok" if has_player_season_stats else "pending_first_scrape",
            },
            "squad_ages": {
                "provider": "ESPN",
                "provider_url": "https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/",
                "license": "API pública sin key",
                "coverage": "plantel por club: nombre, posición, edad, fecha de nacimiento, dorsal",
                "coverage_detail": (
                    f"{teams_with_squads}/{teams_season_total} clubes" if teams_season_total else None
                ),
                "coverage_pct": _pct(teams_with_squads, teams_season_total),
                "method": "Endpoint de roster de ESPN por club. No incluye valor de mercado, caps ni estadística individual.",
                "confidence": "alta",
                "as_of": (_max_ts(squads, "retrieved_at") or generated_at) if has_squads else generated_at,
                "status": "ok" if has_squads else "pending_first_scrape",
            },
            "team_profile": {
                "provider": "ESPN",
                "provider_url": "https://site.api.espn.com/apis/v2/sports/soccer/arg.1/standings",
                "license": "API pública sin key",
                "coverage": "lista de clubes de la Liga Profesional",
                "coverage_detail": (
                    f"{teams_with_profile}/{teams_season_total} clubes" if teams_season_total else None
                ),
                "coverage_pct": _pct(teams_with_profile, teams_season_total),
                "method": "Standings oficiales de ESPN para la Liga Profesional.",
                "confidence": "alta",
                "as_of": (_max_ts(team_profile, "retrieved_at") or generated_at) if has_team_profile else generated_at,
                "status": "ok" if has_team_profile else "pending_first_scrape",
            },
            "standings": {
                "provider": "ESPN",
                "provider_url": "https://site.api.espn.com/apis/v2/sports/soccer/arg.1/standings",
                "license": "API pública sin key",
                "coverage": "tabla de posiciones: puntos, partidos jugados, ganados/empatados/perdidos, goles a favor/en contra, diferencia",
                "coverage_detail": (
                    f"{int(standings['team'].nunique())}/{teams_season_total} clubes" if has_standings and teams_season_total else None
                ),
                "coverage_pct": _pct(int(standings["team"].nunique()), teams_season_total) if has_standings else None,
                "method": "Standings oficiales de ESPN para la Liga Profesional, tabla general.",
                "confidence": "alta",
                "as_of": espn_fetched_at or generated_at,
                "status": "ok" if has_standings else "pending_first_scrape",
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
                "provider": "ESPN",
                "provider_url": "https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/",
                "license": "API pública sin key",
                "license_short": "ESPN (API pública, sin key)",
                "coverage": "goleador, minuto y flags de penal/gol en contra de cada gol de la temporada en curso",
                "coverage_detail": (
                    f"{int(goal_events['match_id'].nunique())} partidos con goles · consistencia interna {cross_verification['matches_matched']}/{cross_verification['matches_checked']}"
                    if has_goal_events and cross_verification
                    else None
                ),
                "method": "Eventos con flag scoringPlay del resumen de partido de ESPN, filtrado por goleador identificable.",
                "confidence": "alta",
                "cross_checked_against": "marcador final del mismo partido (ambos publicados por ESPN)",
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

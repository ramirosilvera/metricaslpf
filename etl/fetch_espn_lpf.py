"""Descarga la Liga Profesional Argentina (temporada actual, en curso) desde
la API pública (no documentada oficialmente, pero ampliamente usada en
proyectos de datos deportivos) de ESPN -- site.api.espn.com -- y la deja en
el formato de CSV procesados que consume build_warehouse.py.

== Por qué ESPN y no fbref / API-Football ==
- fbref: INACCESIBLE desde CI. Interpone un "managed challenge" de Cloudflare
  que bloquea IPs de datacenter. Verificado por HTTP plano (403) y por
  navegador real headless -- Playwright/Chromium (nunca sale del desafío).
  Saltarlo requiere proxies residenciales pagos, descartado por la regla del
  proyecto de usar solo fuentes gratis/open source.
- API-Football (free tier): SÍ es accesible, pero el plan gratuito NO cubre
  la temporada actual -- solo permite consultar temporadas 2022 a 2024
  ("Free plans do not have access to this season, try from 2022 to 2024.").
  Rompe el requisito explícito de "temporada actual". El fetcher para esta
  fuente queda en el repo (fetch_api_football_lpf.py) como opción histórica,
  pero no corre por defecto en el pipeline.
- ESPN (site.api.espn.com/apis/site/v2/sports/soccer/arg.1/...): verificado
  desde GitHub Actions -- responde 200, sin necesidad de API key, con
  fixtures/resultados de la temporada EN CURSO y, para partidos ya jugados,
  estadísticas de partido reales: posesión, remates totales y al arco,
  pases y precisión, córners, faltas, tarjetas, offsides, atajadas, tackles,
  intercepciones y despejes -- por equipo. No requiere key ni tiene límite de
  requests documentado (a diferencia de API-Football). Es la mejor fuente
  gratuita disponible para "Liga Profesional, temporada actual".

Limitación conocida y documentada (no se inventa nada para compensarla): el
detalle de estadística POR JUGADOR (boxscore.players) vino vacío para los
partidos de LPF probados -- ESPN parece no poblar esa sección para esta
competición. Por eso player_match_appearances/tactical_player_match_stats
pueden quedar en 0 filas; el sitio ya maneja ese estado ("sin datos
todavía") sin romperse. NO hay xG en esta fuente -> se usa el mismo proxy de
peligrosidad (remates al arco/dentro/fuera del área) que en la variante
API-Football, documentado como proxy, nunca como xG real.

Uso:
    python etl/fetch_espn_lpf.py
    # opcionales:
    #   LPF_SEASON_START=2026-01-01   (desde cuándo barrer el calendario)
    #   ESPN_CHUNK_DAYS=30            (tamaño de cada ventana de scoreboard)
"""
from __future__ import annotations

import csv
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

SLUG = "arg.1"  # Primera División / Liga Profesional Argentina en ESPN
API_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer"
STANDINGS_URL = f"https://site.api.espn.com/apis/v2/sports/soccer/{SLUG}/standings"
SOURCE = "espn"
SOURCE_URL = f"{API_BASE}/{SLUG}"
REQUEST_TIMEOUT_S = 25
COMPETITION_NAME = "Liga Profesional"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
HEADERS = {"User-Agent": UA, "Accept": "application/json", "Accept-Language": "es-AR,es;q=0.9"}

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "espn"
CACHE_DIR = RAW_DIR / "cache"
OUT_DIR = RAW_DIR / "_processed"

MATCHES_CSV = OUT_DIR / "matches.csv"
TEAM_STATS_CSV = OUT_DIR / "team_match_stats.csv"
APPEARANCES_CSV = OUT_DIR / "player_match_appearances.csv"
TACTICAL_CSV = OUT_DIR / "tactical_player_match_stats.csv"
GOAL_EVENTS_CSV = OUT_DIR / "goal_events.csv"
STANDINGS_CSV = OUT_DIR / "standings.csv"
TEAM_PROFILE_CSV = OUT_DIR / "team_profile.csv"

MATCHES_COLS = ["match_id", "competition", "season", "stage", "group", "match_date",
                "home_team", "away_team", "home_score", "away_score", "stadium", "referee"]
TEAM_STATS_COLS = ["match_id", "team", "possession_share_proxy", "passes_attempted",
                   "passes_completed", "pass_accuracy_pct", "shots_total", "shots_on_target",
                   "shots_inside_box", "shots_outside_box", "shots_blocked", "goals",
                   "fouls_committed", "corners", "offsides", "gk_saves", "peligrosidad_proxy"]
APPEARANCES_COLS = ["match_id", "team", "player_id", "player_name", "minutes_played"]
TACTICAL_COLS = ["match_id", "team", "jersey_number", "player_name", "passes_attempted",
                 "passes_completed", "pass_completion_pct", "attempts_at_goal", "goals",
                 "take_ons", "tackles_made", "blocks", "interceptions", "duels_won_physical",
                 "key_passes", "rating", "source", "source_url", "retrieved_at"]
GOAL_EVENTS_COLS = ["match_id", "team", "player_name", "minute", "minute_stoppage",
                    "minute_display", "own_goal", "penalty", "source", "source_url", "retrieved_at"]
STANDINGS_COLS = ["team", "season", "posicion", "puntos", "jugados", "ganados", "empatados",
                  "perdidos", "goles_favor", "goles_contra", "diferencia", "forma"]
TEAM_PROFILE_COLS = ["team", "fifa_code", "group", "fifa_ranking", "fifa_ranking_prev",
                     "base_camp_city", "base_camp_facility", "base_camp_country",
                     "base_camp_lat", "base_camp_lon", "source", "retrieved_at"]

# Nombre ESPN -> clave interna del proxy de peligrosidad / stats de equipo.
_STAT_KEYS = {
    "possessionPct": "possession",
    "totalShots": "shots_total",
    "shotsOnTarget": "shots_on_target",
    "foulsCommitted": "fouls_committed",
    "wonCorners": "corners",
    "offsides": "offsides",
    "saves": "gk_saves",
    "accuratePasses": "passes_completed",
    "totalPasses": "passes_attempted",
}


def _get(url: str, params: dict | None = None) -> dict | None:
    try:
        r = requests.get(url, headers=HEADERS, params=params, timeout=REQUEST_TIMEOUT_S)
    except Exception as e:  # noqa: BLE001
        print(f"  ESPN error {url}: {type(e).__name__}: {e}", file=sys.stderr)
        return None
    if r.status_code != 200:
        print(f"  ESPN {url} -> HTTP {r.status_code}: {r.text[:200]}", file=sys.stderr)
        return None
    try:
        return r.json()
    except ValueError:
        return None


def _cache_path(event_id: str) -> Path:
    return CACHE_DIR / f"{event_id}_summary.json"


def _get_summary_cached(event_id: str) -> dict | None:
    p = _cache_path(event_id)
    if p.exists() and p.stat().st_size > 0:
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except ValueError:
            pass
    data = _get(f"{API_BASE}/{SLUG}/summary", {"event": event_id})
    if data is not None:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def _write_csv(path: Path, cols: list[str], rows: list[dict]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow(row)


def _write_all_empty() -> None:
    _write_csv(MATCHES_CSV, MATCHES_COLS, [])
    _write_csv(TEAM_STATS_CSV, TEAM_STATS_COLS, [])
    _write_csv(APPEARANCES_CSV, APPEARANCES_COLS, [])
    _write_csv(TACTICAL_CSV, TACTICAL_COLS, [])
    _write_csv(GOAL_EVENTS_CSV, GOAL_EVENTS_COLS, [])
    _write_csv(STANDINGS_CSV, STANDINGS_COLS, [])
    _write_csv(TEAM_PROFILE_CSV, TEAM_PROFILE_COLS, [])


def _date_chunks(start: date, end: date, chunk_days: int):
    cur = start
    while cur <= end:
        stop = min(cur + timedelta(days=chunk_days - 1), end)
        yield cur, stop
        cur = stop + timedelta(days=1)


def _num(v) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _sweep_scoreboard(season_start: date, season_end: date, chunk_days: int) -> list[dict]:
    """Barre el calendario en ventanas y devuelve la lista cruda de 'events'
    de ESPN (deduplicados por id)."""
    seen: dict[str, dict] = {}
    for start, stop in _date_chunks(season_start, season_end, chunk_days):
        params = {"dates": f"{start:%Y%m%d}-{stop:%Y%m%d}"}
        data = _get(f"{API_BASE}/{SLUG}/scoreboard", params)
        if not data:
            continue
        for ev in data.get("events") or []:
            eid = ev.get("id")
            if eid:
                seen[eid] = ev
    return list(seen.values())


def _parse_match_row(ev: dict, season: str) -> dict | None:
    comp = (ev.get("competitions") or [{}])[0]
    competitors = comp.get("competitors") or []
    home = next((c for c in competitors if c.get("homeAway") == "home"), None)
    away = next((c for c in competitors if c.get("homeAway") == "away"), None)
    if not home or not away:
        return None
    home_team = (home.get("team") or {}).get("displayName")
    away_team = (away.get("team") or {}).get("displayName")
    if not home_team or not away_team:
        return None
    status = (comp.get("status") or {}).get("type") or {}
    played = bool(status.get("completed"))
    venue = (comp.get("venue") or {}).get("fullName") or ""
    date_iso = (ev.get("date") or "")[:10]
    return {
        "match_id": ev.get("id"),
        "competition": COMPETITION_NAME,
        "season": season,
        "stage": (ev.get("season") or {}).get("slug") or "",
        "group": "",
        "match_date": date_iso,
        "home_team": home_team,
        "away_team": away_team,
        "home_score": home.get("score") if played else None,
        "away_score": away.get("score") if played else None,
        "stadium": venue,
        "referee": "",
    }, played, home_team, away_team


def _parse_team_stats(summary: dict, match_id: str, score_by_team: dict) -> list[dict]:
    box = (summary.get("boxscore") or {})
    teams = box.get("teams") or []
    rows: list[dict] = []
    for t in teams:
        name = (t.get("team") or {}).get("displayName")
        if not name:
            continue
        raw = {}
        for s in t.get("statistics") or []:
            key = _STAT_KEYS.get(s.get("name"))
            if key:
                raw[key] = _num(s.get("value"))
                if raw[key] is None:
                    raw[key] = _num(s.get("displayValue"))
        by_espn_name = {s.get("name"): _num(s.get("value") if s.get("value") is not None else s.get("displayValue"))
                        for s in (t.get("statistics") or [])}
        shots_on_target = by_espn_name.get("shotsOnTarget") or 0
        shots_total = by_espn_name.get("totalShots") or 0
        possession = by_espn_name.get("possessionPct")
        passes_total = by_espn_name.get("totalPasses") or 0
        passes_completed = by_espn_name.get("accuratePasses") or 0
        pass_pct = round(passes_completed / passes_total * 100, 1) if passes_total else None
        # proxy de peligrosidad (NO xG): remates al arco pesan más que el
        # total de remates. Documentado como heurística transparente.
        peligrosidad = round(shots_on_target * 0.30 + max(shots_total - shots_on_target, 0) * 0.08, 2)
        rows.append({
            "match_id": match_id,
            "team": name,
            "possession_share_proxy": round(possession / 100.0, 4) if possession is not None else None,
            "passes_attempted": int(passes_total),
            "passes_completed": int(passes_completed),
            "pass_accuracy_pct": pass_pct,
            "shots_total": int(shots_total),
            "shots_on_target": int(shots_on_target),
            "shots_inside_box": None,
            "shots_outside_box": None,
            "shots_blocked": int(by_espn_name.get("blockedShots") or 0),
            "goals": score_by_team.get(name, 0),
            "fouls_committed": int(by_espn_name.get("foulsCommitted") or 0),
            "corners": int(by_espn_name.get("wonCorners") or 0),
            "offsides": int(by_espn_name.get("offsides") or 0),
            "gk_saves": int(by_espn_name.get("saves") or 0),
            "peligrosidad_proxy": peligrosidad,
        })
    return rows


def _parse_player_stats(summary: dict, match_id: str, retrieved_at: str) -> tuple[list[dict], list[dict]]:
    """boxscore.players -- vino vacío en las pruebas para LPF, pero se parsea
    igual por si ESPN lo puebla en algunos partidos (no se inventa nada si
    falta, simplemente devuelve listas vacías)."""
    box = (summary.get("boxscore") or {})
    blocks = box.get("players") or []
    apps: list[dict] = []
    tactical: list[dict] = []
    for team_block in blocks:
        team = (team_block.get("team") or {}).get("displayName")
        for stat_group in team_block.get("statistics") or []:
            labels = stat_group.get("labels") or []
            for athlete_row in stat_group.get("athletes") or []:
                athlete = athlete_row.get("athlete") or {}
                name = athlete.get("displayName")
                if not name or not team:
                    continue
                stats = athlete_row.get("stats") or []
                values = dict(zip(labels, stats))
                apps.append({
                    "match_id": match_id,
                    "team": team,
                    "player_id": str(athlete.get("id") or name),
                    "player_name": name,
                    "minutes_played": int(_num(values.get("MIN")) or 0),
                })
                tactical.append({
                    "match_id": match_id,
                    "team": team,
                    "jersey_number": None,
                    "player_name": name,
                    "passes_attempted": None,
                    "passes_completed": None,
                    "pass_completion_pct": None,
                    "attempts_at_goal": None,
                    "goals": int(_num(values.get("G")) or 0) if "G" in values else None,
                    "take_ons": None,
                    "tackles_made": None,
                    "blocks": None,
                    "interceptions": None,
                    "duels_won_physical": None,
                    "key_passes": None,
                    "rating": _num(values.get("RTG")),
                    "source": SOURCE,
                    "source_url": SOURCE_URL,
                    "retrieved_at": retrieved_at,
                })
    return apps, tactical


def _parse_goal_events(summary: dict, match_id: str, home_team: str, away_team: str, retrieved_at: str) -> list[dict]:
    """Intenta leer los goles del partido desde las claves que ESPN suele usar
    para jugadas clave ('keyEvents'/'scoringPlays'/'plays'). Si ninguna está
    presente, devuelve lista vacía -- el resultado del partido (matches.csv)
    no depende de esto, solo se pierde el detalle de goleador/minuto."""
    candidates = summary.get("keyEvents") or summary.get("scoringPlays") or summary.get("plays") or []
    rows: list[dict] = []
    for ev in candidates:
        text = (ev.get("type") or {}).get("text") or ev.get("shortText") or ""
        if "goal" not in text.lower() and not ev.get("scoringPlay"):
            continue
        team_id = ((ev.get("team") or {}).get("id"))
        team_name = None
        # ESPN a veces referencia el equipo por id; se resuelve contra
        # home/away si no viene el nombre directo.
        if isinstance(ev.get("team"), dict) and ev["team"].get("displayName"):
            team_name = ev["team"]["displayName"]
        athlete = (ev.get("athletesInvolved") or [{}])
        player_name = athlete[0].get("displayName") if athlete else ev.get("athlete", {}).get("displayName", "")
        clock = ev.get("clock") or {}
        minute_display = clock.get("displayValue") or ""
        own_goal = "own goal" in text.lower()
        penalty = "penalty" in text.lower()
        rows.append({
            "match_id": match_id,
            "team": team_name or home_team,
            "player_name": player_name or "",
            "minute": None,
            "minute_stoppage": None,
            "minute_display": minute_display,
            "own_goal": own_goal,
            "penalty": penalty,
            "source": SOURCE,
            "source_url": SOURCE_URL,
            "retrieved_at": retrieved_at,
        })
    return rows


def _parse_standings(season: str) -> tuple[list[dict], list[dict]]:
    data = _get(STANDINGS_URL)
    standings: list[dict] = []
    profile: list[dict] = []
    retrieved_at = datetime.now(timezone.utc).isoformat()
    if not data:
        return standings, profile
    for group in data.get("children") or [data]:
        entries = ((group.get("standings") or {}).get("entries")) or []
        for entry in entries:
            team = (entry.get("team") or {}).get("displayName")
            if not team:
                continue
            stats = {s.get("name"): s.get("value") for s in entry.get("stats") or []}
            standings.append({
                "team": team,
                "season": season,
                "posicion": int(stats["rank"]) if stats.get("rank") is not None else None,
                "puntos": int(stats["points"]) if stats.get("points") is not None else None,
                "jugados": int(stats["gamesPlayed"]) if stats.get("gamesPlayed") is not None else None,
                "ganados": int(stats["wins"]) if stats.get("wins") is not None else None,
                "empatados": int(stats["ties"]) if stats.get("ties") is not None else None,
                "perdidos": int(stats["losses"]) if stats.get("losses") is not None else None,
                "goles_favor": int(stats["pointsFor"]) if stats.get("pointsFor") is not None else None,
                "goles_contra": int(stats["pointsAgainst"]) if stats.get("pointsAgainst") is not None else None,
                "diferencia": int(stats["pointDifferential"]) if stats.get("pointDifferential") is not None else None,
                "forma": None,
            })
            profile.append({
                "team": team,
                "fifa_code": None,
                "group": None,
                "fifa_ranking": None,
                "fifa_ranking_prev": None,
                "base_camp_city": None,
                "base_camp_facility": None,
                "base_camp_country": None,
                "base_camp_lat": None,
                "base_camp_lon": None,
                "source": SOURCE,
                "retrieved_at": retrieved_at,
            })
    return standings, profile


def run() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    retrieved_at = datetime.now(timezone.utc).isoformat()
    today = datetime.now(timezone.utc).date()
    season = str(today.year)

    season_start_env = os.environ.get("LPF_SEASON_START", f"{today.year}-01-01")
    try:
        season_start = date.fromisoformat(season_start_env)
    except ValueError:
        season_start = date(today.year, 1, 1)
    chunk_days = int(os.environ.get("ESPN_CHUNK_DAYS", "30"))

    events = _sweep_scoreboard(season_start, today, chunk_days)
    if not events:
        print("ESPN: no se obtuvieron eventos; se escriben CSV vacíos-válidos.", file=sys.stderr)
        _write_all_empty()
        return
    print(f"ESPN: {len(events)} eventos de LPF entre {season_start} y {today}")

    matches_rows: list[dict] = []
    finished: list[tuple[str, str, str, dict]] = []  # (id, home, away, score_by_team)
    for ev in events:
        parsed = _parse_match_row(ev, season)
        if not parsed:
            continue
        row, played, home_team, away_team = parsed
        matches_rows.append(row)
        if played:
            score_by_team = {home_team: _num(row["home_score"]) or 0, away_team: _num(row["away_score"]) or 0}
            finished.append((row["match_id"], home_team, away_team, score_by_team))

    team_stats_rows: list[dict] = []
    appearances_rows: list[dict] = []
    tactical_rows: list[dict] = []
    goal_rows: list[dict] = []

    for match_id, home_team, away_team, score_by_team in finished:
        summary = _get_summary_cached(match_id)
        if not summary:
            continue
        team_stats_rows.extend(_parse_team_stats(summary, match_id, score_by_team))
        apps, tact = _parse_player_stats(summary, match_id, retrieved_at)
        appearances_rows.extend(apps)
        tactical_rows.extend(tact)
        goal_rows.extend(_parse_goal_events(summary, match_id, home_team, away_team, retrieved_at))

    standings_rows, profile_rows = _parse_standings(season)

    _write_csv(MATCHES_CSV, MATCHES_COLS, matches_rows)
    _write_csv(TEAM_STATS_CSV, TEAM_STATS_COLS, team_stats_rows)
    _write_csv(APPEARANCES_CSV, APPEARANCES_COLS, appearances_rows)
    _write_csv(TACTICAL_CSV, TACTICAL_COLS, tactical_rows)
    _write_csv(GOAL_EVENTS_CSV, GOAL_EVENTS_COLS, goal_rows)
    _write_csv(STANDINGS_CSV, STANDINGS_COLS, standings_rows)
    _write_csv(TEAM_PROFILE_CSV, TEAM_PROFILE_COLS, profile_rows)

    print(
        f"LPF {season} (ESPN): {len(matches_rows)} partidos ({len(finished)} jugados), "
        f"{len(team_stats_rows)} filas de stats de equipo, {len(goal_rows)} goles, "
        f"{len(standings_rows)} equipos en tabla."
    )


if __name__ == "__main__":
    run()

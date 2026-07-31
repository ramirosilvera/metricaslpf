"""Descarga la Liga Profesional Argentina (temporada actual) desde API-Football
(api-sports.io) y la deja en el formato de CSV procesados que consume
build_warehouse.py. Es el reemplazo, para Métricas LPF, de los scrapers del
Mundial (FIFA Training Centre / openfootball / 26worldcup).

== Por qué API-Football y no fbref ==
El objetivo original era fbref (xG, remates por zona), pero fbref es
INACCESIBLE desde CI: interpone un desafío "managed challenge" de Cloudflare
que bloquea a las IP de datacenter de GitHub Actions. Se verificó por las dos
vías gratuitas posibles y ambas fallan: HTTP plano (requests -> 403) y navegador
real headless (Playwright/Chromium -> nunca sale del desafío "Just a moment").
Las únicas formas de saltarlo son proxies residenciales PAGOS, descartados por
la restricción del proyecto (solo gratis / open source).

API-Football (free tier) es la mejor alternativa gratuita que SÍ funciona desde
CI: es una API pensada para acceso programático (no scraping), cubre la Liga
Profesional temporada actual, y da por partido: remates (totales, al arco,
dentro/fuera del área), posesión, pases y precisión, faltas, córners, offsides,
tarjetas y atajadas; y por jugador: rating, minutos, remates, pases, pases
clave, quites, intercepciones, duelos, gambetas. NO trae xG en el tier gratis
-> lo sustituimos por un proxy de peligrosidad transparente derivado de remates
por zona (dentro/fuera del área), documentado como proxy (NO xG).

== Restricción del free tier: 100 requests/día ==
Una temporada de LPF son ~300+ partidos y cada partido cuesta 3 llamadas
(statistics + players + events). Bajar todo de una excede el límite. Por eso
este fetcher es INCREMENTAL, CACHEADO y con TOPE de llamadas por corrida:

  - Guarda el JSON crudo de cada fixture en data/raw/api_football/cache/.
  - Solo llama a la API por fixtures TERMINADOS que todavía no tiene cacheados.
  - Respeta un presupuesto de llamadas por corrida (API_FOOTBALL_MAX_CALLS,
    default 90) para no pasarse de 100/día.
  - El primer backfill se reparte en varios días; después, en régimen, solo
    agrega los pocos partidos nuevos de cada fecha.

== Gating por API key (nunca se inventan datos) ==
Requiere el secret/env API_FOOTBALL_KEY (registro gratuito en dashboard.api-
football.com o via RapidAPI). Si NO está la key, el fetcher NO falla el
pipeline: escribe CSV vacíos-pero-válidos (solo encabezados) para que el sitio
muestre su estado "sin datos todavía" y NUNCA publica filas inventadas.

Uso:
    API_FOOTBALL_KEY=xxxx python etl/fetch_api_football_lpf.py
    # opcionales:
    #   LPF_SEASON=2026            (año de inicio de temporada; default: año actual)
    #   API_FOOTBALL_MAX_CALLS=90  (tope de llamadas por corrida)
    #   API_FOOTBALL_HOST=...      (host; default v3.football.api-sports.io)
"""
from __future__ import annotations

import csv
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

# --- Configuración ------------------------------------------------------------
# id de liga en API-Football: 128 = Liga Profesional Argentina (Primera División).
LEAGUE_ID = int(os.environ.get("LPF_LEAGUE_ID", "128"))
LEAGUE_NAME = "Liga Profesional"
DEFAULT_SEASON = int(os.environ.get("LPF_SEASON", str(datetime.now(timezone.utc).year)))
API_HOST = os.environ.get("API_FOOTBALL_HOST", "v3.football.api-sports.io")
API_KEY = os.environ.get("API_FOOTBALL_KEY", "").strip()
MAX_CALLS = int(os.environ.get("API_FOOTBALL_MAX_CALLS", "90"))
REQUEST_TIMEOUT_S = 25

SOURCE = "api-football"
SOURCE_URL = f"https://{API_HOST}"

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "api_football"
CACHE_DIR = RAW_DIR / "cache"
OUT_DIR = RAW_DIR / "_processed"

# CSV de salida (mismos nombres/carpeta que espera build_warehouse.py para la
# fuente api_football).
MATCHES_CSV = OUT_DIR / "matches.csv"
TEAM_STATS_CSV = OUT_DIR / "team_match_stats.csv"
APPEARANCES_CSV = OUT_DIR / "player_match_appearances.csv"
TACTICAL_CSV = OUT_DIR / "tactical_player_match_stats.csv"
GOAL_EVENTS_CSV = OUT_DIR / "goal_events.csv"
STANDINGS_CSV = OUT_DIR / "standings.csv"
TEAM_PROFILE_CSV = OUT_DIR / "team_profile.csv"

# Encabezados de cada CSV (para poder escribir un archivo vacío-pero-válido
# cuando no hay key o no hay datos, sin inventar filas).
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


class CallBudget:
    """Contador simple de llamadas a la API para no pasar el free tier."""

    def __init__(self, limit: int):
        self.limit = limit
        self.used = 0

    def available(self) -> bool:
        return self.used < self.limit

    def spend(self) -> None:
        self.used += 1


def _headers() -> dict:
    # API-Football acepta tanto el host directo (x-apisports-key) como RapidAPI
    # (x-rapidapi-key/host). Mandamos ambos: el host directo ignora los de
    # RapidAPI y viceversa, así la misma key funciona por cualquiera de los dos.
    return {
        "x-apisports-key": API_KEY,
        "x-rapidapi-key": API_KEY,
        "x-rapidapi-host": API_HOST,
        "Accept": "application/json",
    }


def _api_get(path: str, params: dict, budget: CallBudget) -> dict | None:
    """GET a la API respetando el presupuesto. Devuelve el JSON o None si no
    quedan llamadas / hubo error. NUNCA levanta para no tumbar el pipeline."""
    if not budget.available():
        return None
    url = f"https://{API_HOST}/{path}"
    try:
        r = requests.get(url, headers=_headers(), params=params, timeout=REQUEST_TIMEOUT_S)
        budget.spend()
    except Exception as e:  # noqa: BLE001
        print(f"  API error {path} {params}: {type(e).__name__}: {e}", file=sys.stderr)
        return None
    if r.status_code != 200:
        print(f"  API {path} {params} -> HTTP {r.status_code}: {r.text[:200]}", file=sys.stderr)
        return None
    try:
        data = r.json()
    except ValueError:
        return None
    errors = data.get("errors")
    if errors:
        # API-Football pone límites/errores acá (ej. {'requests': 'límite...'} ).
        print(f"  API {path} devolvió errors={errors}", file=sys.stderr)
    return data


def _cache_path(fixture_id: int, kind: str) -> Path:
    return CACHE_DIR / f"{fixture_id}_{kind}.json"


def _load_cache(fixture_id: int, kind: str) -> dict | None:
    p = _cache_path(fixture_id, kind)
    if p.exists() and p.stat().st_size > 0:
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except ValueError:
            return None
    return None


def _save_cache(fixture_id: int, kind: str, payload: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _cache_path(fixture_id, kind).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _get_fixture_sub(fixture_id: int, kind: str, path: str, budget: CallBudget) -> dict | None:
    """Trae statistics/players/events de un fixture, usando cache si ya está.
    Solo gasta una llamada si el dato no está cacheado y queda presupuesto."""
    cached = _load_cache(fixture_id, kind)
    if cached is not None:
        return cached
    data = _api_get(path, {"fixture": fixture_id}, budget)
    if data is not None and not data.get("errors"):
        _save_cache(fixture_id, kind, data)
    return data


def _write_csv(path: Path, cols: list[str], rows: list[dict]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow(row)


def _write_all_empty() -> None:
    """Escribe todos los CSV vacíos-pero-válidos (solo encabezados)."""
    _write_csv(MATCHES_CSV, MATCHES_COLS, [])
    _write_csv(TEAM_STATS_CSV, TEAM_STATS_COLS, [])
    _write_csv(APPEARANCES_CSV, APPEARANCES_COLS, [])
    _write_csv(TACTICAL_CSV, TACTICAL_COLS, [])
    _write_csv(GOAL_EVENTS_CSV, GOAL_EVENTS_COLS, [])
    _write_csv(STANDINGS_CSV, STANDINGS_COLS, [])
    _write_csv(TEAM_PROFILE_CSV, TEAM_PROFILE_COLS, [])


# --- Parsers de estadística ---------------------------------------------------
# API-Football devuelve las stats como lista de {"type": "...", "value": ...}.
# Mapa de tipos (en inglés, como los manda la API) a nuestra clave interna.
_STAT_MAP = {
    "Ball Possession": "possession",           # "54%"
    "Total Shots": "shots_total",
    "Shots on Goal": "shots_on_target",
    "Shots insidebox": "shots_inside_box",
    "Shots outsidebox": "shots_outside_box",
    "Blocked Shots": "shots_blocked",
    "Total passes": "passes_attempted",
    "Passes accurate": "passes_completed",
    "Passes %": "pass_accuracy_pct",           # "83%"
    "Fouls": "fouls_committed",
    "Corner Kicks": "corners",
    "Offsides": "offsides",
    "Goalkeeper Saves": "gk_saves",
}


def _num(v) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("%", "")
    if s == "" or s.lower() == "none":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _parse_team_stats(stats_json: dict, fixture_id: int, score_by_team: dict) -> list[dict]:
    """De /fixtures/statistics -> filas team_match_stats. Calcula el proxy de
    peligrosidad (NO xG): pondera remates por zona (dentro del área pesan más
    que fuera) y al arco. Es una heurística transparente, no un modelo de xG."""
    resp = stats_json.get("response") or []
    rows: list[dict] = []
    for entry in resp:
        team = (entry.get("team") or {}).get("name")
        if not team:
            continue
        raw = {}
        for item in entry.get("statistics") or []:
            key = _STAT_MAP.get(item.get("type"))
            if key:
                raw[key] = _num(item.get("value"))
        possession = raw.get("possession")
        inside = raw.get("shots_inside_box") or 0
        outside = raw.get("shots_outside_box") or 0
        on_target = raw.get("shots_on_target") or 0
        # Proxy de peligrosidad (0..~): remate al arco 0.30, dentro del área
        # 0.12, fuera 0.04. Suma ponderada -> "goles esperados aproximados".
        # Documentado como PROXY, nunca presentado como xG real.
        peligrosidad = round(on_target * 0.30 + inside * 0.12 + outside * 0.04, 2)
        rows.append({
            "match_id": fixture_id,
            "team": team,
            "possession_share_proxy": round(possession / 100.0, 4) if possession is not None else None,
            "passes_attempted": int(raw["passes_attempted"]) if raw.get("passes_attempted") is not None else 0,
            "passes_completed": int(raw["passes_completed"]) if raw.get("passes_completed") is not None else 0,
            "pass_accuracy_pct": raw.get("pass_accuracy_pct"),
            "shots_total": int(raw["shots_total"]) if raw.get("shots_total") is not None else 0,
            "shots_on_target": int(on_target),
            "shots_inside_box": int(inside),
            "shots_outside_box": int(outside),
            "shots_blocked": int(raw["shots_blocked"]) if raw.get("shots_blocked") is not None else 0,
            "goals": score_by_team.get(team, 0),
            "fouls_committed": int(raw["fouls_committed"]) if raw.get("fouls_committed") is not None else 0,
            "corners": int(raw["corners"]) if raw.get("corners") is not None else 0,
            "offsides": int(raw["offsides"]) if raw.get("offsides") is not None else 0,
            "gk_saves": int(raw["gk_saves"]) if raw.get("gk_saves") is not None else 0,
            "peligrosidad_proxy": peligrosidad,
        })
    return rows


def _parse_players(players_json: dict, fixture_id: int, retrieved_at: str) -> tuple[list[dict], list[dict]]:
    """De /fixtures/players -> (appearances, tactical_player_stats)."""
    resp = players_json.get("response") or []
    apps: list[dict] = []
    tactical: list[dict] = []
    for team_block in resp:
        team = (team_block.get("team") or {}).get("name")
        for pl in team_block.get("players") or []:
            player = pl.get("player") or {}
            name = player.get("name")
            pid = player.get("id")
            stats = (pl.get("statistics") or [{}])[0]
            games = stats.get("games") or {}
            minutes = games.get("minutes")
            if not name or not team:
                continue
            if minutes is not None:
                apps.append({
                    "match_id": fixture_id,
                    "team": team,
                    "player_id": str(pid) if pid is not None else name,
                    "player_name": name,
                    "minutes_played": int(minutes),
                })
            shots = stats.get("shots") or {}
            passes = stats.get("passes") or {}
            tackles = stats.get("tackles") or {}
            duels = stats.get("duels") or {}
            dribbles = stats.get("dribbles") or {}
            goals = stats.get("goals") or {}
            passes_total = _num(passes.get("total"))
            passes_acc = _num(passes.get("accuracy"))  # puede venir como % o conteo según plan
            # accuracy en free tier suele ser conteo de pases acertados; si es
            # <= passes_total lo tomamos como conteo, si viene como % lo derivamos.
            passes_completed = None
            pass_pct = None
            if passes_total and passes_acc is not None:
                if passes_acc <= passes_total:
                    passes_completed = int(passes_acc)
                    pass_pct = round(passes_acc / passes_total * 100, 1) if passes_total else None
                else:  # vino como porcentaje
                    pass_pct = passes_acc
                    passes_completed = int(round(passes_total * passes_acc / 100))
            tactical.append({
                "match_id": fixture_id,
                "team": team,
                "jersey_number": None,
                "player_name": name,
                "passes_attempted": int(passes_total) if passes_total is not None else None,
                "passes_completed": passes_completed,
                "pass_completion_pct": pass_pct,
                "attempts_at_goal": int(_num(shots.get("total"))) if _num(shots.get("total")) is not None else None,
                "goals": int(_num(goals.get("total"))) if _num(goals.get("total")) is not None else None,
                "take_ons": int(_num(dribbles.get("success"))) if _num(dribbles.get("success")) is not None else None,
                "tackles_made": int(_num(tackles.get("total"))) if _num(tackles.get("total")) is not None else None,
                "blocks": int(_num(tackles.get("blocks"))) if _num(tackles.get("blocks")) is not None else None,
                "interceptions": int(_num(tackles.get("interceptions"))) if _num(tackles.get("interceptions")) is not None else None,
                "duels_won_physical": int(_num(duels.get("won"))) if _num(duels.get("won")) is not None else None,
                "key_passes": int(_num(passes.get("key"))) if _num(passes.get("key")) is not None else None,
                "rating": _num(stats.get("games", {}).get("rating")),
                "source": SOURCE,
                "source_url": SOURCE_URL,
                "retrieved_at": retrieved_at,
            })
    return apps, tactical


def _parse_events(events_json: dict, fixture_id: int, home_team: str, away_team: str, retrieved_at: str) -> list[dict]:
    """De /fixtures/events (type=Goal) -> goal_events, con la MISMA convención
    de box-score que openfootball: 'team' es la selección/equipo a cuyo marcador
    cuenta el gol. En un gol en contra, el jugador es del rival de 'team', así
    que se asigna al equipo beneficiado (se invierte respecto del team del
    evento, que en la API es el equipo del jugador)."""
    resp = events_json.get("response") or []
    rows: list[dict] = []
    for ev in resp:
        if (ev.get("type") or "").lower() != "goal":
            continue
        detail = (ev.get("detail") or "")
        if detail == "Missed Penalty":
            continue  # penal errado no es gol
        player_team = (ev.get("team") or {}).get("name")
        own_goal = detail == "Own Goal"
        penalty = detail == "Penalty"
        # equipo beneficiado por el gol
        if own_goal:
            beneficiary = away_team if player_team == home_team else home_team
        else:
            beneficiary = player_team
        t = ev.get("time") or {}
        elapsed = t.get("elapsed")
        extra = t.get("extra")
        minute_display = f"{elapsed}+{extra}" if extra else (str(elapsed) if elapsed is not None else "")
        rows.append({
            "match_id": fixture_id,
            "team": beneficiary,
            "player_name": (ev.get("player") or {}).get("name") or "",
            "minute": elapsed,
            "minute_stoppage": extra,
            "minute_display": minute_display,
            "own_goal": own_goal,
            "penalty": penalty,
            "source": SOURCE,
            "source_url": SOURCE_URL,
            "retrieved_at": retrieved_at,
        })
    return rows


def _parse_standings(standings_json: dict, season: int) -> tuple[list[dict], list[dict]]:
    """De /standings -> (standings, team_profile mínimo con la lista de equipos)."""
    resp = standings_json.get("response") or []
    standings: list[dict] = []
    profile: list[dict] = []
    retrieved_at = datetime.now(timezone.utc).isoformat()
    if not resp:
        return standings, profile
    league = (resp[0].get("league") or {})
    groups = league.get("standings") or []
    for group in groups:
        for row in group:
            team = (row.get("team") or {}).get("name")
            if not team:
                continue
            allg = row.get("all") or {}
            goals = allg.get("goals") or {}
            standings.append({
                "team": team,
                "season": str(season),
                "posicion": row.get("rank"),
                "puntos": row.get("points"),
                "jugados": allg.get("played"),
                "ganados": allg.get("win"),
                "empatados": allg.get("draw"),
                "perdidos": allg.get("lose"),
                "goles_favor": goals.get("for"),
                "goles_contra": goals.get("against"),
                "diferencia": row.get("goalsDiff"),
                "forma": row.get("form"),
            })
            profile.append({
                "team": team,
                "fifa_code": None,
                "group": row.get("group") or None,
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
    if not API_KEY:
        print(
            "API_FOOTBALL_KEY no está seteada -> se escriben CSV vacíos-pero-válidos "
            "(el sitio mostrará 'sin datos todavía'). Registrá una key gratuita en "
            "dashboard.api-football.com y cargala como secret API_FOOTBALL_KEY. "
            "NO se inventa ningún dato.",
            file=sys.stderr,
        )
        _write_all_empty()
        return

    budget = CallBudget(MAX_CALLS)
    retrieved_at = datetime.now(timezone.utc).isoformat()
    season = DEFAULT_SEASON

    # 1) fixtures de la temporada (1 llamada)
    fixtures_json = _api_get("fixtures", {"league": LEAGUE_ID, "season": season}, budget)
    if fixtures_json is None or not fixtures_json.get("response"):
        # Sin fixtures (posible temporada aún no publicada o límite): probamos el
        # año anterior como "temporada actual" antes de rendirnos, y si tampoco,
        # escribimos vacío-válido sin inventar nada.
        alt = season - 1
        print(f"Sin fixtures para season={season}; probando season={alt}", file=sys.stderr)
        fixtures_json = _api_get("fixtures", {"league": LEAGUE_ID, "season": alt}, budget)
        if fixtures_json and fixtures_json.get("response"):
            season = alt
        else:
            print("No se obtuvieron fixtures; se escriben CSV vacíos-válidos.", file=sys.stderr)
            _write_all_empty()
            return

    fixtures = fixtures_json.get("response") or []
    print(f"fixtures de LPF {season}: {len(fixtures)}")

    matches_rows: list[dict] = []
    finished: list[dict] = []
    for fx in fixtures:
        fixture = fx.get("fixture") or {}
        teams = fx.get("teams") or {}
        goals = fx.get("goals") or {}
        status = (fixture.get("status") or {}).get("short")  # FT, AET, PEN, NS, ...
        home = (teams.get("home") or {}).get("name")
        away = (teams.get("away") or {}).get("name")
        if not home or not away:
            continue
        fid = fixture.get("id")
        date_iso = (fixture.get("date") or "")[:10]
        played = status in {"FT", "AET", "PEN"}
        matches_rows.append({
            "match_id": fid,
            "competition": LEAGUE_NAME,
            "season": str(season),
            "stage": (fx.get("league") or {}).get("round") or "",
            "group": "",
            "match_date": date_iso,
            "home_team": home,
            "away_team": away,
            "home_score": goals.get("home") if played else None,
            "away_score": goals.get("away") if played else None,
            "stadium": (fixture.get("venue") or {}).get("name") or "",
            "referee": fixture.get("referee") or "",
        })
        if played and fid is not None:
            finished.append({"id": fid, "home": home, "away": away,
                             "gh": goals.get("home") or 0, "ga": goals.get("away") or 0})

    # 2) standings (1 llamada) -> standings + team_profile
    standings_json = _api_get("standings", {"league": LEAGUE_ID, "season": season}, budget)
    standings_rows, profile_rows = _parse_standings(standings_json or {}, season)

    # 3) por cada partido terminado: statistics + players + events (cacheado,
    #    incremental, respetando el presupuesto de llamadas).
    team_stats_rows: list[dict] = []
    appearances_rows: list[dict] = []
    tactical_rows: list[dict] = []
    goal_rows: list[dict] = []
    fetched, from_cache = 0, 0

    for m in finished:
        fid = m["id"]
        score_by_team = {m["home"]: m["gh"], m["away"]: m["ga"]}
        # solo consumimos presupuesto si falta algo en cache
        need = any(_load_cache(fid, k) is None for k in ("statistics", "players", "events"))
        if need and not budget.available():
            # se acabó el presupuesto de hoy: dejamos el resto para la próxima
            # corrida (backfill incremental). No es error.
            continue
        stats_json = _get_fixture_sub(fid, "statistics", "fixtures/statistics", budget)
        players_json = _get_fixture_sub(fid, "players", "fixtures/players", budget)
        events_json = _get_fixture_sub(fid, "events", "fixtures/events", budget)
        if need:
            fetched += 1
        else:
            from_cache += 1

        if stats_json:
            team_stats_rows.extend(_parse_team_stats(stats_json, fid, score_by_team))
        if players_json:
            a, t = _parse_players(players_json, fid, retrieved_at)
            appearances_rows.extend(a)
            tactical_rows.extend(t)
        if events_json:
            goal_rows.extend(_parse_events(events_json, fid, m["home"], m["away"], retrieved_at))

    # 4) escribir CSV (solo datos reales; nunca filas inventadas)
    _write_csv(MATCHES_CSV, MATCHES_COLS, matches_rows)
    _write_csv(TEAM_STATS_CSV, TEAM_STATS_COLS, team_stats_rows)
    _write_csv(APPEARANCES_CSV, APPEARANCES_COLS, appearances_rows)
    _write_csv(TACTICAL_CSV, TACTICAL_COLS, tactical_rows)
    _write_csv(GOAL_EVENTS_CSV, GOAL_EVENTS_COLS, goal_rows)
    _write_csv(STANDINGS_CSV, STANDINGS_COLS, standings_rows)
    _write_csv(TEAM_PROFILE_CSV, TEAM_PROFILE_COLS, profile_rows)

    pending = len(finished) - (fetched + from_cache)
    print(
        f"LPF {season}: {len(matches_rows)} partidos ({len(finished)} jugados). "
        f"Stats bajadas esta corrida: {fetched}, desde cache: {from_cache}, "
        f"pendientes para próximas corridas: {max(pending, 0)}. "
        f"Llamadas API usadas: {budget.used}/{budget.limit}."
    )
    if pending > 0:
        print(
            f"NOTA: quedan {pending} partidos sin stats por el tope de {MAX_CALLS} llamadas/corrida "
            "(free tier 100/día). El backfill se completa en las próximas corridas diarias.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    run()

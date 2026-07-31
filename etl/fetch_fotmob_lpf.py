"""Descarga estadística individual de jugadores de la Liga Profesional
Argentina (temporada en curso) desde la API pública (no documentada, pero
la que usa el propio sitio web) de FotMob.

== Por qué FotMob ==
ESPN (fuente principal del resto del proyecto, ver fetch_espn_lpf.py) no
publica boxscore.players para esta competición -- no hay forma de armar
"jugadores"/"comparar jugadores" con datos reales desde ahí. Se buscó una
fuente alternativa gratis y se encontró que FotMob expone, sin necesidad de
API key ni login, un endpoint de "líderes de estadísticas" por liga:

    https://www.fotmob.com/api/data/leagues?id=112

(112 = Liga Profesional Argentina en FotMob). La respuesta trae
`stats.players`: 37 categorías (goles, asistencias, xG, xGOT, xA, remates,
pases precisos, tackles, intercepciones, atajadas, tarjetas, etc.), cada una
con un campo `fetchAllUrl` que apunta a la LISTA COMPLETA de la temporada
(no solo el top-3 que se ve en la web), por ejemplo:

    https://data.fotmob.com/stats/112/season/28207/goals.json

Verificado en vivo (GitHub Actions, sin proxy residencial, sin key):
  - "goals.json": 282 jugadores, 30 equipos distintos (los 30 clubes de LPF).
  - "total_tackle.json": 415 jugadores (confirma que la cobertura no es solo
    delanteros -- llega a mediocampistas y defensores).
  - "saves.json": 29 arqueros.
  - El líder de goles coincidido de forma independiente con el goleador que
    ya teníamos desde ESPN (goal_events): Gabriel Ávalos, 11 goles.

Es agregado de TEMPORADA por jugador (no partido a partido) -- eso es lo que
FotMob expone públicamente. No es un reemplazo 1:1 de un boxscore por
partido, pero sí es la única fuente gratis encontrada con métricas
avanzadas reales (xG, xGOT, xA) para esta liga, y con cobertura completa de
plantel (no solo estrellas). Se documenta esta naturaleza "por temporada"
en meta.sources del sitio -- nunca se presenta como si fuera partido a
partido.

No hay endpoint de temporada fijo conocido de antemano (el id "28207" es la
temporada actual y cambiará el año que viene) -- por eso el fetcher SIEMPRE
lee `fetchAllUrl` dinámicamente desde la respuesta de /leagues, nunca lo
hardcodea. Si FotMob cambia de temporada, este fetcher lo sigue solo.

Uso:
    python etl/fetch_fotmob_lpf.py
"""
from __future__ import annotations

import csv
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

LEAGUE_ID = 112  # Liga Profesional Argentina en FotMob
LEAGUES_URL = f"https://www.fotmob.com/api/data/leagues?id={LEAGUE_ID}"
SOURCE = "fotmob"
REQUEST_TIMEOUT_S = 25

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
HEADERS = {"User-Agent": UA, "Accept": "application/json", "Accept-Language": "es-AR,es;q=0.9"}

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "raw" / "fotmob" / "_processed"
PLAYER_SEASON_STATS_CSV = OUT_DIR / "player_season_stats.csv"

PLAYER_SEASON_STATS_COLS = [
    "player_name", "team", "fotmob_player_id", "fotmob_team_id", "country_code",
    "metric", "metric_label", "value", "sub_value", "minutes_played",
    "matches_played", "rank", "source", "source_url", "retrieved_at",
]


def _get(url: str) -> dict | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT_S)
    except Exception as e:  # noqa: BLE001
        print(f"  FotMob error {url}: {type(e).__name__}: {e}", file=sys.stderr)
        return None
    if r.status_code != 200:
        print(f"  FotMob {url} -> HTTP {r.status_code}: {r.text[:200]}", file=sys.stderr)
        return None
    try:
        return r.json()
    except ValueError:
        return None


def _num(v) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _write_csv(path: Path, cols: list[str], rows: list[dict]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow(row)


def _fetch_category(entry: dict, retrieved_at: str) -> list[dict]:
    header = entry.get("header") or ""
    stat = ((entry.get("participant") or {}).get("stat")) or {}
    metric = stat.get("name")
    fetch_url = entry.get("fetchAllUrl")
    if not metric or not fetch_url:
        return []
    data = _get(fetch_url)
    if not data:
        return []
    top_lists = data.get("TopLists") or []
    if not top_lists:
        return []
    stat_list = top_lists[0].get("StatList") or []
    rows: list[dict] = []
    for row in stat_list:
        name = row.get("ParticipantName")
        team = row.get("TeamName")
        if not name or not team:
            continue
        rows.append({
            "player_name": name,
            "team": team,
            "fotmob_player_id": row.get("ParticiantId"),
            "fotmob_team_id": row.get("TeamId"),
            "country_code": row.get("ParticipantCountryCode"),
            "metric": metric,
            "metric_label": header,
            "value": _num(row.get("StatValue")),
            "sub_value": _num(row.get("SubStatValue")),
            "minutes_played": _num(row.get("MinutesPlayed")),
            "matches_played": _num(row.get("MatchesPlayed")),
            "rank": _num(row.get("Rank")),
            "source": SOURCE,
            "source_url": fetch_url,
            "retrieved_at": retrieved_at,
        })
    return rows


def run() -> None:
    retrieved_at = datetime.now(timezone.utc).isoformat()
    leagues = _get(LEAGUES_URL)
    if not leagues:
        print("FotMob: no se pudo obtener /leagues; se escribe CSV vacío-válido.", file=sys.stderr)
        _write_csv(PLAYER_SEASON_STATS_CSV, PLAYER_SEASON_STATS_COLS, [])
        return

    categories = ((leagues.get("stats") or {}).get("players")) or []
    if not categories:
        print("FotMob: /leagues no trajo stats.players; se escribe CSV vacío-válido.", file=sys.stderr)
        _write_csv(PLAYER_SEASON_STATS_CSV, PLAYER_SEASON_STATS_COLS, [])
        return

    all_rows: list[dict] = []
    for entry in categories:
        rows = _fetch_category(entry, retrieved_at)
        all_rows.extend(rows)
        print(f"  FotMob [{entry.get('header')}]: {len(rows)} jugadores")

    _write_csv(PLAYER_SEASON_STATS_CSV, PLAYER_SEASON_STATS_COLS, all_rows)
    players = {(r["player_name"], r["team"]) for r in all_rows}
    print(f"FotMob: {len(categories)} categorías, {len(all_rows)} filas, {len(players)} jugadores distintos.")


if __name__ == "__main__":
    run()

"""Descarga y parsea los eventos de gol (goleador, minuto, penal, en contra)
del Mundial 2026 desde el proyecto openfootball/worldcup.json.

Fuente: https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json
Licencia: CC0-1.0 (dominio público) -- proyecto openfootball
(https://github.com/openfootball/worldcup.json).

Por qué esta fuente: el resto del proyecto tiene resultados y estadísticas
agregadas del Mundial 2026 (via FIFA Training Centre, ver
scrape_fifa_training_centre.py) pero CERO datos a nivel de evento de gol
(quién la hizo, en qué minuto). openfootball es JSON plano, sin auth, con
esa granularidad -- goleador + minuto (incluye descuento tipo "90+4"),
y flags de penal/gol en contra cuando aplica.

Verificación cruzada (importante -- este proyecto se basa en datos ya
publicados y contrastados, no en una sola fuente "porque sí"): el resultado
final de cada partido (home_score/away_score) que ya tenemos en
data/warehouse/matches.parquet viene de los PDF oficiales "PMSR" de FIFA
Training Centre. Acá recalculamos el resultado final de cada partido de
openfootball contando sus propios goles (goals1/goals2 -- ya incluye
prórroga si la hubo) y lo comparamos partido a partido contra ese resultado
ya cargado. Si coinciden, es la confirmación cruzada que buscamos. Si NO
coinciden, no se pisa nada ni se elige "la fuente que más me gusta": se
imprime bien fuerte y se vuelca a `_score_discrepancies.json` para revisión
humana -- una discrepancia acá es una señal real (posible error de
tipeo/fecha en cualquiera de las dos fuentes), no ruido para ignorar.

Matching de partidos: openfootball no comparte match_id con este proyecto,
así que el join es por (home_team normalizado, away_team normalizado,
match_date). Los nombres de selección difieren entre fuentes en varios
casos (ISO/COI vs nombre FIFA coloquial) -- ver TEAM_ALIASES. Fixture que no
matchea después de normalizar se loguea en `_unmatched_fixtures.json` en vez
de descartarse en silencio o de adivinar por similitud de string.

Partidos de fase eliminatoria todavía no jugados al momento de la corrida
(cuartos de final en adelante, algunos con equipo aún no definido tipo
"W97") no tienen goles que extraer -- se cuentan aparte y no son
"no matcheados", son "todavía no jugados".

Uso:
    python etl/fetch_openfootball_2026.py
"""
from __future__ import annotations

import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

SOURCE_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json"
SOURCE_LICENSE = "CC0-1.0 (dominio publico) -- https://github.com/openfootball/worldcup.json"
HEADERS = {
    "User-Agent": "MetricasMundial2026Bot/1.0 (+https://github.com/ramirosilvera/metricasmundial2026; "
    "proyecto de analisis publico y sin fines de lucro; contacto via GitHub issues)"
}
REQUEST_TIMEOUT_S = 20

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "openfootball"
RAW_PATH = RAW_DIR / "worldcup2026.json"
OUT_DIR = RAW_DIR / "_processed"
GOAL_EVENTS_PATH = OUT_DIR / "goal_events.csv"
UNMATCHED_PATH = RAW_DIR / "_unmatched_fixtures.json"
DISCREPANCIES_PATH = RAW_DIR / "_score_discrepancies.json"
WAREHOUSE_MATCHES = ROOT / "data" / "warehouse" / "matches.parquet"

# openfootball usa nombres FIFA/COI que en varios casos difieren de los que
# ya usa este proyecto (heredados de matches_fifa2026.csv / FIFA Training
# Centre, ver TEAM_CODE_MAP en scrape_fifa_training_centre.py). Completar acá
# a medida que aparezcan mas selecciones con nombres distintos.
TEAM_ALIASES = {
    "Bosnia & Herzegovina": "Bosnia and Herzegovina",
    "Cape Verde": "Cabo Verde",
    "Czech Republic": "Czechia",
    "DR Congo": "Congo DR",
    "Iran": "IR Iran",
    "Ivory Coast": "Côte d'Ivoire",
    "South Korea": "Korea Republic",
    "Turkey": "Türkiye",
}

_MINUTE_RE = re.compile(r"^(\d+)(?:\+(\d+))?$")


def _normalize_team(name: str) -> str:
    return TEAM_ALIASES.get(name, name)


def _parse_minute(raw: str) -> tuple[int | None, int | None]:
    """"90+4" -> (90, 4); "23" -> (23, None). Devuelve (None, None) si el
    formato no matchea (no debería pasar, pero no hay que reventar el
    pipeline por un formato inesperado -- se deja la fila con minuto nulo)."""
    m = _MINUTE_RE.match(raw.strip()) if raw else None
    if not m:
        return None, None
    base, stoppage = m.groups()
    return int(base), (int(stoppage) if stoppage else None)


def download(force: bool = False) -> dict:
    """Descarga el JSON crudo (o usa el cache en data/raw/openfootball/ si ya
    existe) -- idempotente, para no re-pegarle a GitHub en cada corrida local."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    if RAW_PATH.exists() and not force:
        return json.loads(RAW_PATH.read_text(encoding="utf-8"))

    resp = requests.get(SOURCE_URL, headers=HEADERS, timeout=REQUEST_TIMEOUT_S)
    resp.raise_for_status()
    RAW_PATH.write_text(resp.text, encoding="utf-8")
    return json.loads(resp.text)


def _load_warehouse_matches_2026() -> pd.DataFrame:
    """Lee matches.parquet ya construido (FIFA Training Centre) para poder
    mapear (home, away, fecha) -> match_id y cruzar el resultado. Si todavia
    no existe (primera corrida desde cero, sin warehouse), devuelve vacio --
    el caller loguea todos los fixtures como no-matcheados en vez de fallar."""
    if not WAREHOUSE_MATCHES.exists():
        return pd.DataFrame(columns=["match_id", "season", "match_date", "home_team", "away_team", "home_score", "away_score"])
    df = pd.read_parquet(WAREHOUSE_MATCHES)
    return df[df["season"] == "2026"].copy()


def parse(data: dict, warehouse_matches: pd.DataFrame | None = None) -> tuple[list[dict], list[dict], list[dict]]:
    """Devuelve (goal_event_rows, unmatched_fixtures, score_discrepancies)."""
    if warehouse_matches is None:
        warehouse_matches = _load_warehouse_matches_2026()

    match_lookup: dict[tuple[str, str, str], dict] = {}
    for _, row in warehouse_matches.iterrows():
        key = (row["home_team"], row["away_team"], row["match_date"])
        match_lookup[key] = row.to_dict()

    retrieved_at = datetime.now(timezone.utc).isoformat()
    goal_rows: list[dict] = []
    unmatched: list[dict] = []
    discrepancies: list[dict] = []
    not_yet_played = 0

    for m in data.get("matches", []):
        score = m.get("score") or {}
        ft = score.get("ft")
        if not ft:
            not_yet_played += 1
            continue

        home_raw, away_raw = m["team1"], m["team2"]
        home = _normalize_team(home_raw)
        away = _normalize_team(away_raw)
        date = m["date"]
        key = (home, away, date)

        wh_match = match_lookup.get(key)
        if wh_match is None:
            unmatched.append({
                "date": date,
                "round": m.get("round"),
                "team1_openfootball": home_raw,
                "team2_openfootball": away_raw,
                "team1_normalized": home,
                "team2_normalized": away,
                "score_ft": ft,
                "reason": "no se encontro un partido en matches.parquet (2026) con ese (home, away, fecha) exacto",
            })
            continue

        goals1 = m.get("goals1") or []
        goals2 = m.get("goals2") or []
        # resultado final propio de openfootball, contando goles (incluye
        # prorroga si la hubo -- goals1/goals2 ya vienen con todos los goles
        # del partido, penales de la definicion por penales NO cuentan como
        # gol de juego y openfootball no los incluye acá)
        of_home_score, of_away_score = len(goals1), len(goals2)
        wh_home_score, wh_away_score = wh_match["home_score"], wh_match["away_score"]

        if pd.notna(wh_home_score) and pd.notna(wh_away_score):
            if int(wh_home_score) != of_home_score or int(wh_away_score) != of_away_score:
                discrepancies.append({
                    "match_id": int(wh_match["match_id"]),
                    "date": date,
                    "home_team": home,
                    "away_team": away,
                    "score_fifa_training_centre": [int(wh_home_score), int(wh_away_score)],
                    "score_openfootball": [of_home_score, of_away_score],
                    "score_openfootball_raw": score,
                })

        match_id = int(wh_match["match_id"])
        # goals1/goals2 vienen agrupados por el lado que se BENEFICIA en el
        # marcador (igual que matches.home_score/away_score), no por
        # selección del jugador -- en un gol en contra el nombre es de un
        # jugador del equipo RIVAL. Se respeta esa misma convención acá
        # (ver comentario en GoalEventsSchema.team) en vez de "corregir" el
        # dato a la selección real del jugador, que rompería la cuenta de
        # goles por lado.
        for side_team, side_goals in ((home, goals1), (away, goals2)):
            for g in side_goals:
                minute, minute_stoppage = _parse_minute(g.get("minute", ""))
                goal_rows.append({
                    "match_id": match_id,
                    "team": side_team,
                    "player_name": g.get("name", "").strip(),
                    "minute": minute,
                    "minute_stoppage": minute_stoppage,
                    "minute_display": g.get("minute"),
                    "own_goal": bool(g.get("owngoal", False)),
                    "penalty": bool(g.get("penalty", False)),
                    "source": "openfootball",
                    "source_url": SOURCE_URL,
                    "retrieved_at": retrieved_at,
                })

    print(f"partidos ya jugados en openfootball: {len(data.get('matches', [])) - not_yet_played} "
          f"(sin jugar todavia / equipo sin definir: {not_yet_played})", flush=True)
    return goal_rows, unmatched, discrepancies


def run(force_download: bool = False) -> list[dict]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    data = download(force=force_download)
    warehouse_matches = _load_warehouse_matches_2026()
    goal_rows, unmatched, discrepancies = parse(data, warehouse_matches)

    if goal_rows:
        fieldnames = list(goal_rows[0].keys())
        with GOAL_EVENTS_PATH.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(goal_rows)
        print(f"goal_events.csv: {len(goal_rows)} filas ({GOAL_EVENTS_PATH})", flush=True)

    if unmatched:
        UNMATCHED_PATH.write_text(json.dumps(unmatched, ensure_ascii=False, indent=2))
        print(
            f"ADVERTENCIA: {len(unmatched)} fixture(s) de openfootball no matchearon contra "
            f"matches.parquet (ver {UNMATCHED_PATH}) -- no se les extrajeron goles.",
            file=sys.stderr,
        )
    elif UNMATCHED_PATH.exists():
        UNMATCHED_PATH.unlink()

    if discrepancies:
        DISCREPANCIES_PATH.write_text(json.dumps(discrepancies, ensure_ascii=False, indent=2))
        print(
            f"ADVERTENCIA: {len(discrepancies)} partido(s) tienen resultado distinto entre "
            f"FIFA Training Centre (matches.parquet) y openfootball -- ver {DISCREPANCIES_PATH}. "
            "No se elige automaticamente cual es la correcta.",
            file=sys.stderr,
        )
        for d in discrepancies:
            print(
                f"  DISCREPANCIA match_id={d['match_id']} {d['home_team']} vs {d['away_team']} "
                f"({d['date']}): FIFA Training Centre {d['score_fifa_training_centre']} != "
                f"openfootball {d['score_openfootball']}",
                file=sys.stderr,
            )
    elif DISCREPANCIES_PATH.exists():
        DISCREPANCIES_PATH.unlink()

    return goal_rows


if __name__ == "__main__":
    rows = run()
    print(
        f"fetch_openfootball_2026: {len(rows)} eventos de gol extraidos, "
        f"{len({r['match_id'] for r in rows})} partidos con goles.",
        flush=True,
    )

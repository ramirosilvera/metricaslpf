"""Descarga planteles y perfiles de selección del Mundial 2026 desde el
mirror JSON estático del proyecto "26worldcup" (26worldcup.github.io), y los
deja procesados en data/raw/26worldcup/_processed/ listos para
build_warehouse.py.

Por qué esta fuente y no Transfermarkt: etl/scrape_transfermarkt_squads.py
quedó bloqueado por Transfermarkt con HTTP 403 en todos los candidatos de URL
(ver data/raw/transfermarkt/_discovery_status.json) -- el dominio bloquea
scraping de forma activa. squads.parquet nunca llegó a generarse con esa
fuente. 26worldcup.github.io expone los mismos datos (y más: caps, goles de
carrera, estadísticas del Mundial 2026 en curso, capitanía) como JSON
estático servido por GitHub Pages/raw.githubusercontent, sin bloqueo.

Procedencia real de los datos (importante para la página de metodología del
sitio -- no confundir "mirror MIT" con "fuente primaria de los hechos"):
  - código y compilación del repo 26worldcup: MIT (Copyright (c) Tom Chen,
    ver https://github.com/26worldcup/26worldcup.github.io/blob/main/LICENSE.md)
  - squads.json (nombres, dorsal, posición, fecha de nacimiento, caps, goles,
    club, capitanía, stats del Mundial 2026): hechos extraídos del artículo
    de Wikipedia "2026 FIFA World Cup squads" (texto CC BY-SA 4.0; el repo
    extrae solo hechos no protegidos por derecho de autor, sin reproducir
    prosa). Fuente real: **Wikipedia, via este mirror JSON MIT**.
  - teams.json (ranking FIFA, campo base): hechos obtenidos de la API
    pública de FIFA (api.fifa.com), no de Wikipedia.
  Ver COPYRIGHT.md del repo 26worldcup para el inventario completo:
  https://github.com/26worldcup/26worldcup.github.io/blob/main/COPYRIGHT.md

Este scraper es idempotente: cada corrida vuelve a descargar los dos JSON
(son archivos chicos, ~550KB entre los dos, y se actualizan con el torneo)
pero sobrescribe siempre los mismos nombres de archivo -- no acumula copias.

Uso:
    python etl/fetch_26worldcup_squads.py
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import requests

BASE = "https://raw.githubusercontent.com/26worldcup/26worldcup.github.io/main/public/data"
SQUADS_URL = f"{BASE}/squads.json"
TEAMS_URL = f"{BASE}/teams.json"
REQUEST_TIMEOUT_S = 30

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "26worldcup"
OUT_DIR = RAW_DIR / "_processed"
MATCHES_PARQUET = ROOT / "data" / "warehouse" / "matches.parquet"

# Fecha de referencia para calcular edad -- el inicio real del Mundial 2026,
# no "hoy" (mismo criterio que usaba scrape_transfermarkt_squads.py, para
# que el dato no cambie según cuándo corra el fetch).
TOURNAMENT_START = date(2026, 6, 11)

SOURCE_SQUADS = "26worldcup (Wikipedia)"
SOURCE_TEAMS = "26worldcup (FIFA public API)"


def _get_json(url: str) -> dict:
    resp = requests.get(url, timeout=REQUEST_TIMEOUT_S)
    resp.raise_for_status()
    return resp.json()


def _age_years(birth_date: str | None) -> float | None:
    if not birth_date:
        return None
    try:
        b = date.fromisoformat(birth_date)
    except ValueError:
        return None
    years = (TOURNAMENT_START - b).days / 365.25
    return round(years, 1) if 14 <= years <= 50 else None


def _project_team_names() -> set[str]:
    """Nombres de selección tal como los usa el resto del proyecto (ver
    data/warehouse/matches.parquet), para poder loguear cualquier mismatch
    de nombre en vez de descubrirlo recién en la validación del schema."""
    if not MATCHES_PARQUET.exists():
        return set()
    matches = pd.read_parquet(MATCHES_PARQUET)
    return set(matches["home_team"]) | set(matches["away_team"])


def _team_name_map(teams: dict) -> dict[str, str]:
    """Código FIFA de 3 letras (ej. 'MEX') -> nombre de selección tal como
    lo usa este proyecto. teams.json trae el nombre en inglés (name.en) para
    cada uno de los 48 códigos; se usa tal cual porque coincide exactamente
    con los nombres de matches.parquet (verificado: 0 mismatches en las 48
    selecciones del Mundial 2026 al momento de escribir esto)."""
    return {code: info["name"]["en"] for code, info in teams.items()}


def fetch_raw() -> tuple[dict, dict]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    squads = _get_json(SQUADS_URL)
    teams_wrapper = _get_json(TEAMS_URL)
    teams = teams_wrapper.get("teams", teams_wrapper)

    (RAW_DIR / "raw_squads.json").write_text(json.dumps(squads, ensure_ascii=False, indent=2))
    (RAW_DIR / "raw_teams.json").write_text(json.dumps(teams, ensure_ascii=False, indent=2))
    return squads, teams


def build_squads_rows(squads: dict, name_map: dict[str, str]) -> list[dict]:
    retrieved_at = datetime.now(timezone.utc).isoformat()
    rows: list[dict] = []
    for code, team_data in squads.items():
        team_name = name_map.get(code, code)
        for player in team_data.get("players", []):
            birth_date = player.get("dob")
            rows.append({
                "team": team_name,
                "player_name": player.get("name"),
                "birth_date": birth_date,
                "age_years": _age_years(birth_date),
                "market_value_eur": None,  # esta fuente no tiene valor de mercado
                "position": player.get("pos"),
                "club": player.get("club"),
                "jersey_number": player.get("no"),
                "caps": player.get("caps"),
                "career_goals": player.get("goals"),
                "captain": bool(player.get("captain", False)),
                "wc2026_apps": player.get("wcApps"),
                "wc2026_goals": player.get("wcGoals"),
                "wc2026_yellow": player.get("wcYellow"),
                "wc2026_red": player.get("wcRed"),
                "source": SOURCE_SQUADS,
                "retrieved_at": retrieved_at,
            })
    return rows


def build_team_profile_rows(teams: dict, name_map: dict[str, str]) -> list[dict]:
    retrieved_at = datetime.now(timezone.utc).isoformat()
    rows: list[dict] = []
    for code, info in teams.items():
        base_camp = info.get("baseCamp") or {}
        rows.append({
            "team": name_map.get(code, code),
            "fifa_code": code,
            "group": info.get("group"),
            "fifa_ranking": info.get("ranking"),
            "fifa_ranking_prev": info.get("rankingPrev"),
            "base_camp_city": base_camp.get("city"),
            "base_camp_facility": base_camp.get("facility"),
            "base_camp_country": base_camp.get("country"),
            "base_camp_lat": base_camp.get("lat"),
            "base_camp_lon": base_camp.get("lon"),
            "source": SOURCE_TEAMS,
            "retrieved_at": retrieved_at,
        })
    return rows


def fetch() -> tuple[list[dict], list[dict]]:
    squads, teams = fetch_raw()
    name_map = _team_name_map(teams)

    project_names = _project_team_names()
    if project_names:
        mismatches = {
            code: name for code, name in name_map.items()
            if name not in project_names
        }
        if mismatches:
            print(f"AVISO: {len(mismatches)} selecciones sin match exacto contra "
                  f"matches.parquet -- revisar mapeo de nombres: {mismatches}", file=sys.stderr)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    squads_rows = build_squads_rows(squads, name_map)
    if squads_rows:
        pd.DataFrame(squads_rows).to_csv(OUT_DIR / "squads.csv", index=False)

    team_profile_rows = build_team_profile_rows(teams, name_map)
    if team_profile_rows:
        pd.DataFrame(team_profile_rows).to_csv(OUT_DIR / "team_profile.csv", index=False)

    print(f"squads: {len(squads_rows)} jugadores en {len(squads)} selecciones")
    print(f"team_profile: {len(team_profile_rows)} selecciones")
    return squads_rows, team_profile_rows


if __name__ == "__main__":
    squads_rows, team_profile_rows = fetch()
    if not squads_rows:
        sys.exit(1)

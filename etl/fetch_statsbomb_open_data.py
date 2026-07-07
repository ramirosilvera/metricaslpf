"""Descarga datos abiertos de StatsBomb (matches/events/lineups) para las
selecciones y torneos que nos interesan, y los deja en data/raw/statsbomb/.

Uso:
    python etl/fetch_statsbomb_open_data.py --season 2022 --team Argentina
    python etl/fetch_statsbomb_open_data.py --season 2018 --team Argentina

Fuente: https://github.com/statsbomb/open-data (licencia no comercial,
ver LICENSE del repo StatsBomb). Solo cubre Mundiales 2018 y 2022 (masculino)
al momento de escribir esto; no tiene datos de distancia/sprints (es un
dataset de eventos, no de tracking físico).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import requests

RAW = "https://raw.githubusercontent.com/statsbomb/open-data/master/data"
DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "statsbomb"

WORLD_CUP_COMPETITION_ID = 43
SEASON_IDS = {2018: 3, 2022: 106}


def _get_json(path: str) -> object:
    resp = requests.get(f"{RAW}/{path}", timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch(season: int, team: str | None) -> list[int]:
    season_id = SEASON_IDS[season]
    matches = _get_json(f"matches/{WORLD_CUP_COMPETITION_ID}/{season_id}.json")

    (DATA_DIR / "matches").mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "events").mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "lineups").mkdir(parents=True, exist_ok=True)

    matches_path = DATA_DIR / "matches" / f"{WORLD_CUP_COMPETITION_ID}_{season_id}.json"
    matches_path.write_text(json.dumps(matches, ensure_ascii=False, indent=2))

    match_ids = []
    for m in matches:
        home, away = m["home_team"]["home_team_name"], m["away_team"]["away_team_name"]
        if team and team not in (home, away):
            continue
        match_ids.append(m["match_id"])

    for match_id in match_ids:
        for kind in ("events", "lineups"):
            dest = DATA_DIR / kind / f"{match_id}.json"
            if dest.exists():
                continue
            data = _get_json(f"{kind}/{match_id}.json")
            dest.write_text(json.dumps(data, ensure_ascii=False))
            print(f"  descargado {kind}/{match_id}.json")

    print(f"season {season}: {len(match_ids)} partidos" + (f" de {team}" if team else ""))
    return match_ids


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, choices=[2018, 2022], required=True)
    parser.add_argument("--team", type=str, default=None, help="Filtrar por selección, ej. Argentina")
    args = parser.parse_args()
    fetch(args.season, args.team)

"""Convierte los JSON crudos de StatsBomb (data/raw/statsbomb/) en tablas
tidy (CSV) listas para cargar al warehouse.

Genera:
  data/raw/statsbomb/_processed/matches.csv
  data/raw/statsbomb/_processed/team_match_stats.csv
  data/raw/statsbomb/_processed/player_match_appearances.csv

Notas metodológicas (importantes, ver docs/metodologia):
  - "possession_share" es un proxy calculado como la suma de la duración
    (campo `duration` de StatsBomb) de los eventos de cada equipo dividido
    por el total del partido. NO es la posesión oficial que reporta la
    FIFA/Opta (que se basa en tracking de balón). Se etiqueta como proxy
    en todo el pipeline para no confundirla con posesión "real".
  - StatsBomb open data es un dataset de EVENTOS, no de tracking físico:
    no contiene distancia recorrida, sprints ni velocidad. Sirve acá como
    variable de CONTEXTO TÁCTICO (posesión, formación, minutos jugados),
    nunca como métrica física.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw" / "statsbomb"
OUT = RAW / "_processed"


def _load(kind: str, match_id: int):
    return json.loads((RAW / kind / f"{match_id}.json").read_text())


def _match_ids() -> list[int]:
    ids = set()
    for season_file in (RAW / "matches").glob("*.json"):
        for m in json.loads(season_file.read_text()):
            mid = m["match_id"]
            if (RAW / "events" / f"{mid}.json").exists():
                ids.add(mid)
    return sorted(ids)


def _match_index():
    idx = {}
    for season_file in (RAW / "matches").glob("*.json"):
        for m in json.loads(season_file.read_text()):
            idx[m["match_id"]] = m
    return idx


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    match_index = _match_index()
    match_ids = _match_ids()

    matches_rows = []
    team_rows = []
    player_rows = []

    for match_id in match_ids:
        m = match_index[match_id]
        events = _load("events", match_id)

        home = m["home_team"]["home_team_name"]
        away = m["away_team"]["away_team_name"]

        matches_rows.append({
            "match_id": match_id,
            "competition": m["competition"]["competition_name"],
            "season": m["season"]["season_name"],
            "stage": m["competition_stage"]["name"],
            "group": m["home_team"].get("home_team_group") or "",
            "match_date": m["match_date"],
            "home_team": home,
            "away_team": away,
            "home_score": m["home_score"],
            "away_score": m["away_score"],
            "stadium": m.get("stadium", {}).get("name", ""),
            "referee": m.get("referee", {}).get("name", ""),
        })

        # --- posesión proxy (duración de eventos por equipo) ---
        duration_by_team: dict[str, float] = {home: 0.0, away: 0.0}
        passes = {home: {"attempted": 0, "completed": 0}, away: {"attempted": 0, "completed": 0}}
        shots = {home: {"total": 0, "on_target": 0, "goals": 0}, away: {"total": 0, "on_target": 0, "goals": 0}}
        fouls = {home: 0, away: 0}
        formation = {home: None, away: None}

        # --- minutos jugados por jugador ---
        starters: dict[str, set[str]] = {home: set(), away: set()}
        player_names: dict[str, str] = {}
        player_positions: dict[str, str] = {}
        player_team: dict[str, str] = {}
        sub_off_minute: dict[str, int] = {}
        sub_on_minute: dict[str, int] = {}

        match_end_minute = 90
        for e in events:
            team_name = e.get("team", {}).get("name")
            etype = e["type"]["name"]

            if team_name in duration_by_team:
                duration_by_team[team_name] += e.get("duration", 0.0) or 0.0

            if etype == "Starting XI" and team_name in formation:
                tactics = e.get("tactics", {})
                formation[team_name] = tactics.get("formation")
                for slot in tactics.get("lineup", []):
                    pid = str(slot["player"]["id"])
                    player_names[pid] = slot["player"]["name"]
                    player_positions[pid] = slot["position"]["name"]
                    player_team[pid] = team_name
                    starters[team_name].add(pid)

            if etype == "Pass" and team_name in passes:
                passes[team_name]["attempted"] += 1
                outcome = e.get("pass", {}).get("outcome")
                if outcome is None:  # sin outcome = pase completado en StatsBomb
                    passes[team_name]["completed"] += 1

            if etype == "Shot" and team_name in shots:
                shots[team_name]["total"] += 1
                outcome_name = e.get("shot", {}).get("outcome", {}).get("name")
                if outcome_name == "Goal":
                    shots[team_name]["goals"] += 1
                    shots[team_name]["on_target"] += 1
                elif outcome_name in ("Saved", "Saved to Post"):
                    shots[team_name]["on_target"] += 1

            if etype == "Foul Committed" and team_name in fouls:
                fouls[team_name] += 1

            if etype == "Substitution":
                pid = str(e["player"]["id"])
                sub_off_minute[pid] = e["minute"]
                sub_in = e.get("substitution", {}).get("replacement")
                if sub_in:
                    in_pid = str(sub_in["id"])
                    player_names[in_pid] = sub_in["name"]
                    player_team[in_pid] = team_name
                    sub_on_minute[in_pid] = e["minute"]

            if etype == "Half End" and e.get("period") == 2:
                match_end_minute = max(match_end_minute, e["minute"])
            if etype in ("Half End",) and e.get("period", 0) >= 3:
                match_end_minute = max(match_end_minute, e["minute"])

        total_duration = sum(duration_by_team.values()) or 1.0
        for team_name in (home, away):
            p = passes[team_name]
            s = shots[team_name]
            team_rows.append({
                "match_id": match_id,
                "team": team_name,
                "is_home": team_name == home,
                "possession_share_proxy": round(duration_by_team[team_name] / total_duration, 4),
                "formation": formation[team_name],
                "passes_attempted": p["attempted"],
                "passes_completed": p["completed"],
                "pass_accuracy_pct": round(100 * p["completed"] / p["attempted"], 1) if p["attempted"] else None,
                "shots_total": s["total"],
                "shots_on_target": s["on_target"],
                "goals": s["goals"],
                "fouls_committed": fouls[team_name],
            })

        for pid, name in player_names.items():
            team_name = player_team.get(pid)
            is_starter = pid in starters.get(team_name, set())
            start_minute = 0 if is_starter else sub_on_minute.get(pid, 0)
            end_minute = sub_off_minute.get(pid, match_end_minute)
            minutes_played = max(0, end_minute - start_minute)
            player_rows.append({
                "match_id": match_id,
                "team": team_name,
                "player_id": pid,
                "player_name": name,
                "position": player_positions.get(pid, ""),
                "is_starter": is_starter,
                "minutes_played": minutes_played,
            })

    _write_csv(OUT / "matches.csv", matches_rows)
    _write_csv(OUT / "team_match_stats.csv", team_rows)
    _write_csv(OUT / "player_match_appearances.csv", player_rows)
    print(f"matches: {len(matches_rows)}  team_match_stats: {len(team_rows)}  player_appearances: {len(player_rows)}")


def _write_csv(path: Path, rows: list[dict]):
    if not rows:
        return
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    build()

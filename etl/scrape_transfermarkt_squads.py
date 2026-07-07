"""Scraper de planteles del Mundial 2026 (edad, fecha de nacimiento,
posición, club) desde Transfermarkt.

Igual que el scraper de FIFA Training Centre, este dominio no fue
alcanzable desde el sandbox de desarrollo (bloqueado por la política de
red del entorno). El parsing está escrito según la estructura pública y
estable que Transfermarkt usa hace años para sus tablas de plantel
(`table.items` con columnas de jugador/posición/fecha de nacimiento/club),
pero se valida realmente recién en la primera corrida de GitHub Actions.

Uso:
    python etl/scrape_transfermarkt_squads.py --team-slug lionel-scaloni ... (ver TEAMS)
"""
from __future__ import annotations

import csv
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://www.transfermarkt.com"
HEADERS = {
    "User-Agent": "MetricasMundial2026Bot/1.0 (+https://github.com/ramirosilvera/metricasmundial2026; "
    "proyecto de analisis publico y sin fines de lucro; contacto via GitHub issues)"
}

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "transfermarkt"
OUT_DIR = RAW_DIR / "_processed"

# Mapeo selección -> slug/id de Transfermarkt para el Mundial 2026.
# Completar/corregir en la primera corrida real (el listado de participantes
# confirmados y sus IDs de Transfermarkt se puede sacar de la página del
# torneo: transfermarkt.com/fifa-world-cup-2026/teilnehmer/pokalwettbewerb/WM26)
TEAM_SQUAD_URLS: dict[str, str] = {
    # "Argentina": "https://www.transfermarkt.com/argentina/startseite/verein/3437",
}

BIRTH_DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})")


def _get(url: str) -> requests.Response:
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp


def _parse_squad_table(html: str, team: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    table = soup.find("table", class_="items")
    if table is None:
        return []

    rows_out = []
    retrieved_at = datetime.now(timezone.utc).isoformat()
    for tr in table.find_all("tr", class_=("odd", "even")):
        name_cell = tr.find("td", class_="hauptlink") or tr.find("a", class_="spielprofil_tooltip")
        if name_cell is None:
            continue
        player_name = name_cell.get_text(strip=True)

        row_text = tr.get_text(" ", strip=True)
        birth_match = BIRTH_DATE_RE.search(row_text)
        birth_date = None
        if birth_match:
            m, d, y = birth_match.groups()
            birth_date = f"{y}-{int(m):02d}-{int(d):02d}"

        position_cell = tr.find("td", class_="posrela")
        position = None
        if position_cell:
            pos_text = position_cell.find_all("td")
            if len(pos_text) > 1:
                position = pos_text[-1].get_text(strip=True)

        club_img = tr.find("img", class_="tiny_wappen")
        club = club_img["title"] if club_img and club_img.has_attr("title") else None

        rows_out.append({
            "team": team,
            "player_name": player_name,
            "birth_date": birth_date,
            "position": position,
            "club": club,
            "source": "transfermarkt",
            "retrieved_at": retrieved_at,
        })
    return rows_out


def scrape(team_urls: dict[str, str] | None = None) -> list[dict]:
    team_urls = team_urls or TEAM_SQUAD_URLS
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    all_rows: list[dict] = []
    failures: list[str] = []

    for team, url in team_urls.items():
        try:
            html = _get(url).text
        except requests.RequestException as exc:
            failures.append(f"{team}: {exc}")
            continue

        (RAW_DIR / f"raw_{team.replace(' ', '_')}.html").write_text(html)
        rows = _parse_squad_table(html, team)
        if not rows:
            failures.append(f"{team}: tabla de plantel no encontrada/estructura cambio")
            continue
        all_rows.extend(rows)
        time.sleep(2)  # scraping respetuoso: no golpear el sitio en ráfaga

    if all_rows:
        out_path = OUT_DIR / "squads.csv"
        with out_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(all_rows[0].keys()))
            writer.writeheader()
            writer.writerows(all_rows)

    if failures:
        (RAW_DIR / "_failed.log").write_text("\n".join(failures))

    return all_rows


if __name__ == "__main__":
    if not TEAM_SQUAD_URLS:
        print(
            "TEAM_SQUAD_URLS esta vacio -- falta completar el mapeo selección -> URL de Transfermarkt "
            "para el Mundial 2026 (dejarlo listo es la primera tarea manual del pipeline, ver README de etl/).",
            file=sys.stderr,
        )
        sys.exit(1)
    rows = scrape()
    print(f"jugadores extraidos: {len(rows)}")
    if not rows:
        sys.exit(1)

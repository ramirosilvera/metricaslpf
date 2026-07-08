"""Scraper de planteles del Mundial 2026 (edad, valor de mercado, posición,
club) desde Transfermarkt.

Igual que el scraper de FIFA Training Centre, este dominio no fue
alcanzable desde el sandbox de desarrollo (bloqueado por la política de
red del entorno): el parsing se escribió según la estructura pública y
estable que Transfermarkt usa hace años, pero se valida realmente recién
en la primera corrida de GitHub Actions -- por eso vuelca un diagnóstico
(_discovery_status.json) igual que el scraper de FIFA, para poder
iterar con datos reales si la estructura no coincide.

En vez de mantener un mapeo selección -> URL a mano (48 selecciones en el
Mundial 2026, y hubiera que acertar el slug/id de Transfermarkt de cada
una de memoria), el scraper DESCUBRE las 48 selecciones y sus planteles
recorriendo la página de participantes del torneo.

Uso:
    python etl/scrape_transfermarkt_squads.py
"""
from __future__ import annotations

import csv
import json
import re
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://www.transfermarkt.com"
HUB_URL = f"{BASE}/fifa-world-cup-2026/teilnehmer/pokalwettbewerb/WM26"
HEADERS = {
    "User-Agent": "MetricasMundial2026Bot/1.0 (+https://github.com/ramirosilvera/metricasmundial2026; "
    "proyecto de analisis publico y sin fines de lucro; contacto via GitHub issues)"
}
REQUEST_TIMEOUT_S = 20

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "transfermarkt"
OUT_DIR = RAW_DIR / "_processed"

# Fecha de referencia para calcular edad -- el inicio real del Mundial 2026,
# no "hoy" (así el dato no cambia según cuándo corra el scraper).
TOURNAMENT_START = date(2026, 6, 11)

BIRTH_DATE_RE = re.compile(r"(\w{3} \d{1,2}, \d{4})|(\d{1,2})/(\d{1,2})/(\d{4})")
MARKET_VALUE_RE = re.compile(r"€\s*([\d.,]+)\s*(m|k|Th\.|Mio\.)?", re.IGNORECASE)
TEAM_LINK_RE = re.compile(r"/([a-z0-9-]+)/startseite/verein/(\d+)")


def _get(url: str) -> requests.Response:
    resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT_S)
    resp.raise_for_status()
    return resp


def _parse_birth_date(text: str) -> str | None:
    match = BIRTH_DATE_RE.search(text)
    if not match:
        return None
    if match.group(1):
        try:
            return datetime.strptime(match.group(1), "%b %d, %Y").date().isoformat()
        except ValueError:
            return None
    m, d, y = match.group(2), match.group(3), match.group(4)
    try:
        return date(int(y), int(m), int(d)).isoformat()
    except ValueError:
        return None


def _age_years(birth_date: str | None) -> float | None:
    if not birth_date:
        return None
    try:
        b = date.fromisoformat(birth_date)
    except ValueError:
        return None
    years = (TOURNAMENT_START - b).days / 365.25
    return round(years, 1) if 14 <= years <= 50 else None


def _parse_market_value(text: str) -> float | None:
    match = MARKET_VALUE_RE.search(text)
    if not match:
        return None
    raw, suffix = match.groups()
    try:
        value = float(raw.replace(",", ""))
    except ValueError:
        return None
    suffix = (suffix or "").lower()
    if suffix in ("m", "mio."):
        return value * 1_000_000
    if suffix in ("k", "th."):
        return value * 1_000
    return value


def discover_team_urls(html: str) -> dict[str, str]:
    """Recorre la página de participantes del Mundial 2026 y devuelve
    {selección: url_del_plantel}. Convierte el link a la ficha del equipo
    (".../startseite/verein/ID") en el link a su plantel (".../kader/verein/ID"),
    patrón estable de Transfermarkt para cualquier equipo."""
    soup = BeautifulSoup(html, "lxml")
    teams: dict[str, str] = {}
    for a in soup.find_all("a", href=TEAM_LINK_RE):
        match = TEAM_LINK_RE.search(a["href"])
        if not match:
            continue
        slug, team_id = match.groups()
        name = a.get_text(strip=True)
        if not name or name in teams:
            continue
        teams[name] = f"{BASE}/{slug}/kader/verein/{team_id}"
    return teams


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
        birth_date = _parse_birth_date(row_text)

        position_cell = tr.find("td", class_="posrela")
        position = None
        if position_cell:
            pos_text = position_cell.find_all("td")
            if len(pos_text) > 1:
                position = pos_text[-1].get_text(strip=True)

        club_img = tr.find("img", class_="tiny_wappen")
        club = club_img["title"] if club_img and club_img.has_attr("title") else None

        value_cell = tr.find("td", class_="rechts hauptlink") or tr.find_all("td")[-1]
        market_value_eur = _parse_market_value(value_cell.get_text(strip=True)) if value_cell else None

        rows_out.append({
            "team": team,
            "player_name": player_name,
            "birth_date": birth_date,
            "age_years": _age_years(birth_date),
            "market_value_eur": market_value_eur,
            "position": position,
            "club": club,
            "source": "transfermarkt",
            "retrieved_at": retrieved_at,
        })
    return rows_out


def scrape() -> list[dict]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    try:
        hub_html = _get(HUB_URL).text
    except requests.RequestException as exc:
        (RAW_DIR / "_discovery_status.json").write_text(json.dumps({"error": str(exc), "hub_url": HUB_URL}, indent=2))
        print(f"no se pudo bajar la pagina de participantes: {exc}", file=sys.stderr)
        return []

    (RAW_DIR / "raw_hub.html").write_text(hub_html)
    team_urls = discover_team_urls(hub_html)
    (RAW_DIR / "_discovery_status.json").write_text(
        json.dumps({"hub_url": HUB_URL, "teams_found": len(team_urls), "teams": team_urls}, indent=2, ensure_ascii=False)
    )
    print(f"selecciones descubiertas: {len(team_urls)}")
    if not team_urls:
        print("no se encontraron links de selecciones -- revisar _discovery_status.json / raw_hub.html", file=sys.stderr)
        return []

    all_rows: list[dict] = []
    failures: list[str] = []

    for team, url in team_urls.items():
        try:
            html = _get(url).text
        except requests.RequestException as exc:
            failures.append(f"{team}: {exc}")
            continue

        rows = _parse_squad_table(html, team)
        if not rows:
            failures.append(f"{team}: tabla de plantel no encontrada/estructura cambio")
            continue
        all_rows.extend(rows)
        print(f"  {team}: {len(rows)} jugadores")
        time.sleep(2)  # scraping respetuoso: no golpear el sitio en rafaga

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
    rows = scrape()
    print(f"jugadores extraidos: {len(rows)}")
    if not rows:
        sys.exit(1)

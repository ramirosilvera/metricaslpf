"""Scraper de las métricas físicas públicas del FIFA Training Centre.

FIFA publica, para cada partido del Mundial, un reporte con distancia
total, distancia a alta intensidad, sprints y velocidad punta por equipo
y por posición (ver p.ej. fifatrainingcentre.com/en/fwc2022/physical-analysis/
y, para 2026, el Match Report Hub). No es una API: son páginas HTML
editoriales con tablas embebidas, así que este script:

  1. Lee el índice de partidos ya reportados (Match Report Hub).
  2. Para cada partido nuevo, busca las tablas de distancia/alta
     intensidad/sprints con pandas.read_html + BeautifulSoup como fallback.
  3. Normaliza a filas (match_id externo propio -- hay que resolverlo contra
     nuestro `matches.parquet` por fecha+equipos, ver `_resolve_match_id`).
  4. Si no encuentra una tabla reconocible, NO inventa datos: registra el
     partido en `data/raw/fifa_training_centre/_failed.json` y termina con
     exit code != 0, para que el workflow de GitHub Actions abra un aviso
     en vez de publicar silenciosamente un dato viejo o vacío como si
     fuera actual.

IMPORTANTE: este dominio no es alcanzable desde el entorno de desarrollo
donde se escribió este script (política de red del sandbox lo bloquea con
403 a nivel de proxy). El parsing de HTML de abajo está escrito según la
estructura pública conocida del sitio pero NO PUDO PROBARSE contra el HTML
real. La primera corrida en GitHub Actions (con red sin restricciones) va
a validar esto -- si la estructura cambió, hay que ajustar
`_parse_physical_table` mirando el HTML real que devuelva el request.
"""
from __future__ import annotations

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests
from bs4 import BeautifulSoup

BASE = "https://www.fifatrainingcentre.com"
HUB_URL = f"{BASE}/en/fifa-world-cup-2026/match-report-hub.php"
HEADERS = {
    "User-Agent": "MetricasMundial2026Bot/1.0 (+https://github.com/ramirosilvera/metricasmundial2026; "
    "proyecto de analisis publico y sin fines de lucro; contacto via GitHub issues)"
}

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "fifa_training_centre"
OUT_DIR = RAW_DIR / "_processed"
FAILED_LOG = RAW_DIR / "_failed.json"


def _get(url: str) -> requests.Response:
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp


def discover_match_report_urls() -> list[str]:
    """Lee el Match Report Hub y devuelve las URLs de reportes individuales."""
    resp = _get(HUB_URL)
    soup = BeautifulSoup(resp.text, "lxml")
    urls = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "match-report" in href or "physical-analysis" in href:
            urls.add(href if href.startswith("http") else f"{BASE}{href}")
    return sorted(urls)


def _parse_physical_table(html: str) -> pd.DataFrame | None:
    """Intenta extraer una tabla de distancia/alta intensidad/sprints por equipo.

    Estrategia: cualquier tabla que tenga columnas reconocibles (distance,
    high intensity, sprint) gana. Ajustar acá si la estructura real difiere.
    """
    try:
        tables = pd.read_html(html)
    except ValueError:
        tables = []

    keywords = ("distance", "sprint", "high intensity", "high-intensity", "km/h")
    for table in tables:
        cols_lower = " ".join(str(c).lower() for c in table.columns)
        if any(k in cols_lower for k in keywords):
            return table
    return None


def _resolve_match_id(matches_df: pd.DataFrame, team_a: str, team_b: str, match_date: str | None) -> int | None:
    mask = (
        ((matches_df["home_team"] == team_a) & (matches_df["away_team"] == team_b))
        | ((matches_df["home_team"] == team_b) & (matches_df["away_team"] == team_a))
    )
    if match_date:
        mask &= matches_df["match_date"] == match_date
    candidates = matches_df[mask]
    if len(candidates) == 1:
        return int(candidates.iloc[0]["match_id"])
    return None


def scrape() -> list[dict]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    report_urls = discover_match_report_urls()
    rows: list[dict] = []
    failed: list[dict] = []

    matches_parquet = ROOT / "data" / "warehouse" / "matches.parquet"
    matches_df = pd.read_parquet(matches_parquet) if matches_parquet.exists() else pd.DataFrame(
        columns=["match_id", "home_team", "away_team", "match_date"]
    )

    for url in report_urls:
        try:
            html = _get(url).text
        except requests.RequestException as exc:
            failed.append({"url": url, "error": str(exc)})
            continue

        table = _parse_physical_table(html)
        if table is None:
            failed.append({"url": url, "error": "no se encontro tabla de metricas fisicas reconocible"})
            continue

        # Fallback conservador: si no se puede resolver el match_id real
        # contra matches.parquet, se guarda el HTML crudo para revisión
        # manual en vez de forzar una fila con datos ambiguos.
        soup = BeautifulSoup(html, "lxml")
        title = soup.find("h1")
        title_text = title.get_text(strip=True) if title else url

        (RAW_DIR / f"raw_{abs(hash(url))}.html").write_text(html)

        failed.append({
            "url": url,
            "note": "tabla encontrada pero requiere mapeo manual a match_id/equipo -- revisar HTML guardado",
            "title": title_text,
        })

    if failed:
        FAILED_LOG.write_text(json.dumps(failed, ensure_ascii=False, indent=2))

    if rows:
        out_path = OUT_DIR / "physical_match_stats.csv"
        with out_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)

    return rows


if __name__ == "__main__":
    rows = scrape()
    n_failed = len(json.loads(FAILED_LOG.read_text())) if FAILED_LOG.exists() else 0
    print(f"filas extraidas: {len(rows)} -- items pendientes de revision manual: {n_failed}")
    if not rows:
        print(
            "ADVERTENCIA: no se pudo extraer ninguna fila automáticamente. "
            "Revisar data/raw/fifa_training_centre/_failed.json y los HTML guardados "
            "para ajustar _parse_physical_table() con la estructura real del sitio.",
            file=sys.stderr,
        )
        sys.exit(1)

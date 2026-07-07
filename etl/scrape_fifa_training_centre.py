"""Scraper de las métricas físicas oficiales del FIFA Training Centre para
el Mundial 2026.

Hallazgo clave (primera corrida real en GitHub Actions, ver historial de
commits): el Match Report Hub NO tiene tablas HTML por partido -- linkea
directo a PDFs oficiales "PMSR" (Physical/Player Match Statistics Report,
nombre de archivo tipo `PMSR-M19-ARG-V-ALG.pdf`) para cada partido ya
jugado, embebidos en el propio HTML del hub y su sub-hub de knockout stage.

Este script:
  1. Lee el Match Report Hub y su(s) sub-hub(s) por fase, y junta TODOS los
     links a PDFs `PMSR-M<numero>-<COD1>-V-<COD2>[...].pdf`.
  2. Arma un registro propio de partidos 2026 a partir del nombre de archivo
     (numero de partido + codigos de selección de 3 letras) -- FIFA no
     publica todavía (a la fecha en que se escribió esto) un feed de
     partidos 2026 utilizable, así que este es el único inventario real
     disponible.
  3. Descarga cada PDF y extrae sus tablas con pdfplumber.
  4. Busca una tabla con columnas reconocibles (distancia, alta intensidad,
     sprints). Si no la encuentra, NO inventa datos: la guarda en
     `_failed.json` para revisión manual, y además vuelca el contenido
     crudo extraído (texto + tablas) de hasta `PDF_DEBUG_SAMPLE_LIMIT` PDFs
     a `_pdf_debug_sample.json` para poder ajustar el parser por inspección
     real en vez de a ciegas.

IMPORTANTE: el entorno donde se escribió esto bloquea la salida de red hacia
fifatrainingcentre.com (política del sandbox), así que el parser de PDF de
abajo se ajustó mirando `_discovery_status.json` y `_pdf_debug_sample.json`
generados por corridas reales en GitHub Actions, no contra el PDF en vivo
desde acá.
"""
from __future__ import annotations

import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pdfplumber
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
PDF_DEBUG_SAMPLE_LIMIT = 3
# offset para no chocar con los match_id numericos de StatsBomb (que son
# ids reales de partido, 4 a 7 digitos)
MATCH_ID_OFFSET = 20_260_000

PDF_LINK_RE = re.compile(r"PMSR-M(\d+)[-_]([A-Z]{3})[-_]V[-_]([A-Z]{3})[^/]*\.pdf", re.IGNORECASE)

# Códigos de selección de 3 letras -> nombre de selección, siguiendo la
# convención de nombres que ya usamos desde StatsBomb (para que los joins
# entre 2018/2022 y 2026 de Argentina funcionen). Completar a medida que
# aparezcan códigos nuevos en report_urls_found / _discovery_status.json.
TEAM_CODE_MAP = {
    "ARG": "Argentina", "ALG": "Algeria", "AUT": "Austria", "JOR": "Jordan",
    "MEX": "Mexico", "RSA": "South Africa", "KOR": "South Korea", "CZE": "Czechia",
    "CAN": "Canada", "BIH": "Bosnia and Herzegovina", "QAT": "Qatar", "SUI": "Switzerland",
    "HAI": "Haiti", "SCO": "Scotland", "BRA": "Brazil", "MAR": "Morocco",
    "USA": "United States", "PAR": "Paraguay", "AUS": "Australia", "TUR": "Turkey",
    "CIV": "Ivory Coast", "ECU": "Ecuador", "GER": "Germany", "CUW": "Curacao",
    "NED": "Netherlands", "JPN": "Japan", "SWE": "Sweden", "TUN": "Tunisia",
    "IRN": "Iran", "NZL": "New Zealand", "BEL": "Belgium", "EGY": "Egypt",
    "KSA": "Saudi Arabia", "URU": "Uruguay", "ESP": "Spain", "CPV": "Cape Verde",
    "FRA": "France", "SEN": "Senegal", "IRQ": "Iraq", "NOR": "Norway",
    "GHA": "Ghana", "ENG": "England", "CRO": "Croatia", "POR": "Portugal",
    "COD": "DR Congo", "UZB": "Uzbekistan", "COL": "Colombia", "PAN": "Panama",
}


def _get(url: str) -> requests.Response:
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp


def _all_hrefs(html: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    return [a["href"] for a in soup.find_all("a", href=True)]


def _team_name(code: str) -> str:
    return TEAM_CODE_MAP.get(code.upper(), code.upper())


def discover_pdf_reports(debug: dict | None = None) -> list[dict]:
    """Lee el Match Report Hub y su(s) sub-hub(s) por fase y devuelve la
    lista de PDFs de reporte fisico encontrados, con match_number y equipos
    ya resueltos desde el nombre de archivo."""
    visited_pages: dict[str, list[str]] = {}

    root_html = _get(HUB_URL).text
    root_hrefs = _all_hrefs(root_html)
    visited_pages[HUB_URL] = root_hrefs

    sub_hub_urls = {
        (href if href.startswith("http") else f"{BASE}{href}")
        for href in root_hrefs
        if "match-report-hub" in href and href.rstrip("/").split("/")[-1] != "match-report-hub.php"
    }
    for sub_url in sorted(sub_hub_urls)[:10]:
        try:
            sub_html = _get(sub_url).text
        except requests.RequestException:
            continue
        visited_pages[sub_url] = _all_hrefs(sub_html)

    reports_by_number: dict[str, dict] = {}
    for page_url, hrefs in visited_pages.items():
        # heuristica: la pagina donde aparece el link da una pista de fase
        # (el hub raiz junta grupos + iniciales, los sub-hub tienen la fase
        # en el propio nombre de archivo)
        stage_guess = "Knockout stage" if "knockout" in page_url.lower() else "Group stage"
        for href in hrefs:
            m = PDF_LINK_RE.search(href)
            if not m:
                continue
            match_number, code_a, code_b = m.groups()
            url = href if href.startswith("http") else f"{BASE}{href}"
            reports_by_number[match_number] = {
                "match_number": int(match_number),
                "match_id": MATCH_ID_OFFSET + int(match_number),
                "team_a_code": code_a.upper(),
                "team_b_code": code_b.upper(),
                "team_a": _team_name(code_a),
                "team_b": _team_name(code_b),
                "stage_guess": stage_guess,
                "url": url,
            }

    reports = sorted(reports_by_number.values(), key=lambda r: r["match_number"])

    if debug is not None:
        debug["pages_visited"] = list(visited_pages.keys())
        debug["pdf_reports_found"] = reports

    return reports


def _extract_pdf_tables(pdf_bytes: bytes) -> tuple[list[list[list[str]]], str]:
    """Devuelve (tablas crudas por pagina, texto completo) de un PDF."""
    import io

    tables: list[list[list[str]]] = []
    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                tables.append(table)
            page_text = page.extract_text() or ""
            text_parts.append(page_text)
    return tables, "\n".join(text_parts)


def _parse_physical_metrics(tables: list[list[list[str]]], team_a: str, team_b: str) -> list[dict] | None:
    """Busca, entre las tablas extraidas del PDF, filas con metricas fisicas
    reconocibles (distancia, alta intensidad, sprints) por equipo.

    Estrategia conservadora: sólo devuelve datos si encuentra, en alguna
    tabla, una fila cuya primera celda mencione a uno de los dos equipos (o
    contenga "team"/"total") junto con valores numéricos en columnas que
    tengan un header con alguna de las palabras clave. Si la estructura real
    no matchea esto, se retorna None (no se inventan filas).
    """
    keywords = ("distance", "high intensity", "high-intensity", "sprint", "km/h", "hi ")

    for table in tables:
        if not table or len(table) < 2:
            continue
        header = [str(c or "").strip().lower() for c in table[0]]
        if not any(any(k in h for k in keywords) for h in header):
            continue

        rows_out = []
        for row in table[1:]:
            if not row:
                continue
            label = str(row[0] or "").strip()
            if not label:
                continue
            rows_out.append({"row_label": label, "raw_row": row, "header": table[0]})
        if rows_out:
            return rows_out
    return None


def scrape() -> list[dict]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    debug: dict = {}
    reports = discover_pdf_reports(debug=debug)
    (RAW_DIR / "_discovery_status.json").write_text(json.dumps({
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "hub_url": HUB_URL,
        "pages_visited": debug.get("pages_visited", []),
        "pdf_reports_found": reports,
        "count": len(reports),
    }, ensure_ascii=False, indent=2))
    print(f"discover_pdf_reports: {len(reports)} PDFs encontrados (paginas visitadas: {len(debug.get('pages_visited', []))})", flush=True)

    matches_rows = []
    physical_rows: list[dict] = []
    failed: list[dict] = []
    pdf_debug_samples: list[dict] = []
    retrieved_at = datetime.now(timezone.utc).isoformat()

    for report in reports:
        matches_rows.append({
            "match_id": report["match_id"],
            "competition": "FIFA World Cup",
            "season": "2026",
            "stage": report["stage_guess"],
            "group": "",
            "match_date": None,
            "home_team": report["team_a"],
            "away_team": report["team_b"],
            "home_score": None,
            "away_score": None,
            "stadium": "",
            "referee": "",
        })

        try:
            pdf_bytes = _get(report["url"]).content
        except requests.RequestException as exc:
            failed.append({"match_number": report["match_number"], "url": report["url"], "error": str(exc)})
            continue

        try:
            tables, full_text = _extract_pdf_tables(pdf_bytes)
        except Exception as exc:  # PDF corrupto/formato inesperado -- no debe tumbar todo el pipeline
            failed.append({"match_number": report["match_number"], "url": report["url"], "error": f"error extrayendo PDF: {exc}"})
            continue

        if len(pdf_debug_samples) < PDF_DEBUG_SAMPLE_LIMIT:
            pdf_debug_samples.append({
                "match_number": report["match_number"],
                "team_a": report["team_a"],
                "team_b": report["team_b"],
                "url": report["url"],
                "tables": tables,
                "text": full_text[:8000],
            })

        parsed = _parse_physical_metrics(tables, report["team_a"], report["team_b"])
        if parsed is None:
            failed.append({
                "match_number": report["match_number"],
                "url": report["url"],
                "error": "no se encontro tabla de metricas fisicas reconocible en el PDF",
            })
            continue

        for row in parsed:
            physical_rows.append({
                "match_id": report["match_id"],
                "team": row["row_label"],
                "total_distance_km": None,
                "high_intensity_distance_m": None,
                "sprint_distance_m": None,
                "sprint_count": None,
                "top_speed_kmh": None,
                "source": "fifa_training_centre_pmsr_pdf",
                "source_url": report["url"],
                "retrieved_at": retrieved_at,
                "_raw_row_for_manual_mapping": row["raw_row"],
                "_raw_header_for_manual_mapping": row["header"],
            })

    if failed:
        FAILED_LOG.write_text(json.dumps(failed, ensure_ascii=False, indent=2))
    if pdf_debug_samples:
        (RAW_DIR / "_pdf_debug_sample.json").write_text(json.dumps(pdf_debug_samples, ensure_ascii=False, indent=2))

    if matches_rows:
        with (OUT_DIR / "matches_fifa2026.csv").open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(matches_rows[0].keys()))
            writer.writeheader()
            writer.writerows(matches_rows)

    # IMPORTANTE: physical_rows todavia no se escribe como
    # physical_match_stats.csv -- las filas tienen las metricas numericas en
    # None porque todavia no se mapearon las columnas reales del PDF (se
    # llega a esto recien via _pdf_debug_sample.json). Publicar esto tal
    # cual mostraria en el sitio "datos cargados" con todo en null, que es
    # peor que mostrar "pendiente". Se devuelve solo para inspeccion local/CI.
    return physical_rows


if __name__ == "__main__":
    rows = scrape()
    n_failed = len(json.loads(FAILED_LOG.read_text())) if FAILED_LOG.exists() else 0
    print(f"filas con tabla fisica candidata: {len(rows)} -- items pendientes de revision manual: {n_failed}", flush=True)
    if not rows:
        print(
            "ADVERTENCIA: no se pudo extraer ninguna tabla candidata de los PDFs. "
            "Revisar data/raw/fifa_training_centre/_failed.json y "
            "_pdf_debug_sample.json para ajustar _parse_physical_metrics() con la estructura real.",
            file=sys.stderr,
        )
        sys.exit(1)

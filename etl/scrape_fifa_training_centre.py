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
import os
import re
import sys
import time
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
REQUEST_TIMEOUT_S = 15
# 94 PDFs secuenciales pueden tardar mucho si el sitio tira lento -- se
# puede acotar la corrida con la env var PMSR_LIMIT (ej. para probar el
# parser rápido antes de bajar los 94) o PMSR_MAX_SECONDS para cortar por
# tiempo total en vez de por cantidad.
PMSR_LIMIT = int(os.environ.get("PMSR_LIMIT") or 0) or None
PMSR_MAX_SECONDS = int(os.environ.get("PMSR_MAX_SECONDS") or 0) or None

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "fifa_training_centre"
OUT_DIR = RAW_DIR / "_processed"
# Cache local de los PDFs crudos ya descargados (gitignoreado por peso).
# Permite re-parsear un PDF con un parser nuevo (ej. el de metricas
# tacticas, agregado despues de la corrida fisica original) sin volver a
# pegarle a los servidores de FIFA.
PDF_CACHE_DIR = RAW_DIR / "pdfs"
FAILED_LOG = RAW_DIR / "_failed.json"
DISCOVERY_STATUS_PATH = RAW_DIR / "_discovery_status.json"
PDF_DEBUG_SAMPLE_LIMIT = 3
# offset para no chocar con los match_id numericos de StatsBomb (que son
# ids reales de partido, 4 a 7 digitos)
MATCH_ID_OFFSET = 20_260_000

PDF_LINK_RE = re.compile(r"PMSR-M(\d+)[-_ ]([A-Z]{3})[-_ ]V[-_ ]([A-Z]{3})[^/]*\.pdf", re.IGNORECASE)

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
    resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT_S)
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


_MATCH_SUMMARY_RE = re.compile(
    r"^(?P<home>.+?) (?P<home_score>\d+) - (?P<away_score>\d+) (?P<away>.+?)\n"
    r"(?P<group_label>.+?) - Match (?P<match_num>\d+)\n"
    r"(?P<date>\d{1,2} \w+ \d{4})\n"
    r".*?\n"
    r"(?P<stadium>.+?)\n",
    re.DOTALL,
)


def _parse_match_summary(tables: list[list[list[str]]]) -> dict | None:
    """La portada del PDF ("POST MATCH SUMMARY REPORT") trae resultado,
    fecha, estadio y fase en texto plano (sin el problema de la fuente
    remapeada) -- se usa para completar matches_fifa2026.csv con datos
    reales en vez de dejarlos vacíos."""
    for table in tables:
        for cell_row in table:
            for cell in cell_row or []:
                if not cell or "POST MATCH SUMMARY REPORT" not in cell:
                    continue
                m = _MATCH_SUMMARY_RE.match(cell)
                if not m:
                    continue
                d = m.groupdict()
                try:
                    match_date = datetime.strptime(d["date"], "%d %B %Y").strftime("%Y-%m-%d")
                except ValueError:
                    match_date = None
                return {
                    "home_team": d["home"].strip(),
                    "away_team": d["away"].strip(),
                    "home_score": int(d["home_score"]),
                    "away_score": int(d["away_score"]),
                    "stage": d["group_label"].strip(),
                    "match_date": match_date,
                    "stadium": d["stadium"].strip(),
                }
    return None


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


# El PDF "PMSR" usa una fuente con los dígitos remapeados a Unicode Private
# Use Area en vez de ASCII '0'-'9' (probablemente para dificultar el copy-paste
# directo). Confirmado cruzando la suma de distancia de los 16 jugadores
# listados contra el total de equipo que SI viene en texto plano en la
# página de "Key Statistics" (108.4km / 109.3km calzan exacto con este mapeo).
_PUA_MAP = {chr(0xE071 + i): str(i) for i in range(10)}
_PUA_MAP.update({
    chr(0xE094): ".",
    chr(0xE088): "-",
    chr(0xE081): "(",
    chr(0xE082): ")",
    chr(0xE092): ":",
    chr(0xE09D): "+",
})


def _decode_pmsr_font(s: str) -> str:
    return "".join(_PUA_MAP.get(ch, ch) for ch in s)


def _parse_physical_metrics(tables: list[list[list[str]]]) -> list[dict] | None:
    """Busca celdas "Physical Data <Selección>" entre las tablas extraidas
    (una por equipo) y decodifica las filas de jugadores.

    Cada fila de jugador tiene 9 números al final (después de decodificar):
    distancia total, zona 1-5, corridas de alta velocidad (zona 3), sprints
    (zona 4 y 5), velocidad punta. Si no encuentra ninguna celda con ese
    patrón, devuelve None -- no se inventan datos.
    """
    player_rows: list[dict] = []

    for table in tables:
        for cell_row in table:
            for cell in cell_row or []:
                if not cell or "Physical Data" not in cell:
                    continue
                team_name = cell.split("Physical Data", 1)[1].split("\n", 1)[0].strip()
                for line in cell.split("\n"):
                    decoded = _decode_pmsr_font(line)
                    nums = re.findall(r"-?\d+\.?\d*", decoded)
                    if len(nums) < 9:
                        continue
                    tail = nums[-9:]
                    try:
                        vals = [float(n) for n in tail]
                    except ValueError:
                        continue
                    # la parte de texto antes del primer numero de la cola es "<jersey> <nombre>"
                    prefix = decoded
                    for n in tail:
                        prefix = prefix.rsplit(n, 1)[0]
                    prefix = prefix.strip()
                    jersey_match = re.match(r"^(\d+)\s+(.*)$", prefix)
                    if not jersey_match:
                        continue
                    jersey, name = jersey_match.groups()
                    player_rows.append({
                        "team": team_name,
                        "jersey_number": int(jersey),
                        "player_name": name.strip(),
                        "total_distance_m": vals[0],
                        "zone1_m": vals[1],
                        "zone2_m": vals[2],
                        "zone3_m": vals[3],
                        "zone4_m": vals[4],
                        "zone5_m": vals[5],
                        "high_speed_runs_count": vals[6],
                        "sprint_count": vals[7],
                        "top_speed_kmh": vals[8],
                    })

    return player_rows or None


# El PDF trae, además de la página física, ~130 tablas de estadística táctica
# por jugador (pases, ofertas de recepción, acciones defensivas) -- el mismo
# tipo de dato que usan los analistas de video (Wyscout/InStat/Hudl). Vienen
# en el mismo patrón que "Physical Data <Selección>": una celda de texto con
# todas las filas de jugador pegadas, con un número fijo de columnas
# numéricas al final de cada línea (confirmado contando contra el header de
# la tabla vecina, que sí llega bien separado por columna).
_TOKEN_RE = re.compile(r"\d+\s*/\s*\d+|\d+%|\d+")


def _split_prefix_and_tail(line: str, expected_fields: int) -> tuple[str, list[str]] | None:
    matches = list(_TOKEN_RE.finditer(line))
    if len(matches) < expected_fields:
        return None
    tail_matches = matches[-expected_fields:]
    prefix = line[: tail_matches[0].start()].strip()
    return prefix, [m.group() for m in tail_matches]


def _parse_jersey_name(prefix: str) -> tuple[int, str] | None:
    m = re.match(r"^(\d+)\s+(.*)$", prefix.strip())
    if not m:
        return None
    jersey, name = m.groups()
    return int(jersey), name.strip()


def _find_section_cells(tables: list[list[list[str]]], *markers: str) -> list[tuple[str, str]]:
    """Devuelve [(equipo, texto_de_la_celda)] para las celdas cuyo texto
    contenga alguno de los `markers` (probando variantes porque el PDF a
    veces rompe el ligature "ff" -> "\\x00", ej. "Offers" -> "O\\x00ers")."""
    found = []
    for table in tables:
        for cell_row in table:
            for cell in cell_row or []:
                if not cell:
                    continue
                for marker in markers:
                    idx = cell.find(marker)
                    if idx == -1:
                        continue
                    team = cell[idx + len(marker):].split("\n", 1)[0].strip()
                    found.append((team, cell))
                    break
    return found


def _parse_distributions(tables: list[list[list[str]]]) -> dict[tuple[str, int], dict]:
    out: dict[tuple[str, int], dict] = {}
    for team, cell in _find_section_cells(tables, "In Possession - Distributions "):
        for line in _decode_pmsr_font(cell).split("\n"):
            split = _split_prefix_and_tail(line, 14)
            if not split:
                continue
            prefix, tail = split
            parsed_name = _parse_jersey_name(prefix)
            if not parsed_name:
                continue
            jersey, name = parsed_name
            out[(team, jersey)] = {
                "team": team,
                "jersey_number": jersey,
                "player_name": name,
                "passes_attempted": int(tail[0]),
                "passes_completed": int(tail[1]),
                "pass_completion_pct": float(tail[2].rstrip("%")),
                "switches_of_play": int(tail[3]),
                "crosses_attempted": int(tail[4]),
                "crosses_completed": int(tail[5]),
                "line_breaks_attempted": int(tail[6]),
                "line_breaks_completed": int(tail[7]),
                "line_break_completion_pct": float(tail[8].rstrip("%")),
                "ball_progressions": int(tail[9]),
                "take_ons": int(tail[10]),
                "step_ins": int(tail[11]),
                "attempts_at_goal": int(tail[12]),
                "goals": int(tail[13]),
            }
    return out


def _parse_offers_receptions(tables: list[list[list[str]]]) -> dict[tuple[str, int], dict]:
    out: dict[tuple[str, int], dict] = {}
    for team, cell in _find_section_cells(tables, "ers & Receptions "):
        for line in _decode_pmsr_font(cell).split("\n"):
            split = _split_prefix_and_tail(line, 8)
            if not split:
                continue
            prefix, tail = split
            parsed_name = _parse_jersey_name(prefix)
            if not parsed_name:
                continue
            jersey, name = parsed_name
            out[(team, jersey)] = {
                "team": team,
                "jersey_number": jersey,
                "player_name": name,
                "total_offers": int(tail[0]),
                "offers_in_front": int(tail[1]),
                "offers_in_between": int(tail[2]),
                "offers_out_to_in": int(tail[3]),
                "offers_in_to_out": int(tail[4]),
                "offers_in_behind": int(tail[5]),
                "offers_no_movement": int(tail[6]),
                "offers_received": int(tail[7]),
            }
    return out


def _parse_out_of_possession(tables: list[list[list[str]]]) -> dict[tuple[str, int], dict]:
    out: dict[tuple[str, int], dict] = {}
    for team, cell in _find_section_cells(tables, "Out of Possession "):
        for line in _decode_pmsr_font(cell).split("\n"):
            split = _split_prefix_and_tail(line, 14)
            if not split:
                continue
            prefix, tail = split
            parsed_name = _parse_jersey_name(prefix)
            if not parsed_name:
                continue
            jersey, name = parsed_name
            tackles_made, tackles_won = (int(x.strip()) for x in tail[0].split("/"))
            out[(team, jersey)] = {
                "team": team,
                "jersey_number": jersey,
                "player_name": name,
                "tackles_made": tackles_made,
                "tackles_won": tackles_won,
                "blocks": int(tail[1]),
                "interceptions": int(tail[2]),
                "pressing_direct": int(tail[3]),
                "pressing_indirect": int(tail[4]),
                "duels_won_aerial": int(tail[5]),
                "duels_won_physical": int(tail[6]),
                "possession_contests_won": int(tail[7]),
                "clearances": int(tail[8]),
                "loose_ball_receptions": int(tail[9]),
                "pushing_on": int(tail[10]),
                "pushing_on_into_pressing": int(tail[11]),
                "possession_regains": int(tail[12]),
                "possession_interrupted": int(tail[13]),
            }
    return out


def _parse_tactical_metrics(tables: list[list[list[str]]]) -> list[dict]:
    """Combina las 3 secciones (distribución de pases, ofertas de recepción,
    fuera de posesión) en una fila por jugador. Tolerante: si una sección no
    aparece (PDF con estructura distinta), simplemente deja esos campos
    ausentes en vez de descartar la fila entera."""
    distributions = _parse_distributions(tables)
    offers = _parse_offers_receptions(tables)
    out_of_poss = _parse_out_of_possession(tables)

    keys = set(distributions) | set(offers) | set(out_of_poss)
    rows = []
    for key in keys:
        row = dict(distributions.get(key, {}))
        row.update(offers.get(key, {}))
        row.update(out_of_poss.get(key, {}))
        if "team" not in row:
            # la fila solo aparece en offers/out_of_poss (raro, pero no se
            # descarta) -- reconstruir team/jersey desde la key
            row["team"], row["jersey_number"] = key
        rows.append(row)
    return rows


PLAYER_STATS_PATH = OUT_DIR / "physical_player_match_stats.csv"
TEAM_STATS_PATH = OUT_DIR / "physical_match_stats.csv"
TACTICAL_STATS_PATH = OUT_DIR / "tactical_player_match_stats.csv"
MATCHES_PATH = OUT_DIR / "matches_fifa2026.csv"


def _load_cached_player_rows() -> tuple[list[dict], set[int]]:
    """Lee lo que ya se publicó en corridas anteriores (viene del checkout de
    git en CI) para no re-descargar PDFs de partidos ya procesados -- así
    cada corrida programada suma cobertura en vez de arrancar de cero."""
    if not PLAYER_STATS_PATH.exists():
        return [], set()
    with PLAYER_STATS_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    match_ids = {int(r["match_id"]) for r in rows}
    return rows, match_ids


TACTICAL_FIELDS = [
    "match_id", "team", "jersey_number", "player_name",
    "passes_attempted", "passes_completed", "pass_completion_pct",
    "switches_of_play", "crosses_attempted", "crosses_completed",
    "line_breaks_attempted", "line_breaks_completed", "line_break_completion_pct",
    "ball_progressions", "take_ons", "step_ins", "attempts_at_goal", "goals",
    "total_offers", "offers_in_front", "offers_in_between", "offers_out_to_in",
    "offers_in_to_out", "offers_in_behind", "offers_no_movement", "offers_received",
    "tackles_made", "tackles_won", "blocks", "interceptions",
    "pressing_direct", "pressing_indirect", "duels_won_aerial", "duels_won_physical",
    "possession_contests_won", "clearances", "loose_ball_receptions",
    "pushing_on", "pushing_on_into_pressing", "possession_regains", "possession_interrupted",
    "source", "source_url", "retrieved_at",
]


def _load_cached_tactical_rows() -> tuple[list[dict], set[int]]:
    """Idem `_load_cached_player_rows` pero para la estadistica tactica.
    La cobertura tactica se trackea INDEPENDIENTE de la fisica: el parser
    tactico se agrego despues de que la cobertura fisica ya estaba completa,
    asi que hay partidos con datos fisicos cacheados pero sin tacticos."""
    if not TACTICAL_STATS_PATH.exists():
        return [], set()
    with TACTICAL_STATS_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    match_ids = {int(r["match_id"]) for r in rows}
    return rows, match_ids


def _load_cached_matches() -> dict[int, dict]:
    """Idem para matches_fifa2026.csv -- así el resultado/fecha/estadio ya
    resuelto en una corrida anterior no se pierde en las que solo alcanzan a
    cubrir otros partidos."""
    if not MATCHES_PATH.exists():
        return {}
    with MATCHES_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["match_id"] = int(r["match_id"])
    return {r["match_id"]: r for r in rows}


def _pdf_cache_path(url: str) -> Path:
    return PDF_CACHE_DIR / Path(url.split("?", 1)[0]).name


def _load_cached_discovery() -> list[dict]:
    """Fallback offline: si el hub no responde (red caida / bloqueada), se
    reusa el inventario de PDFs de la ultima corrida exitosa, guardado en
    `_discovery_status.json`. Asi el backfill desde PDFs ya cacheados en
    disco funciona incluso sin red."""
    if not DISCOVERY_STATUS_PATH.exists():
        return []
    try:
        status = json.loads(DISCOVERY_STATUS_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return []
    return status.get("pdf_reports_found") or []


def _team_aggregates_from_players(player_rows: list[dict]) -> list[dict]:
    by_match_team: dict[tuple, list[dict]] = {}
    for r in player_rows:
        key = (int(r["match_id"]), r["team"])
        by_match_team.setdefault(key, []).append(r)

    team_rows = []
    for (match_id, team), rows in by_match_team.items():
        total_distance_m = sum(float(r["total_distance_m"]) for r in rows)
        zone4_5_m = sum(float(r["zone4_m"]) + float(r["zone5_m"]) for r in rows)
        zone5_m = sum(float(r["zone5_m"]) for r in rows)
        sprint_count = sum(float(r["sprint_count"]) for r in rows)
        top_speed = max(float(r["top_speed_kmh"]) for r in rows)
        any_row = rows[0]
        team_rows.append({
            "match_id": match_id,
            "team": team,
            "total_distance_km": round(total_distance_m / 1000, 2),
            "high_intensity_distance_m": round(zone4_5_m, 1),
            "sprint_distance_m": round(zone5_m, 1),
            "sprint_count": sprint_count,
            "top_speed_kmh": top_speed,
            "source": any_row["source"],
            "source_url": any_row["source_url"],
            "retrieved_at": any_row["retrieved_at"],
        })
    return team_rows


def scrape() -> list[dict]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    debug: dict = {}
    try:
        reports = discover_pdf_reports(debug=debug)
    except requests.RequestException as exc:
        reports = _load_cached_discovery()
        print(
            f"discover_pdf_reports: hub inaccesible ({exc}) -- usando el inventario "
            f"cacheado de _discovery_status.json ({len(reports)} PDFs)",
            flush=True,
        )
        if not reports:
            raise
    else:
        DISCOVERY_STATUS_PATH.write_text(json.dumps({
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "hub_url": HUB_URL,
            "pages_visited": debug.get("pages_visited", []),
            "pdf_reports_found": reports,
            "count": len(reports),
        }, ensure_ascii=False, indent=2))
        print(f"discover_pdf_reports: {len(reports)} PDFs encontrados (paginas visitadas: {len(debug.get('pages_visited', []))})", flush=True)

    cached_player_rows, cached_match_ids = _load_cached_player_rows()
    cached_tactical_rows, cached_tactical_match_ids = _load_cached_tactical_rows()
    print(
        f"partidos ya cubiertos en corridas anteriores: {len(cached_match_ids)} fisicos, "
        f"{len(cached_tactical_match_ids)} tacticos",
        flush=True,
    )
    matches_by_id = _load_cached_matches()

    new_player_rows: list[dict] = []
    new_tactical_rows: list[dict] = []
    failed: list[dict] = []
    pdf_debug_samples: list[dict] = []
    retrieved_at = datetime.now(timezone.utc).isoformat()

    # Argentina primero: si esta corrida esta acotada por PMSR_LIMIT/
    # PMSR_MAX_SECONDS, que lo que sí se llegue a descargar sea lo más
    # relevante para el proyecto.
    reports_ordered = sorted(
        reports,
        key=lambda r: 0 if "Argentina" in (r["team_a"], r["team_b"]) else 1,
    )

    start_time = time.monotonic()
    downloaded = 0

    for report in reports_ordered:
        if report["match_id"] not in matches_by_id:
            matches_by_id[report["match_id"]] = {
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
            }

        # La cobertura fisica y la tactica se trackean por separado: el
        # parser tactico se agrego cuando la fisica ya estaba completa, asi
        # que "ya tenemos datos fisicos" NO implica "ya tenemos tacticos".
        # Solo se saltea el PDF si ambas coberturas estan completas.
        need_physical = report["match_id"] not in cached_match_ids
        need_tactical = report["match_id"] not in cached_tactical_match_ids
        if not need_physical and not need_tactical:
            continue  # ya lo tenemos completo de corridas anteriores

        pdf_cache_path = _pdf_cache_path(report["url"])
        if pdf_cache_path.exists():
            # re-parseo local: no gasta red, no cuenta para PMSR_LIMIT
            pdf_bytes = pdf_cache_path.read_bytes()
        else:
            if PMSR_LIMIT is not None and downloaded >= PMSR_LIMIT:
                failed.append({"match_number": report["match_number"], "url": report["url"], "error": "no procesado en esta corrida (PMSR_LIMIT)"})
                continue
            if PMSR_MAX_SECONDS is not None and (time.monotonic() - start_time) >= PMSR_MAX_SECONDS:
                failed.append({"match_number": report["match_number"], "url": report["url"], "error": "no procesado en esta corrida (PMSR_MAX_SECONDS)"})
                continue
            try:
                pdf_bytes = _get(report["url"]).content
                downloaded += 1
            except requests.RequestException as exc:
                failed.append({"match_number": report["match_number"], "url": report["url"], "error": str(exc)})
                continue
            PDF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
            pdf_cache_path.write_bytes(pdf_bytes)

        try:
            tables, full_text = _extract_pdf_tables(pdf_bytes)
        except Exception as exc:  # PDF corrupto/formato inesperado -- no debe tumbar todo el pipeline
            failed.append({"match_number": report["match_number"], "url": report["url"], "error": f"error extrayendo PDF: {exc}"})
            continue

        summary = _parse_match_summary(tables)
        if summary:
            matches_by_id[report["match_id"]].update(summary)

        if need_physical:
            parsed = _parse_physical_metrics(tables)
            print(f"  M{report['match_number']} {report['team_a']} v {report['team_b']}: {len(parsed or [])} filas de jugador", flush=True)

            if len(pdf_debug_samples) < PDF_DEBUG_SAMPLE_LIMIT and parsed is None:
                pdf_debug_samples.append({
                    "match_number": report["match_number"],
                    "team_a": report["team_a"],
                    "team_b": report["team_b"],
                    "url": report["url"],
                    "tables": tables,
                    "text": full_text[:40000],
                })

            if parsed is None:
                failed.append({
                    "match_number": report["match_number"],
                    "url": report["url"],
                    "error": "no se encontro 'Physical Data' reconocible en el PDF",
                })
            else:
                for row in parsed:
                    new_player_rows.append({
                        "match_id": report["match_id"],
                        "team": row["team"],
                        "jersey_number": row["jersey_number"],
                        "player_name": row["player_name"],
                        "total_distance_m": row["total_distance_m"],
                        "zone1_m": row["zone1_m"],
                        "zone2_m": row["zone2_m"],
                        "zone3_m": row["zone3_m"],
                        "zone4_m": row["zone4_m"],
                        "zone5_m": row["zone5_m"],
                        "high_speed_runs_count": row["high_speed_runs_count"],
                        "sprint_count": row["sprint_count"],
                        "top_speed_kmh": row["top_speed_kmh"],
                        "source": "fifa_training_centre_pmsr_pdf",
                        "source_url": report["url"],
                        "retrieved_at": retrieved_at,
                    })

        if need_tactical:
            tactical_parsed = _parse_tactical_metrics(tables)
            if not tactical_parsed:
                failed.append({
                    "match_number": report["match_number"],
                    "url": report["url"],
                    "error": "no se encontraron secciones tacticas reconocibles en el PDF",
                })
            for row in tactical_parsed:
                full_row = {field: row.get(field) for field in TACTICAL_FIELDS}
                full_row["match_id"] = report["match_id"]
                full_row["source"] = "fifa_training_centre_pmsr_pdf"
                full_row["source_url"] = report["url"]
                full_row["retrieved_at"] = retrieved_at
                new_tactical_rows.append(full_row)
            print(f"  M{report['match_number']} {report['team_a']} v {report['team_b']}: + {len(tactical_parsed)} filas de estadistica tactica", flush=True)

    if failed:
        FAILED_LOG.write_text(json.dumps(failed, ensure_ascii=False, indent=2))
    if pdf_debug_samples:
        (RAW_DIR / "_pdf_debug_sample.json").write_text(json.dumps(pdf_debug_samples, ensure_ascii=False, indent=2))

    matches_rows = sorted(matches_by_id.values(), key=lambda r: r["match_id"])
    if matches_rows:
        with MATCHES_PATH.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(matches_rows[0].keys()))
            writer.writeheader()
            writer.writerows(matches_rows)

    all_player_rows = cached_player_rows + new_player_rows
    if all_player_rows:
        with PLAYER_STATS_PATH.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(all_player_rows[0].keys()))
            writer.writeheader()
            writer.writerows(all_player_rows)

        team_rows = _team_aggregates_from_players(all_player_rows)
        with TEAM_STATS_PATH.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(team_rows[0].keys()))
            writer.writeheader()
            writer.writerows(team_rows)

    all_tactical_rows = cached_tactical_rows + new_tactical_rows
    if all_tactical_rows:
        with TACTICAL_STATS_PATH.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=TACTICAL_FIELDS)
            writer.writeheader()
            writer.writerows(all_tactical_rows)
        print(f"tactical_player_match_stats.csv: {len(all_tactical_rows)} filas totales", flush=True)

    return new_player_rows


if __name__ == "__main__":
    rows = scrape()
    n_failed = len(json.loads(FAILED_LOG.read_text())) if FAILED_LOG.exists() else 0
    n_cached = len(_load_cached_player_rows()[1])
    print(f"filas de jugador nuevas: {len(rows)} -- partidos con datos fisicos en total: {n_cached} -- pendientes de revision manual: {n_failed}", flush=True)
    if not rows and n_cached == 0:
        print(
            "ADVERTENCIA: no se pudo extraer ninguna fila fisica automáticamente. "
            "Revisar data/raw/fifa_training_centre/_failed.json y "
            "_pdf_debug_sample.json para ajustar _parse_physical_metrics() con la estructura real.",
            file=sys.stderr,
        )
        sys.exit(1)

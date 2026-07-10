"""Orquestador del pipeline completo. Es lo que corre GitHub Actions
(.github/workflows/update-data.yml) y lo que se puede correr en local.

Pasos:
  1. (opcional, --skip-scrape) bajar fuentes externas: openfootball (goles),
     26worldcup (planteles + perfil de seleccion), FIFA Training Centre (fisico)
     y Transfermarkt (bloqueado, fallback)
  2. reconstruir data/raw/statsbomb/_processed desde los JSON crudos
  3. construir el warehouse Parquet (data/warehouse/)
  4. validar contra los esquemas de Pandera
  5. construir los agregados JSON que consume el sitio (site/public/data/)
  6. sincronizar el warehouse a Supabase (best-effort: un fallo del espejo NO
     frena el publish del sitio, pero queda visible como ::error:: en Actions)

Uso:
    python etl/pipeline.py                 # corrida completa (incluye scraping)
    python etl/pipeline.py --skip-scrape    # solo reconstruye desde datos ya bajados
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ETL_DIR = Path(__file__).resolve().parent


def run(step: str, *args: str) -> None:
    print(f"\n=== {step} ===")
    result = subprocess.run([sys.executable, str(ETL_DIR / step), *args], cwd=ETL_DIR)
    if result.returncode != 0:
        print(f"'{step}' termino con error (exit {result.returncode})")
        sys.exit(result.returncode)


def run_optional(step: str, *args: str) -> bool:
    """Corre un paso NO critico para el publish del sitio (hoy: el sync a
    Supabase, que es un espejo). Si falla, NO aborta el pipeline -- asi una
    caida de Supabase no impide commitear los datos frescos ya generados. Pero
    el fallo NO queda silencioso: emite una anotacion ::error:: de GitHub
    Actions (roja y visible en la UI aunque el job termine en verde) para que la
    staleness del espejo se note y se pueda actuar."""
    print(f"\n=== {step} (best-effort) ===")
    result = subprocess.run([sys.executable, str(ETL_DIR / step), *args], cwd=ETL_DIR)
    if result.returncode != 0:
        # ::error:: -> anotacion visible en la corrida de GitHub Actions.
        print(
            f"::error title=Sync opcional fallo::'{step}' termino con error (exit {result.returncode}). "
            "Los datos del sitio se publican igual; el espejo de Supabase puede quedar desactualizado hasta la proxima corrida."
        )
        print(f"AVISO: '{step}' fallo pero el pipeline continua (paso no critico para el sitio).")
        return False
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-scrape", action="store_true", help="no scrapear fuentes externas, solo reconstruir")
    parser.add_argument(
        "--allow-scrape-failures",
        action="store_true",
        help="no abortar el pipeline si un scraper individual falla (igual se valida/publica lo que haya)",
    )
    args = parser.parse_args()

    if not args.skip_scrape:
        # Orden: primero lo que baja de fuentes HTTP directas y confiables
        # (openfootball CC0, 26worldcup) y despues los scrapers mas fragiles
        # (FIFA por PDF, Transfermarkt bloqueado). Todos escriben a data/raw/*/
        # _processed; el warehouse se reconstruye de ahi.
        scrapers = (
            "fetch_openfootball_2026.py",
            "fetch_26worldcup_squads.py",
            "scrape_fifa_training_centre.py",
            "scrape_transfermarkt_squads.py",
        )
        for script in scrapers:
            print(f"\n=== {script} ===")
            result = subprocess.run([sys.executable, str(ETL_DIR / script)], cwd=ETL_DIR)
            if result.returncode != 0 and not args.allow_scrape_failures:
                print(
                    f"'{script}' fallo -- corriendo el resto del pipeline igual con --allow-scrape-failures "
                    "hubiera continuado. Revisar data/raw/*/_failed.* antes de reintentar."
                )
                sys.exit(result.returncode)

    run("build_statsbomb_features.py")
    run("build_warehouse.py")
    run("build_derived_metrics.py")
    run("validate.py")
    run("build_aggregates.py")
    # El sync a Supabase es best-effort: es un espejo, no la fuente del sitio.
    # Si falla, el sitio se publica igual y el fallo queda visible (::error::).
    synced = run_optional("sync_supabase.py")
    print("\npipeline OK" + ("" if synced else " (con aviso: sync a Supabase fallo, ver arriba)"))


if __name__ == "__main__":
    main()

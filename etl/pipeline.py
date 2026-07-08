"""Orquestador del pipeline completo. Es lo que corre GitHub Actions
(.github/workflows/update-data.yml) y lo que se puede correr en local.

Pasos:
  1. (opcional, --skip-scrape) scrapear FIFA Training Centre y Transfermarkt
  2. reconstruir data/raw/statsbomb/_processed desde los JSON crudos
  3. construir el warehouse Parquet (data/warehouse/)
  4. validar contra los esquemas de Pandera
  5. construir los agregados JSON que consume el sitio (site/public/data/)
  6. (opcional) sincronizar el warehouse a Supabase (metricas_mundial)

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
        for script in ("scrape_fifa_training_centre.py", "scrape_transfermarkt_squads.py"):
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
    run("validate.py")
    run("build_aggregates.py")
    run("sync_supabase.py")
    print("\npipeline OK")


if __name__ == "__main__":
    main()

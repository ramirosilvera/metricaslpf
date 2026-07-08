import { readFileSync } from "node:fs";
import path from "node:path";

// process.cwd() es el root del proyecto Astro (site/) tanto en `astro dev`
// como en `astro build` -- a diferencia de import.meta.url, que durante el
// build apunta a un chunk empaquetado en dist/ y no sirve para resolver
// rutas relativas a public/.
const DATA_DIR = path.join(process.cwd(), "public", "data");

export function loadJson<T>(filename: string): T {
  const filePath = path.join(DATA_DIR, filename);
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

export interface MatchRow {
  match_id: number;
  competition: string;
  season: string;
  stage: string;
  group: string;
  match_date: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  stadium: string;
  referee: string;
}

export interface TeamSeasonSummary {
  team: string;
  season: string;
  partidos: number;
  posesion_promedio_proxy: number;
  precision_pases_promedio: number;
  remates_promedio: number;
  remates_al_arco_promedio: number;
  goles_totales: number;
  faltas_promedio: number;
}

export interface BoxplotRow {
  team: string;
  season: string;
  match_id: number;
  possession_share_proxy: number;
}

export interface TimelineRow {
  team: string;
  season: string;
  match_date: string;
  stage: string;
  possession_share_proxy: number;
  pass_accuracy_pct: number;
  shots_total: number;
}

export interface RadarRow {
  team: string;
  season: string;
  posesion_promedio_proxy_percentil: number;
  precision_pases_promedio_percentil: number;
  remates_promedio_percentil: number;
  remates_al_arco_promedio_percentil: number;
}

export interface PlayerMinutesRow {
  team: string;
  player_id: string;
  player_name: string;
  position: string;
  partidos: number;
  minutos_totales: number;
}

export interface SourceStatus {
  provider: string;
  license?: string;
  coverage?: string;
  status: "ok" | "missing" | "pending_first_scrape";
  matches_loaded?: number;
  matches_total?: number;
}

export interface Meta {
  generated_at: string;
  sources: {
    tactical_context: SourceStatus;
    physical_performance: SourceStatus;
    squad_ages: SourceStatus;
  };
}

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
    tactical_2026?: SourceStatus;
    squad_ages: SourceStatus;
    derived_metrics?: SourceStatus;
  };
}

export interface DerivedTeamMetricRow {
  team: string;
  season: string;
  metric: string;
  value: number;
  z_score: number | null;
  percentile: number | null;
}

export interface DerivedTeamStyleRow {
  team: string;
  season: string;
  cluster_id: number;
  cluster_label: string;
}

export interface GoalEventRow {
  match_id: number;
  team: string;
  player_name: string;
  minute: number | null;
  minute_stoppage: number | null;
  minute_display: string;
  own_goal: boolean;
  penalty: boolean;
  source: string;
  source_url: string;
  retrieved_at: string;
  season: string;
  stage: string;
  home_team: string;
  away_team: string;
  match_date: string;
}

export interface GoalScorerRankingRow {
  team: string;
  player_name: string;
  goles: number;
  penales: number;
  partidos_con_gol: number;
}

export interface OwnGoalRow {
  equipo_beneficiado: string;
  player_name: string;
  goles_en_contra: number;
}

export interface TeamProfileRow {
  team: string;
  fifa_code: string;
  group: string;
  fifa_ranking: number | null;
  fifa_ranking_prev: number | null;
  base_camp_city: string | null;
  base_camp_facility: string | null;
  base_camp_country: string | null;
  base_camp_lat: number | null;
  base_camp_lon: number | null;
  source: string;
  retrieved_at: string;
}

export interface SquadPlayerRow {
  team: string;
  player_name: string;
  birth_date: string | null;
  age_years: number | null;
  market_value_eur: number | null;
  position: string | null;
  club: string | null;
  jersey_number: number | null;
  caps: number | null;
  career_goals: number | null;
  captain: boolean;
  wc2026_apps: number | null;
  wc2026_goals: number | null;
  wc2026_yellow: number | null;
  wc2026_red: number | null;
  source: string;
  retrieved_at: string;
}

export interface DerivedPlayerMetricRow {
  player_name: string;
  team: string;
  metric: string;
  value: number;
  z_score: number | null;
  percentile: number | null;
}

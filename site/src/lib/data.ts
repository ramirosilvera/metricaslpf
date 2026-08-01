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
  /** Remates al arco recibidos por partido (lo que hizo el rival) -- dimensión defensiva. */
  remates_al_arco_recibidos_promedio: number;
  goles_totales: number;
  /** Goles recibidos por partido -- dimensión defensiva. */
  goles_recibidos_promedio: number;
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

// Evolución táctica por partido del Mundial 2026 (en curso, se actualiza en cada
// corrida del pipeline). Un punto por partido de cada selección, cronológico.
export interface TimelineTactical2026Row {
  team: string;
  match_id: number;
  match_date: string;
  stage: string;
  rival: string;
  pass_accuracy_pct: number;
  progresiones: number;
  presiones: number;
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

export type ConfidenceLevel = "alta" | "media" | "complementaria" | "derivada";

export interface SourceStatus {
  provider: string;
  provider_url?: string;
  provider_note?: string;
  license?: string;
  license_short?: string;
  license_url?: string;
  coverage?: string;
  coverage_detail?: string | null;
  coverage_pct?: number | null;
  method?: string;
  confidence?: ConfidenceLevel;
  as_of?: string;
  cross_checked_against?: string;
  status: "ok" | "missing" | "pending_first_scrape";
  matches_loaded?: number;
  matches_total?: number | null;
  teams_loaded?: number;
  teams_total?: number | null;
  matches_with_goals?: number;
  matches_played_total?: number | null;
}

export interface CrossVerification {
  description: string;
  source_a: string;
  source_b: string;
  matches_checked: number;
  matches_matched: number;
  discrepancies: number;
}

export interface Meta {
  generated_at: string;
  confidence_legend?: Record<ConfidenceLevel, string>;
  cross_verification?: CrossVerification | null;
  sources: {
    tactical_context: SourceStatus;
    physical_performance: SourceStatus;
    tactical_2026?: SourceStatus;
    squad_ages: SourceStatus;
    team_profile?: SourceStatus;
    standings?: SourceStatus;
    derived_metrics?: SourceStatus;
    goal_events?: SourceStatus;
    player_season_stats?: SourceStatus;
    player_match_stats?: SourceStatus;
  };
}

export interface StandingsRow {
  team: string;
  season: string;
  posicion: number | null;
  puntos: number | null;
  jugados: number | null;
  ganados: number | null;
  empatados: number | null;
  perdidos: number | null;
  goles_favor: number | null;
  goles_contra: number | null;
  diferencia: number | null;
  forma: string | null;
}

export interface PlayerSeasonStatRow {
  player_name: string;
  team: string;
  fotmob_player_id: number | null;
  fotmob_team_id: number | null;
  country_code: string | null;
  metric: string;
  metric_label: string | null;
  value: number | null;
  sub_value: number | null;
  minutes_played: number | null;
  matches_played: number | null;
  rank: number | null;
  source: string;
  source_url: string | null;
  retrieved_at: string;
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
  crest_url: string | null;
  source: string;
  retrieved_at: string;
}

/**
 * Mapa team -> URL de escudo (team_profile.json), para reemplazar el emoji
 * genérico de flags.ts donde ESPN trae el dato real. Se usa en páginas Astro
 * directamente (loadJson corre server-side); los islands React reciben este
 * mismo mapa como prop desde su página .astro padre, ya que no pueden leer
 * archivos en el navegador.
 */
export function loadCrestMap(): Record<string, string> {
  const raw = loadJson<TeamProfileRow[] | { status: string; rows: [] }>("team_profile.json");
  const rows = Array.isArray(raw) ? raw : [];
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r.crest_url) map[r.team] = r.crest_url;
  }
  return map;
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

// Resumen por partido (vista "Partidos"), datos ESPN reales por equipo y
// partido. `remates` es volumen total (NO xG, que no existe en fuentes libres
// para esta liga).
export interface MatchTeamStats {
  posesion_pct: number | null;
  remates: number | null;
  remates_al_arco: number | null;
  pases: number | null;
  precision_pases_pct: number | null;
  faltas: number | null;
  corners: number | null;
  offsides: number | null;
  atajadas: number | null;
}
export interface MatchGoal {
  player: string;
  team: string;
  minute: string;
  penalty?: boolean;
}
export interface MatchSummary {
  match_id: number;
  match_date: string;
  stage: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  home: MatchTeamStats;
  away: MatchTeamStats;
  goleadores: MatchGoal[];
  goles_contra: MatchGoal[];
  destacado: { player: string; team: string; note: string } | null;
  insight: string;
}

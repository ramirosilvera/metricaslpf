-- =============================================================================
-- Métricas Mundial 2026 — esquema Supabase: tablas + RLS + grants
-- =============================================================================
-- Schema-as-code del proyecto Supabase (schema metricas_mundial). Idempotente:
-- se puede correr las veces que haga falta (create ... if not exists / drop
-- policy if exists). El CI lo aplica solo (ver .github/workflows/apply-supabase-
-- migrations.yml); si algún día se resetea el proyecto, esto lo reconstruye.
--
-- Modelo de seguridad: RLS activo en todas las tablas, lectura pública (anon +
-- authenticated) por política SELECT, y escritura solo para service_role (que
-- bypassea RLS y es lo que usa el ETL, ver etl/sync_supabase.py). La clave anon
-- nunca puede escribir.
-- =============================================================================

create schema if not exists metricas_mundial;
grant usage on schema metricas_mundial to anon, authenticated, service_role;

-- ---------- tablas ----------
-- Las claves (PK / UNIQUE) van inline: con `create table if not exists`, en una
-- base ya creada el statement se saltea entero (constraints incluidas).

create table if not exists metricas_mundial.derived_player_metrics (
  player_name text not null,
  team text not null,
  "position" text,
  metric text not null,
  value double precision,
  z_score double precision,
  percentile double precision,
  primary key (player_name, team, metric)
);

create table if not exists metricas_mundial.derived_team_metrics (
  team text not null,
  season text not null,
  metric text not null,
  value double precision,
  z_score double precision,
  percentile double precision,
  primary key (team, season, metric)
);

create table if not exists metricas_mundial.derived_team_style (
  team text not null,
  season text not null,
  cluster_id integer,
  cluster_label text,
  primary key (team, season)
);

create table if not exists metricas_mundial.goal_events (
  id bigint generated always as identity not null,
  match_id bigint not null,
  team text not null,
  player_name text not null,
  minute integer,
  minute_stoppage integer,
  minute_display text,
  own_goal boolean not null default false,
  penalty boolean not null default false,
  source text default 'openfootball'::text,
  source_url text,
  retrieved_at text,
  primary key (id)
);

create table if not exists metricas_mundial.matches (
  match_id bigint not null,
  competition text not null,
  season text not null,
  stage text,
  "group" text,
  match_date text,
  home_team text not null,
  away_team text not null,
  home_score integer,
  away_score integer,
  stadium text,
  referee text,
  primary key (match_id)
);

create table if not exists metricas_mundial.physical_match_stats (
  match_id bigint not null,
  team text not null,
  total_distance_km double precision,
  high_intensity_distance_m double precision,
  sprint_distance_m double precision,
  sprint_count double precision,
  top_speed_kmh double precision,
  source text,
  source_url text,
  retrieved_at text,
  primary key (match_id, team)
);

create table if not exists metricas_mundial.physical_player_match_stats (
  id bigint generated always as identity not null,
  match_id bigint not null,
  team text not null,
  jersey_number integer,
  player_name text not null,
  total_distance_m double precision,
  zone1_m double precision,
  zone2_m double precision,
  zone3_m double precision,
  zone4_m double precision,
  zone5_m double precision,
  high_speed_runs_count double precision,
  sprint_count double precision,
  top_speed_kmh double precision,
  source text,
  source_url text,
  retrieved_at text,
  unique (match_id, team, player_name),
  primary key (id)
);

create table if not exists metricas_mundial.player_match_appearances (
  match_id bigint not null,
  team text not null,
  player_id text not null,
  player_name text not null,
  "position" text,
  is_starter text,
  minutes_played integer not null,
  primary key (match_id, team, player_id)
);

create table if not exists metricas_mundial.squad_market_value (
  team text not null,
  player_name text not null,
  birth_date text,
  age_years numeric,
  market_value_eur bigint,
  club text,
  "position" text,
  source text not null default '26worldcup (Wikipedia)'::text,
  retrieved_at text,
  jersey_number integer,
  caps integer,
  career_goals integer,
  captain boolean,
  wc2026_apps integer,
  wc2026_goals integer,
  wc2026_yellow integer,
  wc2026_red integer,
  primary key (team, player_name)
);

create table if not exists metricas_mundial.tactical_player_match_stats (
  id bigint generated always as identity not null,
  match_id bigint not null,
  team text not null,
  jersey_number integer,
  player_name text not null,
  passes_attempted integer,
  passes_completed integer,
  pass_completion_pct double precision,
  switches_of_play integer,
  crosses_attempted integer,
  crosses_completed integer,
  line_breaks_attempted integer,
  line_breaks_completed integer,
  line_break_completion_pct double precision,
  ball_progressions integer,
  take_ons integer,
  step_ins integer,
  attempts_at_goal integer,
  goals integer,
  total_offers integer,
  offers_in_front integer,
  offers_in_between integer,
  offers_out_to_in integer,
  offers_in_to_out integer,
  offers_in_behind integer,
  offers_no_movement integer,
  offers_received integer,
  tackles_made integer,
  tackles_won integer,
  blocks integer,
  interceptions integer,
  pressing_direct integer,
  pressing_indirect integer,
  duels_won_aerial integer,
  duels_won_physical integer,
  possession_contests_won integer,
  clearances integer,
  loose_ball_receptions integer,
  pushing_on integer,
  pushing_on_into_pressing integer,
  possession_regains integer,
  possession_interrupted integer,
  source text,
  source_url text,
  retrieved_at text,
  unique (match_id, team, jersey_number),
  primary key (id)
);

create table if not exists metricas_mundial.team_match_stats_tactical (
  match_id bigint not null,
  team text not null,
  is_home text,
  possession_share_proxy double precision,
  formation text,
  passes_attempted integer not null default 0,
  passes_completed integer not null default 0,
  pass_accuracy_pct double precision,
  shots_total integer not null default 0,
  shots_on_target integer,
  goals integer,
  fouls_committed integer,
  primary key (match_id, team)
);

create table if not exists metricas_mundial.team_profile (
  team text not null,
  fifa_code text,
  "group" text,
  fifa_ranking integer,
  fifa_ranking_prev integer,
  base_camp_city text,
  base_camp_facility text,
  base_camp_country text,
  base_camp_lat double precision,
  base_camp_lon double precision,
  source text not null default '26worldcup (FIFA public API)'::text,
  retrieved_at text,
  primary key (team)
);

-- ---------- RLS + políticas + grants (patrón uniforme para las 12 tablas) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'derived_player_metrics', 'derived_team_metrics', 'derived_team_style', 'goal_events',
    'matches', 'physical_match_stats', 'physical_player_match_stats', 'player_match_appearances',
    'squad_market_value', 'tactical_player_match_stats', 'team_match_stats_tactical', 'team_profile'
  ] loop
    execute format('alter table metricas_mundial.%I enable row level security', t);
    execute format('drop policy if exists "public read" on metricas_mundial.%I', t);
    execute format('create policy "public read" on metricas_mundial.%I for select to public using (true)', t);
    execute format('grant select on metricas_mundial.%I to anon, authenticated', t);
    execute format('grant select, insert, update, delete on metricas_mundial.%I to service_role', t);
  end loop;
end $$;

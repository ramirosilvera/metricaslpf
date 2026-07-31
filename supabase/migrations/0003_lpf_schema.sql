-- =============================================================================
-- Métricas LPF — ajustes de esquema para la Liga Profesional Argentina
-- =============================================================================
-- La transformación de Mundial 2026 a LPF cambió las fuentes (ESPN + FotMob en
-- vez de FIFA Training Centre/StatsBomb/openfootball/26worldcup): esta
-- migración agrega lo que falta y ajusta lo que cambió de forma, sin tocar las
-- tablas que ya sirven igual (matches, goal_events, team_profile, derived_*).
--
-- No se borran las tablas físicas/tácticas por jugador (physical_match_stats,
-- physical_player_match_stats, tactical_player_match_stats, player_match_
-- appearances): quedan vacías para LPF (ESPN no publica boxscore.players para
-- esta liga y no existe dato físico/GPS gratuito), pero se conservan por si
-- alguna vez se vuelve a sincronizar el warehouse histórico del Mundial.
-- =============================================================================

-- ---------- tabla de posiciones (ESPN) ----------
create table if not exists metricas_mundial.standings (
  team text not null,
  season text not null,
  posicion integer,
  puntos integer,
  jugados integer,
  ganados integer,
  empatados integer,
  perdidos integer,
  goles_favor integer,
  goles_contra integer,
  diferencia integer,
  forma text,
  primary key (team, season)
);

-- ---------- estadística individual de jugadores (FotMob, agregado de temporada) ----------
create table if not exists metricas_mundial.player_season_stats (
  id bigint generated always as identity not null,
  player_name text not null,
  team text not null,
  fotmob_player_id bigint,
  fotmob_team_id bigint,
  country_code text,
  metric text not null,
  metric_label text,
  value double precision,
  sub_value double precision,
  minutes_played double precision,
  matches_played double precision,
  rank integer,
  source text,
  source_url text,
  retrieved_at text,
  primary key (id)
);
-- Índice para las consultas por métrica (RPC get_player_season_stats) y por
-- jugador+equipo (cruces con squad_market_value).
create index if not exists player_season_stats_metric_idx on metricas_mundial.player_season_stats (metric);
create index if not exists player_season_stats_player_idx on metricas_mundial.player_season_stats (team, player_name);

-- ---------- columnas de team_match_stats_tactical que trae ESPN y faltaban ----------
alter table metricas_mundial.team_match_stats_tactical add column if not exists shots_inside_box integer;
alter table metricas_mundial.team_match_stats_tactical add column if not exists shots_outside_box integer;
alter table metricas_mundial.team_match_stats_tactical add column if not exists shots_blocked integer;
alter table metricas_mundial.team_match_stats_tactical add column if not exists corners integer;
alter table metricas_mundial.team_match_stats_tactical add column if not exists offsides integer;
alter table metricas_mundial.team_match_stats_tactical add column if not exists gk_saves integer;
alter table metricas_mundial.team_match_stats_tactical add column if not exists peligrosidad_proxy double precision;

-- ---------- RLS + políticas + grants (mismo patrón que 0001) ----------
do $$
declare t text;
begin
  foreach t in array array['standings', 'player_season_stats'] loop
    execute format('alter table metricas_mundial.%I enable row level security', t);
    execute format('drop policy if exists "public read" on metricas_mundial.%I', t);
    execute format('create policy "public read" on metricas_mundial.%I for select to public using (true)', t);
    execute format('grant select on metricas_mundial.%I to anon, authenticated', t);
    execute format('grant select, insert, update, delete on metricas_mundial.%I to service_role', t);
  end loop;
end $$;

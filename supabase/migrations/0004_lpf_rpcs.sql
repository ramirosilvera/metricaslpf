-- =============================================================================
-- Métricas LPF — RPCs reescritas para la Liga Profesional Argentina
-- =============================================================================
-- Las RPCs originales (0002_rpcs.sql) estaban armadas enteramente sobre datos
-- físicos/GPS y tácticos POR JUGADOR Y PARTIDO (FIFA Training Centre) que no
-- existen para LPF: ESPN no publica boxscore.players para esta liga y no hay
-- fuente gratuita de datos físicos para ninguna liga (ver etl/fetch_espn_lpf.py
-- y etl/fetch_fotmob_lpf.py). Se dropean las que no tienen sustituto real y se
-- reescriben/agregan las que sí -- nunca se inventa un dato para rellenar el
-- hueco de las que se van.
-- =============================================================================

-- ---------- se van: sin sustituto real (dependían de físico o de boxscore por partido) ----------
drop function if exists metricas_mundial.get_player_matches(text, text);
drop function if exists metricas_mundial.get_physical_leaders(text, integer);
drop function if exists metricas_mundial.get_position_leaders(text, text, integer);
drop function if exists metricas_mundial.get_tactical_leaders(text, integer);
drop function if exists metricas_mundial.get_player_ranking(text, integer);
drop function if exists metricas_mundial.get_team_physical_trend(text);

-- ---------- tabla de posiciones (ESPN) ----------
create or replace function metricas_mundial.get_standings(p_team text default null::text)
 returns table(team text, season text, posicion integer, puntos integer, jugados integer, ganados integer, empatados integer, perdidos integer, goles_favor integer, goles_contra integer, diferencia integer)
 language sql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
  select team, season, posicion, puntos, jugados, ganados, empatados, perdidos, goles_favor, goles_contra, diferencia
  from metricas_mundial.standings
  where p_team is null or team = p_team
  order by posicion nulls last;
$function$;

-- ---------- resumen de club: estadística de equipo (ESPN) + tabla + plantel ----------
create or replace function metricas_mundial.get_team_summary(p_team text)
 returns table(team text, partidos_jugados bigint, posesion_promedio_proxy double precision, precision_pases_promedio double precision, remates_promedio double precision, remates_al_arco_promedio double precision, faltas_promedio double precision, edad_promedio numeric, puntos integer, posicion integer)
 language sql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
  select
    p_team as team,
    (select count(distinct match_id) from metricas_mundial.team_match_stats_tactical where team = p_team) as partidos_jugados,
    (select avg(possession_share_proxy) from metricas_mundial.team_match_stats_tactical where team = p_team) as posesion_promedio_proxy,
    (select avg(case when passes_attempted > 0 then passes_completed::float / passes_attempted * 100 else null end)
       from metricas_mundial.team_match_stats_tactical where team = p_team) as precision_pases_promedio,
    (select avg(shots_total)::double precision from metricas_mundial.team_match_stats_tactical where team = p_team) as remates_promedio,
    (select avg(shots_on_target)::double precision from metricas_mundial.team_match_stats_tactical where team = p_team) as remates_al_arco_promedio,
    (select avg(fouls_committed)::double precision from metricas_mundial.team_match_stats_tactical where team = p_team) as faltas_promedio,
    (select avg(age_years) from metricas_mundial.squad_market_value where team = p_team) as edad_promedio,
    (select puntos from metricas_mundial.standings where team = p_team limit 1) as puntos,
    (select posicion from metricas_mundial.standings where team = p_team limit 1) as posicion;
$function$;

-- ---------- perfil de club: tabla + plantel (sin ranking FIFA/campo base, no existen para LPF) ----------
create or replace function metricas_mundial.get_team_profile(p_team text)
 returns table(team text, posicion integer, puntos integer, jugados integer, plantel_promedio_edad numeric, plantel_capitan text, plantel_jugadores bigint)
 language sql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
  select
    p_team as team,
    (select posicion from metricas_mundial.standings where team = p_team limit 1) as posicion,
    (select puntos from metricas_mundial.standings where team = p_team limit 1) as puntos,
    (select jugados from metricas_mundial.standings where team = p_team limit 1) as jugados,
    (select avg(age_years) from metricas_mundial.squad_market_value where team = p_team) as plantel_promedio_edad,
    (select player_name from metricas_mundial.squad_market_value where team = p_team and captain limit 1) as plantel_capitan,
    (select count(*) from metricas_mundial.squad_market_value where team = p_team) as plantel_jugadores;
$function$;

-- ---------- ranking de EQUIPOS por estadística de partido (ESPN), incluye defensa vía self-join ----------
create or replace function metricas_mundial.get_team_tactical_leaders(p_metric text, p_limit integer default 10)
 returns table(team text, value double precision)
 language plpgsql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
begin
  p_limit := least(coalesce(p_limit, 10), 25);
  if p_metric not in (
    'posesion_promedio_proxy', 'precision_pases_promedio', 'remates_promedio', 'remates_al_arco_promedio',
    'remates_al_arco_recibidos_promedio', 'goles_recibidos_promedio', 'faltas_promedio'
  ) then
    raise exception 'metrica no permitida: %', p_metric;
  end if;

  if p_metric = 'posesion_promedio_proxy' then
    return query select t.team, avg(t.possession_share_proxy) as value from metricas_mundial.team_match_stats_tactical t group by t.team order by value desc nulls last limit p_limit;
  elsif p_metric = 'precision_pases_promedio' then
    return query select t.team, (sum(t.passes_completed)::double precision / nullif(sum(t.passes_attempted), 0) * 100) as value from metricas_mundial.team_match_stats_tactical t group by t.team order by value desc nulls last limit p_limit;
  elsif p_metric = 'remates_promedio' then
    return query select t.team, avg(t.shots_total)::double precision as value from metricas_mundial.team_match_stats_tactical t group by t.team order by value desc nulls last limit p_limit;
  elsif p_metric = 'remates_al_arco_promedio' then
    return query select t.team, avg(t.shots_on_target)::double precision as value from metricas_mundial.team_match_stats_tactical t group by t.team order by value desc nulls last limit p_limit;
  elsif p_metric = 'faltas_promedio' then
    return query select t.team, avg(t.fouls_committed)::double precision as value from metricas_mundial.team_match_stats_tactical t group by t.team order by value asc nulls last limit p_limit;
  elsif p_metric = 'remates_al_arco_recibidos_promedio' then
    return query
      with conceded as (
        select a.team, b.shots_on_target as recibidos
        from metricas_mundial.team_match_stats_tactical a
        join metricas_mundial.team_match_stats_tactical b on a.match_id = b.match_id and a.team <> b.team
      )
      select c.team, avg(c.recibidos)::double precision as value from conceded c group by c.team order by value asc nulls last limit p_limit;
  elsif p_metric = 'goles_recibidos_promedio' then
    return query
      with conceded as (
        select a.team, b.goals as recibidos
        from metricas_mundial.team_match_stats_tactical a
        join metricas_mundial.team_match_stats_tactical b on a.match_id = b.match_id and a.team <> b.team
      )
      select c.team, avg(c.recibidos)::double precision as value from conceded c group by c.team order by value asc nulls last limit p_limit;
  end if;
end;
$function$;

-- ---------- evolución de un club partido a partido (ESPN, real -- reemplaza la curva física) ----------
create or replace function metricas_mundial.get_team_match_trend(p_team text)
 returns table(match_date text, stage text, rival text, es_local boolean, posesion_pct double precision, remates integer, remates_al_arco integer, goles integer)
 language sql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
  select
    m.match_date,
    m.stage,
    case when t.team = m.home_team then m.away_team else m.home_team end as rival,
    (t.team = m.home_team) as es_local,
    round((t.possession_share_proxy * 100)::numeric, 1)::double precision as posesion_pct,
    t.shots_total as remates,
    t.shots_on_target as remates_al_arco,
    t.goals as goles
  from metricas_mundial.team_match_stats_tactical t
  join metricas_mundial.matches m on m.match_id = t.match_id
  where t.team = p_team
  order by m.match_date, m.match_id;
$function$;

-- ---------- ranking de JUGADORES por categoría de FotMob (agregado de TEMPORADA) ----------
create or replace function metricas_mundial.get_player_season_stats(p_metric text, p_limit integer default 10)
 returns table(player_name text, team text, metric text, metric_label text, value double precision, minutes_played double precision, matches_played double precision, rank integer)
 language plpgsql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
declare
  lower_is_better boolean;
begin
  p_limit := least(coalesce(p_limit, 10), 25);
  if p_metric not in (
    'goals', 'goal_assist', '_goals_and_goal_assist', 'rating', 'mins_played', 'goals_per_90',
    'expected_goals', 'expected_goals_per_90', 'expected_goalsontarget', 'ontarget_scoring_att',
    'total_scoring_att', 'accurate_pass', 'big_chance_created', 'total_att_assist', 'accurate_long_balls',
    'expected_assists', 'expected_assists_per_90', '_expected_goals_and_expected_assists_per_90',
    'won_contest', 'big_chance_missed', 'penalty_won', 'defensive_contributions', 'total_tackle',
    'interception', 'effective_clearance', 'outfielder_block', 'ball_recovery', 'penalty_conceded',
    'poss_won_att_3rd', 'clean_sheet', '_save_percentage', 'saves', '_goals_prevented', 'goals_conceded',
    'fouls', 'yellow_card', 'red_card'
  ) then
    raise exception 'metrica no permitida: %', p_metric;
  end if;

  lower_is_better := p_metric in ('big_chance_missed', 'penalty_conceded', 'goals_conceded', 'fouls', 'yellow_card', 'red_card');

  if lower_is_better then
    return query
      select p.player_name, p.team, p.metric, p.metric_label, p.value, p.minutes_played, p.matches_played, p.rank
      from metricas_mundial.player_season_stats p
      where p.metric = p_metric and p.value is not null
      order by p.value asc limit p_limit;
  else
    return query
      select p.player_name, p.team, p.metric, p.metric_label, p.value, p.minutes_played, p.matches_played, p.rank
      from metricas_mundial.player_season_stats p
      where p.metric = p_metric and p.value is not null
      order by p.value desc limit p_limit;
  end if;
end;
$function$;

-- ---------- ranking de JUGADORES por categoría de FotMob, DENTRO de una posición ----------
-- Cruza player_season_stats (FotMob) con squad_market_value (ESPN, posición
-- GK/DF/MF/FW) por nombre -- best-effort, misma limitación que el cruce del
-- lado del sitio (site/src/lib/playerPositions.ts): puede no matchear si el
-- nombre difiere mucho entre las dos fuentes.
create or replace function metricas_mundial.get_player_position_leaders(p_position text, p_metric text, p_limit integer default 10)
 returns table(player_name text, team text, "position" text, value double precision)
 language plpgsql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
declare
  lower_is_better boolean;
begin
  if p_position not in ('GK', 'DF', 'MF', 'FW') then
    raise exception 'posicion no permitida: %', p_position;
  end if;
  p_limit := least(coalesce(p_limit, 10), 25);
  if p_metric not in (
    'goals', 'goal_assist', '_goals_and_goal_assist', 'rating', 'mins_played', 'goals_per_90',
    'expected_goals', 'expected_goals_per_90', 'expected_goalsontarget', 'ontarget_scoring_att',
    'total_scoring_att', 'accurate_pass', 'big_chance_created', 'total_att_assist', 'accurate_long_balls',
    'expected_assists', 'expected_assists_per_90', '_expected_goals_and_expected_assists_per_90',
    'won_contest', 'big_chance_missed', 'penalty_won', 'defensive_contributions', 'total_tackle',
    'interception', 'effective_clearance', 'outfielder_block', 'ball_recovery', 'penalty_conceded',
    'poss_won_att_3rd', 'clean_sheet', '_save_percentage', 'saves', '_goals_prevented', 'goals_conceded',
    'fouls', 'yellow_card', 'red_card'
  ) then
    raise exception 'metrica no permitida: %', p_metric;
  end if;
  lower_is_better := p_metric in ('big_chance_missed', 'penalty_conceded', 'goals_conceded', 'fouls', 'yellow_card', 'red_card');

  return query execute format(
    'select ps.player_name, ps.team, sv."position", ps.value
     from metricas_mundial.player_season_stats ps
     join metricas_mundial.squad_market_value sv
       on sv.team = ps.team and lower(sv.player_name) = lower(ps.player_name)
     where sv."position" = %L and ps.metric = %L and ps.value is not null
     order by ps.value %s
     limit %L',
    p_position, p_metric, case when lower_is_better then 'asc' else 'desc' end, p_limit
  );
end;
$function$;

-- ---------- grants de ejecución (solo lectura, para anon/authenticated) ----------
grant execute on function metricas_mundial.get_standings(text) to anon, authenticated;
grant execute on function metricas_mundial.get_team_summary(text) to anon, authenticated;
grant execute on function metricas_mundial.get_team_profile(text) to anon, authenticated;
grant execute on function metricas_mundial.get_team_tactical_leaders(text, integer) to anon, authenticated;
grant execute on function metricas_mundial.get_team_match_trend(text) to anon, authenticated;
grant execute on function metricas_mundial.get_player_season_stats(text, integer) to anon, authenticated;
grant execute on function metricas_mundial.get_player_position_leaders(text, text, integer) to anon, authenticated;

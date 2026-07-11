-- =============================================================================
-- Métricas Mundial 2026 — RPCs de solo lectura (function-calling del asistente)
-- =============================================================================
-- Estas funciones son lo único que el asistente de IA (Cloudflare Worker) puede
-- invocar con la clave anon: son STABLE (solo lectura), tienen search_path fijo,
-- validan/whitelistan sus parámetros y nunca reciben SQL crudo del usuario. El
-- Worker mapea cada herramienta a una de estas RPCs (ver worker/src/index.js).
--
-- Idempotente: create or replace + grant execute (repetible sin efectos).
-- =============================================================================

create or replace function metricas_mundial.get_team_summary(p_team text)
 returns table(team text, partidos_jugados bigint, posesion_promedio_proxy double precision, precision_pases_promedio double precision, remates_promedio double precision, distancia_promedio_km double precision, alta_intensidad_promedio_m double precision, sprints_promedio double precision, velocidad_punta_kmh double precision, edad_promedio numeric, valor_plantel_total_eur numeric)
 language sql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
  select
    p_team as team,
    (select count(distinct match_id) from metricas_mundial.team_match_stats_tactical where team = p_team) as partidos_jugados,
    (select avg(possession_share_proxy) from metricas_mundial.team_match_stats_tactical where team = p_team) as posesion_promedio_proxy,
    (select avg(case when passes_attempted > 0 then passes_completed::float / passes_attempted else null end)
       from metricas_mundial.team_match_stats_tactical where team = p_team) as precision_pases_promedio,
    (select avg(shots_total) from metricas_mundial.team_match_stats_tactical where team = p_team) as remates_promedio,
    (select avg(total_distance_km) from metricas_mundial.physical_match_stats where team = p_team) as distancia_promedio_km,
    (select avg(zone4_m + zone5_m) from metricas_mundial.physical_player_match_stats where team = p_team) as alta_intensidad_promedio_m,
    (select avg(sprint_count) from metricas_mundial.physical_match_stats where team = p_team) as sprints_promedio,
    (select max(top_speed_kmh) from metricas_mundial.physical_match_stats where team = p_team) as velocidad_punta_kmh,
    (select avg(age_years) from metricas_mundial.squad_market_value where team = p_team) as edad_promedio,
    (select sum(market_value_eur) from metricas_mundial.squad_market_value where team = p_team) as valor_plantel_total_eur;
$function$;

create or replace function metricas_mundial.get_team_matches(p_team text)
 returns table(match_id bigint, competition text, season text, stage text, match_date text, home_team text, away_team text, home_score integer, away_score integer)
 language sql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
  select match_id, competition, season, stage, match_date, home_team, away_team, home_score, away_score
  from metricas_mundial.matches
  where home_team = p_team or away_team = p_team
  order by match_date nulls last;
$function$;

create or replace function metricas_mundial.get_player_ranking(p_metric text, p_limit integer default 10)
 returns table(player_name text, team text, value double precision)
 language plpgsql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
begin
  p_limit := least(coalesce(p_limit, 10), 25);
  if p_metric not in ('minutos_jugados', 'distancia_total_km', 'distancia_promedio_km',
                       'alta_intensidad_promedio_m', 'sprints_promedio', 'velocidad_punta_kmh',
                       'edad', 'valor_mercado_eur', 'caps', 'goles_seleccion') then
    raise exception 'metrica no permitida: %', p_metric;
  end if;

  if p_metric = 'minutos_jugados' then
    return query
      select pma.player_name, pma.team, sum(pma.minutes_played)::double precision as value
      from metricas_mundial.player_match_appearances pma
      group by pma.player_name, pma.team
      order by value desc limit p_limit;
  elsif p_metric = 'distancia_total_km' then
    return query
      select ppms.player_name, ppms.team, (sum(ppms.total_distance_m) / 1000.0) as value
      from metricas_mundial.physical_player_match_stats ppms
      group by ppms.player_name, ppms.team
      order by value desc limit p_limit;
  elsif p_metric = 'distancia_promedio_km' then
    return query
      select ppms.player_name, ppms.team, (avg(ppms.total_distance_m) / 1000.0) as value
      from metricas_mundial.physical_player_match_stats ppms
      group by ppms.player_name, ppms.team
      order by value desc limit p_limit;
  elsif p_metric = 'alta_intensidad_promedio_m' then
    return query
      select ppms.player_name, ppms.team, avg(ppms.zone4_m + ppms.zone5_m) as value
      from metricas_mundial.physical_player_match_stats ppms
      group by ppms.player_name, ppms.team
      order by value desc limit p_limit;
  elsif p_metric = 'sprints_promedio' then
    return query
      select ppms.player_name, ppms.team, avg(ppms.sprint_count) as value
      from metricas_mundial.physical_player_match_stats ppms
      group by ppms.player_name, ppms.team
      order by value desc limit p_limit;
  elsif p_metric = 'velocidad_punta_kmh' then
    return query
      select ppms.player_name, ppms.team, max(ppms.top_speed_kmh) as value
      from metricas_mundial.physical_player_match_stats ppms
      group by ppms.player_name, ppms.team
      order by value desc limit p_limit;
  elsif p_metric = 'edad' then
    return query
      select smv.player_name, smv.team, smv.age_years::double precision as value
      from metricas_mundial.squad_market_value smv
      order by value asc limit p_limit;
  elsif p_metric = 'valor_mercado_eur' then
    return query
      select smv.player_name, smv.team, smv.market_value_eur::double precision as value
      from metricas_mundial.squad_market_value smv
      order by value desc limit p_limit;
  elsif p_metric = 'caps' then
    return query
      select smv.player_name, smv.team, smv.caps::double precision as value
      from metricas_mundial.squad_market_value smv
      where smv.caps is not null
      order by value desc limit p_limit;
  elsif p_metric = 'goles_seleccion' then
    return query
      select smv.player_name, smv.team, smv.career_goals::double precision as value
      from metricas_mundial.squad_market_value smv
      where smv.career_goals is not null
      order by value desc limit p_limit;
  end if;
end;
$function$;

create or replace function metricas_mundial.get_physical_leaders(p_metric text, p_limit integer default 10)
 returns table(team text, value double precision)
 language plpgsql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
begin
  p_limit := least(coalesce(p_limit, 10), 25);
  if p_metric not in ('distancia_promedio_km', 'sprints_promedio', 'velocidad_punta_kmh', 'alta_intensidad_promedio_m') then
    raise exception 'metrica no permitida: %', p_metric;
  end if;

  if p_metric = 'distancia_promedio_km' then
    return query
      select pms.team, avg(pms.total_distance_km) as value
      from metricas_mundial.physical_match_stats pms
      group by pms.team order by value desc limit p_limit;
  elsif p_metric = 'sprints_promedio' then
    return query
      select pms.team, avg(pms.sprint_count) as value
      from metricas_mundial.physical_match_stats pms
      group by pms.team order by value desc limit p_limit;
  elsif p_metric = 'velocidad_punta_kmh' then
    return query
      select pms.team, max(pms.top_speed_kmh) as value
      from metricas_mundial.physical_match_stats pms
      group by pms.team order by value desc limit p_limit;
  elsif p_metric = 'alta_intensidad_promedio_m' then
    return query
      select ppms.team, avg(ppms.zone4_m + ppms.zone5_m) as value
      from metricas_mundial.physical_player_match_stats ppms
      group by ppms.team order by value desc limit p_limit;
  end if;
end;
$function$;

create or replace function metricas_mundial.get_tactical_leaders(p_metric text, p_limit integer default 10)
 returns table(player_name text, team text, value double precision)
 language plpgsql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
begin
  p_limit := least(coalesce(p_limit, 10), 25);
  if p_metric not in ('pases_completados', 'precision_pases', 'progresiones', 'tackles_ganados',
                       'intercepciones', 'presion_directa', 'recuperaciones', 'goles') then
    raise exception 'metrica no permitida: %', p_metric;
  end if;

  if p_metric = 'pases_completados' then
    return query
      select t.player_name, t.team, sum(t.passes_completed)::double precision as value
      from metricas_mundial.tactical_player_match_stats t
      group by t.player_name, t.team order by value desc limit p_limit;
  elsif p_metric = 'precision_pases' then
    return query
      select t.player_name, t.team, avg(t.pass_completion_pct) as value
      from metricas_mundial.tactical_player_match_stats t
      where t.passes_attempted >= 10
      group by t.player_name, t.team order by value desc limit p_limit;
  elsif p_metric = 'progresiones' then
    return query
      select t.player_name, t.team, sum(t.ball_progressions)::double precision as value
      from metricas_mundial.tactical_player_match_stats t
      group by t.player_name, t.team order by value desc limit p_limit;
  elsif p_metric = 'tackles_ganados' then
    return query
      select t.player_name, t.team, sum(t.tackles_won)::double precision as value
      from metricas_mundial.tactical_player_match_stats t
      group by t.player_name, t.team order by value desc limit p_limit;
  elsif p_metric = 'intercepciones' then
    return query
      select t.player_name, t.team, sum(t.interceptions)::double precision as value
      from metricas_mundial.tactical_player_match_stats t
      group by t.player_name, t.team order by value desc limit p_limit;
  elsif p_metric = 'presion_directa' then
    return query
      select t.player_name, t.team, sum(t.pressing_direct)::double precision as value
      from metricas_mundial.tactical_player_match_stats t
      group by t.player_name, t.team order by value desc limit p_limit;
  elsif p_metric = 'recuperaciones' then
    return query
      select t.player_name, t.team, sum(t.possession_regains)::double precision as value
      from metricas_mundial.tactical_player_match_stats t
      group by t.player_name, t.team order by value desc limit p_limit;
  elsif p_metric = 'goles' then
    return query
      select t.player_name, t.team, sum(t.goals)::double precision as value
      from metricas_mundial.tactical_player_match_stats t
      group by t.player_name, t.team order by value desc limit p_limit;
  end if;
end;
$function$;

create or replace function metricas_mundial.get_team_tactical_leaders(p_metric text, p_limit integer default 10)
 returns table(team text, value double precision)
 language plpgsql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
declare
  col text;
begin
  p_limit := least(coalesce(p_limit, 10), 25);

  -- Precisión de pase del equipo = completados / intentados SUMADOS sobre todos
  -- sus partidos (más robusto que promediar porcentajes por jugador).
  if p_metric = 'precision_pases_pct' then
    return query
      select t.team,
             (sum(t.passes_completed)::double precision / nullif(sum(t.passes_attempted), 0) * 100) as value
      from metricas_mundial.tactical_player_match_stats t
      group by t.team
      order by value desc nulls last
      limit p_limit;
    return;
  end if;

  -- Métricas de conteo: promedio por partido = suma total / partidos cargados.
  -- El nombre de columna sale de un CASE con lista blanca (no del input crudo),
  -- así format(%I) no abre inyección.
  col := case p_metric
    when 'progresiones_promedio'     then 'ball_progressions'
    when 'presiones_promedio'        then 'pressing_direct'
    when 'recuperaciones_promedio'   then 'possession_regains'
    when 'remates_promedio'          then 'attempts_at_goal'
    when 'tackles_promedio'          then 'tackles_won'
    when 'intercepciones_promedio'   then 'interceptions'
    when 'quiebres_linea_promedio'   then 'line_breaks_completed'
    else null
  end;

  if col is null then
    raise exception 'metrica no permitida: %', p_metric;
  end if;

  return query execute format(
    'select t.team,
            sum(t.%I)::double precision / nullif(count(distinct t.match_id), 0) as value
     from metricas_mundial.tactical_player_match_stats t
     group by t.team
     order by value desc nulls last
     limit %L', col, p_limit);
end;
$function$;

create or replace function metricas_mundial.get_position_leaders(p_position text, p_metric text, p_limit integer default 10)
 returns table(player_name text, team text, value double precision, percentil_posicion double precision)
 language plpgsql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
begin
  if p_position not in ('GK', 'DF', 'MF', 'FW') then
    raise exception 'posicion no permitida: %', p_position;
  end if;
  if p_metric not in ('distancia_promedio_km', 'alta_intensidad_promedio_m', 'sprints_promedio', 'velocidad_punta_kmh') then
    raise exception 'metrica no permitida: %', p_metric;
  end if;

  return query
  with per_player as (
    select
      pp.player_name,
      pp.team,
      case p_metric
        when 'distancia_promedio_km' then avg(pp.total_distance_m) / 1000.0
        when 'alta_intensidad_promedio_m' then avg(pp.zone4_m + pp.zone5_m)
        when 'sprints_promedio' then avg(pp.sprint_count)
        when 'velocidad_punta_kmh' then max(pp.top_speed_kmh)
      end as value
    from metricas_mundial.physical_player_match_stats pp
    join metricas_mundial.squad_market_value sv
      on sv.team = pp.team and sv.jersey_number = pp.jersey_number
    where sv.position = p_position
    group by pp.player_name, pp.team
  ),
  ranked as (
    select
      per_player.player_name,
      per_player.team,
      per_player.value,
      round((percent_rank() over (order by per_player.value) * 100)::numeric, 0)::double precision as percentil_posicion
    from per_player
  )
  select ranked.player_name, ranked.team, ranked.value, ranked.percentil_posicion
  from ranked
  order by ranked.value desc
  limit p_limit;
end;
$function$;

create or replace function metricas_mundial.get_goal_scorers(p_team text default null::text, p_limit integer default 10)
 returns table(player_name text, team text, goles bigint, penales bigint, partidos_con_gol bigint)
 language sql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
  select
    ge.player_name,
    ge.team,
    count(*) as goles,
    count(*) filter (where ge.penalty) as penales,
    count(distinct ge.match_id) as partidos_con_gol
  from metricas_mundial.goal_events ge
  where not ge.own_goal
    and (p_team is null or ge.team = p_team)
  group by ge.player_name, ge.team
  order by goles desc, ge.player_name
  limit least(coalesce(p_limit, 10), 25);
$function$;

create or replace function metricas_mundial.get_team_profile(p_team text)
 returns table(team text, fifa_ranking integer, fifa_ranking_prev integer, group_name text, base_camp_city text, base_camp_facility text, base_camp_country text, plantel_promedio_edad numeric, plantel_capitan text, plantel_caps_promedio numeric)
 language sql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
  select
    tp.team,
    tp.fifa_ranking,
    tp.fifa_ranking_prev,
    tp."group" as group_name,
    tp.base_camp_city,
    tp.base_camp_facility,
    tp.base_camp_country,
    (select avg(smv.age_years) from metricas_mundial.squad_market_value smv where smv.team = tp.team) as plantel_promedio_edad,
    (select smv.player_name from metricas_mundial.squad_market_value smv where smv.team = tp.team and smv.captain limit 1) as plantel_capitan,
    (select avg(smv.caps) from metricas_mundial.squad_market_value smv where smv.team = tp.team) as plantel_caps_promedio
  from metricas_mundial.team_profile tp
  where tp.team = p_team;
$function$;

create or replace function metricas_mundial.get_team_physical_trend(p_team text)
 returns table(match_date text, stage text, rival text, es_local boolean, total_distance_km double precision, high_intensity_distance_m double precision, sprint_count double precision, top_speed_kmh double precision)
 language sql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
  select
    m.match_date,
    m.stage,
    case when p.team = m.home_team then m.away_team else m.home_team end as rival,
    (p.team = m.home_team) as es_local,
    p.total_distance_km,
    p.high_intensity_distance_m,
    p.sprint_count,
    p.top_speed_kmh
  from metricas_mundial.physical_match_stats p
  join metricas_mundial.matches m on m.match_id = p.match_id
  where p.team = p_team and m.season = '2026'
  order by m.match_date, m.match_id;
$function$;

-- Partidos con datos FIFA de un jugador (responde "¿de qué partido salen estos
-- números?" / "¿qué partido jugó X?"). Matchea el nombre por ILIKE (parcial,
-- sin distinguir mayúsculas) y opcionalmente filtra por selección. Devuelve un
-- registro por partido con el resultado y las estadísticas clave de ese partido.
create or replace function metricas_mundial.get_player_matches(p_player text, p_team text default null)
 returns table(
   player_name text, team text, match_id bigint, match_date text, stage text,
   home_team text, away_team text, home_score integer, away_score integer,
   distancia_km double precision, velocidad_punta_kmh double precision,
   remates integer, goles integer, pases_completados integer
 )
 language sql
 stable
 set search_path to 'metricas_mundial', 'pg_catalog'
as $function$
  with appearances as (
    select ppms.player_name, ppms.team, ppms.match_id from metricas_mundial.physical_player_match_stats ppms
    union
    select tpms.player_name, tpms.team, tpms.match_id from metricas_mundial.tactical_player_match_stats tpms
  )
  select
    a.player_name, a.team, m.match_id, m.match_date, m.stage,
    m.home_team, m.away_team, m.home_score, m.away_score,
    round((p.total_distance_m / 1000.0)::numeric, 2)::double precision as distancia_km,
    p.top_speed_kmh as velocidad_punta_kmh,
    t.attempts_at_goal as remates,
    t.goals as goles,
    t.passes_completed as pases_completados
  from appearances a
  join metricas_mundial.matches m on m.match_id = a.match_id
  left join metricas_mundial.physical_player_match_stats p
    on p.match_id = a.match_id and p.player_name = a.player_name and p.team = a.team
  left join metricas_mundial.tactical_player_match_stats t
    on t.match_id = a.match_id and t.player_name = a.player_name and t.team = a.team
  where a.player_name ilike '%' || p_player || '%'
    and (p_team is null or a.team = p_team)
  order by m.match_date nulls last, m.match_id;
$function$;

-- ---------- grants de ejecución (solo lectura, para anon/authenticated) ----------
grant execute on function metricas_mundial.get_player_matches(text, text) to anon, authenticated;
grant execute on function metricas_mundial.get_team_summary(text) to anon, authenticated;
grant execute on function metricas_mundial.get_team_matches(text) to anon, authenticated;
grant execute on function metricas_mundial.get_player_ranking(text, integer) to anon, authenticated;
grant execute on function metricas_mundial.get_physical_leaders(text, integer) to anon, authenticated;
grant execute on function metricas_mundial.get_tactical_leaders(text, integer) to anon, authenticated;
grant execute on function metricas_mundial.get_team_tactical_leaders(text, integer) to anon, authenticated;
grant execute on function metricas_mundial.get_position_leaders(text, text, integer) to anon, authenticated;
grant execute on function metricas_mundial.get_goal_scorers(text, integer) to anon, authenticated;
grant execute on function metricas_mundial.get_team_profile(text) to anon, authenticated;
grant execute on function metricas_mundial.get_team_physical_trend(text) to anon, authenticated;

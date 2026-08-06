// =============================================================================
// "Fuerza" de club — ÚNICA fuente del índice de rendimiento de equipo,
// compartida por Comparar (RadarCompare.tsx) y Predicción (prediction.ts).
// -----------------------------------------------------------------------------
// Antes cada página calculaba su propio número: Comparar mostraba 5 ejes
// crudos (posesión, precisión, remates, remates al arco, faltas) sin
// combinarlos, y Predicción combinaba un subconjunto DISTINTO de métricas
// (agrupadas distinto, con pesos, más el índice individual de los jugadores)
// en un solo "Fuerza". Un mismo club podía mostrar "Remates: 73" en Comparar
// y "Ofensivo: 78" en Predicción para lo que a simple vista parece lo mismo
// -- números parecidos pero no iguales, sin ninguna explicación de por qué
// difieren. Se resuelve como ya se resolvió del lado de jugadores: un único
// cálculo, reusado en cualquier pantalla que muestre "cómo rinde este club"
// (ver playerCategories.ts::categoryWeight, mismo principio).
//
//   · ofensivo   (30%): remates y remates al arco por partido (ESPN)
//   · control    (20%): posesión-proxy y precisión de pase (ESPN)
//   · defensivo  (25%): remates al arco RECIBIDOS y goles RECIBIDOS por
//     partido -- lo que le hizo el rival en el mismo partido (ver
//     build_aggregates.py). Antes esto no se veía en NINGÚN lado de
//     Comparar -- comparar dos clubes sin ver qué conceden es sólo media
//     comparación.
//   · individual (25%): promedio del índice GLOBAL (estilo EA SPORTS FC,
//     mismo criterio que el resto del sitio) de los 11 mejores jugadores
//     "ranked" del plantel por posición. Tampoco se veía en Comparar --
//     un plantel con jerarquía individual real (aunque su equipo rinda
//     parejo) quedaba invisible en la comparación club a club.
//
// "Faltas" (disciplina) NO integra la Fuerza a propósito -- correlaciona con
// estilo de juego (un equipo que presiona alto comete más), no con calidad;
// se muestra aparte, como dato de contexto, igual que "big_chance_missed" en
// el lado de jugadores.
// =============================================================================

import { makeIndexer, isLowerBetter, buildIndexers } from "./normalize";
import { computeGlobalIndex } from "./globalIndex";
import { PLAYER_METRIC_LABELS, PLAYER_RADAR_ORDER } from "./playerMetrics";
import { sampleTier } from "./playerSampleGate";

// Pesos de la Fuerza (suman 1). La jerarquía individual y el juego ofensivo
// pesan más; el control de la pelota y lo defensivo completan el cuadro.
export const CLUB_STRENGTH_WEIGHTS = { ofensivo: 0.3, control: 0.2, defensivo: 0.25, individual: 0.25 };

export const OFF_KEYS = ["remates_promedio", "remates_al_arco_promedio"];
export const CONTROL_KEYS = ["posesion_promedio_proxy", "precision_pases_promedio"];
export const DEF_KEYS = ["remates_al_arco_recibidos_promedio", "goles_recibidos_promedio"];

export interface TeamStrength {
  team: string;
  ofensivo: number;
  control: number;
  defensivo: number;
  individual: number;
  fuerza: number;
  topPlayer: string | null; // mejor jugador por índice global (para la narrativa)
}

type Row = Record<string, unknown>;

function avgIdx(indexers: Record<string, (v: number) => number>, row: Row | undefined, keys: string[]): number {
  if (!row) return 0;
  const vals = keys.map((k) => indexers[k]?.(Number(row[k]))).filter((v) => Number.isFinite(v)) as number[];
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

/**
 * Fuerza 0-100 de cada club de `teamRows` (team_season_summary.json),
 * combinando estadística de equipo (ESPN) + índice GLOBAL de los mejores 11
 * jugadores "ranked" del plantel (FotMob) -- mismo cálculo para Comparar y
 * Predicción, para que nunca puedan divergir en silencio.
 */
export function computeTeamStrengths(
  teamRows: Row[],
  playerRows: { player_name: string; team: string; metric: string; value: number | null }[],
  positions: Record<string, string>,
): Map<string, TeamStrength> {
  // Indexadores por métrica de EQUIPO sobre los 30 clubes. Las métricas
  // "conceded" (menos es mejor) se detectan vía isLowerBetter -- si no, un
  // club que recibe más goles rankearía como mejor defensor.
  const teamIndexers: Record<string, (v: number) => number> = {};
  for (const k of [...OFF_KEYS, ...CONTROL_KEYS, ...DEF_KEYS]) {
    teamIndexers[k] = makeIndexer(teamRows.map((r) => Number(r[k])).filter(Number.isFinite), isLowerBetter(k));
  }

  // Indexadores por métrica de JUGADOR sobre todos los medidos (para el índice global).
  const { indexers: playerIndexers, metricsWithData } = buildIndexers(playerRows, PLAYER_RADAR_ORDER);

  // Índice global (normalizado dentro de cada posición, ver globalIndex.ts)
  // por jugador -> mejores 11 por equipo. Mismo gate de muestra mínima que el
  // ranking de jugadores (ver playerSampleGate.ts): un jugador con pocos
  // minutos no debería mover la "Fuerza" estimada de su equipo.
  const byPlayer = new Map<
    string,
    {
      team: string;
      player: string;
      position: string | null;
      factors: { metric: string; idx: number }[];
      matchesPlayed: number | null;
      minsPlayed: number | null;
    }
  >();
  for (const r of playerRows) {
    if (!PLAYER_METRIC_LABELS[r.metric] || r.value == null) continue;
    const key = `${r.team}|${r.player_name}`;
    let e = byPlayer.get(key);
    if (!e) {
      e = {
        team: r.team,
        player: r.player_name,
        position: positions[key] ?? null,
        factors: [],
        matchesPlayed: null,
        minsPlayed: null,
      };
      byPlayer.set(key, e);
    }
    if (r.metric === "matches_played") e.matchesPlayed = r.value;
    if (r.metric === "mins_played") e.minsPlayed = r.value;
    e.factors.push({ metric: r.metric, idx: playerIndexers[r.metric](r.value) });
  }
  const globals = computeGlobalIndex(
    [...byPlayer.entries()].map(([key, e]) => ({
      key,
      position: e.position,
      factors: e.factors,
      matchesPlayed: e.matchesPlayed,
      minsPlayed: e.minsPlayed,
    })),
    playerIndexers,
    metricsWithData,
  );
  const teamPlayers = new Map<string, { player: string; position: string | null; global: number }[]>();
  for (const [key, e] of byPlayer) {
    if (sampleTier(e.matchesPlayed, e.minsPlayed) !== "ranked") continue;
    const g = globals.get(key);
    if (g == null) continue;
    (teamPlayers.get(e.team) ?? teamPlayers.set(e.team, []).get(e.team)!).push({
      player: e.player,
      position: e.position,
      global: g,
    });
  }

  const teamByName = new Map(teamRows.map((r) => [String(r.team), r]));
  const W = CLUB_STRENGTH_WEIGHTS;

  const strengths = new Map<string, TeamStrength>();
  for (const team of teamByName.keys()) {
    const t = teamByName.get(team);
    const players = (teamPlayers.get(team) ?? []).sort((a, b) => b.global - a.global);
    // Un 11 real tiene UN arquero. Sin este tope, el mejor 11 podía incluir
    // dos o más (el GLOBAL ya no favorece sistemáticamente a los arqueros
    // tras normalizar dentro de cada posición, pero seguía siendo posible
    // que dos arqueros de un plantel entraran los dos entre los 11 mejores).
    const bestGk = players.find((p) => p.position === "GK");
    const outfield = players.filter((p) => p.position !== "GK");
    const top11 = bestGk ? [bestGk, ...outfield.slice(0, 10)] : outfield.slice(0, 11);
    const individual = top11.length ? Math.round(top11.reduce((s, x) => s + x.global, 0) / top11.length) : 50;

    const ofensivo = avgIdx(teamIndexers, t, OFF_KEYS);
    const control = avgIdx(teamIndexers, t, CONTROL_KEYS);
    const defensivo = avgIdx(teamIndexers, t, DEF_KEYS);
    const fuerza = Math.round(W.ofensivo * ofensivo + W.control * control + W.defensivo * defensivo + W.individual * individual);
    strengths.set(team, {
      team,
      ofensivo: Math.round(ofensivo),
      control: Math.round(control),
      defensivo: Math.round(defensivo),
      individual,
      fuerza,
      topPlayer: players[0]?.player ?? null,
    });
  }

  return strengths;
}

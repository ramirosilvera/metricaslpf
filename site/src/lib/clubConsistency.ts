// Cruce club-jugador: ¿el rendimiento individual agregado de un club (índice
// GLOBAL de sus jugadores) es consistente con lo que ese club efectivamente
// rinde en la tabla? Reutiliza EXACTAMENTE la misma lógica de GLOBAL que el
// ranking de jugadores (buildIndexers/positionWeightedGlobal/sampleTier) --
// nunca se reimplementa aparte, para no arriesgar que los dos números diverjan.
//
// Corre en el build de Astro (frontmatter, server-side), no en el navegador
// -- es exactamente el tipo de join que el proyecto evita hacer en cliente.
//
// Nota de metodología: la tabla de LA LIGA en vivo (standings.json) puede
// tener muy pocos partidos jugados al arrancar un torneo (Apertura/Clausura,
// no una liga de 38 fechas) -- comparar contra eso da una correlación cero
// por pura falta de muestra, no porque no haya relación real. Por eso este
// módulo NO usa standings.json: recalcula la tabla directamente de
// matches.json para CADA torneo/stage disputado y elige como referencia el
// más reciente que ya tenga una cantidad razonable de partidos por equipo
// (MIN_MATCHES_FOR_REFERENCE). Si ninguno la alcanza todavía, se usa el que
// más partidos tenga IGUAL, pero marcado `complete: false` -- la página debe
// avisarlo, nunca mostrarlo como si fuera una tabla cerrada.

import type { MatchRow, DerivedPlayerMetricRow } from "./data";
import { buildIndexers } from "./normalize";
import { computeGlobalIndex } from "./globalIndex";
import { sampleTier } from "./playerSampleGate";
import { PLAYER_METRIC_LABELS, PLAYER_RADAR_ORDER } from "./playerMetrics";
import { TEAM_ALIAS_FOTMOB_TO_ESPN } from "./playerPositions";

const MIN_MATCHES_FOR_REFERENCE = 10;

export interface ClubTableRow {
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export interface ReferenceTable {
  stage: string;
  complete: boolean;
  minMatchesPerTeam: number;
  rows: ClubTableRow[];
}

function tableFor(stageMatches: MatchRow[]): ClubTableRow[] {
  const byTeam = new Map<string, ClubTableRow>();
  const get = (team: string) => {
    let e = byTeam.get(team);
    if (!e) {
      e = { team, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0 };
      byTeam.set(team, e);
    }
    return e;
  };
  for (const m of stageMatches) {
    const home = get(m.home_team);
    const away = get(m.away_team);
    home.played++;
    away.played++;
    home.gf += m.home_score;
    home.ga += m.away_score;
    away.gf += m.away_score;
    away.ga += m.home_score;
    if (m.home_score > m.away_score) {
      home.wins++;
      away.losses++;
      home.points += 3;
    } else if (m.home_score < m.away_score) {
      away.wins++;
      home.losses++;
      away.points += 3;
    } else {
      home.draws++;
      away.draws++;
      home.points += 1;
      away.points += 1;
    }
  }
  for (const e of byTeam.values()) e.gd = e.gf - e.ga;
  return [...byTeam.values()].sort((a, b) => b.points - a.points || b.gd - a.gd);
}

export function computeReferenceTable(matches: MatchRow[]): ReferenceTable | null {
  const played = matches.filter((m) => m.home_score != null && m.away_score != null && m.stage);
  if (played.length === 0) return null;

  const byStage = new Map<string, MatchRow[]>();
  for (const m of played) {
    const list = byStage.get(m.stage) ?? [];
    list.push(m);
    byStage.set(m.stage, list);
  }

  // Entre los stages que ya alcanzan el mínimo de partidos por equipo,
  // preferimos el que tiene MÁS partidos jugados en total (el torneo
  // completo más reciente, no uno recién arrancado).
  let best: { stage: string; matches: MatchRow[] } | null = null;
  for (const [stage, stageMatches] of byStage) {
    const rows = tableFor(stageMatches);
    const minPlayed = Math.min(...rows.map((r) => r.played));
    if (minPlayed >= MIN_MATCHES_FOR_REFERENCE && (!best || stageMatches.length > best.matches.length)) {
      best = { stage, matches: stageMatches };
    }
  }
  if (best) {
    const rows = tableFor(best.matches);
    return { stage: best.stage, complete: true, minMatchesPerTeam: Math.min(...rows.map((r) => r.played)), rows };
  }

  // Ninguno alcanza el mínimo todavía -- usar el de más partidos igual, pero
  // marcado incompleto para que la página lo avise en vez de mostrar una
  // "consistencia" calculada sobre 1-2 fechas.
  let fallbackStage = "";
  let fallbackCount = -1;
  for (const [stage, stageMatches] of byStage) {
    if (stageMatches.length > fallbackCount) {
      fallbackCount = stageMatches.length;
      fallbackStage = stage;
    }
  }
  const rows = tableFor(byStage.get(fallbackStage)!);
  return { stage: fallbackStage, complete: false, minMatchesPerTeam: Math.min(...rows.map((r) => r.played)), rows };
}

export interface ClubConsistencyRow {
  team: string;
  points: number;
  gd: number;
  played: number;
  /** Mediana del índice GLOBAL entre los jugadores "ranked" (muestra suficiente) del club. */
  medianGlobal: number | null;
  nRanked: number;
  pointsZ: number;
  globalZ: number | null;
  /** globalZ - pointsZ: positivo = el rendimiento individual agregado supera lo que rinde el club en la tabla; negativo = al revés. */
  gap: number | null;
}

function zscoreFn(vals: number[]): (v: number) => number {
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  const sd = Math.sqrt(variance);
  return (v: number) => (sd > 0 ? (v - mean) / sd : 0);
}

function median(vals: number[]): number {
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Mediana de GLOBAL (sólo jugadores tier "ranked", ver playerSampleGate.ts)
 * por club de la tabla de referencia, más el gap contra el rendimiento real.
 * `positions` es el mismo mapa `${team FotMob}|${player}` -> posición que
 * usa el resto del sitio (lib/playerPositions.ts).
 */
export function computeClubConsistency(
  playerRows: DerivedPlayerMetricRow[],
  positions: Record<string, string>,
  referenceRows: ClubTableRow[],
): ClubConsistencyRow[] {
  const { indexers, metricsWithData } = buildIndexers(playerRows, PLAYER_RADAR_ORDER);

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
      e = { team: r.team, player: r.player_name, position: positions[key] ?? null, factors: [], matchesPlayed: null, minsPlayed: null };
      byPlayer.set(key, e);
    }
    if (r.metric === "matches_played") e.matchesPlayed = r.value;
    if (r.metric === "mins_played") e.minsPlayed = r.value;
    e.factors.push({ metric: r.metric, idx: indexers[r.metric](r.value) });
  }

  // GLOBAL normalizado dentro de cada posición (ver globalIndex.ts) -- clave
  // para que la mediana por club no quede sesgada por cuántos arqueros le
  // tocó calificar a cada plantel.
  const globals = computeGlobalIndex(
    [...byPlayer.entries()].map(([key, e]) => ({
      key,
      position: e.position,
      factors: e.factors,
      matchesPlayed: e.matchesPlayed,
      minsPlayed: e.minsPlayed,
    })),
    indexers,
    metricsWithData,
  );

  // Las métricas de jugador vienen con el nombre de club de FotMob -- se
  // pasan al nombre de ESPN (el que usan matches/standings/squads) con el
  // mismo alias que arregla el cruce de posición (ver playerPositions.ts).
  const globalsByEspnTeam = new Map<string, number[]>();
  for (const [key, e] of byPlayer) {
    if (sampleTier(e.matchesPlayed, e.minsPlayed) !== "ranked") continue;
    const g = globals.get(key);
    if (g == null) continue;
    const espnTeam = TEAM_ALIAS_FOTMOB_TO_ESPN[e.team] ?? e.team;
    const list = globalsByEspnTeam.get(espnTeam);
    if (list) list.push(g);
    else globalsByEspnTeam.set(espnTeam, [g]);
  }

  const pointsZ = zscoreFn(referenceRows.map((r) => r.points));
  const medianByTeam = new Map<string, number>();
  for (const [team, vals] of globalsByEspnTeam) medianByTeam.set(team, median(vals));
  const globalVals = referenceRows.map((r) => medianByTeam.get(r.team)).filter((v): v is number => v != null);
  const globalZ = globalVals.length > 1 ? zscoreFn(globalVals) : null;

  return referenceRows.map((r) => {
    const vals = globalsByEspnTeam.get(r.team) ?? [];
    const med = vals.length ? median(vals) : null;
    const gz = med != null && globalZ ? globalZ(med) : null;
    const pz = pointsZ(r.points);
    return {
      team: r.team,
      points: r.points,
      gd: r.gd,
      played: r.played,
      medianGlobal: med != null ? Math.round(med) : null,
      nRanked: vals.length,
      pointsZ: pz,
      globalZ: gz,
      gap: gz != null ? gz - pz : null,
    };
  });
}

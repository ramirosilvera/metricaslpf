// Índice GLOBAL ajustado por posición (estilo EA SPORTS FC).
// ---------------------------------------------------------------------------
// Revisado tras dos auditorías de criterio futbolístico (ver /metodologia/):
//
// Ronda 1 (ya aplicada): un promedio plano de todos los factores cargados
// premiaba el VOLUMEN de actividad sobre la calidad, y colaba métricas de
// conteo crudo censuradas en cero. Se resolvió con denominador fijo por
// posición + imputación de 0 vía el indexador real de cada métrica + sin
// fallback de promedio plano.
//
// Ronda 2 (esta): el número que salía de la ronda 1 NO era comparable ENTRE
// posiciones -- cada posición se indexa contra su propia población de
// referencia (29 arqueros de rango angosto vs. 200-400 jugadores de campo
// muy sesgados a la derecha), así que un arquero promedio quedaba con GLOBAL
// más alto que un delantero top sólo por la forma de la distribución de su
// posición, no por ser mejor jugador. Verificado con datos reales: 47% del
// top 30 de la liga eran arqueros; en 14 de 30 clubes el arquero figuraba
// como "el mejor del club" por delante de sus delanteros/mediocampistas.
//
// La solución (`computeGlobalIndex`) agrega un segundo paso: el número crudo
// ponderado (`rawWeightedGlobal`, ronda 1) se re-expresa como el mismo
// estiramiento [40,100] que ya se usa para CADA factor individual
// (`makeIndexer` en normalize.ts), pero calibrado sobre la distribución de
// esa MISMA posición (sólo jugadores con muestra suficiente, ver
// playerSampleGate.ts). Así un 70 de un arquero y un 70 de un delantero
// significan lo mismo: mismo percentil relativo dentro de su propia
// posición. Esto requiere el pool COMPLETO de jugadores (no uno solo) --
// por eso `computeGlobalIndex` recibe la lista entera y no un jugador
// suelto como la vieja `positionWeightedGlobal`.

import { makeIndexer } from "./normalize";
import { sampleTier, MIN_MATCHES_QUALIFIED, type SampleTier } from "./playerSampleGate";

export type Position = "GK" | "DF" | "MF" | "FW";
const POSITIONS: Position[] = ["GK", "DF", "MF", "FW"];

// Peso 0..5 de cada factor por posición (cada tabla suma 20.00 -- denominador
// fijo, comparable entre jugadores de la misma posición). Sólo entran
// métricas per-90 o ratios; los totales crudos de temporada (goals,
// expected_goals, big_chance_created, etc.) quedan fuera del GLOBAL a
// propósito -- premian minutos jugados, no rendimiento -- y se muestran sólo
// en la ficha del jugador. big_chance_missed, red_card, penalty_won y
// penalty_conceded tampoco puntúan: son eventos rarísimos (rango de liga
// 1-2) o, en el caso de ocasiones falladas, correlacionan positivo con xG
// (+0.78) -- es señal de exposición ofensiva, no un defecto a penalizar.
export const POSITION_WEIGHTS: Record<Position, Record<string, number>> = {
  FW: {
    goals_per_90: 3.5,
    _expected_goals_and_expected_assists_per_90: 3,
    expected_goals_per_90: 2,
    rating: 2,
    ontarget_scoring_att: 1.5,
    won_contest: 1.5,
    expected_assists_per_90: 1.25,
    big_chance_created_per_90: 1,
    poss_won_att_3rd: 1,
    total_att_assist_per_90: 0.75,
    goal_assist_per_90: 0.75,
    total_scoring_att: 0.5,
    accurate_pass: 0.5,
    defensive_contributions: 0.5,
    yellow_card_per_90: 0.25, // [menos es mejor]
  },
  MF: {
    _expected_goals_and_expected_assists_per_90: 3,
    expected_assists_per_90: 2,
    total_att_assist_per_90: 2,
    rating: 2,
    accurate_pass: 1.5,
    defensive_contributions: 1.5,
    big_chance_created_per_90: 1.25,
    goal_assist_per_90: 1,
    goals_per_90: 1,
    won_contest: 1,
    ball_recovery: 1,
    total_tackle: 0.75,
    interception: 0.75,
    poss_won_att_3rd: 0.5,
    yellow_card_per_90: 0.5, // [menos es mejor]
    accurate_long_balls: 0.25,
  },
  DF: {
    total_tackle: 2.5,
    interception: 2.5,
    defensive_contributions: 2.5,
    rating: 2,
    ball_recovery: 1.5,
    accurate_pass: 1.5,
    effective_clearance: 1.25,
    accurate_long_balls: 1.25,
    outfielder_block: 1,
    poss_won_att_3rd: 0.75,
    expected_assists_per_90: 0.75,
    won_contest: 0.5,
    total_att_assist_per_90: 0.5,
    _expected_goals_and_expected_assists_per_90: 0.5,
    fouls: 0.5, // [menos es mejor]
    yellow_card_per_90: 0.5, // [menos es mejor]
  },
  GK: {
    _goals_prevented_per_90: 5,
    _save_percentage: 4,
    rating: 4,
    accurate_pass: 2,
    saves: 2,
    clean_sheet_ratio: 1.5,
    goals_conceded: 1.5, // [menos es mejor]
  },
};

// Bajo esta cobertura del peso total de la tabla (medida en si CADA métrica
// tiene al menos un dato en TODO el dataset, no por jugador -- eso se imputa
// a 0 más abajo) no se emite GLOBAL: significa que una fuente entera de datos
// falta (ej. la categoría dejó de publicarse), no que el jugador no anotó.
// Esta misma cobertura mínima es también el tope duro de cuánto puede faltar
// de las métricas DESCONOCIDAS (ver CERO_IMPUTABLE) sin que se deje de emitir
// GLOBAL -- ej. si a un jugador le falta `rating` (2/20 = 10% del peso en
// campo, 4/20 = 20% en arqueros), el GLOBAL se recalcula sobre el resto; si
// faltara más del 15%, no hay GLOBAL en vez de una cifra fabricada.
const MIN_COVERAGE = 0.85;

// Métricas cuya ausencia dentro de la población calificada (>=11 partidos)
// significa CERO real -- listas de FotMob censuradas en 0 (arrancan en 1) o
// cuyo mínimo observado en toda la liga es ~0 -- se imputan pasando 0 por el
// indexador real de la métrica. Todo lo que NO está acá (rating, accurate_pass,
// ball_recovery, saves, goals_conceded, _save_percentage, _goals_prevented...)
// tiene un mínimo observado lejos de 0: su ausencia significa "no medido", así
// que NUNCA se imputa -- se excluye del promedio (numerador Y denominador),
// con el tope de MIN_COVERAGE arriba como única salvaguarda. Antes de este fix,
// CUALQUIER métrica ausente (incluido rating) se imputaba a indexers(0) = piso
// 40, como si el jugador hubiese rendido pésimo en algo que la fuente
// simplemente no publicó -- afectaba a 38 jugadores calificados (9 "ranked").
export const CERO_IMPUTABLE: ReadonlySet<string> = new Set([
  "goals", "goal_assist", "total_att_assist", "big_chance_created", "yellow_card", "clean_sheet",
  "total_tackle", "fouls", "won_contest", "expected_goals_per_90", "expected_assists_per_90",
  "_expected_goals_and_expected_assists_per_90", "goals_per_90", "interception", "effective_clearance",
  "outfielder_block", "poss_won_att_3rd", "ontarget_scoring_att", "total_scoring_att", "accurate_long_balls",
  "defensive_contributions", "expected_goals", "expected_assists", "expected_goalsontarget",
  "goal_assist_per_90", "big_chance_created_per_90", "total_att_assist_per_90", "yellow_card_per_90",
  "clean_sheet_ratio",
]);

export function isFieldPosition(position?: string | null): boolean {
  return position === "DF" || position === "MF" || position === "FW";
}

function isPosition(position: string | null | undefined): position is Position {
  return position === "GK" || position === "DF" || position === "MF" || position === "FW";
}

/**
 * Global ponderado CRUDO (sin normalizar entre posiciones) a partir de los
 * índices por factor del jugador. Denominador SIEMPRE fijo (suma de pesos de
 * la tabla de la posición): un factor de la tabla que el jugador no tiene
 * cargado se imputa pasando el valor crudo 0 por el indexador real de esa
 * métrica. Uso interno de `computeGlobalIndex` -- no exportar/usar
 * directamente para mostrar un número (no es comparable entre posiciones,
 * ver comentario de cabecera).
 */
function rawWeightedGlobal(
  factors: { metric: string; idx: number }[],
  position: Position,
  indexers: Record<string, (v: number) => number>,
  metricsWithData: ReadonlySet<string>,
): number | null {
  const w = POSITION_WEIGHTS[position];
  const byMetric = new Map(factors.map((f) => [f.metric, f.idx]));
  let num = 0;
  let totalApplicable = 0; // peso de métricas con dato en TODO el dataset (gate de cobertura)
  let covered = 0; // peso efectivamente cubierto para este jugador -- es el denominador real
  for (const [metric, wt] of Object.entries(w)) {
    if (!metricsWithData.has(metric)) continue; // la métrica no existe en todo el dataset -- no cuenta ni en el gate
    totalApplicable += wt;
    let idx = byMetric.get(metric);
    if (idx == null && CERO_IMPUTABLE.has(metric)) idx = indexers[metric]?.(0);
    // si sigue sin valor (métrica "desconocida" ausente, ej. rating), NO se
    // imputa -- se excluye del promedio, no se fabrica un piso.
    if (idx != null) {
      num += idx * wt;
      covered += wt;
    }
  }
  if (totalApplicable === 0 || covered / totalApplicable < MIN_COVERAGE) return null;
  return num / covered;
}

export interface PlayerGlobalInput {
  key: string;
  position: string | null | undefined;
  factors: { metric: string; idx: number }[];
  /** Partidos/minutos jugados -- determina si este jugador entra en la
   *  población de referencia usada para calibrar su posición (ver cabecera). */
  matchesPlayed: number | null | undefined;
  minsPlayed: number | null | undefined;
}

/**
 * GLOBAL final (0-100, normalizado DENTRO de cada posición) para TODO un
 * pool de jugadores a la vez -- necesita el pool completo porque calibra
 * cada posición contra su propia distribución real. Sólo los jugadores con
 * muestra suficiente ("ranked", ver playerSampleGate.ts) entran en la
 * distribución de referencia de su posición; un jugador de muestra chica
 * igual recibe un número (calculado sobre esa misma distribución), pero no
 * la integra -- así una racha de pocos minutos no le corre la escala a
 * nadie más.
 */
export function computeGlobalIndex(
  players: PlayerGlobalInput[],
  indexers: Record<string, (v: number) => number>,
  metricsWithData: ReadonlySet<string>,
): Map<string, number | null> {
  const raw = new Map<string, number | null>();
  const byPosition: Record<Position, number[]> = { GK: [], DF: [], MF: [], FW: [] };

  for (const p of players) {
    // Por debajo de la población calificada de FotMob (<11 partidos) no hay
    // GLOBAL, punto -- ninguna de las métricas "cada 90'" nativas de la tabla
    // de pesos existe para estos jugadores, así que imputar CERO_IMPUTABLE
    // (pensado para "esto no ocurrió DENTRO de la lista calificada") sería
    // tratar "la fuente no mide esto para nadie con tan poca muestra" como
    // "el jugador rindió cero" -- exactamente el tipo de imputación indebida
    // que este archivo existe para evitar. Ver playerCategories.ts para el
    // rendimiento visible de estos jugadores (categorías con muestra chica).
    if (!isPosition(p.position) || (p.matchesPlayed ?? 0) < MIN_MATCHES_QUALIFIED) {
      raw.set(p.key, null);
      continue;
    }
    const w = rawWeightedGlobal(p.factors, p.position, indexers, metricsWithData);
    raw.set(p.key, w);
    if (w != null && sampleTier(p.matchesPlayed, p.minsPlayed) === "ranked") {
      byPosition[p.position].push(w);
    }
  }

  const posIndexer: Partial<Record<Position, (v: number) => number>> = {};
  for (const pos of POSITIONS) {
    if (byPosition[pos].length > 0) posIndexer[pos] = makeIndexer(byPosition[pos], false);
  }

  const out = new Map<string, number | null>();
  for (const p of players) {
    const w = raw.get(p.key);
    const idxFn = isPosition(p.position) ? posIndexer[p.position] : undefined;
    out.set(p.key, w != null && idxFn ? Math.round(idxFn(w)) : null);
  }
  return out;
}

export type { SampleTier };

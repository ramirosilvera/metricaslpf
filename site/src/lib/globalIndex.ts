// Índice GLOBAL ajustado por posición (estilo EA SPORTS FC).
// ---------------------------------------------------------------------------
// Revisado tras una auditoría de criterio futbolístico (ver /metodologia/):
// un promedio plano de todos los factores cargados premiaba el VOLUMEN de
// actividad (pases, quites, recuperaciones) sobre la calidad del rendimiento,
// y colaba métricas de conteo crudo censuradas en cero (ej. "1 tarjeta
// amarilla" = índice 100 porque la lista de FotMob sólo incluye a quien tiene
// >=1). Este archivo ahora:
//   1. usa SIEMPRE el mismo denominador fijo por posición (la suma de pesos
//      de la tabla), nunca el promedio plano de "lo que el jugador tenga
//      cargado" -- así no convertir un gol, por ejemplo, ya no le borra el
//      peso a ese factor en vez de penalizarlo;
//   2. imputa 0 (vía el indexador real de esa métrica, que ya sabe si es
//      "menos es mejor") para un factor de la tabla que el jugador no tiene
//      cargado, en vez de dejarlo afuera del cálculo;
//   3. NO tiene fallback de promedio plano: sin posición conocida, o con
//      menos del 85% del peso de la tabla resoluble (la fuente de esa
//      métrica no tiene ningún dato en todo el dataset), no se emite GLOBAL.

export type Position = "GK" | "DF" | "MF" | "FW";

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
const MIN_COVERAGE = 0.85;

export function isFieldPosition(position?: string | null): boolean {
  return position === "DF" || position === "MF" || position === "FW";
}

/**
 * Global ponderado por posición a partir de los índices por factor del
 * jugador. Denominador SIEMPRE fijo (suma de pesos de la tabla de la
 * posición): un factor de la tabla que el jugador no tiene cargado se imputa
 * pasando el valor crudo 0 por el indexador real de esa métrica (que ya
 * conoce la dirección -- para "menos es mejor" un 0 es el mejor caso
 * posible, ej. 0 amarillas cada 90'). Si no hay posición conocida, o si una
 * métrica de la tabla no tiene NINGÚN dato en el dataset (fuente caída), no
 * se emite número -- null, no un promedio plano que mezcle bases distintas.
 */
export function positionWeightedGlobal(
  factors: { metric: string; idx: number }[],
  position: string | null | undefined,
  indexers: Record<string, (v: number) => number>,
  metricsWithData: ReadonlySet<string>,
): number | null {
  const w = position ? POSITION_WEIGHTS[position as Position] : undefined;
  if (!w) return null;
  const byMetric = new Map(factors.map((f) => [f.metric, f.idx]));
  let num = 0;
  let den = 0;
  let covered = 0;
  for (const [metric, wt] of Object.entries(w)) {
    if (!metricsWithData.has(metric)) continue; // la métrica no existe en todo el dataset -- no cuenta ni en el denominador
    den += wt;
    const idx = byMetric.get(metric) ?? indexers[metric]?.(0);
    if (idx != null) {
      num += idx * wt;
      covered += wt;
    }
  }
  if (den === 0 || covered / den < MIN_COVERAGE) return null;
  return Math.round(num / den);
}

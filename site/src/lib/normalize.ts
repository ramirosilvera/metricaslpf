// =============================================================================
// Sistema único de normalización de métricas — "cercanía al mejor rendimiento"
// =============================================================================
// Filosofía (inspirada en cómo EA SPORTS FC muestra atributos): un valor
// normalizado responde "¿qué tan cerca está del MEJOR rendimiento observado?",
// no "¿qué puesto ocupa?" (percentil). Un 90 se lee directo: "llega al 90% del
// mejor registrado". No hace falta entender estadística.
//
//   más-es-mejor:  norm = valor / mejor(máx) * 100
//   menos-es-mejor: norm = mejor(mín) / valor * 100   (el más bajo = 100)
//
// Los valores OFICIALES nunca se tocan: esto es solo para la comparación visual.
// Un único lugar para toda la app -> consistente, configurable y mantenible.

/** Métricas donde MENOS es mejor (el mejor rendimiento es el valor más bajo). */
export const LOWER_IS_BETTER: ReadonlySet<string> = new Set([
  "faltas_promedio",
  "edad_promedio",
  "edad_years",
  "age_years",
  "goles_recibidos",
  "goles_recibidos_promedio",
  "remates_al_arco_recibidos_promedio",
  "tarjetas_amarillas",
  "tarjetas_rojas",
  // métricas de jugador de FotMob (ver lib/playerMetrics.ts) donde menos es mejor.
  // big_chance_missed NO va acá: correlaciona +0.78 con xG (a más ocasiones
  // claras recibidas, más se falla en términos absolutos) -- es señal de
  // exposición ofensiva, no un defecto. penalty_conceded/penalty_won/red_card
  // tampoco: son eventos rarísimos (rango de liga 1-2), cualquier dirección
  // sobre esa muestra es ruido. Ninguna de las cuatro puntúa en el GLOBAL
  // (ver globalIndex.ts); se muestran tal cual en la ficha del jugador.
  "goals_conceded",
  "fouls",
  "yellow_card_per_90",
  // OJO: "yellow_card" (el conteo crudo) NO va acá a propósito -- está
  // censurado en 0 (FotMob sólo lista a quien tiene >=1, ver H2 de la
  // auditoría del índice GLOBAL), así que invertirlo ("menos es mejor")
  // hacía que "1 amarilla" sacara índice 100 como si fuera una virtud. La
  // versión segura es yellow_card_per_90 (imputada a 0 dentro del set
  // calificado en el ETL) -- el conteo crudo se muestra tal cual en la
  // ficha, sin indexar como "bueno" en ninguna dirección.
]);

export function isLowerBetter(metricKey: string): boolean {
  return LOWER_IS_BETTER.has(metricKey);
}

/**
 * % de cercanía al mejor valor de `values`, para UN `value`.
 * - lowerIsBetter=false (default): valor/máx*100.
 * - lowerIsBetter=true: mín/valor*100 (el mínimo = 100). Con guardas para 0.
 * Devuelve un entero 0..100.
 */
export function pctOfBest(value: number, values: number[], lowerIsBetter = false): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (!Number.isFinite(value) || finite.length === 0) return 0;

  if (lowerIsBetter) {
    const best = Math.min(...finite);
    if (value <= 0) return 100; // no se puede hacer mejor que 0 (ej. 0 faltas)
    if (best <= 0) {
      // alguien registra 0: la razón best/valor se rompe -> min-max invertido
      const worst = Math.max(...finite);
      if (worst === best) return 100;
      return clamp(Math.round(((worst - value) / (worst - best)) * 100));
    }
    return clamp(Math.round((best / value) * 100));
  }

  const best = Math.max(...finite);
  if (best <= 0) return 0;
  return clamp(Math.round((value / best) * 100));
}

/**
 * Construye un normalizador para una serie ya conocida (evita recomputar el
 * máx/mín en cada llamada). Útil cuando se normalizan muchos equipos a la vez.
 */
export function makeNormalizer(values: number[], lowerIsBetter = false): (v: number) => number {
  const finite = values.filter((v) => Number.isFinite(v));
  const best = lowerIsBetter ? Math.min(...finite) : Math.max(...finite);
  const worst = lowerIsBetter ? Math.max(...finite) : Math.min(...finite);
  return (v: number) => {
    if (!Number.isFinite(v) || finite.length === 0) return 0;
    if (lowerIsBetter) {
      if (v <= 0) return 100;
      if (best <= 0) return worst === best ? 100 : clamp(Math.round(((worst - v) / (worst - best)) * 100));
      return clamp(Math.round((best / v) * 100));
    }
    if (best <= 0) return 0;
    return clamp(Math.round((v / best) * 100));
  };
}

/** El valor real (oficial) del mejor del conjunto, para citarlo en textos. */
export function bestValue(values: number[], lowerIsBetter = false): number | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  return lowerIsBetter ? Math.min(...finite) : Math.max(...finite);
}

// =============================================================================
// Índice de rendimiento (estilo EA SPORTS FC) — para DIFERENCIAR visualmente
// =============================================================================
// Problema del "% del mejor": los clubes de arriba de tabla rinden parecido en
// varias métricas, así que casi todos dan 90-100% y los radares quedan
// iguales (blobs). EA FC lo resuelve estirando el rango real observado a una
// escala calibrada con un PISO (ningún jugador tiene pace 5). Acá igual: se
// mapea [mín, máx] de la temporada a [FLOOR, 100], así una diferencia real
// chica se ve grande en el gráfico.
//
//   más-es-mejor:  idx = FLOOR + (v - mín)/(máx - mín) * (100 - FLOOR)
//   menos-es-mejor: idx = FLOOR + (máx - v)/(máx - mín) * (100 - FLOOR)
//
// 100 = el mejor de la temporada; FLOOR ≈ el más flojo del rango (sigue siendo
// un club de Primera División, no un cero). El valor OFICIAL se muestra
// siempre aparte.
export const INDEX_FLOOR = 40;

export function makeIndexer(
  values: number[],
  lowerIsBetter = false,
  floor = INDEX_FLOOR,
): (v: number) => number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return () => 0;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min;
  return (v: number) => {
    if (!Number.isFinite(v)) return 0;
    if (range === 0) return 100;
    const pos = lowerIsBetter ? (max - v) / range : (v - min) / range; // 0..1
    return Math.round(floor + Math.max(0, Math.min(1, pos)) * (100 - floor));
  };
}

/** Índice de una sola serie/valor (conveniencia; usa makeIndexer por dentro). */
export function perfIndex(value: number, values: number[], lowerIsBetter = false, floor = INDEX_FLOOR): number {
  return makeIndexer(values, lowerIsBetter, floor)(value);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/**
 * Construye, en una sola pasada sobre `rows`, un indexador por métrica (sobre
 * TODOS los jugadores medidos) y el set de métricas que tienen al menos un
 * dato real en el dataset. `metricsWithData` es lo que globalIndex.ts usa
 * para distinguir "el jugador no anotó" (se imputa 0) de "la fuente de esta
 * métrica no tiene ningún dato" (esa métrica no debería contar ni en el
 * denominador del GLOBAL).
 */
export function buildIndexers(
  rows: { metric: string; value: number | null | undefined }[],
  metricKeys: readonly string[],
): { indexers: Record<string, (v: number) => number>; metricsWithData: ReadonlySet<string> } {
  const indexers: Record<string, (v: number) => number> = {};
  const metricsWithData = new Set<string>();
  for (const m of metricKeys) {
    const vals = rows.filter((r) => r.metric === m && r.value != null).map((r) => r.value as number);
    if (vals.length > 0) metricsWithData.add(m);
    indexers[m] = makeIndexer(vals, isLowerBetter(m));
  }
  return { indexers, metricsWithData };
}

// Categorías de rendimiento estilo EA SPORTS FC -- descomposición del índice
// GLOBAL en un puñado de "atributos" (Ataque/Creación/Pase/Defensa/Valoración
// para jugadores de campo; Atajadas/Valla/Pies/Valoración para arqueros) en
// vez de un radar de 30+ factores sueltos.
// ---------------------------------------------------------------------------
// Diseño encargado a revisión de dominio futbolístico (ver /metodologia/) tras
// el pedido explícito de agrupar factores y subir la cobertura de jugadores
// con algo de rendimiento visible de 41% a ~90%. Reglas centrales:
//
//   1. Las categorías NO reemplazan el GLOBAL -- son su descomposición. La
//      composición y los pesos INTERNOS de cada categoría son los mismos para
//      las 3 posiciones de campo (así son comparables entre sí); lo que
//      cambia por posición es cuánto pesa cada categoría en el GLOBAL
//      (`categoryWeight`, derivado de POSITION_WEIGHTS -- nunca se inventa un
//      número nuevo, se suman los pesos que ya existían agrupados).
//   2. Dentro de la población calificada de FotMob (>=11 partidos) una
//      categoría NUNCA se renormaliza -- cada métrica ausente se imputa a 0
//      (si es un conteo censurado-en-0, ver CERO_IMPUTABLE) o simplemente no
//      está disponible en esa magnitud para nadie (UNKNOWN, nunca se imputa).
//   3. Por debajo de 11 partidos (con >=45' jugados) FotMob no publica NINGUNA
//      de sus categorías "cada 90'" nativas -- ahí SÍ se renormaliza sobre lo
//      presente, y las tasas se derivan de los conteos crudos reales (goles,
//      asistencias, xG, xA, ocasiones) con encogimiento empírico-Bayes hacia
//      la mediana de su posición, para que una racha de pocos minutos no
//      produzca un número absurdo. La ausencia acá es EXÓGENA (FotMob no lo
//      calculó, no depende de si el jugador rindió bien o mal) -- por eso
//      renormalizar acá no reintroduce el bug de la ronda 1 del GLOBAL (ese
//      denominador era ENDÓGENO: no convertir un gol le borraba peso al
//      factor en vez de penalizarlo).
//
// Todo esto es un SISTEMA DE VISUALIZACIÓN aparte -- el GLOBAL de una sola
// cifra lo sigue calculando exclusivamente globalIndex.ts::computeGlobalIndex
// (matemáticamente equivalente: agrupar en cajas no cambia el resultado,
// verificado empíricamente con Spearman >=0.99 entre el GLOBAL actual y el
// reconstruido desde categorías).

import { makeIndexer, isLowerBetter } from "./normalize";
import { sampleTier, MIN_MATCHES_QUALIFIED } from "./playerSampleGate";
import { POSITION_WEIGHTS, CERO_IMPUTABLE, type Position } from "./globalIndex";

export type CategoryKey = "ATA" | "CRE" | "PAS" | "DEF" | "VAL" | "ATJ" | "VLL" | "PIE";

interface CategoryMember {
  metric: string;
  /** Proporción del peso de POSITION_WEIGHTS que aporta a esta categoría (1
   *  normalmente; 0.5 para xG+xA, que se reparte entre Ataque y Creación). */
  share: number;
  /** Si es false (fouls, yellow_card_per_90, goals_conceded), es un factor de
   *  AJUSTE: nunca puede por sí solo activar la categoría (ver §regla del núcleo). */
  core: boolean;
}

const FIELD_CATEGORIES: Record<string, CategoryMember[]> = {
  ATA: [
    { metric: "goals_per_90", share: 1, core: true },
    { metric: "_expected_goals_and_expected_assists_per_90", share: 0.5, core: true },
    { metric: "expected_goals_per_90", share: 1, core: true },
    { metric: "ontarget_scoring_att", share: 1, core: true },
    { metric: "total_scoring_att", share: 1, core: true },
  ],
  CRE: [
    { metric: "expected_assists_per_90", share: 1, core: true },
    { metric: "_expected_goals_and_expected_assists_per_90", share: 0.5, core: true },
    { metric: "total_att_assist_per_90", share: 1, core: true },
    { metric: "big_chance_created_per_90", share: 1, core: true },
    { metric: "goal_assist_per_90", share: 1, core: true },
  ],
  PAS: [
    { metric: "accurate_pass", share: 1, core: true },
    { metric: "accurate_long_balls", share: 1, core: true },
    { metric: "won_contest", share: 1, core: true },
  ],
  DEF: [
    { metric: "defensive_contributions", share: 1, core: true },
    { metric: "total_tackle", share: 1, core: true },
    { metric: "interception", share: 1, core: true },
    { metric: "ball_recovery", share: 1, core: true },
    { metric: "effective_clearance", share: 1, core: true },
    { metric: "outfielder_block", share: 1, core: true },
    { metric: "poss_won_att_3rd", share: 1, core: true },
    { metric: "fouls", share: 1, core: false },
    { metric: "yellow_card_per_90", share: 1, core: false },
  ],
  VAL: [{ metric: "rating", share: 1, core: true }],
};

const GK_CATEGORIES: Record<string, CategoryMember[]> = {
  ATJ: [
    { metric: "_goals_prevented_per_90", share: 1, core: true },
    { metric: "_save_percentage", share: 1, core: true },
    { metric: "saves", share: 1, core: true },
  ],
  VLL: [
    { metric: "clean_sheet_ratio", share: 1, core: true },
    { metric: "goals_conceded", share: 1, core: false },
  ],
  PIE: [{ metric: "accurate_pass", share: 1, core: true }],
  VAL: [{ metric: "rating", share: 1, core: true }],
};

export const CATEGORIES_BY_POSITION: Record<Position, Record<string, CategoryMember[]>> = {
  FW: FIELD_CATEGORIES,
  MF: FIELD_CATEGORIES,
  DF: FIELD_CATEGORIES,
  GK: GK_CATEGORIES,
};

export const CATEGORY_ORDER: Record<Position, CategoryKey[]> = {
  FW: ["ATA", "CRE", "PAS", "DEF", "VAL"],
  MF: ["ATA", "CRE", "PAS", "DEF", "VAL"],
  DF: ["ATA", "CRE", "PAS", "DEF", "VAL"],
  GK: ["ATJ", "VLL", "PIE", "VAL"],
};

/** Categorías a usar para un jugador sin posición resuelta (~15% de los 898):
 *  las de campo, genéricas -- se benefician igual del sistema, sólo pierden
 *  el GLOBAL de una cifra (que sí necesita saber el peso por puesto). */
export const FALLBACK_CATEGORY_ORDER: CategoryKey[] = ["ATA", "CRE", "PAS", "DEF", "VAL"];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  ATA: "Ataque",
  CRE: "Creación",
  PAS: "Pase",
  DEF: "Defensa",
  VAL: "Valoración",
  ATJ: "Atajadas",
  VLL: "Valla",
  PIE: "Pies",
};

export function isPosition(position: string | null | undefined): position is Position {
  return position === "GK" || position === "DF" || position === "MF" || position === "FW";
}

/** Peso de una categoría en el GLOBAL de una posición -- suma de los pesos de
 *  POSITION_WEIGHTS de sus métricas (con el share correspondiente). Nunca se
 *  hardcodea un número: si mañana cambian los pesos del GLOBAL, esto se
 *  recalcula solo y no puede desincronizarse. */
export function categoryWeight(position: Position, cat: CategoryKey): number {
  const members = CATEGORIES_BY_POSITION[position][cat] ?? [];
  const posWeights = POSITION_WEIGHTS[position];
  return members.reduce((s, m) => s + (posWeights[m.metric] ?? 0) * m.share, 0);
}

// --- Clasificación de ausencia (ver cabecera del archivo) -------------------
// CERO_IMPUTABLE vive en globalIndex.ts (un solo lugar, sin duplicar la lista
// -- el GLOBAL y las categorías tienen que usar EXACTAMENTE el mismo criterio
// de qué ausencia es un 0 real).

// Métricas cuyo mínimo observado en la liga está lejos de 0 (rating, atajadas,
// recuperaciones, etc.): la ausencia significa "no medido", nunca se imputa.
// (No hace falta una lista explícita: todo lo que use `computeCategoryScores`
// y no esté en CERO_IMPUTABLE se trata como "nunca se imputa" por defecto --
// es la opción segura, ver rawWeightedGlobal en globalIndex.ts para el mismo
// criterio aplicado al GLOBAL.)

// --- Derivación extendida para muestra chica (mp < 11) ----------------------

/** "Minutos prestados" del prior posicional -- a los 45' el jugador es 91%
 *  prior, a los 450' es 50/50, a los 900' pesa 67% lo suyo. Calibrado contra
 *  la relación varianza-dentro/varianza-entre observada en goles y xA de la
 *  LPF (k≈3-5 partidos); 450' (~5 partidos) es el valor conservador del rango
 *  y se comunica fácil ("le prestamos 5 partidos de su posición"). */
export const SHRINKAGE_K_MINUTES = 450;
/** Mínimo de minutos para mostrar CUALQUIER categoría derivada -- por debajo
 *  de esto el número sería >=91% prior posicional firmado con el nombre del
 *  jugador, y eso ya no es informar, es adivinar. */
export const MIN_MINUTES_FOR_CATEGORY = 45;
/** Shrinkage de vallas invictas (ratio por partido, no por minuto) -- mismo
 *  espíritu, expuesto en partidos en vez de minutos. */
const SHRINKAGE_K_MATCHES = 5;

/** Metric per-90 -> su conteo crudo hermano (exportado para que las fichas
 *  de jugador puedan excluir el crudo de "Aporte y contexto" cuando ya se
 *  muestra, envuelto en la categoría, como tasa). */
export const PER90_TO_RAW: Record<string, string> = {
  goals_per_90: "goals",
  goal_assist_per_90: "goal_assist",
  expected_goals_per_90: "expected_goals",
  expected_assists_per_90: "expected_assists",
  total_att_assist_per_90: "total_att_assist",
  big_chance_created_per_90: "big_chance_created",
  yellow_card_per_90: "yellow_card",
};

function derivedRate(
  per90Metric: string,
  rawByMetric: ReadonlyMap<string, number>,
  matchesPlayed: number | null,
  minsPlayed: number | null,
  medianRates: Record<string, number> | undefined,
): number | null {
  if (per90Metric === "_expected_goals_and_expected_assists_per_90") {
    const xg = derivedRate("expected_goals_per_90", rawByMetric, matchesPlayed, minsPlayed, medianRates);
    const xa = derivedRate("expected_assists_per_90", rawByMetric, matchesPlayed, minsPlayed, medianRates);
    if (xg == null && xa == null) return null;
    return (xg ?? 0) + (xa ?? 0);
  }
  if (per90Metric === "clean_sheet_ratio") {
    const matches = matchesPlayed ?? 0;
    if (matches <= 0) return null;
    const events = rawByMetric.get("clean_sheet") ?? 0;
    const lambda = medianRates?.["clean_sheet_ratio"] ?? 0;
    return (events + lambda * SHRINKAGE_K_MATCHES) / (matches + SHRINKAGE_K_MATCHES);
  }
  const rawKey = PER90_TO_RAW[per90Metric];
  if (!rawKey) return null;
  const mins = minsPlayed ?? 0;
  if (mins <= 0) return null;
  const events = rawByMetric.get(rawKey) ?? 0; // ausente en la lista censurada-en-0 = 0 real (ver H2, auditoría GLOBAL)
  const lambda = medianRates?.[per90Metric] ?? 0;
  const K = SHRINKAGE_K_MINUTES;
  return ((events + (lambda * K) / 90) * 90) / (mins + K);
}

// --- Contexto compartido (calibrar UNA vez sobre todo el pool) --------------

export interface CategoryContext {
  /** Indexadores 40-100 por métrica, calibrados EXCLUSIVAMENTE con la
   *  población "ranked" -- si se calibraran con toda la población, una tasa
   *  derivada de un jugador de 46' con una racha estiraría el techo del
   *  indexador y comprimiría a los 372 jugadores de muestra sólida contra el
   *  piso. makeIndexer ya clampea fuera de rango, así que es seguro. */
  indexers: Record<string, (v: number) => number>;
  metricsWithData: ReadonlySet<string>;
  /** Mediana de la tasa nativa entre jugadores "ranked", por posición (y
   *  "ALL" para quien no tiene posición resuelta) -- el prior del shrinkage. */
  medianRateByPosition: Record<string, Record<string, number>>;
}

function median(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const SHRINKABLE_METRICS = [...Object.keys(PER90_TO_RAW), "_expected_goals_and_expected_assists_per_90", "clean_sheet_ratio"];

export function buildCategoryContext(
  rows: { team: string; player_name: string; metric: string; value: number | null }[],
  positions: Record<string, string>,
): CategoryContext {
  const sampleByKey = new Map<string, { mp: number | null; mins: number | null }>();
  for (const r of rows) {
    if (r.value == null) continue;
    const key = `${r.team}|${r.player_name}`;
    const e = sampleByKey.get(key) ?? { mp: null, mins: null };
    if (r.metric === "matches_played") e.mp = r.value;
    if (r.metric === "mins_played") e.mins = r.value;
    sampleByKey.set(key, e);
  }
  const rankedKeys = new Set<string>();
  for (const [key, s] of sampleByKey) {
    if (sampleTier(s.mp, s.mins) === "ranked") rankedKeys.add(key);
  }

  const valuesByMetric = new Map<string, number[]>();
  const rankedValuesByMetric = new Map<string, number[]>();
  for (const r of rows) {
    if (r.value == null) continue;
    const key = `${r.team}|${r.player_name}`;
    (valuesByMetric.get(r.metric) ?? valuesByMetric.set(r.metric, []).get(r.metric)!).push(r.value);
    if (rankedKeys.has(key)) {
      (rankedValuesByMetric.get(r.metric) ?? rankedValuesByMetric.set(r.metric, []).get(r.metric)!).push(r.value);
    }
  }

  const metricsWithData = new Set(valuesByMetric.keys());
  const indexers: Record<string, (v: number) => number> = {};
  for (const metric of metricsWithData) {
    const rankedVals = rankedValuesByMetric.get(metric);
    const vals = rankedVals && rankedVals.length > 0 ? rankedVals : (valuesByMetric.get(metric) ?? []);
    indexers[metric] = makeIndexer(vals, isLowerBetter(metric));
  }

  const perPosValues: Record<string, Record<string, number[]>> = { GK: {}, DF: {}, MF: {}, FW: {}, ALL: {} };
  for (const r of rows) {
    if (r.value == null || !SHRINKABLE_METRICS.includes(r.metric)) continue;
    const key = `${r.team}|${r.player_name}`;
    if (!rankedKeys.has(key)) continue;
    const pos = positions[key];
    const buckets = pos && perPosValues[pos] ? [perPosValues[pos], perPosValues.ALL] : [perPosValues.ALL];
    for (const b of buckets) {
      (b[r.metric] ?? (b[r.metric] = [])).push(r.value);
    }
  }
  const medianRateByPosition: Record<string, Record<string, number>> = {};
  for (const posKey of Object.keys(perPosValues)) {
    medianRateByPosition[posKey] = {};
    for (const [metric, vals] of Object.entries(perPosValues[posKey])) {
      medianRateByPosition[posKey][metric] = median(vals);
    }
  }

  return { indexers, metricsWithData, medianRateByPosition };
}

// --- Cálculo por jugador -----------------------------------------------------

export interface CategoryFactorDetail {
  metric: string;
  idx: number;
  raw: number;
  /** true = la tasa viene del encogimiento empírico-Bayes (mp&lt;11), no del
   *  valor nativo de FotMob. Nunca se muestra como valor "oficial". */
  estimated: boolean;
}

export type CategoryState = "solid" | "small_sample" | "partial" | "none";

export interface CategoryScore {
  key: CategoryKey;
  idx: number | null;
  /** Fracción (0..1) del peso NÚCLEO de la categoría con dato presente. */
  completeness: number;
  factorsPresent: number;
  factorsTotal: number;
  state: CategoryState;
  factors: CategoryFactorDetail[];
}

/**
 * Categorías de UN jugador. `rawByMetric` = todos sus valores crudos
 * (`Map` metric->value, tal cual vienen en derived_player_metrics.json).
 */
export function computeCategoryScores(
  position: string | null | undefined,
  matchesPlayed: number | null,
  minsPlayed: number | null,
  rawByMetric: ReadonlyMap<string, number>,
  ctx: CategoryContext,
): CategoryScore[] {
  const pos = isPosition(position) ? position : null;
  const membersFor = pos ? CATEGORIES_BY_POSITION[pos] : FIELD_CATEGORIES;
  const order = pos ? CATEGORY_ORDER[pos] : FALLBACK_CATEGORY_ORDER;
  const qualified = (matchesPlayed ?? 0) >= MIN_MATCHES_QUALIFIED;
  const tier = sampleTier(matchesPlayed, minsPlayed);
  const priorKey = pos ?? "ALL";
  const belowFloor = !qualified && (minsPlayed ?? 0) < MIN_MINUTES_FOR_CATEGORY;

  return order.map((key) => {
    const catMembers = membersFor[key] ?? [];
    let num = 0;
    let presentWeight = 0;
    let coreWeight = 0;
    let corePresentWeight = 0;
    let factorsPresent = 0;
    let hasCore = false;
    const factors: CategoryFactorDetail[] = [];

    if (!belowFloor) {
      for (const m of catMembers) {
        const w = m.share;
        let idx: number | null = null;
        let rawVal = rawByMetric.get(m.metric);
        let estimated = false;

        if (qualified) {
          if (rawVal != null) {
            idx = ctx.indexers[m.metric]?.(rawVal) ?? null;
          } else if (CERO_IMPUTABLE.has(m.metric) && ctx.metricsWithData.has(m.metric)) {
            idx = ctx.indexers[m.metric]?.(0) ?? null;
            rawVal = 0;
          }
        } else {
          const derived = derivedRate(m.metric, rawByMetric, matchesPlayed, minsPlayed, ctx.medianRateByPosition[priorKey]);
          if (derived != null && ctx.indexers[m.metric]) {
            idx = ctx.indexers[m.metric](derived);
            rawVal = derived;
            estimated = true;
          }
        }

        if (m.core) coreWeight += w;
        if (idx != null) {
          num += idx * w;
          presentWeight += w;
          factorsPresent++;
          if (m.core) {
            hasCore = true;
            corePresentWeight += w;
          }
        }
        if (rawVal != null) factors.push({ metric: m.metric, idx: idx ?? 0, raw: rawVal, estimated });
      }
    }

    const completeness = coreWeight > 0 ? corePresentWeight / coreWeight : 0;
    if (belowFloor || !hasCore || presentWeight === 0) {
      return { key, idx: null, completeness: 0, factorsPresent, factorsTotal: catMembers.length, state: "none" as const, factors };
    }

    const idx = Math.round(num / presentWeight);
    let state: CategoryState;
    if (qualified && tier === "ranked" && completeness === 1) state = "solid";
    else if (qualified) state = "small_sample";
    else state = "partial";

    return { key, idx, completeness, factorsPresent, factorsTotal: catMembers.length, state, factors };
  });
}

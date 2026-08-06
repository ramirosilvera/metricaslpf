// Generador de "lecturas automáticas" (insights) determinístico y del lado del
// cliente. NO llama a ninguna API: sólo interpreta percentiles/valores que ya
// vienen calculados en los JSON del dataset. La idea es que "la IA hable
// primero" sin costo ni riesgo de rate-limit — el chat con Gemini queda para
// cuando el usuario quiere profundizar de verdad.
//
// Reglas de estilo (registro analista rioplatense):
//  - Siempre citar los percentiles reales que llegan por props.
//  - Lenguaje con cautela ("sugiere", "es consistente con"), nunca causal
//    ("prueba", "demuestra").
//  - Si la diferencia entre dos equipos en una métrica es chica, no se fabrica
//    un insight falso: se eligen las dimensiones con separación genuina.
//
// Módulo sin dependencias (ni de charts ni de React) para que sea trivialmente
// testeable desde Node.

/** Diferencia mínima (en puntos de índice) para considerar que dos equipos/
 *  jugadores están genuinamente separados en una métrica. Por debajo, van
 *  "parejos". */
const MIN_GAP = 10;

function round(n: number): number {
  return Math.round(n);
}

export interface PlayerMetricPoint {
  key: string;
  /** Etiqueta legible ("distancia por partido", "intercepciones"). */
  label: string;
  value: number;
  /** Índice de rendimiento (0..100, calibrado al rango del torneo), no percentil. */
  percentile: number | null;
  /** Sufijo de unidad para el valor (" km", "%", ""). */
  suffix?: string;
  /** "físico" | "táctico" — para poder contrastar los dos perfiles. */
  group?: string;
}

/** Cualificador verbal según el índice de rendimiento (0-100, calibrado al
 *  rango del torneo; 100 = el mejor, ~40 = el más flojo del campo). */
function tier(p: number): string {
  if (p >= 90) return "prácticamente al nivel del mejor del torneo";
  if (p >= 75) return "cerca del techo del torneo";
  if (p >= 60) return "en la franja alta del torneo";
  if (p >= 45) return "en la zona media del torneo";
  if (p >= 30) return "en la franja baja del torneo";
  return "entre los valores más bajos de los jugadores medidos";
}

function fmtValue(p: PlayerMetricPoint): string {
  const v = Math.round(p.value * 10) / 10;
  return `${v}${p.suffix ?? ""}`;
}

/**
 * Genera frases sobre un jugador comparándolo contra el resto del dataset (no
 * cabeza a cabeza con otro jugador nombrado). Destaca sus 1-2 fortalezas por
 * percentil, contrasta físico vs táctico si hay de los dos, y menciona un punto
 * flojo sólo si es genuinamente bajo.
 */
export function generatePlayerInsights(
  playerName: string,
  metrics: PlayerMetricPoint[],
): string[] {
  const valid = metrics
    .filter((m) => m.percentile != null && Number.isFinite(m.percentile))
    .map((m) => ({ ...m, percentile: m.percentile as number }));
  if (valid.length === 0) return [];

  const byPct = [...valid].sort((a, b) => b.percentile - a.percentile);
  const insights: string[] = [];
  const used = new Set<string>();

  // 1) Fortaleza principal.
  const top = byPct[0];
  used.add(top.key);
  insights.push(
    `${playerName} saca un índice de ${round(top.percentile)} en ${top.label} ` +
      `(${fmtValue(top)}): ${tier(top.percentile)}.`,
  );

  // 2) Segunda fortaleza — de preferencia del otro perfil (físico/táctico) para
  //    dar una lectura más completa, y sólo si sigue siendo destacable.
  const second =
    byPct.slice(1).find((m) => m.group && m.group !== top.group && m.percentile >= 60) ??
    byPct.slice(1).find((m) => m.percentile >= 60);
  if (second && !used.has(second.key)) {
    used.add(second.key);
    const nexo = second.group && top.group && second.group !== top.group ? "También" : "Además";
    insights.push(
      `${nexo} aparece fuerte en ${second.label}: índice ${round(second.percentile)} ` +
        `(${fmtValue(second)}), ${tier(second.percentile)}.`,
    );
  }

  // 3) Punto flojo, sólo si es realmente bajo (< 35% del mejor) y no repetido.
  const weakest = byPct[byPct.length - 1];
  if (weakest && !used.has(weakest.key) && weakest.percentile < 35) {
    insights.push(
      `Donde más cede es en ${weakest.label}: índice ${round(weakest.percentile)} ` +
        `(${fmtValue(weakest)}), ${tier(weakest.percentile)}.`,
    );
  }

  // 4) Si todavía hay poco y el jugador es parejo, cerramos con una lectura de
  //    conjunto en lugar de forzar un contraste inexistente.
  if (insights.length < 2) {
    const avg = valid.reduce((s, m) => s + m.percentile, 0) / valid.length;
    insights.push(
      `En el resto de las métricas su rendimiento es parejo (índice promedio ${round(avg)} ` +
        `entre las ${valid.length} medidas), sin un pico ni un bache marcado.`,
    );
  }

  return insights;
}

// =============================================================================
// Lecturas por "índice de rendimiento" (sistema de normalización nuevo)
// =============================================================================
// Reemplazan a las lecturas por percentil en los radares: en vez de "está en el
// percentil 82", dicen "saca un índice de 82 en velocidad". El índice (0-100)
// estira el rango real del torneo (estilo EA SPORTS FC) para que las diferencias
// entre selecciones/jugadores se VEAN, no es posición en un ranking.

export interface VsBestMetric {
  /** Etiqueta en minúscula para incrustar en la frase (ej. "distancia recorrida"). */
  label: string;
  /** Índice de rendimiento (0..100, calibrado al rango del torneo) de cada equipo. */
  aPct: number;
  bPct: number;
  /** Valor oficial (para citarlo tal cual). */
  aRaw: number;
  bRaw: number;
  /** Sufijo del valor oficial (ej. " km", "%"). */
  suffix: string;
}

function fmtRaw(v: number, suffix: string): string {
  const n = Math.round(v * 10) / 10;
  return `${n}${suffix}`;
}

export function generateVsBestInsights(nameA: string, nameB: string, metrics: VsBestMetric[]): string[] {
  const usable = metrics.filter((m) => Number.isFinite(m.aPct) && Number.isFinite(m.bPct));
  if (usable.length === 0) return [];

  const insights: string[] = [];

  // 1) Lectura de conjunto: promedio del índice de rendimiento de cada uno.
  const avgA = Math.round(usable.reduce((s, m) => s + m.aPct, 0) / usable.length);
  const avgB = Math.round(usable.reduce((s, m) => s + m.bPct, 0) / usable.length);
  if (Math.abs(avgA - avgB) >= 8) {
    const leader = avgA > avgB ? nameA : nameB;
    const other = avgA > avgB ? nameB : nameA;
    insights.push(
      `En conjunto, ${leader} rinde más alto en el torneo: promedia un índice de ${Math.max(avgA, avgB)} ` +
        `sobre 100, contra ${Math.min(avgA, avgB)} de ${other}.`,
    );
  } else {
    insights.push(
      `${nameA} y ${nameB} promedian un índice parejo (${avgA} y ${avgB} sobre 100): ` +
        `las diferencias aparecen métrica por métrica, no en el conjunto.`,
    );
  }

  // 2) Métricas con separación genuina, de mayor a menor brecha.
  const gaps = [...usable].sort((x, y) => Math.abs(y.aPct - y.bPct) - Math.abs(x.aPct - x.bPct));
  for (const m of gaps.filter((g) => Math.abs(g.aPct - g.bPct) >= MIN_GAP).slice(0, 3)) {
    const aHigher = m.aPct >= m.bPct;
    const higher = aHigher ? nameA : nameB;
    const lower = aHigher ? nameB : nameA;
    const hp = Math.max(m.aPct, m.bPct);
    const lp = Math.min(m.aPct, m.bPct);
    const hRaw = fmtRaw(aHigher ? m.aRaw : m.bRaw, m.suffix);
    const lRaw = fmtRaw(aHigher ? m.bRaw : m.aRaw, m.suffix);
    // Cuando el valor "oficial" es el mismo índice (ej. los ejes de Fuerza de
    // equipo, que combinan dos métricas crudas en un solo número y no tienen
    // un "valor oficial" propio, ver RadarCompare.tsx), citarlo de nuevo no
    // suma nada -- sólo repite "100 contra 78" después de ya haber dicho
    // "índice 100 contra 78".
    const rawAddsInfo = hRaw !== String(hp) || lRaw !== String(lp);
    insights.push(
      rawAddsInfo
        ? `En ${m.label}, ${higher} saca ventaja (índice ${hp} contra ${lp}): ${hRaw} contra ${lRaw}.`
        : `En ${m.label}, ${higher} saca ventaja (índice ${hp} contra ${lp}).`,
    );
    if (insights.length >= 4) break;
  }

  // 3) Si quedó lugar, una métrica donde van casi iguales.
  if (insights.length < 4) {
    const even = [...usable].reverse().find((m) => Math.abs(m.aPct - m.bPct) < MIN_GAP);
    if (even) {
      insights.push(
        `En ${even.label} van prácticamente iguales (índice ${Math.round(even.aPct)} contra ${Math.round(even.bPct)}): ` +
          `ahí no hay una ventaja para ninguno.`,
      );
    }
  }

  return insights;
}

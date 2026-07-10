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

import type { RadarRow } from "./data";

/** Diferencia mínima (en puntos de percentil) para considerar que dos equipos
 *  están genuinamente separados en una métrica. Por debajo, van "parejos". */
const MIN_GAP = 10;

/** Descripción, por métrica, de qué sugiere tener un percentil más alto.
 *  Redactada con cautela — el sujeto de la frase es el equipo que va arriba. */
const TEAM_HIGHER_MEANS: Record<string, string> = {
  posesion_promedio_proxy_percentil:
    "tiende a manejar más la pelota, lo que es consistente con un plan de controlar el juego desde la posesión",
  precision_pases_promedio_percentil:
    "hace circular la pelota con más precisión, lo que sugiere una construcción más cuidada y menos pérdidas",
  remates_promedio_percentil:
    "genera más volumen de remate, lo que sugiere una propuesta más ofensiva o mayor llegada al área rival",
  remates_al_arco_promedio_percentil:
    "llega con más peligro real al arco, lo que sugiere mejor selección y definición de sus situaciones",
};

export interface MetricDef {
  key: string;
  /** Etiqueta corta en minúscula para incrustar en la frase ("posesión"). */
  label: string;
}

function round(n: number): number {
  return Math.round(n);
}

/** Nombre a mostrar. Si son el mismo equipo en distinto torneo, desambigua con
 *  el año (Argentina 2018 vs Argentina 2022). */
function displayName(row: RadarRow, other: RadarRow): string {
  return row.team === other.team ? `${row.team} ${row.season}` : row.team;
}

interface Gap {
  def: MetricDef;
  va: number;
  vb: number;
  diff: number; // va - vb
  abs: number;
}

/**
 * Genera 3-4 frases en español que comparan dos selecciones a partir de sus
 * percentiles de contexto táctico. Prioriza las métricas con separación real y
 * arranca con una lectura de conjunto, para que se sienta "la IA hablando".
 */
export function generateTeamComparisonInsights(
  a: RadarRow | undefined,
  b: RadarRow | undefined,
  metrics: MetricDef[],
): string[] {
  if (!a || !b) return [];

  const nameA = displayName(a, b);
  const nameB = displayName(b, a);

  const gaps: Gap[] = metrics
    .map((def) => {
      const va = Number((a as unknown as Record<string, unknown>)[def.key]);
      const vb = Number((b as unknown as Record<string, unknown>)[def.key]);
      if (!Number.isFinite(va) || !Number.isFinite(vb)) return null;
      return { def, va, vb, diff: va - vb, abs: Math.abs(va - vb) };
    })
    .filter((g): g is Gap => g !== null)
    .sort((x, y) => y.abs - x.abs);

  if (gaps.length === 0) return [];

  const insights: string[] = [];

  // 1) Lectura de conjunto (promedio de percentiles disponibles).
  const avgA = gaps.reduce((s, g) => s + g.va, 0) / gaps.length;
  const avgB = gaps.reduce((s, g) => s + g.vb, 0) / gaps.length;
  const avgDiff = Math.abs(avgA - avgB);
  if (avgDiff >= 8) {
    const leader = avgA > avgB ? nameA : nameB;
    const other = avgA > avgB ? nameB : nameA;
    insights.push(
      `En conjunto, ${leader} muestra un perfil de contexto táctico más marcado que ${other} ` +
        `(promedio de percentiles ${round(Math.max(avgA, avgB))} contra ${round(Math.min(avgA, avgB))}).`,
    );
  } else {
    insights.push(
      `${nameA} y ${nameB} tienen perfiles de contexto táctico parejos en promedio ` +
        `(percentiles ${round(avgA)} y ${round(avgB)}): las diferencias aparecen métrica por métrica, no en el conjunto.`,
    );
  }

  // 2) Métricas con separación genuina (>= MIN_GAP), de mayor a menor brecha.
  const strong = gaps.filter((g) => g.abs >= MIN_GAP);
  for (const g of strong.slice(0, 3)) {
    const higher = g.diff > 0 ? nameA : nameB;
    const lower = g.diff > 0 ? nameB : nameA;
    const hv = round(Math.max(g.va, g.vb));
    const lv = round(Math.min(g.va, g.vb));
    const meaning =
      TEAM_HIGHER_MEANS[g.def.key] ?? "marca una diferencia clara en esa faceta del juego";
    insights.push(
      `En ${g.def.label}, ${higher} supera a ${lower} (percentil ${hv} contra ${lv}, ` +
        `${round(g.abs)} puntos de diferencia): ${meaning}.`,
    );
    if (insights.length >= 4) break;
  }

  // 3) Si quedó lugar y hay una métrica donde van muy parejos, se dice
  //    explícitamente — es tan informativo como una diferencia.
  if (insights.length < 4) {
    const even = [...gaps].reverse().find((g) => g.abs < MIN_GAP);
    if (even) {
      insights.push(
        `En cambio, en ${even.def.label} van prácticamente iguales ` +
          `(percentil ${round(even.va)} contra ${round(even.vb)}): ahí no hay una ventaja para ninguno.`,
      );
    }
  }

  return insights;
}

export interface PlayerMetricPoint {
  key: string;
  /** Etiqueta legible ("distancia por partido", "intercepciones"). */
  label: string;
  value: number;
  percentile: number | null;
  /** Sufijo de unidad para el valor (" km", "%", ""). */
  suffix?: string;
  /** "físico" | "táctico" — para poder contrastar los dos perfiles. */
  group?: string;
}

/** Cualificador verbal según dónde cae el percentil dentro del dataset. */
function tier(p: number): string {
  if (p >= 85) return "uno de los valores más altos entre los jugadores medidos";
  if (p >= 70) return "claramente por encima de la media del dataset";
  if (p >= 55) return "por encima de la media del dataset";
  if (p >= 45) return "en torno a la media del dataset";
  if (p >= 30) return "por debajo de la media del dataset";
  return "entre los valores más bajos del dataset";
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
    `${playerName} está en el percentil ${round(top.percentile)} en ${top.label} ` +
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
      `${nexo} aparece fuerte en ${second.label}: percentil ${round(second.percentile)} ` +
        `(${fmtValue(second)}), ${tier(second.percentile)}.`,
    );
  }

  // 3) Punto flojo, sólo si es realmente bajo (< 35) y no repetido.
  const weakest = byPct[byPct.length - 1];
  if (weakest && !used.has(weakest.key) && weakest.percentile < 35) {
    insights.push(
      `Donde más cede es en ${weakest.label}: percentil ${round(weakest.percentile)} ` +
        `(${fmtValue(weakest)}), ${tier(weakest.percentile)}.`,
    );
  }

  // 4) Si todavía hay poco y el jugador es parejo, cerramos con una lectura de
  //    conjunto en lugar de forzar un contraste inexistente.
  if (insights.length < 2) {
    const avg = valid.reduce((s, m) => s + m.percentile, 0) / valid.length;
    insights.push(
      `En el resto de las métricas su rendimiento es parejo (percentil promedio ${round(avg)} ` +
        `entre las ${valid.length} medidas), sin un pico ni un bache marcado.`,
    );
  }

  return insights;
}

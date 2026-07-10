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
  "tarjetas_amarillas",
  "tarjetas_rojas",
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

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

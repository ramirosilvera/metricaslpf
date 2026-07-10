// Datos para el panel "estilo EA SPORTS FC": un GLOBAL (promedio de los índices,
// como el OVR de una carta) y el desglose factor por factor. Lo comparten el
// panel en pantalla (RatingsPanel.tsx) y el exportable (shareChart.ts), así lo
// que se ve es lo que se comparte.

export interface RatingsEntity {
  name: string;
  /** Color CSS concreto (hex/rgb) para la insignia/columna de esta entidad. */
  color: string;
}

export interface RatingsFactor {
  label: string;
  /** Índice (0-100) por entidad, alineado al orden de `entities`. */
  values: number[];
}

export interface RatingsData {
  entities: RatingsEntity[];
  factors: RatingsFactor[];
  /** Aclaración de escala al pie del panel. */
  scaleLabel?: string;
}

/** GLOBAL (OVR) de una entidad = promedio redondeado de sus índices por factor. */
export function ovrOf(data: RatingsData, entityIndex: number): number {
  const vals = data.factors
    .map((f) => f.values[entityIndex])
    .filter((v) => Number.isFinite(v));
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

export const RATINGS_SCALE_LABEL = "GLOBAL = promedio del índice de rendimiento (0-100, calibrado al rango del torneo)";

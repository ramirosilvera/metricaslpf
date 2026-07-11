// Índice GLOBAL ajustado por posición (estilo EA SPORTS FC).
// ---------------------------------------------------------------------------
// Un promedio plano de todos los factores premia a mediocampistas y defensores
// (acumulan pases, quites, intercepciones, recuperaciones) y castiga a los
// delanteros, que hacen menos de eso aunque su valor esté en velocidad y ataque.
// EA FC no promedia igual para todos: el overall de un delantero pesa distinto
// que el de un defensor. Acá hacemos lo mismo -> cada factor tiene un peso según
// la posición, así un extremo no pierde por "pocos quites" ni un central por
// "poca velocidad punta". Los índices por factor NO cambian; cambia cómo se
// combinan en el número global.

export type Position = "GK" | "DF" | "MF" | "FW";

// Peso 0..3 de cada factor por posición. 0 = no cuenta para esa posición.
// (Los arqueros se excluyen del ranking: las métricas de campo no los
//  representan; su overall en EA FC sale de atributos que este dataset no tiene.)
export const POSITION_WEIGHTS: Record<Position, Record<string, number>> = {
  FW: {
    remates_promedio: 3.5,
    velocidad_punta_kmh: 3,
    sprints_promedio: 3,
    progresiones_promedio: 3,
    alta_intensidad_promedio_m: 2,
    precision_pases_promedio: 1.5,
    distancia_promedio_km: 1,
    pases_completados_promedio: 1,
    presion_directa_promedio: 1,
    recuperaciones_promedio: 0.5,
    tackles_ganados_promedio: 0.3,
    intercepciones_promedio: 0.3,
  },
  MF: {
    pases_completados_promedio: 3,
    precision_pases_promedio: 3,
    progresiones_promedio: 3,
    presion_directa_promedio: 2.5,
    recuperaciones_promedio: 2.5,
    distancia_promedio_km: 2,
    remates_promedio: 1.5,
    alta_intensidad_promedio_m: 1.5,
    sprints_promedio: 1.5,
    tackles_ganados_promedio: 1.5,
    intercepciones_promedio: 1.5,
    velocidad_punta_kmh: 1,
  },
  DF: {
    tackles_ganados_promedio: 3,
    intercepciones_promedio: 3,
    recuperaciones_promedio: 3,
    precision_pases_promedio: 2.5,
    presion_directa_promedio: 2,
    pases_completados_promedio: 2,
    distancia_promedio_km: 1.5,
    alta_intensidad_promedio_m: 1.5,
    progresiones_promedio: 1.5,
    sprints_promedio: 1,
    velocidad_punta_kmh: 1,
    remates_promedio: 0.4,
  },
  // GK: sin pesos -> quien lo tenga cae al promedio plano; el ranking igual los
  // excluye con isFieldPosition().
  GK: {},
};

export function isFieldPosition(position?: string | null): boolean {
  return position === "DF" || position === "MF" || position === "FW";
}

/**
 * Global ponderado por posición a partir de los índices por factor del jugador.
 * Si no hay posición conocida (o es GK sin pesos), cae a promedio plano para no
 * dejar al jugador sin número.
 */
export function positionWeightedGlobal(
  factors: { metric: string; idx: number }[],
  position?: string | null,
): number {
  if (factors.length === 0) return 0;
  const flat = () => Math.round(factors.reduce((s, f) => s + f.idx, 0) / factors.length);
  const w = position ? POSITION_WEIGHTS[position as Position] : undefined;
  if (!w || Object.keys(w).length === 0) return flat();
  let num = 0;
  let den = 0;
  for (const f of factors) {
    const wt = w[f.metric] ?? 0;
    if (wt > 0) {
      num += f.idx * wt;
      den += wt;
    }
  }
  return den > 0 ? Math.round(num / den) : flat();
}

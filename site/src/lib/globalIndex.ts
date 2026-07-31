// Índice GLOBAL ajustado por posición (estilo EA SPORTS FC).
// ---------------------------------------------------------------------------
// Un promedio plano de todos los factores premia a mediocampistas y defensores
// (acumulan pases, quites, intercepciones, recuperaciones) y castiga a los
// delanteros, que hacen menos de eso aunque su valor esté en remates y ataque.
// EA FC no promedia igual para todos: el overall de un delantero pesa distinto
// que el de un defensor. Acá hacemos lo mismo -> cada factor (de las 37
// categorías de FotMob, ver lib/playerMetrics.ts) tiene un peso según la
// posición, así un extremo no pierde por "pocos tackles" ni un central por
// "poco xG". Los índices por factor NO cambian; cambia cómo se combinan en el
// número global.

export type Position = "GK" | "DF" | "MF" | "FW";

// Peso 0..3.5 de cada factor por posición. 0 = no cuenta para esa posición.
// A diferencia de la versión física/táctica anterior, acá SÍ hay pesos reales
// para arqueros (FotMob publica atajadas, % de atajadas, vallas invictas y
// goles evitados) -- ya no hace falta excluirlos del ranking.
export const POSITION_WEIGHTS: Record<Position, Record<string, number>> = {
  FW: {
    goals_per_90: 3.5,
    expected_goals_per_90: 3,
    ontarget_scoring_att: 2.5,
    total_scoring_att: 2,
    _expected_goals_and_expected_assists_per_90: 2,
    big_chance_created: 1.5,
    won_contest: 1.5,
    expected_assists_per_90: 1,
    accurate_pass: 0.8,
    rating: 1,
    penalty_won: 0.5,
    big_chance_missed: 0.3,
  },
  MF: {
    accurate_pass: 3,
    total_att_assist: 2.5,
    expected_assists_per_90: 2.5,
    ball_recovery: 2,
    defensive_contributions: 2,
    interception: 1.5,
    total_tackle: 1.5,
    goals_per_90: 1,
    won_contest: 1,
    rating: 1,
    accurate_long_balls: 1,
    poss_won_att_3rd: 1,
  },
  DF: {
    total_tackle: 3,
    interception: 3,
    effective_clearance: 2.5,
    defensive_contributions: 2.5,
    ball_recovery: 2,
    accurate_pass: 1.5,
    accurate_long_balls: 1.5,
    outfielder_block: 1.5,
    rating: 1,
    poss_won_att_3rd: 1,
    penalty_conceded: 0.5,
    fouls: 0.3,
  },
  GK: {
    saves: 3,
    _save_percentage: 3,
    clean_sheet: 2.5,
    _goals_prevented: 2.5,
    goals_conceded: 2,
    rating: 1,
    accurate_pass: 0.5,
  },
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

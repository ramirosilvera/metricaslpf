// Cruce nombre-jugador -> posición (GK/DF/MF/FW) entre las métricas (nombre estilo
// FIFA "Kylian MBAPPE") y el plantel (nombre editorial "Kylian Mbappé"). Se usa
// para ponderar el índice global por posición. Un solo lugar -> mismo criterio en
// Jugadores, Comparar y Analizar.

interface HasTeamName {
  team: string;
  player_name: string;
}
interface HasPosition extends HasTeamName {
  position: string | null;
}

export function normName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ø/gi, "o")
    .replace(/đ/gi, "d")
    .replace(/ł/gi, "l")
    .toLowerCase()
    .split(/\s+/)
    .join(" ")
    .trim();
}

/**
 * Mapa `${team}|${player_name de las métricas}` -> posición, cruzando por nombre
 * normalizado contra el plantel. Match best-effort: quien no cruza queda sin
 * posición (índice global cae a promedio plano).
 */
export function buildPlayerPositions(metricRows: HasTeamName[], squadRows: HasPosition[]): Record<string, string> {
  const byNorm = new Map(squadRows.map((r) => [`${r.team}|${normName(r.player_name)}`, r.position]));
  const out: Record<string, string> = {};
  for (const row of metricRows) {
    const key = `${row.team}|${row.player_name}`;
    if (key in out) continue;
    const pos = byNorm.get(`${row.team}|${normName(row.player_name)}`);
    if (pos) out[key] = pos;
  }
  return out;
}

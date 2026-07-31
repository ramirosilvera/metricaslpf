// Cruce nombre-jugador -> posición (GK/DF/MF/FW) entre las métricas de FotMob
// (nombre "Gabriel Ávalos") y el plantel de ESPN (mismo formato de nombre,
// pero puede variar en acentos/orden). Se usa para ponderar el índice global
// por posición. Un solo lugar -> mismo criterio en Jugadores, Comparar y Analizar.

interface HasTeamName {
  team: string;
  player_name: string;
}
interface HasPosition extends HasTeamName {
  position: string | null;
}

// ESPN devuelve la posición del roster como una sola letra (G/D/M/F, ver
// fetch_espn_lpf.py) -- se normaliza acá al código de 2 letras (GK/DF/MF/FW)
// que usa el resto del sitio (pesos del índice global, etc.). Si ya viene en
// ese formato (u otro no reconocido) se deja pasar tal cual.
const POSITION_CODE_MAP: Record<string, string> = { G: "GK", D: "DF", M: "MF", F: "FW" };

function normPosition(position: string | null): string | null {
  if (!position) return null;
  return POSITION_CODE_MAP[position] ?? position;
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
  const byNorm = new Map(squadRows.map((r) => [`${r.team}|${normName(r.player_name)}`, normPosition(r.position)]));
  const out: Record<string, string> = {};
  for (const row of metricRows) {
    const key = `${row.team}|${row.player_name}`;
    if (key in out) continue;
    const pos = byNorm.get(`${row.team}|${normName(row.player_name)}`);
    if (pos) out[key] = pos;
  }
  return out;
}

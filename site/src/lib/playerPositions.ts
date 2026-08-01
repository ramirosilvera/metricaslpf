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

// FotMob (fuente de las métricas) y ESPN (fuente del plantel/posición) usan
// nombres de club distintos para 6 de los 30 equipos de la LPF -- sin este
// alias, el cruce por `${team}|${nombre}` falla para TODOS los jugadores de
// esos 6 clubes y su índice global cae sin posición (detectado en la
// auditoría de criterio del índice: ~145 jugadores calificados, titulares
// reales, quedaban sin ponderar por esto). Clave = nombre tal como aparece en
// las métricas de FotMob, valor = nombre tal como aparece en squads.json (ESPN).
export const TEAM_ALIAS_FOTMOB_TO_ESPN: Record<string, string> = {
  "Belgrano": "Belgrano (Córdoba)",
  "Gimnasia de Mendoza": "Gimnasia (Mendoza)",
  "Instituto": "Instituto (Córdoba)",
  "Sarmiento": "Sarmiento (Junín)",
  "Talleres de Córdoba": "Talleres (Córdoba)",
  "Unión Santa Fe": "Unión (Santa Fe)",
};

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
 * Mapa `${team}|${player_name de las métricas}` -> posición, cruzando por
 * nombre normalizado contra el plantel. Dos pasadas:
 *   1. team (con alias FotMob->ESPN) + nombre normalizado -- el match preciso.
 *   2. para quien no cruzó en (1): nombre normalizado solo, SI ese nombre es
 *      único en toda la liga (evita mezclar homónimos de distinto club, ej.
 *      los 3 "Palavecino" reales de esta temporada).
 * Quien no cruza en ninguna de las dos queda sin posición -- ya no cae a un
 * promedio plano (ver globalIndex.ts), directamente no recibe índice GLOBAL.
 */
export function buildPlayerPositions(metricRows: HasTeamName[], squadRows: HasPosition[]): Record<string, string> {
  const byTeamAndName = new Map(squadRows.map((r) => [`${r.team}|${normName(r.player_name)}`, normPosition(r.position)]));

  const byNameOnly = new Map<string, string | null | undefined>(); // undefined = ambiguo (>1 club)
  for (const r of squadRows) {
    const key = normName(r.player_name);
    const pos = normPosition(r.position);
    if (byNameOnly.has(key)) {
      byNameOnly.set(key, undefined);
    } else {
      byNameOnly.set(key, pos);
    }
  }

  const out: Record<string, string> = {};
  for (const row of metricRows) {
    const key = `${row.team}|${row.player_name}`;
    if (key in out) continue;
    const normed = normName(row.player_name);
    const aliasedTeam = TEAM_ALIAS_FOTMOB_TO_ESPN[row.team] ?? row.team;

    let pos = byTeamAndName.get(`${aliasedTeam}|${normed}`);
    if (!pos) {
      const uniquePos = byNameOnly.get(normed);
      if (uniquePos) pos = uniquePos;
    }
    if (pos) out[key] = pos;
  }
  return out;
}

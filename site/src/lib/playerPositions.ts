// Cruce nombre-jugador -> posición (GK/DF/MF/FW) entre las métricas de FotMob
// (nombre "Gabriel Ávalos") y el plantel de ESPN (mismo formato de nombre,
// pero puede variar en acentos/orden). Se usa para ponderar el índice global
// por posición. Un solo lugar -> mismo criterio en Jugadores, Comparar y Analizar.

interface HasTeamName {
  team: string;
  player_name: string;
}
interface HasMetric {
  metric: string;
  value: number | null;
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

function nameTokens(name: string): string[] {
  return normName(name).split(" ").filter(Boolean);
}

// Métricas que sólo existen para arqueros -- si un jugador las tiene, es
// arquero, sin importar si el roster de ESPN lo tiene cargado o no. No es una
// inferencia estadística: es una deducción directa de la propia fuente
// (FotMob no publica atajadas para nadie que no sea arquero).
const GK_SIGNATURE_METRICS = new Set(["saves", "_save_percentage", "goals_conceded", "_goals_prevented"]);

/**
 * Mapa `${team}|${player_name de las métricas}` -> posición, cruzando por
 * nombre normalizado contra el plantel. En orden:
 *   1. team (con alias FotMob->ESPN) + nombre normalizado -- el match preciso.
 *   2. subconjunto de tokens dentro del MISMO club (≥2 tokens en común y un
 *      único candidato) -- recupera nombres compuestos/abreviados distintos
 *      entre fuentes (ej. "Cristian Alberto Tarragona" vs "Cristian Tarragona").
 *   3. nombre normalizado solo, SI ese nombre es único en toda la liga (evita
 *      mezclar homónimos de distinto club, ej. los 3 "Palavecino" reales).
 *   4. firma de datos: si el jugador tiene alguna métrica exclusiva de
 *      arquero (saves, _save_percentage, goals_conceded, _goals_prevented),
 *      es arquero -- no hace falta cruzar con ESPN para saberlo.
 * Quien no cruza en ninguna queda sin posición -- no cae a un promedio plano
 * (ver globalIndex.ts), directamente no recibe índice GLOBAL de una cifra
 * (pero sí puede mostrar categorías cross-posición, ver playerCategories.ts).
 */
export function buildPlayerPositions<T extends HasTeamName & Partial<HasMetric>>(
  metricRows: T[],
  squadRows: HasPosition[],
): Record<string, string> {
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

  const squadsByClub = new Map<string, HasPosition[]>();
  for (const r of squadRows) {
    const list = squadsByClub.get(r.team);
    if (list) list.push(r);
    else squadsByClub.set(r.team, [r]);
  }

  function tokenSubsetMatch(club: string, playerTokens: string[]): string | null {
    const candidates = squadsByClub.get(club);
    if (!candidates) return null;
    const positions = new Set<string>();
    let nMatches = 0;
    for (const c of candidates) {
      const common = nameTokens(c.player_name).filter((t) => playerTokens.includes(t));
      if (common.length >= 2) {
        nMatches++;
        const pos = normPosition(c.position);
        if (pos) positions.add(pos);
      }
    }
    return nMatches === 1 && positions.size === 1 ? [...positions][0] : null;
  }

  // Jugadores con métricas GK-exclusivas, para el paso 4 (firma de datos).
  const gkByKey = new Set<string>();
  for (const row of metricRows) {
    if (row.metric && GK_SIGNATURE_METRICS.has(row.metric) && row.value != null) {
      gkByKey.add(`${row.team}|${row.player_name}`);
    }
  }

  const out: Record<string, string> = {};
  for (const row of metricRows) {
    const key = `${row.team}|${row.player_name}`;
    if (key in out) continue;
    const normed = normName(row.player_name);
    const aliasedTeam = TEAM_ALIAS_FOTMOB_TO_ESPN[row.team] ?? row.team;

    let pos = byTeamAndName.get(`${aliasedTeam}|${normed}`);
    if (!pos) pos = tokenSubsetMatch(aliasedTeam, nameTokens(row.player_name)) ?? undefined;
    if (!pos) {
      const uniquePos = byNameOnly.get(normed);
      if (uniquePos) pos = uniquePos;
    }
    if (!pos && gkByKey.has(key)) pos = "GK";
    if (pos) out[key] = pos;
  }
  return out;
}

// =============================================================================
// Predicción de partido — modelo HEURÍSTICO y transparente (no una casa de
// apuestas). Combina rendimiento observado hasta ahora en el Mundial 2026:
//   · físico colectivo   (FIFA Training Centre, por equipo)
//   · táctico colectivo  (ofensivo / control / defensivo, por equipo)
//   · individual ponderado (calidad de los mejores jugadores, índice global
//     por posición estilo EA FC)
// -> una "Fuerza" 0-100 por selección. La diferencia de Fuerza se traduce a una
// ventaja de goles y con Poisson salen las probabilidades 1-X-2 y los marcadores
// más probables. Es un modelo simple y explicable, no una predicción profesional:
// no usa cuotas, historial ni contexto (lesiones, clima, fase). Sirve para
// dimensionar "quién llega mejor", no para acertar el resultado.
// =============================================================================

import { makeIndexer } from "./normalize";
import { positionWeightedGlobal } from "./globalIndex";
import { PLAYER_METRIC_LABELS, PLAYER_RADAR_ORDER } from "./playerMetrics";

// Promedio de goles por partido del torneo (97 partidos 2026). Calibra el total.
export const AVG_TOTAL_GOALS = 2.9;

// Pesos de la Fuerza (suman 1). La jerarquía individual y el juego con la pelota
// pesan más; el físico es contexto.
const W = { fisico: 0.15, ofensivo: 0.25, control: 0.15, defensivo: 0.15, individual: 0.3 };

// ~7 puntos de índice de diferencia ≈ 1 gol de ventaja esperada. El índice está
// calibrado con piso (40-100), así que comprime las diferencias entre equipos;
// este factor las vuelve a abrir un poco para que el favoritismo se note.
const DIFF_PER_GOAL = 7;

const PHYS_KEYS = ["distancia_promedio_km", "alta_intensidad_promedio_m", "sprints_promedio", "velocidad_punta_kmh"];
const OFF_KEYS = ["remates_promedio", "progresiones_promedio", "quiebres_linea_promedio"];
const DEF_KEYS = ["tackles_promedio", "intercepciones_promedio", "recuperaciones_promedio", "presiones_promedio"];
const CONTROL_KEY = "precision_pases_pct";

export interface TeamStrength {
  team: string;
  fisico: number;
  ofensivo: number;
  control: number;
  defensivo: number;
  individual: number;
  fuerza: number;
  velocidad: number; // índice de velocidad punta (para escenarios de transición)
  presion: number; // índice de presión (para escenarios)
  topPlayer: string | null; // mejor jugador por índice global (para la narrativa)
}

export interface Prediction {
  pA: number; // prob. gana A (0..1)
  pDraw: number;
  pB: number;
  xA: number; // goles esperados A
  xB: number;
  topScores: { a: number; b: number; p: number }[]; // marcadores más probables
  scenarios: string[];
}

type Row = Record<string, unknown>;

function avgIdx(indexers: Record<string, (v: number) => number>, row: Row | undefined, keys: string[]): number {
  if (!row) return 0;
  const vals = keys.map((k) => indexers[k]?.(Number(row[k]))).filter((v) => Number.isFinite(v)) as number[];
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

export function buildPredictor(
  physicalRows: Row[],
  tacticalRows: Row[],
  playerRows: { player_name: string; team: string; metric: string; value: number | null }[],
  positions: Record<string, string>,
  avgTotalGoals = AVG_TOTAL_GOALS,
) {
  // Indexadores por métrica de EQUIPO sobre las 48 selecciones.
  const teamIndexers: Record<string, (v: number) => number> = {};
  for (const k of PHYS_KEYS) teamIndexers[k] = makeIndexer(physicalRows.map((r) => Number(r[k])).filter(Number.isFinite));
  for (const k of [...OFF_KEYS, ...DEF_KEYS, CONTROL_KEY])
    teamIndexers[k] = makeIndexer(tacticalRows.map((r) => Number(r[k])).filter(Number.isFinite));

  // Indexadores por métrica de JUGADOR sobre todos los medidos (para el índice global).
  const playerIndexers: Record<string, (v: number) => number> = {};
  for (const m of PLAYER_RADAR_ORDER) {
    playerIndexers[m] = makeIndexer(playerRows.filter((r) => r.metric === m && r.value != null).map((r) => r.value as number));
  }

  // Índice global (ponderado por posición) por jugador -> mejores 11 por equipo.
  const byPlayer = new Map<string, { team: string; player: string; factors: { metric: string; idx: number }[] }>();
  for (const r of playerRows) {
    if (!PLAYER_METRIC_LABELS[r.metric] || r.value == null) continue;
    const key = `${r.team}|${r.player_name}`;
    let e = byPlayer.get(key);
    if (!e) {
      e = { team: r.team, player: r.player_name, factors: [] };
      byPlayer.set(key, e);
    }
    e.factors.push({ metric: r.metric, idx: playerIndexers[r.metric](r.value) });
  }
  const teamPlayers = new Map<string, { player: string; global: number }[]>();
  for (const e of byPlayer.values()) {
    if (e.factors.length < 4) continue;
    const pos = positions[`${e.team}|${e.player}`] ?? null;
    if (pos === "GK") continue; // el índice global excluye arqueros
    const g = positionWeightedGlobal(e.factors, pos);
    (teamPlayers.get(e.team) ?? teamPlayers.set(e.team, []).get(e.team)!).push({ player: e.player, global: g });
  }

  const physByTeam = new Map(physicalRows.map((r) => [String(r.team), r]));
  const tacByTeam = new Map(tacticalRows.map((r) => [String(r.team), r]));

  const strengths = new Map<string, TeamStrength>();
  for (const team of new Set([...physByTeam.keys()].filter((t) => tacByTeam.has(t)))) {
    const p = physByTeam.get(team);
    const t = tacByTeam.get(team);
    const players = (teamPlayers.get(team) ?? []).sort((a, b) => b.global - a.global);
    const top11 = players.slice(0, 11);
    const individual = top11.length ? Math.round(top11.reduce((s, x) => s + x.global, 0) / top11.length) : 50;

    const fisico = avgIdx(teamIndexers, p, PHYS_KEYS);
    const ofensivo = avgIdx(teamIndexers, t, OFF_KEYS);
    const defensivo = avgIdx(teamIndexers, t, DEF_KEYS);
    const control = teamIndexers[CONTROL_KEY]?.(Number(t?.[CONTROL_KEY])) ?? 0;
    const fuerza = Math.round(
      W.fisico * fisico + W.ofensivo * ofensivo + W.control * control + W.defensivo * defensivo + W.individual * individual,
    );
    strengths.set(team, {
      team,
      fisico: Math.round(fisico),
      ofensivo: Math.round(ofensivo),
      control: Math.round(control),
      defensivo: Math.round(defensivo),
      individual,
      fuerza,
      velocidad: teamIndexers["velocidad_punta_kmh"]?.(Number(p?.["velocidad_punta_kmh"])) ?? 0,
      presion: teamIndexers["presiones_promedio"]?.(Number(t?.["presiones_promedio"])) ?? 0,
      topPlayer: top11[0]?.player ?? null,
    });
  }

  function predict(A: TeamStrength, B: TeamStrength): Prediction {
    const mu = clamp((A.fuerza - B.fuerza) / DIFF_PER_GOAL, -2.5, 2.5);
    const xA = clamp(avgTotalGoals / 2 + mu / 2, 0.25, 4.5);
    const xB = clamp(avgTotalGoals / 2 - mu / 2, 0.25, 4.5);

    const MAX = 8;
    const pa = poissonVec(xA, MAX);
    const pb = poissonVec(xB, MAX);
    let pA = 0;
    let pDraw = 0;
    let pB = 0;
    const scores: { a: number; b: number; p: number }[] = [];
    for (let a = 0; a <= MAX; a++) {
      for (let b = 0; b <= MAX; b++) {
        const p = pa[a] * pb[b];
        if (a > b) pA += p;
        else if (a === b) pDraw += p;
        else pB += p;
        scores.push({ a, b, p });
      }
    }
    const topScores = scores.sort((x, y) => y.p - x.p).slice(0, 3);
    return { pA, pDraw, pB, xA, xB, topScores, scenarios: buildScenarios(A, B, xA, xB) };
  }

  return { strengths, predict };
}

// --- narrativa determinística de "cómo se puede desarrollar" ---
function buildScenarios(A: TeamStrength, B: TeamStrength, xA: number, xB: number): string[] {
  const out: string[] = [];
  const diff = A.fuerza - B.fuerza;
  const strong = Math.abs(diff) >= 5 ? (diff > 0 ? A : B) : null;
  const weak = strong ? (strong === A ? B : A) : null;

  // 1) marco general
  if (strong && weak) {
    out.push(
      `${strong.team} llega mejor por rendimiento observado (Fuerza ${strong.fuerza} contra ${weak.fuerza}): parte como favorito, pero es un solo partido y el margen no es enorme.`,
    );
  } else {
    out.push(`Partido parejo por rendimiento (Fuerza ${A.fuerza} y ${B.fuerza}): probablemente se defina por un detalle, una pelota parada o un acierto individual.`);
  }

  // 2) dónde saca ventaja (la mayor brecha entre sub-índices) — siempre da textura
  const dims: { key: string; a: number; b: number; hi: string; lo: string }[] = [
    { key: "juego ofensivo", a: A.ofensivo, b: B.ofensivo, hi: "genera más volumen ofensivo (remates y progresiones)", lo: "" },
    { key: "control de la pelota", a: A.control, b: B.control, hi: "maneja mejor la pelota (más precisión de pase)", lo: "" },
    { key: "trabajo defensivo", a: A.defensivo, b: B.defensivo, hi: "es más sólida sin la pelota (quites, intercepciones, recuperaciones)", lo: "" },
    { key: "despliegue físico", a: A.fisico, b: B.fisico, hi: "corre e insiste más a alta intensidad", lo: "" },
    { key: "jerarquía individual", a: A.individual, b: B.individual, hi: "tiene mejores individualidades (índice global)", lo: "" },
  ];
  const biggest = dims.map((d) => ({ ...d, diff: d.a - d.b })).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))[0];
  if (biggest && Math.abs(biggest.diff) >= 3) {
    const w2 = biggest.diff > 0 ? A : B;
    const mag = Math.abs(biggest.diff) >= 12 ? "una ventaja clara" : Math.abs(biggest.diff) >= 6 ? "ventaja" : "una ventaja leve";
    out.push(`Donde más se diferencian es en ${biggest.key}: ${w2.team} saca ${mag} — ${biggest.hi}.`);
  }

  // 2) quién maneja la pelota / presión
  if (Math.abs(A.control - B.control) >= 8) {
    const dom = A.control > B.control ? A : B;
    const other = dom === A ? B : A;
    let s = `${dom.team} tiende a manejar más la pelota (mejor precisión de pase).`;
    if (other.presion - dom.presion >= 8) s += ` ${other.team} intentará presionarlo arriba para robar y salir rápido.`;
    out.push(s);
  } else if (Math.max(A.presion, B.presion) >= 70) {
    const pr = A.presion > B.presion ? A : B;
    out.push(`${pr.team} presiona fuerte: puede ser un partido de mucha disputa y transiciones, con la pelota cambiando de dueño seguido.`);
  }

  // 3) amenaza ofensiva / velocidad
  const offLeader = A.ofensivo >= B.ofensivo ? A : B;
  const offOther = offLeader === A ? B : A;
  if (offLeader.ofensivo - offOther.ofensivo >= 8) {
    let s = `${offLeader.team} genera más volumen ofensivo (remates y progresiones).`;
    if (offLeader.velocidad >= 70) s += ` Con su velocidad punta, es peligrosa a la espalda y en contra.`;
    out.push(s);
  } else if (Math.min(A.ofensivo, B.ofensivo) <= 55 && Math.max(A.defensivo, B.defensivo) >= 65) {
    out.push(`Los dos generan poco y defienden bien: pinta partido cerrado, de pocas situaciones claras.`);
  }

  // 4) jerarquía individual
  if (Math.abs(A.individual - B.individual) >= 8) {
    const q = A.individual > B.individual ? A : B;
    if (q.topPlayer) out.push(`La diferencia la puede marcar la jerarquía individual: ${q.topPlayer} es el jugador de mejor índice global del cruce.`);
  }

  // 5) físico en el tramo final
  if (Math.abs(A.fisico - B.fisico) >= 10) {
    const fit = A.fisico > B.fisico ? A : B;
    out.push(`${fit.team} corre e insiste más a alta intensidad: puede pesar en el tramo final si el partido se estira.`);
  }

  return out.slice(0, 4);
}

function poissonVec(lambda: number, max: number): number[] {
  const out: number[] = [];
  let p = Math.exp(-lambda); // P(0)
  out.push(p);
  for (let k = 1; k <= max; k++) {
    p = (p * lambda) / k;
    out.push(p);
  }
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

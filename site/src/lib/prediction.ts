// =============================================================================
// Predicción de partido — modelo HEURÍSTICO y transparente (no una casa de
// apuestas). Combina rendimiento observado hasta ahora en la Liga Profesional:
//   · ofensivo colectivo   (remates y remates al arco por partido, ESPN)
//   · control de la pelota (posesión-proxy y precisión de pase, ESPN)
//   · defensivo colectivo  (remates al arco y goles RECIBIDOS por partido --
//     lo que le hizo el rival en el mismo partido, ver build_aggregates.py)
//   · individual ponderado (calidad de los mejores jugadores, índice global
//     por posición estilo EA FC, sobre las 37 categorías de FotMob)
// -> una "Fuerza" 0-100 por club. La diferencia de Fuerza se traduce a una
// ventaja de goles y con Poisson salen las probabilidades 1-X-2 y los marcadores
// más probables. Es un modelo simple y explicable, no una predicción profesional:
// no usa cuotas, historial ni contexto (lesiones, clima, fecha del campeonato).
// Sirve para dimensionar "quién llega mejor", no para acertar el resultado.
//
// No hay dimensión física (no existe dato GPS/físico gratuito para LPF, ver
// docstring de etl/fetch_espn_lpf.py) ni táctico por jugador (ESPN no publica
// boxscore.players para esta liga) -- a diferencia de la versión Mundial de
// este modelo, que sí tenía ambas.
// =============================================================================

import { computeTeamStrengths, type TeamStrength } from "./clubStrength";

// Promedio de goles TOTALES por partido -- fallback si por algún motivo no
// se puede derivar de team_season_summary.json (ver deriveAvgTotalGoals).
// Valor real observado a esta fecha (297 partidos jugados de la LPF): 2.07.
export const AVG_TOTAL_GOALS = 2.08;

// Puntos de índice de diferencia ≈ 1 gol de ventaja esperada. Calibrado por
// regresión lineal (gd ~ ΔFuerza) sobre los partidos ya jugados de la LPF --
// última recalibración: 297 partidos, pendiente real ≈29.5 (r=0.33). El
// valor anterior (26) venía de la misma regresión sobre 282 partidos, de
// antes del fix de renormalización del índice GLOBAL (num/covered en vez de
// num/den, ver globalIndex.ts) -- ese fix cambió el GLOBAL de los jugadores
// a los que les faltaba alguna métrica no censurada-en-cero (ej. rating),
// que a su vez mueve la "Fuerza" individual de varios clubes lo suficiente
// como para correr la pendiente real. Recalibrar este único número es lo
// que más devuelve el modelo a la realidad -- ver /metodologia/. Sin
// recalibrar quedaría ~13% más confiado de lo que la regresión sostiene
// (29.5/26 ≈ 1.13): un cruce con 15 puntos de diferencia de Fuerza saturaría
// más rápido de lo que los datos justifican.
const DIFF_PER_GOAL = 29.5;

export type { TeamStrength };

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

// Deriva el promedio de goles TOTALES por partido directo de los datos reales
// de la temporada (team_season_summary.json ya trae goles y partidos por
// club) en vez de un número fijo, para que se autocorrija solo cuando cambie
// el contexto (otra temporada, otro formato de torneo). `goles_totales` es
// lo anotado POR ese club en sus `partidos`; sumando sobre los 30 clubes cada
// partido se cuenta una vez por cada uno de sus dos equipos, así que el
// promedio resultante ya es "goles por equipo por partido" -- se multiplica
// por 2 para el total del partido (los dos equipos).
function deriveAvgTotalGoals(teamRows: Row[]): number {
  let goals = 0;
  let matches = 0;
  for (const r of teamRows) {
    const g = Number((r as any).goles_totales);
    const p = Number((r as any).partidos);
    if (Number.isFinite(g) && Number.isFinite(p) && p > 0) {
      goals += g;
      matches += p;
    }
  }
  return matches > 0 ? (2 * goals) / matches : AVG_TOTAL_GOALS;
}

export function buildPredictor(
  teamRows: Row[],
  playerRows: { player_name: string; team: string; metric: string; value: number | null }[],
  positions: Record<string, string>,
  avgTotalGoalsOverride?: number,
) {
  const avgTotalGoals = avgTotalGoalsOverride ?? deriveAvgTotalGoals(teamRows);
  // Fuerza de cada club -- MISMO cálculo que usa Comparar (RadarCompare.tsx)
  // para su radar de equipo, ver clubStrength.ts. Antes este archivo tenía su
  // propia copia de esta lógica (duplicada, con riesgo de divergir en
  // silencio -- que es exactamente lo que terminó pasando).
  const strengths = computeTeamStrengths(teamRows, playerRows, positions);

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
    return { pA, pDraw, pB, xA, xB, topScores, scenarios: buildScenarios(A, B) };
  }

  return { strengths, predict };
}

// --- narrativa determinística de "cómo se puede desarrollar" ---
function buildScenarios(A: TeamStrength, B: TeamStrength): string[] {
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
  const dims: { key: string; a: number; b: number; hi: string }[] = [
    { key: "juego ofensivo", a: A.ofensivo, b: B.ofensivo, hi: "genera más volumen ofensivo (remates y remates al arco)" },
    { key: "control de la pelota", a: A.control, b: B.control, hi: "maneja mejor la pelota (más posesión y precisión de pase)" },
    { key: "solidez defensiva", a: A.defensivo, b: B.defensivo, hi: "es más sólida atrás (recibe menos remates y goles)" },
    { key: "jerarquía individual", a: A.individual, b: B.individual, hi: "tiene mejores individualidades (índice global)" },
  ];
  const biggest = dims.map((d) => ({ ...d, diff: d.a - d.b })).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))[0];
  if (biggest && Math.abs(biggest.diff) >= 3) {
    const w2 = biggest.diff > 0 ? A : B;
    const mag = Math.abs(biggest.diff) >= 12 ? "una ventaja clara" : Math.abs(biggest.diff) >= 6 ? "ventaja" : "una ventaja leve";
    out.push(`Donde más se diferencian es en ${biggest.key}: ${w2.team} saca ${mag} — ${biggest.hi}.`);
  }

  // 3) quién maneja la pelota
  if (Math.abs(A.control - B.control) >= 8) {
    const dom = A.control > B.control ? A : B;
    out.push(`${dom.team} tiende a manejar más la pelota (mejor posesión y precisión de pase).`);
  }

  // 4) amenaza ofensiva vs. solidez defensiva
  const offLeader = A.ofensivo >= B.ofensivo ? A : B;
  const offOther = offLeader === A ? B : A;
  if (offLeader.ofensivo - offOther.ofensivo >= 8) {
    out.push(`${offLeader.team} genera más volumen ofensivo (remates y remates al arco por partido).`);
  } else if (Math.min(A.ofensivo, B.ofensivo) <= 55 && Math.max(A.defensivo, B.defensivo) >= 65) {
    out.push(`Los dos generan poco y defienden bien: pinta partido cerrado, de pocas situaciones claras.`);
  }

  // 5) jerarquía individual
  if (Math.abs(A.individual - B.individual) >= 8) {
    const q = A.individual > B.individual ? A : B;
    if (q.topPlayer) out.push(`La diferencia la puede marcar la jerarquía individual: ${q.topPlayer} es el jugador de mejor índice global del cruce.`);
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

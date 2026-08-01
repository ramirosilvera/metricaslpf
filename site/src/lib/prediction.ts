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

import { makeIndexer, isLowerBetter, buildIndexers } from "./normalize";
import { positionWeightedGlobal } from "./globalIndex";
import { PLAYER_METRIC_LABELS, PLAYER_RADAR_ORDER } from "./playerMetrics";
import { sampleTier } from "./playerSampleGate";

// Promedio de goles por partido de la liga. Calibra el total esperado.
export const AVG_TOTAL_GOALS = 2.6;

// Pesos de la Fuerza (suman 1). La jerarquía individual y el juego ofensivo
// pesan más; el control de la pelota y lo defensivo completan el cuadro.
const W = { ofensivo: 0.3, control: 0.2, defensivo: 0.25, individual: 0.25 };

// ~7 puntos de índice de diferencia ≈ 1 gol de ventaja esperada. El índice está
// calibrado con piso (40-100), así que comprime las diferencias entre equipos;
// este factor las vuelve a abrir un poco para que el favoritismo se note.
const DIFF_PER_GOAL = 7;

const OFF_KEYS = ["remates_promedio", "remates_al_arco_promedio"];
const CONTROL_KEYS = ["posesion_promedio_proxy", "precision_pases_promedio"];
const DEF_KEYS = ["remates_al_arco_recibidos_promedio", "goles_recibidos_promedio"];

export interface TeamStrength {
  team: string;
  ofensivo: number;
  control: number;
  defensivo: number;
  individual: number;
  fuerza: number;
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
  teamRows: Row[],
  playerRows: { player_name: string; team: string; metric: string; value: number | null }[],
  positions: Record<string, string>,
  avgTotalGoals = AVG_TOTAL_GOALS,
) {
  // Indexadores por métrica de EQUIPO sobre los 30 clubes. Las métricas
  // "conceded" (menos es mejor) se detectan vía isLowerBetter -- si no, un
  // club que recibe más goles rankearía como mejor defensor.
  const teamIndexers: Record<string, (v: number) => number> = {};
  for (const k of [...OFF_KEYS, ...CONTROL_KEYS, ...DEF_KEYS]) {
    teamIndexers[k] = makeIndexer(teamRows.map((r) => Number(r[k])).filter(Number.isFinite), isLowerBetter(k));
  }

  // Indexadores por métrica de JUGADOR sobre todos los medidos (para el índice global).
  const { indexers: playerIndexers, metricsWithData } = buildIndexers(playerRows, PLAYER_RADAR_ORDER);

  // Índice global (ponderado por posición) por jugador -> mejores 11 por equipo.
  // Mismo gate de muestra mínima que el ranking de jugadores (ver
  // playerSampleGate.ts): un jugador con pocos minutos no debería mover la
  // "Fuerza" estimada de su equipo.
  const byPlayer = new Map<
    string,
    { team: string; player: string; factors: { metric: string; idx: number }[]; matchesPlayed: number | null; minsPlayed: number | null }
  >();
  for (const r of playerRows) {
    if (!PLAYER_METRIC_LABELS[r.metric] || r.value == null) continue;
    const key = `${r.team}|${r.player_name}`;
    let e = byPlayer.get(key);
    if (!e) {
      e = { team: r.team, player: r.player_name, factors: [], matchesPlayed: null, minsPlayed: null };
      byPlayer.set(key, e);
    }
    if (r.metric === "matches_played") e.matchesPlayed = r.value;
    if (r.metric === "mins_played") e.minsPlayed = r.value;
    e.factors.push({ metric: r.metric, idx: playerIndexers[r.metric](r.value) });
  }
  const teamPlayers = new Map<string, { player: string; global: number }[]>();
  for (const e of byPlayer.values()) {
    if (sampleTier(e.matchesPlayed, e.minsPlayed) !== "ranked") continue;
    const pos = positions[`${e.team}|${e.player}`] ?? null;
    const g = positionWeightedGlobal(e.factors, pos, playerIndexers, metricsWithData);
    if (g == null) continue;
    (teamPlayers.get(e.team) ?? teamPlayers.set(e.team, []).get(e.team)!).push({ player: e.player, global: g });
  }

  const teamByName = new Map(teamRows.map((r) => [String(r.team), r]));

  const strengths = new Map<string, TeamStrength>();
  for (const team of teamByName.keys()) {
    const t = teamByName.get(team);
    const players = (teamPlayers.get(team) ?? []).sort((a, b) => b.global - a.global);
    const top11 = players.slice(0, 11);
    const individual = top11.length ? Math.round(top11.reduce((s, x) => s + x.global, 0) / top11.length) : 50;

    const ofensivo = avgIdx(teamIndexers, t, OFF_KEYS);
    const control = avgIdx(teamIndexers, t, CONTROL_KEYS);
    const defensivo = avgIdx(teamIndexers, t, DEF_KEYS);
    const fuerza = Math.round(W.ofensivo * ofensivo + W.control * control + W.defensivo * defensivo + W.individual * individual);
    strengths.set(team, {
      team,
      ofensivo: Math.round(ofensivo),
      control: Math.round(control),
      defensivo: Math.round(defensivo),
      individual,
      fuerza,
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

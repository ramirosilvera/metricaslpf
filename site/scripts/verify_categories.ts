import { readFileSync } from "node:fs";
import { buildPlayerPositions } from "../src/lib/playerPositions";
import { buildCategoryContext, computeCategoryScores } from "../src/lib/playerCategories";
import { computeGlobalIndex } from "../src/lib/globalIndex";
import { buildIndexers } from "../src/lib/normalize";
import { PLAYER_RADAR_ORDER, PLAYER_METRIC_LABELS } from "../src/lib/playerMetrics";

const ROOT = "public/data";
const rows: any[] = JSON.parse(readFileSync(`${ROOT}/derived_player_metrics.json`, "utf-8"));
const squads: any[] = JSON.parse(readFileSync(`${ROOT}/squads.json`, "utf-8"));

const positions = buildPlayerPositions(rows, squads);
console.log(`Posiciones resueltas: ${Object.keys(positions).length}`);

const ctx = buildCategoryContext(rows, positions);

const byPlayer = new Map<string, { team: string; player: string; raw: Map<string, number>; mp: number | null; mins: number | null }>();
for (const r of rows) {
  if (r.value == null) continue;
  const key = `${r.team}|${r.player_name}`;
  let e = byPlayer.get(key);
  if (!e) {
    e = { team: r.team, player: r.player_name, raw: new Map(), mp: null, mins: null };
    byPlayer.set(key, e);
  }
  e.raw.set(r.metric, r.value);
  if (r.metric === "matches_played") e.mp = r.value;
  if (r.metric === "mins_played") e.mins = r.value;
}

let total = 0;
let withAnyCategory = 0;
let withNoCategory = 0;
let solid = 0, smallSample = 0, partial = 0;
const examples: any[] = [];

for (const [key, e] of byPlayer) {
  total++;
  const pos = positions[key] ?? null;
  const scores = computeCategoryScores(pos, e.mp, e.mins, e.raw, ctx);
  const anyVisible = scores.some((s) => s.state !== "none");
  if (anyVisible) withAnyCategory++;
  else withNoCategory++;
  for (const s of scores) {
    if (s.state === "solid") solid++;
    else if (s.state === "small_sample") smallSample++;
    else if (s.state === "partial") partial++;
  }
  if (e.player === "Milton Giménez" || e.player === "Lucas Alario" || e.player === "Ryoga Kida") {
    examples.push({
      player: e.player, team: e.team, mp: e.mp, mins: e.mins, pos,
      scores: scores.map((s) => ({ k: s.key, idx: s.idx, c: s.completeness.toFixed(2), state: s.state, n: `${s.factorsPresent}/${s.factorsTotal}` })),
    });
  }
}

console.log(`\nTotal jugadores: ${total}`);
console.log(`Con >=1 categoría visible: ${withAnyCategory} (${(100 * withAnyCategory / total).toFixed(1)}%)`);
console.log(`Sin ninguna categoría: ${withNoCategory}`);
console.log(`\nCategoría-estados (sobre todas las categorías de todos los jugadores): solid=${solid} small_sample=${smallSample} partial=${partial}`);

console.log("\n--- Ejemplos verificados contra la spec de Opus ---");
for (const ex of examples) console.log(JSON.stringify(ex));

const { indexers, metricsWithData } = buildIndexers(rows, PLAYER_RADAR_ORDER);
const globalInputs = [...byPlayer.entries()].map(([key, e]) => ({
  key, position: positions[key] ?? null,
  factors: [...e.raw.entries()].filter(([m]) => PLAYER_METRIC_LABELS[m]).map(([m, v]) => ({ metric: m, idx: indexers[m](v) })),
  matchesPlayed: e.mp, minsPlayed: e.mins,
}));
const globals = computeGlobalIndex(globalInputs, indexers, metricsWithData);
let globalCount = 0;
for (const [, g] of globals) if (g != null) globalCount++;
console.log(`\nGLOBAL emitido para: ${globalCount} jugadores`);

let noRatingQualified = 0, noRatingWithGlobal = 0;
for (const [key, e] of byPlayer) {
  if ((e.mp ?? 0) >= 11 && !e.raw.has("rating")) {
    noRatingQualified++;
    if (globals.get(key) != null) noRatingWithGlobal++;
  }
}
console.log(`Calificados sin rating: ${noRatingQualified}, de esos con GLOBAL emitido: ${noRatingWithGlobal}`);

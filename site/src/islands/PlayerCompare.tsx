import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { DerivedPlayerMetricRow } from "../lib/data";
import { useChartTokens, useIsNarrow, wrapAxisName } from "../lib/theme";
import { buildIndexers } from "../lib/normalize";
import { PLAYER_METRIC_LABELS, PLAYER_RADAR_ORDER, INSIGHT_EXCLUDED_METRICS } from "../lib/playerMetrics";
import { computeGlobalIndex } from "../lib/globalIndex";
import { escapeHtml } from "../lib/flags";
import { generateVsBestInsights, type VsBestMetric } from "../lib/insights";
import { sampleTier } from "../lib/playerSampleGate";
import {
  buildCategoryContext,
  computeCategoryScores,
  isPosition,
  CATEGORY_ORDER,
  FALLBACK_CATEGORY_ORDER,
  CATEGORY_LABELS,
  type CategoryKey,
  type CategoryScore,
} from "../lib/playerCategories";

// Comparación CABEZA A CABEZA de dos jugadores: radar FIJO de categorías
// estilo EA SPORTS FC (5 ejes de campo -- Ataque/Creación/Pase/Defensa/
// Valoración -- o 4 de arquero -- Atajadas/Valla/Pies/Valoración), no un
// radar de factores sueltos que sólo comparte lo que ambos tengan cargado:
// así SIEMPRE se comparan las mismas categorías, jueguen la posición que
// jueguen (ver playerCategories.ts, misma fuente que la ficha de jugador y
// el ranking). El GLOBAL de cada uno es ponderado por su posición (estilo EA
// FC). Arqueros y jugadores de campo no comparten categorías -- comparar
// ambos no tendría ejes en común, así que se bloquea con un aviso.

const POS_LABEL: Record<string, string> = { GK: "Arquero", DF: "Defensor", MF: "Mediocampista", FW: "Delantero" };

interface Props {
  rows: DerivedPlayerMetricRow[];
  positions?: Record<string, string>;
}

interface PlayerData {
  key: string;
  team: string;
  player: string;
  position: string | null;
  byMetric: Map<string, { idx: number; raw: number }>;
  rawByMetric: Map<string, number>;
  matchesPlayed: number | null;
  minsPlayed: number | null;
}

/** Arqueros y jugadores de campo no tienen categorías en común -- este es el
 *  grupo que decide si dos jugadores son comparables con el radar fijo. */
function compareGroup(position: string | null): "GK" | "FIELD" {
  return position === "GK" ? "GK" : "FIELD";
}

export default function PlayerCompare({ rows, positions = {} }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  const { indexers, metricsWithData } = useMemo(() => buildIndexers(rows, PLAYER_RADAR_ORDER), [rows]);
  const categoryCtx = useMemo(() => buildCategoryContext(rows, positions), [rows, positions]);

  const players = useMemo(() => {
    const map = new Map<string, PlayerData>();
    for (const r of rows) {
      if (!PLAYER_METRIC_LABELS[r.metric] || r.value == null) continue;
      const key = `${r.team}|${r.player_name}`;
      let e = map.get(key);
      if (!e) {
        e = {
          key,
          team: r.team,
          player: r.player_name,
          position: positions[key] ?? null,
          byMetric: new Map(),
          rawByMetric: new Map(),
          matchesPlayed: null,
          minsPlayed: null,
        };
        map.set(key, e);
      }
      if (r.metric === "matches_played") e.matchesPlayed = r.value;
      if (r.metric === "mins_played") e.minsPlayed = r.value;
      e.byMetric.set(r.metric, { idx: indexers[r.metric](r.value), raw: r.value });
      e.rawByMetric.set(r.metric, r.value);
    }
    // sólo jugadores con base mínima de factores
    return [...map.values()].filter((p) => p.byMetric.size >= 4);
  }, [rows, indexers, positions]);

  // GLOBAL normalizado dentro de cada posición (ver globalIndex.ts), sobre el
  // perfil COMPLETO de cada jugador -- no sólo los factores que comparte con
  // el rival de turno, para que sea el mismo GLOBAL que se ve en el resto del
  // sitio (ranking, ficha).
  const globalByKey = useMemo(() => {
    const withPosition = players.map((p) => ({
      key: p.key,
      position: p.position,
      factors: [...p.byMetric.entries()].map(([metric, v]) => ({ metric, idx: v.idx })),
      matchesPlayed: p.matchesPlayed,
      minsPlayed: p.minsPlayed,
    }));
    return computeGlobalIndex(withPosition, indexers, metricsWithData);
  }, [players, indexers, metricsWithData]);

  const teams = useMemo(() => [...new Set(players.map((p) => p.team))].sort(), [players]);
  const playersOf = (team: string) => players.filter((p) => p.team === team).map((p) => p.player).sort();

  const pick = (team: string, prefer: string[]) => {
    const list = playersOf(team);
    return prefer.find((n) => list.includes(n)) ?? list[0] ?? "";
  };

  const teamA0 = teams.includes("Boca Juniors") ? "Boca Juniors" : teams[0] ?? "";
  const teamB0 = teams.includes("River Plate") ? "River Plate" : teams[1] ?? teams[0] ?? "";
  const [teamA, setTeamA] = useState(teamA0);
  const [teamB, setTeamB] = useState(teamB0);
  const [playerA, setPlayerA] = useState("");
  const [playerB, setPlayerB] = useState("");

  const effTeamA = teams.includes(teamA) ? teamA : teamA0;
  const effTeamB = teams.includes(teamB) ? teamB : teamB0;
  const effPlayerA = playersOf(effTeamA).includes(playerA) ? playerA : pick(effTeamA, []);
  const effPlayerB = playersOf(effTeamB).includes(playerB) ? playerB : pick(effTeamB, []);

  const a = players.find((p) => p.team === effTeamA && p.player === effPlayerA);
  const b = players.find((p) => p.team === effTeamB && p.player === effPlayerB);

  // Arqueros y jugadores de campo no tienen categorías en común -- bloquear
  // en vez de mostrar un radar vacío o mezclar escalas que no significan lo
  // mismo (ver cabecera del archivo).
  const blocked = a && b ? compareGroup(a.position) !== compareGroup(b.position) : false;

  const categoryScoresA = useMemo<CategoryScore[]>(
    () => (a ? computeCategoryScores(a.position, a.matchesPlayed, a.minsPlayed, a.rawByMetric, categoryCtx) : []),
    [a, categoryCtx],
  );
  const categoryScoresB = useMemo<CategoryScore[]>(
    () => (b ? computeCategoryScores(b.position, b.matchesPlayed, b.minsPlayed, b.rawByMetric, categoryCtx) : []),
    [b, categoryCtx],
  );

  // Ejes FIJOS por grupo -- 5 de campo o 4 de arquero, tenga o no datos el
  // jugador en cada una (el eje se muestra igual, con el estado "sin datos"
  // si corresponde). Nunca varía según lo que el rival tenga cargado.
  const axisKeys: CategoryKey[] = useMemo(() => {
    if (!a || blocked) return [];
    return isPosition(a.position) ? CATEGORY_ORDER[a.position] : FALLBACK_CATEGORY_ORDER;
  }, [a, blocked]);

  const axisData = useMemo(
    () =>
      axisKeys.map((key) => ({
        key,
        sa: categoryScoresA.find((s) => s.key === key),
        sb: categoryScoresB.find((s) => s.key === key),
      })),
    [axisKeys, categoryScoresA, categoryScoresB],
  );

  const hasCategoryRadar = !!a && !!b && !blocked && axisData.some((d) => d.sa?.idx != null || d.sb?.idx != null);

  // Si alguno de los dos está por debajo de la muestra "ranked" (600'), su
  // GLOBAL y/o alguna categoría puede venir con encogimiento de muestra
  // chica -- avisar antes de comparar los números como si fueran parejos.
  const smallSampleWarn = a && b ? [a, b].some((p) => sampleTier(p.matchesPlayed, p.minsPlayed) !== "ranked") : false;

  // ejes: factores que ambos tienen, en orden canónico -- vista de detalle
  // (colapsable), ya no el radar principal (ver axisData arriba). Se excluyen
  // los totales crudos con variante _per_90 ya disponible y los eventos
  // censurados en 0 (mismo criterio que el índice GLOBAL) -- si no, el radar
  // duplicaba ejes (goles Y goles cada 90') y la lectura automática podía
  // destacar "ventaja en tarjetas rojas" como si fuera un logro.
  const sharedMetrics = useMemo(() => {
    if (!a || !b) return [];
    return PLAYER_RADAR_ORDER.filter((m) => !INSIGHT_EXCLUDED_METRICS.has(m) && a.byMetric.has(m) && b.byMetric.has(m));
  }, [a, b]);

  const num = (m: string, v: number) => `${Math.round(v * 10) / 10}${PLAYER_METRIC_LABELS[m].suffix}`;
  const shortLabel = (m: string) => PLAYER_METRIC_LABELS[m].label.replace(" / partido", "");

  // Carta de share PRINCIPAL: GLOBAL + las categorías fijas (no los factores
  // compartidos -- ver arriba).
  const ratings = useMemo(() => {
    if (!a || !b || !hasCategoryRadar) return undefined;
    return {
      entities: [
        { name: a.player, color: tokens["--series-6"], ovr: globalByKey.get(a.key) ?? null },
        { name: b.player, color: tokens["--series-1"], ovr: globalByKey.get(b.key) ?? null },
      ],
      factors: axisData.map((d) => ({
        label: CATEGORY_LABELS[d.key],
        values: [d.sa?.idx ?? 0, d.sb?.idx ?? 0],
      })),
    };
  }, [a, b, hasCategoryRadar, axisData, tokens, globalByKey]);

  // Radar de factores sueltos compartidos -- vista de detalle (colapsable).
  const legacyRatings = useMemo(() => {
    if (!a || !b || sharedMetrics.length < 3) return undefined;
    return {
      entities: [
        { name: a.player, color: tokens["--series-6"], ovr: globalByKey.get(a.key) ?? null },
        { name: b.player, color: tokens["--series-1"], ovr: globalByKey.get(b.key) ?? null },
      ],
      factors: sharedMetrics.map((m) => ({ label: shortLabel(m), values: [a.byMetric.get(m)!.idx, b.byMetric.get(m)!.idx] })),
    };
  }, [a, b, sharedMetrics, tokens, globalByKey]);

  const insights = useMemo(() => {
    if (!a || !b || sharedMetrics.length === 0) return [];
    const metrics: VsBestMetric[] = sharedMetrics.map((m) => ({
      label: shortLabel(m).toLowerCase(),
      aPct: a.byMetric.get(m)!.idx,
      bPct: b.byMetric.get(m)!.idx,
      aRaw: a.byMetric.get(m)!.raw,
      bRaw: b.byMetric.get(m)!.raw,
      suffix: PLAYER_METRIC_LABELS[m].suffix,
    }));
    return generateVsBestInsights(a.player, b.player, metrics);
  }, [a, b, sharedMetrics]);

  // Radar PRINCIPAL: 5 (o 4) ejes fijos de categoría -- siempre los mismos
  // para esta posición, tenga o no ambos jugadores dato en cada una (0 +
  // "sin datos" en el tooltip cuando falta, nunca se inventa un valor).
  const option = useMemo(() => {
    if (!a || !b || !hasCategoryRadar) return {};
    const factorState = (s: CategoryScore | undefined) => (s?.idx != null ? "" : " · sin datos");
    return {
      color: [tokens["--series-6"], tokens["--series-1"]],
      tooltip: {
        confine: true,
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"] },
        formatter: (p: any) => {
          const who = p.seriesIndex === 0 ? a : b;
          const scores = p.seriesIndex === 0 ? categoryScoresA : categoryScoresB;
          const rowsTxt = axisData
            .map((d) => {
              const s = scores.find((x: CategoryScore) => x.key === d.key);
              return `${CATEGORY_LABELS[d.key]}: índice <strong>${s?.idx ?? "—"}</strong>${factorState(s)}`;
            })
            .join("<br/>");
          const pos = who.position ? ` · ${POS_LABEL[who.position] ?? who.position}` : "";
          return `<strong>${escapeHtml(who.player)}</strong> · ${escapeHtml(who.team)}${pos}<br/>${rowsTxt}`;
        },
      },
      legend: { bottom: 0, textStyle: { color: tokens["--text-secondary"] } },
      radar: {
        indicator: axisData.map((d) => ({
          name: narrow ? wrapAxisName(CATEGORY_LABELS[d.key], 12) : CATEGORY_LABELS[d.key],
          min: 0,
          max: 100,
        })),
        radius: narrow ? "56%" : "68%",
        axisName: { color: tokens["--text-secondary"], fontSize: narrow ? 9 : 10 },
        splitLine: { lineStyle: { color: tokens["--gridline"] } },
        splitArea: { areaStyle: { color: ["transparent", "transparent"] } },
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
      },
      series: [
        {
          type: "radar",
          data: [
            { name: a.player, value: axisData.map((d) => d.sa?.idx ?? 0), areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 } },
            { name: b.player, value: axisData.map((d) => d.sb?.idx ?? 0), areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 } },
          ],
        },
      ],
    };
  }, [a, b, hasCategoryRadar, axisData, categoryScoresA, categoryScoresB, tokens, narrow]);

  // Radar de detalle (factores sueltos compartidos) -- colapsable, ver JSX.
  const legacyOption = useMemo(() => {
    if (!a || !b || sharedMetrics.length < 3) return {};
    return {
      color: [tokens["--series-6"], tokens["--series-1"]],
      tooltip: {
        confine: true,
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"] },
        formatter: (p: any) => {
          const who = p.seriesIndex === 0 ? a : b;
          const rowsTxt = sharedMetrics
            .map((m) => {
              const d = who.byMetric.get(m)!;
              return `${shortLabel(m)}: índice <strong>${d.idx}</strong> · ${num(m, d.raw)}`;
            })
            .join("<br/>");
          const pos = who.position ? ` · ${POS_LABEL[who.position] ?? who.position}` : "";
          return `<strong>${escapeHtml(who.player)}</strong> · ${escapeHtml(who.team)}${pos}<br/>${rowsTxt}`;
        },
      },
      legend: { bottom: 0, textStyle: { color: tokens["--text-secondary"] } },
      radar: {
        indicator: sharedMetrics.map((m) => ({ name: narrow ? wrapAxisName(shortLabel(m), 12) : shortLabel(m), min: 0, max: 100 })),
        radius: narrow ? "56%" : "68%",
        axisName: { color: tokens["--text-secondary"], fontSize: narrow ? 9 : 10 },
        splitLine: { lineStyle: { color: tokens["--gridline"] } },
        splitArea: { areaStyle: { color: ["transparent", "transparent"] } },
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
      },
      series: [
        {
          type: "radar",
          data: [
            { name: a.player, value: sharedMetrics.map((m) => a.byMetric.get(m)!.idx), areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 } },
            { name: b.player, value: sharedMetrics.map((m) => b.byMetric.get(m)!.idx), areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 } },
          ],
        },
      ],
    };
  }, [a, b, sharedMetrics, tokens, narrow]);

  if (players.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay métricas por jugador cargadas para comparar.</p>;
  }

  const selectorPair = (
    team: string,
    setTeam: (v: string) => void,
    player: string,
    setPlayer: (v: string) => void,
  ) => (
    <div style={{ display: "flex", gap: "0.4rem", flex: "1 1 260px", minWidth: 0 }}>
      <select
        value={team}
        onChange={(e) => {
          setTeam(e.target.value);
          setPlayer("");
        }}
        aria-label="Club"
        style={{ flex: "0 0 auto", maxWidth: "45%" }}
      >
        {teams.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select value={player} onChange={(e) => setPlayer(e.target.value)} aria-label="Jugador" style={{ flex: "1 1 auto", minWidth: 0 }}>
        {playersOf(team).map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div>
      <div className="controls-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
        {selectorPair(effTeamA, setTeamA, effPlayerA, setPlayerA)}
        <span style={{ color: "var(--text-muted)" }}>vs.</span>
        {selectorPair(effTeamB, setTeamB, effPlayerB, setPlayerB)}
      </div>

      {blocked && (
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0.75rem 0" }}>
          🥅 <strong>No comparable</strong>: {a?.player} (arquero) y {b?.player} (jugador de campo) no tienen
          categorías en común -- Atajadas/Valla/Pies no existen para un jugador de campo, y Ataque/Creación/Pase/
          Defensa no existen para un arquero. Elegí dos jugadores de campo o dos arqueros.
        </p>
      )}

      {!blocked && smallSampleWarn && a && b && (
        <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 0.75rem" }}>
          ⚠️ <strong>Muestra chica</strong>: {[a, b].filter((p) => sampleTier(p.matchesPlayed, p.minsPlayed) !== "ranked").map((p) => p.player).join(" y ")} todavía no llega a la muestra "ranked" (600') -- alguna categoría puede venir con GLOBAL de muestra chica o con estimación por encogimiento estadístico (marcada en el detalle de factores). Leé la comparación con cautela.
        </p>
      )}

      {!blocked && a && b && hasCategoryRadar ? (
        <ShareableChart
          option={option}
          style={{ height: narrow ? 360 : 440 }}
          share={{
            title: `${a.player} vs ${b.player}`,
            subtitle: `Cabeza a cabeza · categorías de rendimiento (estilo EA SPORTS FC) · Liga Profesional`,
            insight: insights[0],
            shareText: `${a.player} vs ${b.player} · comparación jugador a jugador`,
            filenameBase: `${a.player}-vs-${b.player}`,
            ratings,
          }}
          shareLabel="🖼️ Compartir comparación"
        />
      ) : (
        !blocked && (
          <p style={{ color: "var(--text-muted)" }}>
            {a && b ? "Ninguno de los dos tiene categorías de rendimiento cargadas todavía." : "Elegí dos jugadores."}
          </p>
        )
      )}

      {!blocked && a && b && sharedMetrics.length >= 3 && (
        <details style={{ margin: "0.5rem 0 1rem" }}>
          <summary style={{ cursor: "pointer", fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>
            Ver radar de factores individuales compartidos ({sharedMetrics.length})
          </summary>
          <div style={{ marginTop: "0.75rem" }}>
            <ShareableChart
              option={legacyOption}
              style={{ height: narrow ? 360 : 440 }}
              share={{
                title: `${a.player} vs ${b.player}`,
                subtitle: `Cabeza a cabeza · índice de rendimiento por factor · Liga Profesional`,
                insight: insights[0],
                shareText: `${a.player} vs ${b.player} · comparación jugador a jugador`,
                filenameBase: `factores-${a.player}-vs-${b.player}`,
                ratings: legacyRatings,
              }}
              shareLabel="🖼️ Compartir radar de factores"
            />
          </div>
        </details>
      )}

      {a && b && insights.length > 0 && (
        <div className="insight-card">
          <div className="insight-head">
            <span className="insight-dot" />
            Lectura automática
          </div>
          <ul className="insight-list">
            {insights.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <p className="insight-note">
            Índice de rendimiento (0–100) por factor y GLOBAL ponderado por posición (estilo EA SPORTS FC). Resumen
            generado en tu navegador a partir de los valores oficiales. ¿Querés profundizar? Preguntale al asistente.
          </p>
        </div>
      )}

      {!blocked && a && b && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {a.player} ({a.team}) vs {b.player} ({b.team}). Los 5 ejes (4 para arqueros) son SIEMPRE los mismos --
          Ataque/Creación/Pase/Defensa/Valoración, o Atajadas/Valla/Pies/Valoración -- no sólo lo que ambos tengan
          cargado; si a alguno le falta esa categoría, el tooltip lo marca "sin datos" en vez de mostrar un número
          inventado. El GLOBAL de cada uno pondera las mismas categorías según su posición (estilo EA SPORTS FC).
          Fuente: FotMob — agregado de TEMPORADA (no de partido).
        </p>
      )}
    </div>
  );
}

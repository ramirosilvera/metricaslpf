import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { DerivedPlayerMetricRow } from "../lib/data";
import { useChartTokens, useIsNarrow, wrapAxisName } from "../lib/theme";
import { buildIndexers } from "../lib/normalize";
import { PLAYER_METRIC_LABELS, PLAYER_RADAR_ORDER } from "../lib/playerMetrics";
import { positionWeightedGlobal } from "../lib/globalIndex";
import { generateVsBestInsights, type VsBestMetric } from "../lib/insights";

// Comparación CABEZA A CABEZA de dos jugadores: mismo lenguaje que el radar de
// clubes pero a nivel jugador. Ejes = índice de rendimiento (0-100, calibrado
// al rango de todos los jugadores) de cada categoría de FotMob que ambos
// tengan cargada. El GLOBAL de cada uno es ponderado por su posición (estilo
// EA FC). El valor oficial se muestra en el tooltip.

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
}

export default function PlayerCompare({ rows, positions = {} }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  const { indexers, metricsWithData } = useMemo(() => buildIndexers(rows, PLAYER_RADAR_ORDER), [rows]);

  const players = useMemo(() => {
    const map = new Map<string, PlayerData>();
    for (const r of rows) {
      if (!PLAYER_METRIC_LABELS[r.metric] || r.value == null) continue;
      const key = `${r.team}|${r.player_name}`;
      let e = map.get(key);
      if (!e) {
        e = { key, team: r.team, player: r.player_name, position: positions[key] ?? null, byMetric: new Map() };
        map.set(key, e);
      }
      e.byMetric.set(r.metric, { idx: indexers[r.metric](r.value), raw: r.value });
    }
    // sólo jugadores con base mínima de factores
    return [...map.values()].filter((p) => p.byMetric.size >= 4);
  }, [rows, indexers, positions]);

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

  // ejes: factores que ambos tienen, en orden canónico
  const sharedMetrics = useMemo(() => {
    if (!a || !b) return [];
    return PLAYER_RADAR_ORDER.filter((m) => a.byMetric.has(m) && b.byMetric.has(m));
  }, [a, b]);

  const num = (m: string, v: number) => `${Math.round(v * 10) / 10}${PLAYER_METRIC_LABELS[m].suffix}`;
  const shortLabel = (m: string) => PLAYER_METRIC_LABELS[m].label.replace(" / partido", "");

  const ratings = useMemo(() => {
    if (!a || !b || sharedMetrics.length < 3) return undefined;
    const facA = sharedMetrics.map((m) => ({ metric: m, idx: a.byMetric.get(m)!.idx }));
    const facB = sharedMetrics.map((m) => ({ metric: m, idx: b.byMetric.get(m)!.idx }));
    return {
      entities: [
        { name: a.player, color: tokens["--series-6"], ovr: positionWeightedGlobal(facA, a.position, indexers, metricsWithData) },
        { name: b.player, color: tokens["--series-1"], ovr: positionWeightedGlobal(facB, b.position, indexers, metricsWithData) },
      ],
      factors: sharedMetrics.map((m) => ({ label: shortLabel(m), values: [a.byMetric.get(m)!.idx, b.byMetric.get(m)!.idx] })),
    };
  }, [a, b, sharedMetrics, tokens]);

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

  const option = useMemo(() => {
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
          return `<strong>${who.player}</strong> · ${who.team}${pos}<br/>${rowsTxt}`;
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

      {a && b && sharedMetrics.length >= 3 ? (
        <ShareableChart
          option={option}
          style={{ height: narrow ? 360 : 440 }}
          share={{
            title: `${a.player} vs ${b.player}`,
            subtitle: `Cabeza a cabeza · índice de rendimiento por factor · Liga Profesional`,
            insight: insights[0],
            shareText: `${a.player} vs ${b.player} · comparación jugador a jugador`,
            filenameBase: `${a.player}-vs-${b.player}`,
            ratings,
          }}
          shareLabel="🖼️ Compartir comparación"
        />
      ) : (
        <p style={{ color: "var(--text-muted)" }}>
          Estos dos jugadores no comparten suficientes factores cargados todavía para el radar.
        </p>
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

      {a && b && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {a.player} ({a.team}) vs {b.player} ({b.team}). Cada eje es el índice de rendimiento de esa categoría
          (calibrado al rango de todos los jugadores medidos); el GLOBAL de cada uno pondera los factores según su
          posición. Fuente: FotMob — agregado de TEMPORADA (no de partido).
        </p>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { DerivedPlayerMetricRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";
import { flagFor } from "../lib/flags";
import { makeIndexer, isLowerBetter } from "../lib/normalize";
import { PLAYER_METRIC_LABELS, PLAYER_RADAR_ORDER } from "../lib/playerMetrics";

// Ranking por FACTOR: elegí cualquier factor físico o táctico (los 12) y mirá qué
// jugador manda en ese factor — entre TODAS las selecciones o dentro de una sola.
// Ordena por el valor real de la métrica; el índice (0-100, calibrado a todos los
// jugadores medidos) va en el tooltip para dimensionar. Complementa al índice
// global: uno resume, éste te deja bucear factor por factor.

const ALL = "__all__";
const TOP_ALL = 25;
const POS_LABEL: Record<string, string> = { GK: "Arquero", DF: "Defensor", MF: "Mediocampista", FW: "Delantero" };

interface Props {
  rows: DerivedPlayerMetricRow[];
  positions?: Record<string, string>;
}

interface Row {
  player: string;
  team: string;
  value: number;
  idx: number;
  position: string | null;
}

export default function PlayerFactorRanking({ rows, positions = {} }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  const [metric, setMetric] = useState(PLAYER_RADAR_ORDER[0]);
  const [team, setTeam] = useState(ALL);

  const def = PLAYER_METRIC_LABELS[metric];
  const label = def.label.replace(" / partido", "");
  const suffix = def.suffix;

  // índice del factor elegido sobre todos los jugadores medidos.
  const indexer = useMemo(() => {
    const vals = rows.filter((r) => r.metric === metric && r.value != null).map((r) => r.value as number);
    return makeIndexer(vals, isLowerBetter(metric));
  }, [rows, metric]);

  // filas del factor elegido, con posición.
  const factorRows = useMemo<Row[]>(() => {
    return rows
      .filter((r) => r.metric === metric && r.value != null)
      .map((r) => ({
        player: r.player_name,
        team: r.team,
        value: r.value as number,
        idx: indexer(r.value as number),
        position: positions[`${r.team}|${r.player_name}`] ?? null,
      }));
  }, [rows, metric, indexer, positions]);

  const teams = useMemo(() => [...new Set(factorRows.map((r) => r.team))].sort(), [factorRows]);
  const effTeam = team === ALL || teams.includes(team) ? team : ALL;

  const filtered = useMemo(() => {
    const lower = isLowerBetter(metric);
    const base = effTeam === ALL ? factorRows : factorRows.filter((r) => r.team === effTeam);
    const sorted = [...base].sort((a, b) => (lower ? a.value - b.value : b.value - a.value));
    return effTeam === ALL ? sorted.slice(0, TOP_ALL) : sorted;
  }, [factorRows, effTeam, metric]);

  const fmt = (v: number) => `${Math.round(v * 10) / 10}${suffix}`;

  const option = useMemo(() => {
    if (filtered.length === 0) return {};
    const ordered = [...filtered].reverse(); // mejor arriba
    const labels = ordered.map((r) => (effTeam === ALL ? `${r.player} · ${r.team}` : r.player));
    return {
      // margen derecho holgado: la etiqueta muestra valor + unidad (ej. "37.6 km/h")
      // y con poco margen se recortaba en el borde del canvas.
      grid: { left: 8, right: 88, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        confine: true,
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"], fontSize: 12 },
        formatter: (ps: any) => {
          const i = Array.isArray(ps) ? ps[0]?.dataIndex : ps?.dataIndex;
          const r = ordered[i];
          if (!r) return "";
          const pos = r.position ? ` · ${POS_LABEL[r.position] ?? r.position}` : "";
          return `${flagFor(r.team)} <strong>${r.player}</strong> · ${r.team}${pos}<br/>${label}: <strong>${fmt(r.value)}</strong> · índice ${r.idx}`;
        },
      },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: tokens["--gridline"] } },
        axisLabel: { color: tokens["--text-secondary"] },
      },
      yAxis: {
        type: "category",
        data: labels,
        axisLabel: { color: tokens["--text-secondary"], fontSize: narrow ? 10 : 12 },
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
      },
      series: [
        {
          type: "bar",
          data: ordered.map((r) => Math.round(r.value * 100) / 100),
          barMaxWidth: 20,
          itemStyle: { color: tokens["--series-3"], borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: "right",
            color: tokens["--text-primary"],
            fontWeight: 700,
            fontFamily: "ui-monospace, Menlo, monospace",
            formatter: (p: any) => fmt(ordered[p.dataIndex].value),
          },
        },
      ],
    };
  }, [filtered, effTeam, tokens, narrow, label, suffix]);

  if (factorRows.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay datos de este factor cargados.</p>;
  }

  const chartHeight = Math.max(240, filtered.length * (narrow ? 26 : 30) + 40);
  const leader = filtered[0];
  const subtitle =
    effTeam === ALL ? `Top ${filtered.length} del torneo · ${label}` : `${effTeam} · ${label}`;

  return (
    <div>
      <div className="controls-row" style={{ flexWrap: "wrap" }}>
        <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Factor">
          {PLAYER_RADAR_ORDER.map((m) => (
            <option key={m} value={m}>
              {PLAYER_METRIC_LABELS[m].label.replace(" / partido", "")}
            </option>
          ))}
        </select>
        <select value={effTeam} onChange={(e) => setTeam(e.target.value)} aria-label="Selección">
          <option value={ALL}>🌎 Todas las selecciones (top {TOP_ALL})</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <ShareableChart
        option={option}
        style={{ height: chartHeight }}
        share={{
          title: `${label} — ${effTeam === ALL ? "top del torneo" : effTeam}`,
          subtitle,
          insight: leader ? `${leader.player} (${leader.team}) lidera en ${label.toLowerCase()} con ${fmt(leader.value)} (índice ${leader.idx}).` : undefined,
          filenameBase: `ranking-${metric}-${effTeam === ALL ? "torneo" : effTeam}`,
        }}
        shareLabel="🖼️ Compartir ranking"
      />

      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Elegí un <strong>factor físico o táctico</strong> y una <strong>selección</strong> (o "todas") para ver quién
        manda en ese factor. Ordena por el valor real; el <strong>índice</strong> (0–100, calibrado al rango de todos los
        jugadores medidos) aparece en el tooltip para dimensionar. Fuente: FIFA Training Centre (Mundial 2026 en curso);
        cobertura parcial según el scraper.
      </p>
    </div>
  );
}

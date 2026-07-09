import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { PlayerPhysicalPositionRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";

// Comparación física NORMALIZADA POR POSICIÓN. Un central y un extremo no se
// miden con la misma vara de distancia recorrida; acá el percentil se calcula
// dentro del grupo posicional (GK/DF/MF/FW), así el ranking es justo.
const METRICS: { key: keyof PlayerPhysicalPositionRow; pctKey: keyof PlayerPhysicalPositionRow; label: string; suffix: string }[] = [
  { key: "distancia_promedio_km", pctKey: "distancia_promedio_km_pct_pos", label: "Distancia (promedio por partido)", suffix: " km" },
  { key: "alta_intensidad_promedio_m", pctKey: "alta_intensidad_promedio_m_pct_pos", label: "Alta intensidad (zona 4+5, promedio)", suffix: " m" },
  { key: "sprints_promedio", pctKey: "sprints_promedio_pct_pos", label: "Sprints (promedio por partido)", suffix: "" },
  { key: "velocidad_punta_kmh", pctKey: "velocidad_punta_kmh_pct_pos", label: "Velocidad punta", suffix: " km/h" },
];

const POSITIONS: { value: string; label: string }[] = [
  { value: "GK", label: "Arqueros (GK)" },
  { value: "DF", label: "Defensores (DF)" },
  { value: "MF", label: "Mediocampistas (MF)" },
  { value: "FW", label: "Delanteros (FW)" },
];

interface Props {
  rows: PlayerPhysicalPositionRow[];
}

export default function PositionPhysicalRanking({ rows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();
  const [position, setPosition] = useState("DF");
  const [metricKey, setMetricKey] = useState<string>(METRICS[0].key as string);
  const [showPercentile, setShowPercentile] = useState(true);
  const metric = METRICS.find((m) => m.key === metricKey)!;

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => r.position === position && r[metric.key] != null)
        .sort((a, b) => (b[metric.key] as number) - (a[metric.key] as number))
        .slice(0, 20),
    [rows, position, metricKey],
  );

  const isArgentina = filtered.map((r) => r.team === "Argentina");
  const values = filtered.map((r) => (showPercentile ? (r[metric.pctKey] as number) : (r[metric.key] as number)));

  const option = {
    grid: { left: narrow ? 116 : 190, right: narrow ? 16 : 44, top: 10, bottom: 30 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "none" },
      backgroundColor: tokens["--surface-1"],
      borderColor: tokens["--gridline"],
      textStyle: { color: tokens["--text-primary"] },
      formatter: (params: any) => {
        const row = filtered[params[0].dataIndex];
        const pct = row[metric.pctKey] as number;
        return `<strong>${row.player_name}</strong> · ${row.team}<br/>${row.position}${row.club ? ` · ${row.club}` : ""}<br/>${metric.label}: ${(row[metric.key] as number)}${metric.suffix}<br/>Percentil entre ${row.position}: ${Math.round(pct)}<br/>${row.partidos} partido(s)`;
      },
    },
    xAxis: {
      type: "value",
      max: showPercentile ? 100 : undefined,
      axisLine: { lineStyle: { color: tokens["--baseline"] } },
      axisLabel: { color: tokens["--text-muted"] },
      splitLine: { lineStyle: { color: tokens["--gridline"] } },
    },
    yAxis: {
      type: "category",
      data: filtered.map((r) => `${r.player_name} · ${r.team}`),
      inverse: true,
      axisLine: { lineStyle: { color: tokens["--baseline"] } },
      axisLabel: {
        color: tokens["--text-secondary"],
        fontSize: narrow ? 9 : 11,
        width: narrow ? 106 : 176,
        overflow: "truncate",
      },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        barWidth: 13,
        data: values.map((v, i) => ({
          value: v,
          itemStyle: {
            color: isArgentina[i] ? tokens["--series-6"] : tokens["--series-2"],
            borderRadius: [0, 4, 4, 0],
          },
        })),
      },
    ],
  };

  if (rows.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay datos físicos cruzados con posición de plantel.</p>;
  }

  return (
    <div>
      <div className="controls-row">
        <select value={position} onChange={(e) => setPosition(e.target.value)}>
          {POSITIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
          {METRICS.map((m) => (
            <option key={m.key as string} value={m.key as string}>
              {m.label}
            </option>
          ))}
        </select>
        <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          <input type="checkbox" checked={showPercentile} onChange={(e) => setShowPercentile(e.target.checked)} />
          Percentil por posición
        </label>
        <span className="badge">
          <span className="dot" style={{ background: tokens["--series-6"] }}></span>
          Argentina resaltada
        </span>
      </div>
      <ReactECharts option={option} style={{ height: Math.max(320, filtered.length * 26) }} notMerge={true} />
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Fuente: FIFA Training Centre (físico, Mundial 2026) cruzado con el plantel (26worldcup/Wikipedia) por dorsal.
        El percentil se calcula <strong>dentro de la posición</strong> — un arquero recorre ~5 km y un defensor ~8 km
        por partido, así que compararlos en la misma escala sería engañoso. Percentil sobre los jugadores medidos, no
        un ranking mundial completo.
      </p>
    </div>
  );
}

import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { GoalsVsPhysicalRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";

// ¿Un equipo que corre más también convierte más goles en ese mismo partido?
// Un punto por (partido, selección) -- cruce directo de goal_events y
// physical_match_stats por match_id, sin inventar ninguna correlación: si no
// hay relación visible, el gráfico la muestra tal cual.
const METRICS: { key: keyof GoalsVsPhysicalRow; label: string; suffix: string; digits: number }[] = [
  { key: "total_distance_km", label: "Distancia de equipo", suffix: " km", digits: 1 },
  { key: "high_intensity_distance_m", label: "Alta intensidad", suffix: " m", digits: 0 },
  { key: "sprint_count", label: "Sprints", suffix: "", digits: 0 },
  { key: "top_speed_kmh", label: "Velocidad punta", suffix: " km/h", digits: 1 },
];

interface Props {
  rows: GoalsVsPhysicalRow[];
}

export default function GoalsVsPhysical({ rows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();
  const [metricKey, setMetricKey] = useState<string>(METRICS[0].key as string);
  const metric = METRICS.find((m) => m.key === metricKey)!;

  const { argRows, restRows } = useMemo(() => {
    const arg = rows.filter((r) => r.team === "Argentina");
    const rest = rows.filter((r) => r.team !== "Argentina");
    return { argRows: arg, restRows: rest };
  }, [rows]);

  const toPoint = (r: GoalsVsPhysicalRow) => [
    Math.round((r[metric.key] as number) * 10 ** metric.digits) / 10 ** metric.digits,
    r.goles_marcados,
    r.team,
    r.rival ?? "",
    r.stage ?? "",
  ];

  const option = useMemo(
    () => ({
      color: [tokens["--series-1"], tokens["--brand"] ?? tokens["--series-6"]],
      grid: { left: narrow ? 44 : 56, right: narrow ? 14 : 24, top: 20, bottom: narrow ? 78 : 56 },
      tooltip: {
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"] },
        formatter: (p: any) => {
          const [x, y, team, rival, stage] = p.value;
          return `<strong>${team}</strong> vs ${rival} (${stage})<br/>${metric.label}: ${x}${metric.suffix}<br/>Goles convertidos: ${y}`;
        },
      },
      xAxis: {
        type: "value",
        name: narrow ? "" : `${metric.label}${metric.suffix}`,
        nameTextStyle: { color: tokens["--text-muted"] },
        axisLabel: { color: tokens["--text-muted"] },
        splitLine: { lineStyle: { color: tokens["--gridline"] } },
      },
      yAxis: {
        type: "value",
        name: narrow ? "" : "Goles en el partido",
        nameTextStyle: { color: tokens["--text-muted"] },
        minInterval: 1,
        axisLabel: { color: tokens["--text-muted"] },
        splitLine: { lineStyle: { color: tokens["--gridline"] } },
      },
      series: [
        {
          name: "Selecciones",
          type: "scatter",
          symbolSize: 9,
          itemStyle: { opacity: 0.55 },
          data: restRows.map(toPoint),
        },
        {
          name: "Argentina",
          type: "scatter",
          symbolSize: 13,
          itemStyle: { opacity: 0.95 },
          data: argRows.map(toPoint),
        },
      ],
    }),
    [restRows, argRows, tokens, metricKey, narrow],
  );

  if (rows.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay suficientes partidos con físico y goles cruzados.</p>;
  }

  return (
    <div>
      <div className="controls-row">
        <select value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
          {METRICS.map((m) => (
            <option key={m.key as string} value={m.key as string}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <ShareableChart
        option={option}
        style={{ height: narrow ? 320 : 380 }}
        share={{
          title: `Goles vs. ${metric.label}`,
          subtitle: "Relación físico–goles por partido · Mundial 2026",
          filenameBase: `goles-vs-${metricKey}`,
        }}
      />
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Un punto por selección y partido ({rows.length} en total). Descriptivo, no causal: correr más no implica
        convertir más goles, y este cruce no controla por rival, marcador ni posesión. Argentina resaltada en verde.
      </p>
    </div>
  );
}

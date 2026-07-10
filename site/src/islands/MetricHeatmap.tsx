import { useMemo } from "react";
import ShareableChart from "./ShareableChart";
import type { TeamSeasonSummary } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";

const METRICS: { key: keyof TeamSeasonSummary; label: string; invert?: boolean }[] = [
  { key: "posesion_promedio_proxy", label: "Posesión" },
  { key: "precision_pases_promedio", label: "Precisión de pase" },
  { key: "remates_promedio", label: "Remates" },
  { key: "remates_al_arco_promedio", label: "Remates al arco" },
];

function percentileRank(values: number[], v: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = sorted.findIndex((x) => x >= v);
  return Math.round((idx / (sorted.length - 1 || 1)) * 100);
}

interface Props {
  rows: TeamSeasonSummary[];
}

export default function MetricHeatmap({ rows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  const { labels, data } = useMemo(() => {
    const labels = rows.map((r) => `${r.team} ${r.season}`);
    const cells: [number, number, number][] = [];
    METRICS.forEach((m, mi) => {
      const values = rows.map((r) => r[m.key] as number);
      rows.forEach((r, ri) => {
        cells.push([mi, ri, percentileRank(values, r[m.key] as number)]);
      });
    });
    return { labels, data: cells };
  }, [rows]);

  const option = {
    grid: { left: narrow ? 96 : 150, right: narrow ? 8 : 20, top: 30, bottom: narrow ? 84 : 60 },
    tooltip: {
      backgroundColor: tokens["--surface-1"],
      borderColor: tokens["--gridline"],
      textStyle: { color: tokens["--text-primary"] },
      formatter: (p: any) => `<strong>${labels[p.value[1]]}</strong><br/>${METRICS[p.value[0]].label}: percentil ${p.value[2]}`,
    },
    xAxis: {
      type: "category",
      data: METRICS.map((m) => m.label),
      splitArea: { show: true },
      axisLabel: {
        color: tokens["--text-secondary"],
        fontSize: narrow ? 9 : 11,
        interval: 0,
        rotate: narrow ? 28 : 0,
      },
      axisLine: { lineStyle: { color: tokens["--baseline"] } },
    },
    yAxis: {
      type: "category",
      data: labels,
      splitArea: { show: true },
      axisLabel: {
        color: tokens["--text-secondary"],
        fontSize: narrow ? 9 : 11,
        width: narrow ? 88 : undefined,
        overflow: "truncate",
      },
      axisLine: { lineStyle: { color: tokens["--baseline"] } },
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: false,
      show: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      textStyle: { color: tokens["--text-muted"] },
      inRange: { color: ["#cde2fb", "#6da7ec", "#2a78d6", "#184f95"] },
    },
    series: [
      {
        type: "heatmap",
        data,
        itemStyle: { borderColor: tokens["--surface-1"], borderWidth: 2 },
        emphasis: { itemStyle: { borderColor: tokens["--text-primary"], borderWidth: 1 } },
      },
    ],
  };

  return (
    <div>
      <ShareableChart
        option={option}
        style={{ height: Math.max(360, labels.length * (narrow ? 22 : 26) + (narrow ? 130 : 100)) }}
        share={{
          title: "Mapa de calor táctico",
          subtitle: "Percentiles por selección/torneo · StatsBomb",
          filenameBase: "mapa-calor-tactico",
        }}
      />
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Percentil (0–100) dentro de este conjunto de partidos, no valor absoluto. Celdas claras = percentil bajo,
        oscuras = percentil alto.
      </p>
    </div>
  );
}

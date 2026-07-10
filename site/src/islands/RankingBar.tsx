import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { TeamSeasonSummary } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";

const METRICS: { key: keyof TeamSeasonSummary; label: string; pct?: boolean }[] = [
  { key: "posesion_promedio_proxy", label: "Posesión (proxy StatsBomb)", pct: true },
  { key: "precision_pases_promedio", label: "Precisión de pase (%)" },
  { key: "remates_promedio", label: "Remates por partido" },
  { key: "remates_al_arco_promedio", label: "Remates al arco por partido" },
  { key: "faltas_promedio", label: "Faltas cometidas por partido" },
];

interface Props {
  rows: TeamSeasonSummary[];
}

export default function RankingBar({ rows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();
  const [metricKey, setMetricKey] = useState<string>(METRICS[0].key as string);
  const metric = METRICS.find((m) => m.key === metricKey)!;

  const sorted = useMemo(() => {
    return [...rows]
      .filter((r) => r[metric.key] !== null && r[metric.key] !== undefined)
      .sort((a, b) => (b[metric.key] as number) - (a[metric.key] as number))
      .slice(0, 16);
  }, [rows, metricKey]);

  const labels = sorted.map((r) => `${r.team} ${r.season}`);
  const values = sorted.map((r) => (metric.pct ? (r[metric.key] as number) * 100 : (r[metric.key] as number)));
  const isArgentina = sorted.map((r) => r.team === "Argentina");

  const option = {
    grid: { left: narrow ? 104 : 150, right: narrow ? 16 : 40, top: 10, bottom: 30 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "none" },
      backgroundColor: tokens["--surface-1"],
      borderColor: tokens["--gridline"],
      textStyle: { color: tokens["--text-primary"] },
      formatter: (params: any) => {
        const p = params[0];
        return `<strong>${p.name}</strong><br/>${metric.label}: ${p.value.toFixed(1)}${metric.pct ? "%" : ""}`;
      },
    },
    xAxis: {
      type: "value",
      axisLine: { lineStyle: { color: tokens["--baseline"] } },
      axisLabel: { color: tokens["--text-muted"] },
      splitLine: { lineStyle: { color: tokens["--gridline"] } },
    },
    yAxis: {
      type: "category",
      data: labels,
      inverse: true,
      axisLine: { lineStyle: { color: tokens["--baseline"] } },
      axisLabel: {
        color: tokens["--text-secondary"],
        fontSize: narrow ? 10 : 12,
        width: narrow ? 94 : undefined,
        overflow: "truncate",
      },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        data: values.map((v, i) => ({
          value: v,
          itemStyle: {
            color: isArgentina[i] ? tokens["--series-6"] : tokens["--series-1"],
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barWidth: 14,
      },
    ],
  };

  return (
    <div>
      <div className="controls-row">
        <label htmlFor="ranking-metric" style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Métrica
        </label>
        <select id="ranking-metric" value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
          {METRICS.map((m) => (
            <option key={m.key as string} value={m.key as string}>
              {m.label}
            </option>
          ))}
        </select>
        <span className="badge">
          <span className="dot" style={{ background: tokens["--series-6"] }}></span>
          Argentina resaltada
        </span>
      </div>
      <ShareableChart
        option={option}
        style={{ height: Math.max(320, sorted.length * 28) }}
        share={{
          title: metric.label,
          subtitle: "Ranking por selección/torneo",
          filenameBase: `ranking-${metricKey}`,
        }}
      />
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        n = 1 partido por selección salvo Argentina (4 en 2018, 7 en 2022). No promediar entre selecciones con
        tamaños de muestra tan distintos como si fueran comparables — ver <a href="../metodologia/">metodología</a>.
      </p>
    </div>
  );
}

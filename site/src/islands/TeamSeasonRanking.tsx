import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { TeamSeasonSummary } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";
import { makeIndexer, isLowerBetter } from "../lib/normalize";
import { escapeHtml } from "../lib/flags";

// Ranking de estadística de EQUIPO real para LPF (ESPN, por partido -- ver
// etl/fetch_espn_lpf.py). Único dato de equipo disponible para esta liga: no
// hay físico/GPS ni táctico por jugador (ver docstring del fetcher).
const METRICS: { key: keyof TeamSeasonSummary; label: string; suffix: string; factor?: number }[] = [
  { key: "posesion_promedio_proxy", label: "Posesión (proxy)", suffix: "%", factor: 100 },
  { key: "precision_pases_promedio", label: "Precisión de pase", suffix: "%" },
  { key: "remates_promedio", label: "Remates por partido", suffix: "" },
  { key: "remates_al_arco_promedio", label: "Remates al arco por partido", suffix: "" },
  { key: "faltas_promedio", label: "Faltas por partido", suffix: "" },
  { key: "goles_totales", label: "Goles en la temporada", suffix: "" },
];

interface Props {
  rows: TeamSeasonSummary[];
}

export default function TeamSeasonRanking({ rows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();
  const [metricKey, setMetricKey] = useState<string>(METRICS[0].key as string);
  const metric = METRICS.find((m) => m.key === metricKey)!;
  const lower = isLowerBetter(metricKey);

  const indexer = useMemo(() => {
    const vals = rows.map((r) => Number(r[metric.key])).filter((v) => Number.isFinite(v));
    return makeIndexer(vals, lower);
  }, [rows, metricKey]);

  const sorted = useMemo(() => {
    const withVal = rows.filter((r) => r[metric.key] != null);
    return [...withVal].sort((a, b) => {
      const av = Number(a[metric.key]);
      const bv = Number(b[metric.key]);
      return lower ? av - bv : bv - av;
    });
  }, [rows, metricKey]);

  const labels = sorted.map((r) => r.team);
  const values = sorted.map((r) => Number(r[metric.key]) * (metric.factor ?? 1));

  const option = {
    grid: { left: narrow ? 92 : 130, right: narrow ? 16 : 44, top: 10, bottom: 30 },
    tooltip: {
      confine: true,
      trigger: "axis",
      axisPointer: { type: "none" },
      backgroundColor: tokens["--surface-1"],
      borderColor: tokens["--gridline"],
      textStyle: { color: tokens["--text-primary"] },
      formatter: (params: any) => {
        const p = params[0];
        const row = sorted[p.dataIndex];
        const idx = indexer(Number(row[metric.key]));
        return `<strong>${escapeHtml(row.team)}</strong><br/>${metric.label}: ${p.value}${metric.suffix}<br/>índice <strong>${idx}</strong> · ${row.partidos} partido(s)`;
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
      axisLabel: { color: tokens["--text-secondary"], fontSize: narrow ? 9 : 11, width: narrow ? 84 : undefined, overflow: "truncate" },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        barWidth: narrow ? 8 : 11,
        data: values.map((v) => ({ value: Math.round(v * 100) / 100, itemStyle: { color: tokens["--series-2"], borderRadius: [0, 3, 3, 0] } })),
      },
    ],
  };

  if (rows.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay estadística de equipo cargada.</p>;
  }

  return (
    <div>
      <div className="controls-row">
        <label htmlFor="team-season-metric" style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Métrica
        </label>
        <select id="team-season-metric" value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
          {METRICS.map((m) => (
            <option key={m.key as string} value={m.key as string}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <ShareableChart
        option={option}
        style={{ height: Math.max(360, sorted.length * (narrow ? 18 : 22)) }}
        share={{
          title: metric.label,
          subtitle: `Ranking de equipo · ${sorted.length} clubes · Liga Profesional`,
          filenameBase: `ranking-equipo-${metric.key as string}`,
        }}
      />
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Fuente: ESPN (estadística de equipo por partido), promediada sobre los partidos ya jugados de cada club.
        Cobertura: {sorted.length} de los 30 clubes de la temporada en curso con estadística cargada.
      </p>
    </div>
  );
}

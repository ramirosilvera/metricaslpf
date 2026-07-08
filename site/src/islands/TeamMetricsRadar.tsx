import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { DerivedTeamMetricRow } from "../lib/data";
import { useChartTokens } from "../lib/theme";

const METRIC_LABELS: Record<string, string> = {
  posesion_promedio_proxy: "Posesión",
  precision_pases_promedio: "Precisión de pase",
  remates_promedio: "Remates",
  remates_al_arco_promedio: "Remates al arco",
  faltas_promedio: "Faltas (menos es mejor)",
  distancia_promedio_km: "Distancia recorrida",
  sprints_promedio: "Sprints",
  velocidad_punta_kmh: "Velocidad punta",
  alta_intensidad_promedio_m: "Alta intensidad",
  edad_promedio: "Edad de plantel (menor es más joven)",
  valor_plantel_promedio_eur: "Valor de mercado de plantel",
};

const METRIC_ORDER = Object.keys(METRIC_LABELS);

interface Props {
  rows: DerivedTeamMetricRow[];
}

export default function TeamMetricsRadar({ rows }: Props) {
  const tokens = useChartTokens();
  const teamSeasons = useMemo(() => [...new Set(rows.map((r) => `${r.team} ${r.season}`))].sort(), [rows]);

  const [aLabel, setALabel] = useState(teamSeasons.find((o) => o.startsWith("Argentina")) ?? teamSeasons[0] ?? "");
  const [bLabel, setBLabel] = useState(teamSeasons.find((o) => o.startsWith("France")) ?? teamSeasons[1] ?? teamSeasons[0] ?? "");

  const rowsFor = (label: string) => rows.filter((r) => `${r.team} ${r.season}` === label);
  const a = rowsFor(aLabel);
  const b = rowsFor(bLabel);

  const sharedMetrics = METRIC_ORDER.filter(
    (m) => a.some((r) => r.metric === m && r.percentile != null) && b.some((r) => r.metric === m && r.percentile != null),
  );

  const option = useMemo(() => {
    if (sharedMetrics.length < 3) return null;
    const valueFor = (list: DerivedTeamMetricRow[], m: string) => list.find((r) => r.metric === m)?.percentile ?? 0;
    return {
      color: [tokens["--series-6"], tokens["--series-1"]],
      tooltip: {
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"] },
      },
      legend: { bottom: 0, textStyle: { color: tokens["--text-secondary"] } },
      radar: {
        indicator: sharedMetrics.map((m) => ({ name: METRIC_LABELS[m], min: 0, max: 100 })),
        axisName: { color: tokens["--text-secondary"], fontSize: 10 },
        splitLine: { lineStyle: { color: tokens["--gridline"] } },
        splitArea: { areaStyle: { color: ["transparent", "transparent"] } },
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
      },
      series: [
        {
          type: "radar",
          data: [
            { name: aLabel, value: sharedMetrics.map((m) => valueFor(a, m)), areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 } },
            { name: bLabel, value: sharedMetrics.map((m) => valueFor(b, m)), areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 } },
          ],
        },
      ],
    };
  }, [sharedMetrics, a, b, aLabel, bLabel, tokens]);

  if (teamSeasons.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay métricas derivadas cargadas.</p>;
  }

  return (
    <div>
      <div className="controls-row">
        <select value={aLabel} onChange={(e) => setALabel(e.target.value)}>
          {teamSeasons.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span style={{ color: "var(--text-muted)" }}>vs.</span>
        <select value={bLabel} onChange={(e) => setBLabel(e.target.value)}>
          {teamSeasons.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      {option ? (
        <ReactECharts option={option} style={{ height: 440 }} notMerge={true} />
      ) : (
        <p style={{ color: "var(--text-muted)" }}>
          Estas dos selecciones/torneos no comparten suficientes métricas cargadas todavía (ej. una es de 2018 y la
          otra de 2026, y todavía no hay overlap de fuentes).
        </p>
      )}
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Cada eje es un percentil (0–100) calculado dentro de la misma temporada — combina lo táctico (StatsBomb),
        físico (FIFA Training Centre) y de plantel (Transfermarkt) cuando hay datos de las tres fuentes.
      </p>
    </div>
  );
}

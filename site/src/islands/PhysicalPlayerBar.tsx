import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import { useChartTokens, useIsNarrow } from "../lib/theme";

export interface PhysicalPlayerRankingRow {
  team: string;
  player_name: string;
  partidos: number;
  distancia_total_km: number;
  distancia_promedio_km: number;
  alta_intensidad_promedio_m: number;
  sprints_promedio: number;
  velocidad_punta_kmh: number;
}

const METRICS: { key: keyof PhysicalPlayerRankingRow; label: string; suffix: string }[] = [
  { key: "distancia_promedio_km", label: "Distancia recorrida (promedio por partido)", suffix: " km" },
  { key: "alta_intensidad_promedio_m", label: "Distancia a alta intensidad (zona 4+5, promedio)", suffix: " m" },
  { key: "sprints_promedio", label: "Sprints (promedio por partido)", suffix: "" },
  { key: "velocidad_punta_kmh", label: "Velocidad punta", suffix: " km/h" },
];

interface Props {
  rows: PhysicalPlayerRankingRow[];
}

export default function PhysicalPlayerBar({ rows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();
  const [metricKey, setMetricKey] = useState<string>(METRICS[0].key as string);
  const metric = METRICS.find((m) => m.key === metricKey)!;

  const teams = useMemo(() => [...new Set(rows.map((r) => r.team))].sort(), [rows]);
  const [team, setTeam] = useState(teams.includes("Argentina") ? "Argentina" : teams[0] ?? "");

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => r.team === team)
        .sort((a, b) => (b[metric.key] as number) - (a[metric.key] as number))
        .slice(0, 16),
    [rows, team, metricKey],
  );

  const option = {
    grid: { left: narrow ? 112 : 170, right: narrow ? 16 : 40, top: 10, bottom: 30 },
    tooltip: {
        confine: true, // el tooltip no se sale de la pantalla en móvil
      trigger: "axis",
      axisPointer: { type: "none" },
      backgroundColor: tokens["--surface-1"],
      borderColor: tokens["--gridline"],
      textStyle: { color: tokens["--text-primary"] },
      formatter: (params: any) => {
        const p = params[0];
        const row = filtered[p.dataIndex];
        return `<strong>${row.player_name}</strong><br/>${metric.label}: ${p.value}${metric.suffix}<br/>${row.partidos} partido(s) con datos`;
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
      data: filtered.map((r) => r.player_name),
      inverse: true,
      axisLine: { lineStyle: { color: tokens["--baseline"] } },
      axisLabel: {
        color: tokens["--text-secondary"],
        fontSize: narrow ? 10 : 12,
        width: narrow ? 102 : undefined,
        overflow: "truncate",
      },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        barWidth: 14,
        data: filtered.map((r) => r[metric.key]),
        itemStyle: { color: tokens["--series-5"], borderRadius: [0, 4, 4, 0] },
      },
    ],
  };

  if (rows.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay métricas físicas cargadas para ningún partido.</p>;
  }

  return (
    <div>
      <div className="controls-row">
        <select value={team} onChange={(e) => setTeam(e.target.value)}>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
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
      </div>
      <ShareableChart
        option={option}
        style={{ height: Math.max(320, filtered.length * 28) }}
        share={{
          title: `${team} · ${metric.label}`,
          subtitle: "Ranking físico por jugador · Mundial 2026",
          filenameBase: `jugadores-${team}-${metricKey}`,
        }}
      />
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Fuente: FIFA Training Centre (reportes oficiales PMSR), Mundial 2026. Cobertura parcial: solo partidos ya
        procesados por el scraper — ver el banner de estado de datos.
      </p>
    </div>
  );
}

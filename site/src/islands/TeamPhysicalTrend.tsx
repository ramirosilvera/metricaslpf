import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { TeamPhysicalTrendRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";

// Curva de forma física dentro del torneo: ¿la selección corre más o menos a
// medida que avanza? La línea punteada es la media del torneo (todos los
// partidos de las 48 selecciones) para esa misma métrica, como referencia.
const METRICS: { key: keyof TeamPhysicalTrendRow; label: string; suffix: string; digits: number }[] = [
  { key: "total_distance_km", label: "Distancia de equipo", suffix: " km", digits: 1 },
  { key: "high_intensity_distance_m", label: "Alta intensidad", suffix: " m", digits: 0 },
  { key: "sprint_count", label: "Sprints", suffix: "", digits: 0 },
  { key: "top_speed_kmh", label: "Velocidad punta", suffix: " km/h", digits: 1 },
];

interface Props {
  rows: TeamPhysicalTrendRow[];
}

export default function TeamPhysicalTrend({ rows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();
  const teams = useMemo(() => [...new Set(rows.map((r) => r.team))].sort(), [rows]);
  const [team, setTeam] = useState(teams.includes("Argentina") ? "Argentina" : teams[0] ?? "");
  const [metricKey, setMetricKey] = useState<string>(METRICS[0].key as string);
  const metric = METRICS.find((m) => m.key === metricKey)!;

  const fieldAvg = useMemo(() => {
    const vals = rows.map((r) => r[metric.key] as number).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [rows, metricKey]);

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => r.team === team)
        .sort((a, b) => a.jornada - b.jornada),
    [rows, team],
  );

  const option = {
    color: [tokens["--series-1"]],
    grid: { left: narrow ? 44 : 62, right: narrow ? 14 : 30, top: 20, bottom: narrow ? 78 : 64 },
    tooltip: {
      trigger: "axis",
      backgroundColor: tokens["--surface-1"],
      borderColor: tokens["--gridline"],
      textStyle: { color: tokens["--text-primary"] },
      formatter: (params: any) => {
        const p = params[0];
        const row = filtered[p.dataIndex];
        if (!row) return "";
        const delta = (row[metric.key] as number) - fieldAvg;
        const sign = delta >= 0 ? "+" : "";
        return `<strong>${row.stage} · vs ${row.rival}</strong> ${row.es_local ? "(local)" : "(visitante)"}<br/>${metric.label}: ${p.value}${metric.suffix}<br/>vs. media del torneo: ${sign}${delta.toFixed(metric.digits)}${metric.suffix}`;
      },
    },
    xAxis: {
      type: "category",
      data: filtered.map((r) => `J${r.jornada}\nvs ${r.rival}`),
      axisLine: { lineStyle: { color: tokens["--baseline"] } },
      axisLabel: { color: tokens["--text-muted"], fontSize: narrow ? 9 : 10, interval: 0, rotate: narrow ? 30 : 0 },
    },
    yAxis: {
      type: "value",
      scale: true,
      name: narrow ? "" : `${metric.label}${metric.suffix}`,
      nameTextStyle: { color: tokens["--text-muted"] },
      axisLabel: { color: tokens["--text-muted"] },
      splitLine: { lineStyle: { color: tokens["--gridline"] } },
    },
    series: [
      {
        name: metric.label,
        type: "line",
        smooth: false,
        symbolSize: 9,
        lineStyle: { width: 2.5 },
        data: filtered.map((r) => Math.round((r[metric.key] as number) * 10 ** metric.digits) / 10 ** metric.digits),
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: tokens["--series-6"], type: "dashed", width: 1.5 },
          label: {
            formatter: `media torneo ${fieldAvg.toFixed(metric.digits)}${metric.suffix}`,
            color: tokens["--text-muted"],
            fontSize: narrow ? 9 : 10,
            position: "insideEndTop",
          },
          data: [{ yAxis: Math.round(fieldAvg * 10 ** metric.digits) / 10 ** metric.digits }],
        },
      },
    ],
  };

  if (rows.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay suficientes partidos con datos físicos para trazar una curva.</p>;
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
      {filtered.length < 2 ? (
        <p style={{ color: "var(--text-muted)" }}>
          {team} todavía tiene un solo partido con datos físicos cargados — no alcanza para una tendencia. Volvé cuando
          el scraper sume más partidos.
        </p>
      ) : (
        <ShareableChart
          option={option}
          style={{ height: narrow ? 320 : 380 }}
          share={{
            title: `${team} · ${metric.label}`,
            subtitle: "Evolución por partido vs. media del torneo · Mundial 2026",
            filenameBase: `tendencia-${team}-${metricKey}`,
          }}
        />
      )}
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Fuente: FIFA Training Centre, Mundial 2026. Con pocos partidos por selección esto es descriptivo, no una
        tendencia estadística — una caída puede reflejar rival, marcador o rotación, no "menos estado físico". La línea
        punteada es la media del torneo sobre todos los partidos cargados.
      </p>
    </div>
  );
}

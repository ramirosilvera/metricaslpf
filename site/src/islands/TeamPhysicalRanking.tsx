import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { TeamPhysicalRankingRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";
import { generateTeamPhysicalRankingInsights } from "../lib/insights";

// Ranking físico COLECTIVO real del Mundial 2026 — las 48 selecciones, no un
// proxy táctico. Es la distancia/intensidad SUMADA del equipo por partido
// (11 jugadores), promediada entre los partidos ya cargados de cada selección.
// `short` es la etiqueta breve para incrustar en la lectura automática; `running`
// distingue las métricas de "correr" (para la salvedad de la hipótesis).
const METRICS: {
  key: keyof TeamPhysicalRankingRow;
  pctKey: keyof TeamPhysicalRankingRow;
  label: string;
  short: string;
  suffix: string;
  running: boolean;
}[] = [
  { key: "distancia_promedio_km", pctKey: "distancia_promedio_km_percentil", label: "Distancia de equipo (promedio por partido)", short: "distancia recorrida", suffix: " km", running: true },
  { key: "alta_intensidad_promedio_m", pctKey: "alta_intensidad_promedio_m_percentil", label: "Distancia a alta intensidad (equipo, promedio)", short: "distancia a alta intensidad", suffix: " m", running: true },
  { key: "sprints_promedio", pctKey: "sprints_promedio_percentil", label: "Sprints del equipo (promedio por partido)", short: "sprints por partido", suffix: "", running: true },
  { key: "velocidad_punta_kmh", pctKey: "velocidad_punta_kmh_percentil", label: "Velocidad punta del equipo", short: "velocidad punta", suffix: " km/h", running: false },
];

interface Props {
  rows: TeamPhysicalRankingRow[];
}

export default function TeamPhysicalRanking({ rows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();
  const [metricKey, setMetricKey] = useState<string>(METRICS[0].key as string);
  const metric = METRICS.find((m) => m.key === metricKey)!;

  const sorted = useMemo(
    () =>
      [...rows]
        .filter((r) => r[metric.key] != null)
        .sort((a, b) => (b[metric.key] as number) - (a[metric.key] as number)),
    [rows, metricKey],
  );

  const labels = sorted.map((r) => r.team);
  const values = sorted.map((r) => r[metric.key] as number);
  const isArgentina = sorted.map((r) => r.team === "Argentina");

  // Lectura automática: dónde cae Argentina en esta métrica, con la salvedad de
  // la hipótesis. Determinística, sin llamadas a IA.
  const insights = useMemo(
    () =>
      generateTeamPhysicalRankingInsights(
        sorted.map((r) => ({ team: r.team, value: r[metric.key] as number, percentile: r[metric.pctKey] as number })),
        metric.short,
        metric.suffix,
        { focusTeam: "Argentina", isRunning: metric.running },
      ),
    [sorted, metricKey],
  );

  const option = {
    grid: { left: narrow ? 92 : 130, right: narrow ? 16 : 44, top: 10, bottom: 30 },
    tooltip: {
        confine: true, // el tooltip no se sale de la pantalla en móvil
      trigger: "axis",
      axisPointer: { type: "none" },
      backgroundColor: tokens["--surface-1"],
      borderColor: tokens["--gridline"],
      textStyle: { color: tokens["--text-primary"] },
      formatter: (params: any) => {
        const p = params[0];
        const row = sorted[p.dataIndex];
        const best = (sorted[0][metric.key] as number) || 1; // sorted desc -> el máximo
        const pctBest = Math.round(((row[metric.key] as number) / best) * 100);
        return `<strong>${row.team}</strong><br/>${metric.label}: ${p.value}${metric.suffix}<br/><strong>${pctBest}%</strong> del mejor del torneo<br/>${row.partidos} partido(s) con datos`;
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
        fontSize: narrow ? 9 : 11,
        width: narrow ? 84 : undefined,
        overflow: "truncate",
      },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        barWidth: narrow ? 8 : 11,
        data: values.map((v, i) => ({
          value: v,
          itemStyle: {
            color: isArgentina[i] ? tokens["--series-6"] : tokens["--series-5"],
            borderRadius: [0, 3, 3, 0],
          },
        })),
      },
    ],
  };

  if (rows.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay métricas físicas de equipo cargadas.</p>;
  }

  return (
    <div>
      <div className="controls-row">
        <label htmlFor="team-phys-metric" style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Métrica física
        </label>
        <select id="team-phys-metric" value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
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
        style={{ height: Math.max(360, sorted.length * (narrow ? 18 : 22)) }}
        share={{
          title: metric.label,
          subtitle: "Ranking físico de equipo · 48 selecciones · Mundial 2026",
          insight: insights[0],
          filenameBase: `ranking-${metric.key as string}`,
        }}
      />

      {insights.length > 0 && (
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
            Resumen generado en tu navegador a partir del ranking real (no es una respuesta de IA en vivo). ¿Querés
            profundizar? Preguntale al asistente.
          </p>
        </div>
      )}

      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Fuente: FIFA Training Centre (reportes oficiales por partido, Mundial 2026). Es la métrica del equipo (suma de
        los 11) por partido, promediada sobre los partidos ya cargados de cada selección — recordá que un equipo que
        domina el balón suele correr <em>menos</em>: leé esto junto al contexto táctico, no como un ranking de
        "esfuerzo". Cobertura parcial y creciente (ver banner de estado).
      </p>
    </div>
  );
}

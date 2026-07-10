import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { TeamTacticalRankingRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";
import { generateTeamPhysicalRankingInsights } from "../lib/insights";

// Ranking TÁCTICO colectivo real del Mundial 2026 — las 48 selecciones, derivado
// de la estadística por jugador de FIFA Training Centre (suma de los 11 por
// partido, promediada). Es el equivalente táctico del ranking físico, con el
// vocabulario propio de FIFA (progresiones, presión, recuperaciones…), distinto
// al táctico histórico de StatsBomb 2018/2022.
const METRICS: {
  key: keyof TeamTacticalRankingRow;
  pctKey: keyof TeamTacticalRankingRow;
  label: string;
  short: string;
  suffix: string;
}[] = [
  { key: "progresiones_promedio", pctKey: "progresiones_promedio_percentil", label: "Progresiones de balón (promedio por partido)", short: "progresiones de balón", suffix: "" },
  { key: "precision_pases_pct", pctKey: "precision_pases_pct_percentil", label: "Precisión de pase del equipo (%)", short: "precisión de pase", suffix: "%" },
  { key: "presiones_promedio", pctKey: "presiones_promedio_percentil", label: "Presión sobre el rival (promedio por partido)", short: "presión", suffix: "" },
  { key: "recuperaciones_promedio", pctKey: "recuperaciones_promedio_percentil", label: "Recuperaciones (promedio por partido)", short: "recuperaciones", suffix: "" },
  { key: "remates_promedio", pctKey: "remates_promedio_percentil", label: "Remates (promedio por partido)", short: "remates", suffix: "" },
  { key: "tackles_promedio", pctKey: "tackles_promedio_percentil", label: "Tackles ganados (promedio por partido)", short: "tackles ganados", suffix: "" },
  { key: "intercepciones_promedio", pctKey: "intercepciones_promedio_percentil", label: "Intercepciones (promedio por partido)", short: "intercepciones", suffix: "" },
  { key: "quiebres_linea_promedio", pctKey: "quiebres_linea_promedio_percentil", label: "Quiebres de línea (promedio por partido)", short: "quiebres de línea", suffix: "" },
];

interface Props {
  rows: TeamTacticalRankingRow[];
}

export default function TeamTacticalRanking({ rows }: Props) {
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

  const insights = useMemo(
    () =>
      generateTeamPhysicalRankingInsights(
        sorted.map((r) => ({ team: r.team, value: r[metric.key] as number, percentile: r[metric.pctKey] as number })),
        metric.short,
        metric.suffix,
        { focusTeam: "Argentina" },
      ),
    [sorted, metricKey],
  );

  const option = {
    grid: { left: narrow ? 92 : 130, right: narrow ? 16 : 44, top: 10, bottom: 30 },
    tooltip: {
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
            color: isArgentina[i] ? tokens["--series-6"] : tokens["--series-2"],
            borderRadius: [0, 3, 3, 0],
          },
        })),
      },
    ],
  };

  if (rows.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay estadística táctica de equipo cargada.</p>;
  }

  return (
    <div>
      <div className="controls-row">
        <label htmlFor="team-tac-metric" style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Métrica táctica
        </label>
        <select id="team-tac-metric" value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
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
          subtitle: "Ranking táctico de equipo · 48 selecciones · Mundial 2026",
          insight: insights[0],
          filenameBase: `ranking-tactico-${metric.key as string}`,
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
        Fuente: FIFA Training Centre (estadística por jugador por partido, Mundial 2026), agregada al equipo (suma de los
        11) y promediada sobre los partidos ya cargados de cada selección. Vocabulario propio de FIFA — no comparable eje
        a eje con el táctico histórico de StatsBomb (2018/2022). Cobertura parcial y creciente (ver banner de estado).
      </p>
    </div>
  );
}

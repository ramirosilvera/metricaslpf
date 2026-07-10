import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { RadarRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";
import { flagFor } from "../lib/flags";
import { generateTeamComparisonInsights, type MetricDef } from "../lib/insights";

const INDICATORS = [
  { key: "posesion_promedio_proxy_percentil", name: "Posesión (percentil)", short: "Posesión" },
  { key: "precision_pases_promedio_percentil", name: "Precisión de pase (percentil)", short: "Precisión\nde pase" },
  { key: "remates_promedio_percentil", name: "Remates (percentil)", short: "Remates" },
  { key: "remates_al_arco_promedio_percentil", name: "Remates al arco (percentil)", short: "Remates\nal arco" },
] as const;

// Etiquetas en minúscula para incrustar en las frases de la lectura automática.
const INSIGHT_METRICS: MetricDef[] = [
  { key: "posesion_promedio_proxy_percentil", label: "posesión" },
  { key: "precision_pases_promedio_percentil", label: "precisión de pase" },
  { key: "remates_promedio_percentil", label: "remates" },
  { key: "remates_al_arco_promedio_percentil", label: "remates al arco" },
];

interface Props {
  rows: RadarRow[];
}

export default function RadarCompare({ rows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();
  const options = rows.map((r) => `${r.team} ${r.season}`);
  const [aLabel, setALabel] = useState(options.find((o) => o.startsWith("Argentina")) ?? options[0]);
  const [bLabel, setBLabel] = useState(options.find((o) => o.startsWith("France")) ?? options[1] ?? options[0]);

  const find = (label: string) => rows.find((r) => `${r.team} ${r.season}` === label);
  const a = find(aLabel);
  const b = find(bLabel);

  const option = useMemo(() => {
    if (!a || !b) return {};
    return {
      color: [tokens["--series-6"], tokens["--series-1"]],
      tooltip: {
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"] },
      },
      legend: {
        bottom: 0,
        textStyle: { color: tokens["--text-secondary"] },
      },
      radar: {
        // en móvil se usan nombres cortos (la nota al pie ya aclara que todo
        // es percentil) para que las puntas izquierda/derecha no se recorten
        indicator: INDICATORS.map((i) => ({ name: narrow ? i.short : i.name, min: 0, max: 100 })),
        radius: narrow ? "56%" : "70%",
        axisName: {
          color: tokens["--text-secondary"],
          fontSize: narrow ? 10 : 11,
        },
        splitLine: { lineStyle: { color: tokens["--gridline"] } },
        splitArea: { areaStyle: { color: ["transparent", "transparent"] } },
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
      },
      series: [
        {
          type: "radar",
          data: [
            {
              name: aLabel,
              value: INDICATORS.map((i) => a[i.key]),
              areaStyle: { opacity: 0.15 },
              lineStyle: { width: 2 },
            },
            {
              name: bLabel,
              value: INDICATORS.map((i) => b[i.key]),
              areaStyle: { opacity: 0.15 },
              lineStyle: { width: 2 },
            },
          ],
        },
      ],
    };
  }, [a, b, tokens, aLabel, bLabel, narrow]);

  // Lectura automática: heurística determinística sobre los percentiles ya
  // calculados. No hay llamada a ninguna API — el chat con IA queda aparte.
  const insights = useMemo(() => generateTeamComparisonInsights(a, b, INSIGHT_METRICS), [a, b]);

  const shareText =
    a && b
      ? `${a.team} vs ${b.team} (percentiles de contexto táctico, Mundial 2026): posesión ${Math.round(a.posesion_promedio_proxy_percentil)} vs ${Math.round(b.posesion_promedio_proxy_percentil)}.`
      : undefined;

  // Link de WhatsApp con la lectura automática como gancho (mismo patrón
  // wa.me + encodeURIComponent que usa el hero del inicio).
  const waLink = useMemo(() => {
    if (!a || !b) return null;
    const url = typeof window !== "undefined" ? window.location.href : undefined;
    const lead = insights[0] ?? shareText ?? `${a.team} vs ${b.team}`;
    const message = `${a.team} vs ${b.team} · Mundial 2026 — ${lead}${url ? ` Mirá el análisis completo: ${url}` : ""}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [a, b, insights, shareText]);

  return (
    <div>
      <div className="controls-row">
        <select value={aLabel} onChange={(e) => setALabel(e.target.value)}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span style={{ color: "var(--text-muted)" }}>vs.</span>
        <select value={bLabel} onChange={(e) => setBLabel(e.target.value)}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      {a && b ? (
        <ShareableChart
          option={option}
          style={{ height: narrow ? 340 : 420 }}
          share={{
            title: `${a.team} vs ${b.team}`,
            subtitle: "Cabeza a cabeza · percentiles de contexto táctico · Mundial 2026",
            insight: insights[0],
            shareText,
            filenameBase: `${a.team}-vs-${b.team}`,
          }}
          shareLabel="🖼️ Compartir radar"
        />
      ) : (
        <p>Elegí dos selecciones/torneos para comparar.</p>
      )}
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Valores expresados como percentil dentro del propio dataset (0–100), no valor absoluto — son variables de
        contexto táctico (StatsBomb), no métricas físicas.
      </p>

      {a && b && insights.length > 0 && (
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
            Resumen generado en tu navegador a partir de los percentiles del dataset (no es una respuesta de IA en
            vivo). ¿Querés profundizar? Preguntale al asistente.
          </p>
        </div>
      )}

      {a && b && (
        <div className="share-block">
          <div className="share-label">
            <strong>Compartir este análisis</strong>
            <span>
              {flagFor(a.team)} {a.team} vs {b.team} {flagFor(b.team)} — la imagen del radar se comparte con el botón de
              arriba
            </span>
          </div>
          <div className="share-actions">
            {waLink && (
              <a className="btn btn-share" href={waLink} target="_blank" rel="noreferrer">
                📲 WhatsApp (texto)
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

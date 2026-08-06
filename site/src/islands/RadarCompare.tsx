import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { TeamSeasonSummary, DerivedPlayerMetricRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";
import TeamBadge from "./TeamBadge";
import { generateVsBestInsights, type VsBestMetric } from "../lib/insights";
import { escapeHtml } from "../lib/flags";
import { computeTeamStrengths, type TeamStrength } from "../lib/clubStrength";

// Radar de EQUIPO -- 4 ejes (Ofensivo/Control/Defensivo/Individual) + Fuerza
// GLOBAL, el MISMO cálculo que usa Predicción (ver clubStrength.ts) para que
// nunca puedan mostrar números distintos para lo mismo. Antes este radar
// mostraba 5 métricas crudas sueltas (posesión, precisión, remates, remates
// al arco, faltas) sin combinar y sin la dimensión defensiva (lo que el
// equipo RECIBE) ni la individual (calidad de los jugadores) -- las dos
// cosas que sí movían el número de Predicción, invisibles acá. Esas métricas
// crudas siguen disponibles más abajo, como detalle, no como ejes del radar.

const STRENGTH_AXES: { key: "ofensivo" | "control" | "defensivo" | "individual"; name: string; short: string }[] = [
  { key: "ofensivo", name: "Ofensivo", short: "Ofensivo" },
  { key: "control", name: "Control (pelota)", short: "Control\n(pelota)" },
  { key: "defensivo", name: "Defensivo", short: "Defensivo" },
  { key: "individual", name: "Individual (mejores 11)", short: "Individual\n(mejores 11)" },
];

const AXIS_DETAIL: Record<string, string> = {
  ofensivo: "remates y remates al arco por partido",
  control: "posesión y precisión de pase",
  defensivo: "remates al arco y goles recibidos por partido (lo que le hizo el rival)",
  individual: "índice GLOBAL promedio de los 11 mejores jugadores con muestra suficiente",
};

// Métricas crudas que NO integran la Fuerza (a propósito, ver clubStrength.ts)
// pero siguen siendo dato real -- se muestran aparte, como detalle.
const RAW_DETAIL: { key: keyof TeamSeasonSummary; label: string; suffix: string; factor?: number }[] = [
  { key: "posesion_promedio_proxy", label: "Posesión", suffix: "%", factor: 100 },
  { key: "precision_pases_promedio", label: "Precisión de pase", suffix: "%" },
  { key: "remates_promedio", label: "Remates", suffix: "" },
  { key: "remates_al_arco_promedio", label: "Remates al arco", suffix: "" },
  { key: "remates_al_arco_recibidos_promedio", label: "Remates al arco recibidos", suffix: "" },
  { key: "goles_recibidos_promedio", label: "Goles recibidos", suffix: "" },
  { key: "faltas_promedio", label: "Faltas", suffix: "" },
];

interface Props {
  summaryRows: TeamSeasonSummary[];
  playerRows?: DerivedPlayerMetricRow[];
  positions?: Record<string, string>;
  crests?: Record<string, string>;
}

export default function RadarCompare({ summaryRows, playerRows = [], positions = {}, crests }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  const labelOf = (r: TeamSeasonSummary) => `${r.team} ${r.season}`;
  const options = useMemo(() => summaryRows.map(labelOf), [summaryRows]);

  const strengths = useMemo(
    () => computeTeamStrengths(summaryRows as unknown as Record<string, unknown>[], playerRows, positions),
    [summaryRows, playerRows, positions],
  );

  const [aLabel, setALabel] = useState("");
  const [bLabel, setBLabel] = useState("");

  const defaultA = "Boca Juniors 2026";
  const defaultB = "River Plate 2026";
  const effectiveA = options.includes(aLabel) ? aLabel : options.includes(defaultA) ? defaultA : options[0];
  const effectiveB = options.includes(bLabel) ? bLabel : options.includes(defaultB) ? defaultB : (options[1] ?? options[0]);

  const rowA = summaryRows.find((r) => labelOf(r) === effectiveA);
  const rowB = summaryRows.find((r) => labelOf(r) === effectiveB);
  const strengthA = rowA ? strengths.get(String(rowA.team)) : undefined;
  const strengthB = rowB ? strengths.get(String(rowB.team)) : undefined;

  const nameA = String(rowA?.team ?? effectiveA);
  const nameB = String(rowB?.team ?? effectiveB);

  const num = (v: number, suffix: string) => (Number.isFinite(v) ? `${Math.round(v * 10) / 10}${suffix}` : "—");

  const option = useMemo(() => {
    if (!strengthA || !strengthB) return {};
    return {
      color: [tokens["--series-6"], tokens["--series-1"]],
      tooltip: {
        confine: true,
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"] },
        formatter: (p: any) => {
          const isA = p.name === effectiveA || p.seriesIndex === 0;
          const s = isA ? strengthA : strengthB;
          const rows = STRENGTH_AXES.map((ax) => `${ax.name}: índice <strong>${s[ax.key]}</strong> · ${AXIS_DETAIL[ax.key]}`).join(
            "<br/>",
          );
          return `<strong>${escapeHtml(p.name)}</strong> · Fuerza <strong>${s.fuerza}</strong><br/>${rows}`;
        },
      },
      legend: { bottom: 0, textStyle: { color: tokens["--text-secondary"] } },
      radar: {
        indicator: STRENGTH_AXES.map((ax) => ({ name: narrow ? ax.short : ax.name, min: 0, max: 100 })),
        radius: narrow ? "56%" : "70%",
        axisName: { color: tokens["--text-secondary"], fontSize: narrow ? 10 : 11 },
        splitLine: { lineStyle: { color: tokens["--gridline"] } },
        splitArea: { areaStyle: { color: ["transparent", "transparent"] } },
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
      },
      series: [
        {
          type: "radar",
          data: [
            {
              name: effectiveA,
              value: STRENGTH_AXES.map((ax) => strengthA[ax.key]),
              areaStyle: { opacity: 0.15 },
              lineStyle: { width: 2 },
            },
            {
              name: effectiveB,
              value: STRENGTH_AXES.map((ax) => strengthB[ax.key]),
              areaStyle: { opacity: 0.15 },
              lineStyle: { width: 2 },
            },
          ],
        },
      ],
    };
  }, [strengthA, strengthB, tokens, narrow, effectiveA, effectiveB]);

  const insights = useMemo(() => {
    if (!strengthA || !strengthB) return [];
    const metrics: VsBestMetric[] = STRENGTH_AXES.map((ax) => ({
      label: ax.name.toLowerCase(),
      aPct: strengthA[ax.key],
      bPct: strengthB[ax.key],
      aRaw: strengthA[ax.key],
      bRaw: strengthB[ax.key],
      suffix: "",
    }));
    return generateVsBestInsights(nameA, nameB, metrics);
  }, [strengthA, strengthB, nameA, nameB]);

  const ratings = useMemo(() => {
    if (!strengthA || !strengthB) return undefined;
    return {
      entities: [
        { name: nameA, color: tokens["--series-6"], ovr: strengthA.fuerza },
        { name: nameB, color: tokens["--series-1"], ovr: strengthB.fuerza },
      ],
      factors: STRENGTH_AXES.map((ax) => ({ label: ax.name, values: [strengthA[ax.key], strengthB[ax.key]] })),
    };
  }, [strengthA, strengthB, nameA, nameB, tokens]);

  const subtitle = "Cabeza a cabeza · Fuerza de equipo (estilo EA SPORTS FC) · Liga Profesional";
  const shareText = rowA && rowB ? `${nameA} vs ${nameB} · ${subtitle}` : undefined;

  const waLink = useMemo(() => {
    if (!rowA || !rowB) return null;
    const url = typeof window !== "undefined" ? window.location.href : undefined;
    const lead = insights[0] ?? shareText ?? `${nameA} vs ${nameB}`;
    const message = `${nameA} vs ${nameB} · Liga Profesional — ${lead}${url ? ` Mirá el análisis completo: ${url}` : ""}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [rowA, rowB, insights, shareText, nameA, nameB]);

  return (
    <div>
      <div className="controls-row">
        <select value={effectiveA} onChange={(e) => setALabel(e.target.value)} aria-label="Primer club">
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span style={{ color: "var(--text-muted)" }}>vs.</span>
        <select value={effectiveB} onChange={(e) => setBLabel(e.target.value)} aria-label="Segundo club">
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      {strengthA && strengthB ? (
        <ShareableChart
          option={option}
          style={{ height: narrow ? 340 : 420 }}
          share={{
            title: `${nameA} vs ${nameB}`,
            subtitle,
            insight: insights[0],
            shareText,
            filenameBase: `${nameA}-vs-${nameB}`,
            ratings,
          }}
          shareLabel="🖼️ Compartir radar"
        />
      ) : (
        <p>Elegí dos selecciones para comparar.</p>
      )}
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        <strong>Fuerza</strong>: mismo índice que usa Predicción (0–100, calibrado a la liga) — 30% ofensivo, 20%
        control de pelota, 25% defensivo, 25% individual (índice GLOBAL de los 11 mejores jugadores con muestra
        suficiente del plantel). Estadística de equipo por partido: ESPN. El valor oficial de cada eje está en el
        tooltip.
      </p>

      {rowA && rowB && (
        <div className="table-scroll" style={{ marginTop: "0.75rem" }}>
          <table>
            <thead>
              <tr>
                <th>Detalle (no integra la Fuerza)</th>
                <th>{nameA}</th>
                <th>{nameB}</th>
              </tr>
            </thead>
            <tbody>
              {RAW_DETAIL.map((d) => {
                const va = Number((rowA as any)[d.key]) * (d.factor ?? 1);
                const vb = Number((rowB as any)[d.key]) * (d.factor ?? 1);
                return (
                  <tr key={d.key as string}>
                    <td>{d.label}</td>
                    <td>{num(va, d.suffix)}</td>
                    <td>{num(vb, d.suffix)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {strengthA && strengthB && insights.length > 0 && (
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
            Resumen generado en tu navegador a partir de los valores oficiales del dataset, expresados como índice de
            rendimiento (0–100, calibrado al rango del torneo) (no es una respuesta de IA en vivo). ¿Querés
            profundizar? Preguntale al asistente.
          </p>
        </div>
      )}

      {rowA && rowB && (
        <div className="share-block">
          <div className="share-label">
            <strong>Compartir este análisis</strong>
            <span>
              <TeamBadge team={nameA} crests={crests} /> {nameA} vs {nameB} <TeamBadge team={nameB} crests={crests} />{" "}
              — la imagen del radar se comparte con el botón de arriba
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

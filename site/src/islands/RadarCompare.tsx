import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { TeamPhysicalRankingRow, TeamTacticalRankingRow, TeamSeasonSummary } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";
import { flagFor } from "../lib/flags";
import { generateVsBestInsights, type VsBestMetric } from "../lib/insights";
import { makeIndexer, isLowerBetter } from "../lib/normalize";

// Los ejes del radar NO son percentiles ni "% del mejor" (con eso las
// selecciones de élite corrían casi lo mismo y todos los radares quedaban
// iguales). Usamos un ÍNDICE de rendimiento estilo EA SPORTS FC: se estira el
// rango real del torneo a una escala calibrada (40 = el más flojo del campo,
// 100 = el mejor), así una diferencia real chica se VE en el gráfico. Los
// valores oficiales se muestran igual en el tooltip.
//
// Tres modos, porque las fuentes miden cosas distintas en cada época:
//  - fisico2026 / tactico2026: las 48 selecciones del Mundial 2026 (FIFA).
//  - historico: contexto táctico de 2018/2022 (StatsBomb).
type Mode = "fisico2026" | "tactico2026" | "historico";

interface Metric {
  /** Clave del valor OFICIAL en la fila. */
  key: string;
  name: string;
  short: string;
  /** Sufijo del valor oficial (ej. " km", "%"). */
  suffix: string;
  /** Factor para mostrar el valor oficial (ej. posesión 0–1 -> ×100 = %). */
  factor?: number;
  /** Etiqueta en minúscula para la lectura automática. */
  insightLabel: string;
}

const PHYS_METRICS: Metric[] = [
  { key: "distancia_promedio_km", name: "Distancia", short: "Distancia", suffix: " km", insightLabel: "distancia recorrida" },
  { key: "alta_intensidad_promedio_m", name: "Alta intensidad", short: "Alta\nintensidad", suffix: " m", insightLabel: "alta intensidad" },
  { key: "sprints_promedio", name: "Sprints", short: "Sprints", suffix: "", insightLabel: "sprints" },
  { key: "velocidad_punta_kmh", name: "Velocidad punta", short: "Velocidad\npunta", suffix: " km/h", insightLabel: "velocidad punta" },
];

const TAC_METRICS: Metric[] = [
  { key: "precision_pases_pct", name: "Precisión de pase", short: "Precisión\nde pase", suffix: "%", insightLabel: "precisión de pase" },
  { key: "progresiones_promedio", name: "Progresiones", short: "Progre-\nsiones", suffix: "", insightLabel: "progresiones de balón" },
  { key: "remates_promedio", name: "Remates", short: "Remates", suffix: "", insightLabel: "remates" },
  { key: "presiones_promedio", name: "Presión", short: "Presión", suffix: "", insightLabel: "presión" },
  { key: "recuperaciones_promedio", name: "Recuperaciones", short: "Recupe-\nraciones", suffix: "", insightLabel: "recuperaciones" },
];

const HIST_METRICS: Metric[] = [
  { key: "posesion_promedio_proxy", name: "Posesión", short: "Posesión", suffix: "%", factor: 100, insightLabel: "posesión" },
  { key: "precision_pases_promedio", name: "Precisión de pase", short: "Precisión\nde pase", suffix: "%", insightLabel: "precisión de pase" },
  { key: "remates_promedio", name: "Remates", short: "Remates", suffix: "", insightLabel: "remates" },
  { key: "remates_al_arco_promedio", name: "Remates al arco", short: "Remates\nal arco", suffix: "", insightLabel: "remates al arco" },
];

interface Props {
  physicalRows: TeamPhysicalRankingRow[];
  tacticalRows: TeamTacticalRankingRow[];
  summaryRows: TeamSeasonSummary[];
}

export default function RadarCompare({ physicalRows, tacticalRows, summaryRows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  const [mode, setMode] = useState<Mode>(physicalRows.length ? "fisico2026" : "historico");

  // Configuración del modo activo: métricas, filas y cómo se etiqueta cada opción.
  const cfg = useMemo(() => {
    if (mode === "tactico2026") {
      return {
        metrics: TAC_METRICS,
        rows: [...tacticalRows].sort((a, b) => a.team.localeCompare(b.team)) as unknown as Record<string, number | string>[],
        labelOf: (r: Record<string, number | string>) => String(r.team),
        defaultA: "Argentina",
        defaultB: "Brazil",
        note: "Escala: índice de rendimiento (0–100) calibrado al rango de las 48 selecciones del Mundial 2026 — 100 = el mejor del torneo, ~40 = el más flojo del campo. Estira las diferencias reales para que se vean (estilo EA SPORTS FC). Táctico de equipo derivado de FIFA Training Centre. El valor oficial está en el tooltip.",
        subtitle: "Cabeza a cabeza · índice de rendimiento táctico · Mundial 2026",
      };
    }
    if (mode === "historico") {
      return {
        metrics: HIST_METRICS,
        rows: summaryRows as unknown as Record<string, number | string>[],
        labelOf: (r: Record<string, number | string>) => `${r.team} ${r.season}`,
        defaultA: "Argentina 2022",
        defaultB: "France 2022",
        note: "Escala: índice de rendimiento (0–100) calibrado al rango de este conjunto (StatsBomb, Mundiales 2018 y 2022; el free tier no cubre 2026 a nivel de equipo) — 100 = el mejor, ~40 = el más flojo del campo. El valor oficial está en el tooltip.",
        subtitle: "Cabeza a cabeza · índice de contexto táctico · 2018/2022",
      };
    }
    return {
      metrics: PHYS_METRICS,
      rows: [...physicalRows].sort((a, b) => a.team.localeCompare(b.team)) as unknown as Record<string, number | string>[],
      labelOf: (r: Record<string, number | string>) => String(r.team),
      defaultA: "Argentina",
      defaultB: "Brazil",
      note: "Escala: índice de rendimiento (0–100) calibrado al rango de las 48 selecciones del Mundial 2026 — 100 = el mejor del torneo, ~40 = el más flojo del campo. Estira las diferencias reales para que se vean (estilo EA SPORTS FC). Físico de equipo (FIFA Training Centre). Correr más no es automáticamente 'mejor': leelo junto al contexto táctico. El valor oficial está en el tooltip.",
      subtitle: "Cabeza a cabeza · índice de rendimiento físico · Mundial 2026",
    };
  }, [mode, physicalRows, tacticalRows, summaryRows]);

  const options = useMemo(() => cfg.rows.map(cfg.labelOf), [cfg]);

  // Índice de rendimiento por métrica: estira el rango del torneo a 40-100 para
  // que las diferencias entre selecciones se VEAN (no todas pegadas al borde).
  const normalizers = useMemo(() => {
    const map: Record<string, (v: number) => number> = {};
    for (const m of cfg.metrics) {
      const vals = cfg.rows.map((r) => Number(r[m.key])).filter((v) => Number.isFinite(v));
      map[m.key] = makeIndexer(vals, isLowerBetter(m.key));
    }
    return map;
  }, [cfg]);

  const [aLabel, setALabel] = useState("");
  const [bLabel, setBLabel] = useState("");

  const effectiveA = options.includes(aLabel) ? aLabel : options.includes(cfg.defaultA) ? cfg.defaultA : options[0];
  const effectiveB = options.includes(bLabel) ? bLabel : options.includes(cfg.defaultB) ? cfg.defaultB : options[1] ?? options[0];

  const a = cfg.rows.find((r) => cfg.labelOf(r) === effectiveA);
  const b = cfg.rows.find((r) => cfg.labelOf(r) === effectiveB);

  // Valores normalizados + oficiales de cada equipo, por métrica.
  const data = useMemo(() => {
    if (!a || !b) return null;
    const build = (row: Record<string, number | string>) =>
      cfg.metrics.map((m) => {
        const raw = Number(row[m.key]);
        const rawShown = Number.isFinite(raw) ? raw * (m.factor ?? 1) : NaN;
        return { norm: normalizers[m.key](raw), raw: rawShown, suffix: m.suffix };
      });
    return { a: build(a), b: build(b) };
  }, [a, b, cfg, normalizers]);

  const nameA = String(a?.team ?? effectiveA);
  const nameB = String(b?.team ?? effectiveB);

  const option = useMemo(() => {
    if (!data) return {};
    return {
      color: [tokens["--series-6"], tokens["--series-1"]],
      tooltip: {
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"] },
        formatter: (p: any) => {
          const isA = p.name === effectiveA || p.seriesIndex === 0;
          const arr = isA ? data.a : data.b;
          const rows = cfg.metrics
            .map((m, i) => {
              const d = arr[i];
              const rawTxt = Number.isFinite(d.raw) ? `${Math.round(d.raw * 10) / 10}${m.suffix}` : "—";
              return `${m.name.replace("\n", " ")}: índice <strong>${d.norm}</strong> · ${rawTxt}`;
            })
            .join("<br/>");
          return `<strong>${p.name}</strong><br/>${rows}`;
        },
      },
      legend: { bottom: 0, textStyle: { color: tokens["--text-secondary"] } },
      radar: {
        indicator: cfg.metrics.map((m) => ({ name: narrow ? m.short : m.name, min: 0, max: 100 })),
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
            { name: effectiveA, value: data.a.map((d) => d.norm), areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 } },
            { name: effectiveB, value: data.b.map((d) => d.norm), areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 } },
          ],
        },
      ],
    };
  }, [data, cfg, tokens, narrow, effectiveA, effectiveB]);

  const insights = useMemo(() => {
    if (!data) return [];
    const metrics: VsBestMetric[] = cfg.metrics.map((m, i) => ({
      label: m.insightLabel,
      aPct: data.a[i].norm,
      bPct: data.b[i].norm,
      aRaw: data.a[i].raw,
      bRaw: data.b[i].raw,
      suffix: m.suffix,
    }));
    return generateVsBestInsights(nameA, nameB, metrics);
  }, [data, cfg, nameA, nameB]);

  // Desglose "carta EA FC": GLOBAL (promedio) + índice por factor de cada
  // selección, con los mismos colores del radar (A=series-6, B=series-1).
  const ratings = useMemo(() => {
    if (!data) return undefined;
    return {
      entities: [
        { name: nameA, color: tokens["--series-6"] },
        { name: nameB, color: tokens["--series-1"] },
      ],
      factors: cfg.metrics.map((m, i) => ({
        label: m.name.replace("\n", " "),
        values: [data.a[i].norm, data.b[i].norm],
      })),
    };
  }, [data, cfg, nameA, nameB, tokens]);

  const shareText = a && b ? `${nameA} vs ${nameB} · ${cfg.subtitle}` : undefined;

  const waLink = useMemo(() => {
    if (!a || !b) return null;
    const url = typeof window !== "undefined" ? window.location.href : undefined;
    const lead = insights[0] ?? shareText ?? `${nameA} vs ${nameB}`;
    const message = `${nameA} vs ${nameB} · Mundial 2026 — ${lead}${url ? ` Mirá el análisis completo: ${url}` : ""}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [a, b, insights, shareText, nameA, nameB]);

  return (
    <div>
      <div className="mode-toggle" role="tablist" aria-label="Dimensión de comparación">
        <button type="button" role="tab" aria-selected={mode === "fisico2026"} className={mode === "fisico2026" ? "is-active" : undefined} onClick={() => setMode("fisico2026")} disabled={physicalRows.length === 0}>
          Físico · Mundial 2026 <span className="mode-count">48</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === "tactico2026"} className={mode === "tactico2026" ? "is-active" : undefined} onClick={() => setMode("tactico2026")} disabled={tacticalRows.length === 0}>
          Táctico · Mundial 2026 <span className="mode-count">48</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === "historico"} className={mode === "historico" ? "is-active" : undefined} onClick={() => setMode("historico")}>
          Táctico · histórico 2018/2022
        </button>
      </div>

      <div className="controls-row">
        <select value={effectiveA} onChange={(e) => setALabel(e.target.value)} aria-label="Primera selección">
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span style={{ color: "var(--text-muted)" }}>vs.</span>
        <select value={effectiveB} onChange={(e) => setBLabel(e.target.value)} aria-label="Segunda selección">
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
            title: `${nameA} vs ${nameB}`,
            subtitle: cfg.subtitle,
            insight: insights[0],
            shareText,
            filenameBase: `${nameA}-vs-${nameB}-${mode}`,
            ratings,
          }}
          shareLabel="🖼️ Compartir radar"
        />
      ) : (
        <p>Elegí dos selecciones para comparar.</p>
      )}
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{cfg.note}</p>

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
            Resumen generado en tu navegador a partir de los valores oficiales del dataset, expresados como índice de
            rendimiento (0–100, calibrado al rango del torneo) (no es una respuesta de IA en vivo). ¿Querés profundizar? Preguntale al asistente.
          </p>
        </div>
      )}

      {a && b && (
        <div className="share-block">
          <div className="share-label">
            <strong>Compartir este análisis</strong>
            <span>
              {flagFor(nameA)} {nameA} vs {nameB} {flagFor(nameB)} — la imagen del radar se comparte con el botón de arriba
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

import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { RadarRow, TeamPhysicalRankingRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";
import { flagFor } from "../lib/flags";
import { generateTeamComparisonInsights, type MetricDef } from "../lib/insights";

// Dos modos honestos, porque las fuentes NO miden lo mismo en cada época:
//  - "fisico2026": físico de equipo de las 48 selecciones del Mundial 2026
//    (FIFA Training Centre). Es el dato más completo y el eje de la hipótesis
//    del sitio. Todas las selecciones de 2026 son comparables entre sí.
//  - "tactico": contexto táctico histórico (posesión/pases/remates) de los
//    Mundiales 2018 y 2022 (StatsBomb Open Data — el free tier no cubre 2026
//    a nivel de equipo). Ejes distintos a propósito: no se mezclan métricas
//    de fuentes que miden cosas diferentes.
type Mode = "fisico2026" | "tactico";

interface Indicator {
  key: string;
  name: string;
  short: string;
}

const PHYS_INDICATORS: Indicator[] = [
  { key: "distancia_promedio_km_percentil", name: "Distancia (percentil)", short: "Distancia" },
  { key: "alta_intensidad_promedio_m_percentil", name: "Alta intensidad (percentil)", short: "Alta\nintensidad" },
  { key: "sprints_promedio_percentil", name: "Sprints (percentil)", short: "Sprints" },
  { key: "velocidad_punta_kmh_percentil", name: "Velocidad punta (percentil)", short: "Velocidad\npunta" },
];

const PHYS_INSIGHT_METRICS: MetricDef[] = [
  { key: "distancia_promedio_km_percentil", label: "distancia recorrida" },
  { key: "alta_intensidad_promedio_m_percentil", label: "alta intensidad" },
  { key: "sprints_promedio_percentil", label: "sprints" },
  { key: "velocidad_punta_kmh_percentil", label: "velocidad punta" },
];

const TAC_INDICATORS: Indicator[] = [
  { key: "posesion_promedio_proxy_percentil", name: "Posesión (percentil)", short: "Posesión" },
  { key: "precision_pases_promedio_percentil", name: "Precisión de pase (percentil)", short: "Precisión\nde pase" },
  { key: "remates_promedio_percentil", name: "Remates (percentil)", short: "Remates" },
  { key: "remates_al_arco_promedio_percentil", name: "Remates al arco (percentil)", short: "Remates\nal arco" },
];

const TAC_INSIGHT_METRICS: MetricDef[] = [
  { key: "posesion_promedio_proxy_percentil", label: "posesión" },
  { key: "precision_pases_promedio_percentil", label: "precisión de pase" },
  { key: "remates_promedio_percentil", label: "remates" },
  { key: "remates_al_arco_promedio_percentil", label: "remates al arco" },
];

interface Props {
  /** Táctico histórico 2018/2022 (StatsBomb). */
  rows: RadarRow[];
  /** Físico de las 48 selecciones del Mundial 2026 (FIFA Training Centre). */
  physicalRows: TeamPhysicalRankingRow[];
}

export default function RadarCompare({ rows, physicalRows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  // Si no hay físico 2026 todavía, arranca en táctico para no mostrar vacío.
  const [mode, setMode] = useState<Mode>(physicalRows.length ? "fisico2026" : "tactico");

  // Cada modo tiene su propia lista de opciones (etiqueta) y su forma de
  // encontrar la fila a partir de esa etiqueta.
  const cfg = useMemo(() => {
    if (mode === "fisico2026") {
      const sorted = [...physicalRows].sort((x, y) => x.team.localeCompare(y.team));
      const asRadar = (r: TeamPhysicalRankingRow) => ({ ...r, season: "2026" }) as unknown as RadarRow;
      return {
        indicators: PHYS_INDICATORS,
        insightMetrics: PHYS_INSIGHT_METRICS,
        dimensionLabel: "rendimiento físico",
        options: sorted.map((r) => r.team),
        find: (label: string) => {
          const r = sorted.find((x) => x.team === label);
          return r ? asRadar(r) : undefined;
        },
        defaultA: "Argentina",
        defaultB: sorted.find((r) => r.team === "Brazil")?.team ?? sorted.find((r) => r.team !== "Argentina")?.team,
        note:
          "Percentil entre las 48 selecciones del Mundial 2026 (0–100), no valor absoluto. Físico de equipo (suma de los 11) por partido: FIFA Training Centre. Recordá que correr más no es automáticamente 'mejor' — leelo junto al contexto táctico.",
        subtitle: "Cabeza a cabeza · percentiles físicos · Mundial 2026",
      };
    }
    return {
      indicators: TAC_INDICATORS,
      insightMetrics: TAC_INSIGHT_METRICS,
      dimensionLabel: "contexto táctico",
      options: rows.map((r) => `${r.team} ${r.season}`),
      find: (label: string) => rows.find((r) => `${r.team} ${r.season}` === label),
      defaultA: rows.find((r) => r.team === "Argentina") ? `Argentina ${rows.find((r) => r.team === "Argentina")!.season}` : `${rows[0]?.team} ${rows[0]?.season}`,
      defaultB: rows.find((r) => r.team === "France") ? `France ${rows.find((r) => r.team === "France")!.season}` : undefined,
      note:
        "Percentil dentro del propio dataset (0–100), no valor absoluto — variables de contexto táctico de StatsBomb (Mundiales 2018 y 2022; el free tier no cubre 2026 a nivel de equipo), no métricas físicas.",
      subtitle: "Cabeza a cabeza · percentiles de contexto táctico · 2018/2022",
    };
  }, [mode, rows, physicalRows]);

  const [aLabel, setALabel] = useState<string>("");
  const [bLabel, setBLabel] = useState<string>("");

  // Al cambiar de modo, las etiquetas del modo anterior pueden no existir en el
  // nuevo -> se caen a los valores por defecto de ese modo.
  const effectiveA = cfg.options.includes(aLabel) ? aLabel : (cfg.defaultA && cfg.options.includes(cfg.defaultA) ? cfg.defaultA : cfg.options[0]);
  const effectiveB = cfg.options.includes(bLabel) ? bLabel : (cfg.defaultB && cfg.options.includes(cfg.defaultB) ? cfg.defaultB : cfg.options[1] ?? cfg.options[0]);

  const a = cfg.find(effectiveA);
  const b = cfg.find(effectiveB);

  const option = useMemo(() => {
    if (!a || !b) return {};
    return {
      color: [tokens["--series-6"], tokens["--series-1"]],
      tooltip: {
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"] },
      },
      legend: { bottom: 0, textStyle: { color: tokens["--text-secondary"] } },
      radar: {
        indicator: cfg.indicators.map((i) => ({ name: narrow ? i.short : i.name, min: 0, max: 100 })),
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
              name: a.team,
              value: cfg.indicators.map((i) => (a as unknown as Record<string, number>)[i.key]),
              areaStyle: { opacity: 0.15 },
              lineStyle: { width: 2 },
            },
            {
              name: b.team,
              value: cfg.indicators.map((i) => (b as unknown as Record<string, number>)[i.key]),
              areaStyle: { opacity: 0.15 },
              lineStyle: { width: 2 },
            },
          ],
        },
      ],
    };
  }, [a, b, tokens, narrow, cfg]);

  const insights = useMemo(
    () => generateTeamComparisonInsights(a, b, cfg.insightMetrics, cfg.dimensionLabel),
    [a, b, cfg],
  );

  const shareText = a && b ? `${a.team} vs ${b.team} · ${cfg.subtitle}` : undefined;

  const waLink = useMemo(() => {
    if (!a || !b) return null;
    const url = typeof window !== "undefined" ? window.location.href : undefined;
    const lead = insights[0] ?? shareText ?? `${a.team} vs ${b.team}`;
    const message = `${a.team} vs ${b.team} · Mundial 2026 — ${lead}${url ? ` Mirá el análisis completo: ${url}` : ""}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [a, b, insights, shareText]);

  return (
    <div>
      <div className="mode-toggle" role="tablist" aria-label="Dimensión de comparación">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "fisico2026"}
          className={mode === "fisico2026" ? "is-active" : undefined}
          onClick={() => setMode("fisico2026")}
          disabled={physicalRows.length === 0}
        >
          Físico · Mundial 2026 <span className="mode-count">48</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "tactico"}
          className={mode === "tactico" ? "is-active" : undefined}
          onClick={() => setMode("tactico")}
        >
          Táctico · histórico 2018/2022
        </button>
      </div>

      <div className="controls-row">
        <select value={effectiveA} onChange={(e) => setALabel(e.target.value)} aria-label="Primera selección">
          {cfg.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span style={{ color: "var(--text-muted)" }}>vs.</span>
        <select value={effectiveB} onChange={(e) => setBLabel(e.target.value)} aria-label="Segunda selección">
          {cfg.options.map((o) => (
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
            subtitle: cfg.subtitle,
            insight: insights[0],
            shareText,
            filenameBase: `${a.team}-vs-${b.team}-${mode}`,
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

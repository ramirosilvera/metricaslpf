import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { DerivedTeamMetricRow } from "../lib/data";
import { useChartTokens, useIsNarrow, wrapAxisName } from "../lib/theme";
import { makeIndexer, isLowerBetter } from "../lib/normalize";

// Sufijos para mostrar el valor OFICIAL en el tooltip (además del índice).
const METRIC_SUFFIX: Record<string, string> = {
  posesion_promedio_proxy: "",
  precision_pases_promedio: "%",
  remates_promedio: "",
  remates_al_arco_promedio: "",
  faltas_promedio: "",
  distancia_promedio_km: " km",
  sprints_promedio: "",
  velocidad_punta_kmh: " km/h",
  alta_intensidad_promedio_m: " m",
  edad_promedio: " años",
  valor_plantel_promedio_eur: " €",
};

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
  const narrow = useIsNarrow();
  const teamSeasons = useMemo(() => [...new Set(rows.map((r) => `${r.team} ${r.season}`))].sort(), [rows]);

  const [aLabel, setALabel] = useState(teamSeasons.find((o) => o.startsWith("Argentina")) ?? teamSeasons[0] ?? "");
  const [bLabel, setBLabel] = useState(teamSeasons.find((o) => o.startsWith("France")) ?? teamSeasons[1] ?? teamSeasons[0] ?? "");

  const rowsFor = (label: string) => rows.filter((r) => `${r.team} ${r.season}` === label);
  const a = rowsFor(aLabel);
  const b = rowsFor(bLabel);

  const sharedMetrics = METRIC_ORDER.filter(
    (m) => a.some((r) => r.metric === m && r.value != null) && b.some((r) => r.metric === m && r.value != null),
  );

  // Índice de rendimiento por (temporada, métrica): estira el rango real de esa
  // temporada a 40-100 para que las diferencias entre selecciones se VEAN (si no,
  // los equipos de élite quedan todos pegados al borde). Estilo EA SPORTS FC.
  const normalizers = useMemo(() => {
    const map: Record<string, (v: number) => number> = {};
    for (const m of METRIC_ORDER) {
      const bySeason = new Map<string, number[]>();
      for (const r of rows) {
        if (r.metric !== m || r.value == null) continue;
        (bySeason.get(r.season) ?? bySeason.set(r.season, []).get(r.season)!).push(r.value);
      }
      for (const [season, vals] of bySeason) map[`${season}|${m}`] = makeIndexer(vals, isLowerBetter(m));
    }
    return map;
  }, [rows]);

  const option = useMemo(() => {
    if (sharedMetrics.length < 3) return null;
    const normFor = (list: DerivedTeamMetricRow[], m: string) => {
      const row = list.find((r) => r.metric === m);
      if (!row || row.value == null) return 0;
      return normalizers[`${row.season}|${m}`]?.(row.value) ?? 0;
    };
    const rawFor = (list: DerivedTeamMetricRow[], m: string) => list.find((r) => r.metric === m)?.value ?? null;
    return {
      color: [tokens["--series-6"], tokens["--series-1"]],
      tooltip: {
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"] },
        formatter: (p: any) => {
          const list = p.name === aLabel ? a : b;
          const rowsTxt = sharedMetrics
            .map((m) => {
              const raw = rawFor(list, m);
              const rawTxt = raw != null ? `${Math.round(raw * 10) / 10}${METRIC_SUFFIX[m] ?? ""}` : "—";
              return `${METRIC_LABELS[m]}: índice <strong>${normFor(list, m)}</strong> · ${rawTxt}`;
            })
            .join("<br/>");
          return `<strong>${p.name}</strong><br/>${rowsTxt}`;
        },
      },
      legend: { bottom: 0, textStyle: { color: tokens["--text-secondary"] } },
      radar: {
        indicator: sharedMetrics.map((m) => ({
          name: narrow ? wrapAxisName(METRIC_LABELS[m], 13) : METRIC_LABELS[m],
          min: 0,
          max: 100,
        })),
        radius: narrow ? "52%" : "70%",
        axisName: {
          color: tokens["--text-secondary"],
          fontSize: narrow ? 9 : 10,
        },
        splitLine: { lineStyle: { color: tokens["--gridline"] } },
        splitArea: { areaStyle: { color: ["transparent", "transparent"] } },
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
      },
      series: [
        {
          type: "radar",
          data: [
            { name: aLabel, value: sharedMetrics.map((m) => normFor(a, m)), areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 } },
            { name: bLabel, value: sharedMetrics.map((m) => normFor(b, m)), areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 } },
          ],
        },
      ],
    };
  }, [sharedMetrics, a, b, aLabel, bLabel, tokens, narrow, normalizers]);

  // Desglose "carta EA FC": GLOBAL + índice por factor de cada selección/torneo.
  const ratings = useMemo(() => {
    if (sharedMetrics.length < 3) return undefined;
    const idxOf = (list: DerivedTeamMetricRow[], m: string) => {
      const row = list.find((r) => r.metric === m);
      if (!row || row.value == null) return 0;
      return normalizers[`${row.season}|${m}`]?.(row.value) ?? 0;
    };
    return {
      entities: [
        { name: aLabel, color: tokens["--series-6"] },
        { name: bLabel, color: tokens["--series-1"] },
      ],
      factors: sharedMetrics.map((m) => ({
        label: METRIC_LABELS[m],
        values: [idxOf(a, m), idxOf(b, m)],
      })),
    };
  }, [sharedMetrics, a, b, aLabel, bLabel, normalizers, tokens]);

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
        <ShareableChart
          option={option}
          style={{ height: narrow ? 360 : 440 }}
          share={{
            title: `${aLabel} vs ${bLabel}`,
            subtitle: "Métricas derivadas (índice de rendimiento) · radar multi-fuente",
            filenameBase: `${aLabel}-vs-${bLabel}`,
            ratings,
          }}
          shareLabel="🖼️ Compartir radar"
        />
      ) : (
        <p style={{ color: "var(--text-muted)" }}>
          Estas dos selecciones/torneos no comparten suficientes métricas cargadas todavía (ej. una es de 2018 y la
          otra de 2026, y todavía no hay overlap de fuentes).
        </p>
      )}
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Cada eje es un índice de rendimiento (0–100) calibrado al rango real de esa temporada — 100 = el mejor de ese
        Mundial, ~40 = el más flojo del campo (estira las diferencias para que se vean, estilo EA SPORTS FC). Combina lo
        táctico (StatsBomb), físico (FIFA Training Centre) y de plantel (Transfermarkt) cuando hay datos de las tres fuentes.
      </p>
    </div>
  );
}

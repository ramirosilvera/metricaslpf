import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { TeamPhysicalRankingRow, TeamTacticalRankingRow } from "../lib/data";
import { useChartTokens, useIsNarrow, wrapAxisName } from "../lib/theme";
import { flagFor } from "../lib/flags";
import { makeIndexer } from "../lib/normalize";
import { generateVsBestInsights, type VsBestMetric } from "../lib/insights";

// Radar COMPLETO de selección (Mundial 2026): junta en un mismo gráfico el perfil
// FÍSICO (FIFA Training Centre) y el TÁCTICO de equipo (derivado de la estadística
// por jugador de FIFA) — todos los factores para analizar una selección a fondo,
// no sólo cuatro. Cada eje es el índice de rendimiento (0-100) calibrado al rango
// de las 48 selecciones; el GLOBAL es el promedio de esos índices. Valor oficial
// en el tooltip. Todas las métricas son "más es mejor".

interface Metric {
  key: string;
  src: "phys" | "tac";
  name: string;
  short: string;
  suffix: string;
}

const METRICS: Metric[] = [
  { key: "distancia_promedio_km", src: "phys", name: "Distancia", short: "Distancia", suffix: " km" },
  { key: "alta_intensidad_promedio_m", src: "phys", name: "Alta intensidad", short: "Alta\nintensidad", suffix: " m" },
  { key: "sprints_promedio", src: "phys", name: "Sprints", short: "Sprints", suffix: "" },
  { key: "velocidad_punta_kmh", src: "phys", name: "Velocidad punta", short: "Velocidad\npunta", suffix: " km/h" },
  { key: "precision_pases_pct", src: "tac", name: "Precisión de pase", short: "Precisión\nde pase", suffix: "%" },
  { key: "progresiones_promedio", src: "tac", name: "Progresiones", short: "Progre-\nsiones", suffix: "" },
  { key: "remates_promedio", src: "tac", name: "Remates", short: "Remates", suffix: "" },
  { key: "presiones_promedio", src: "tac", name: "Presión", short: "Presión", suffix: "" },
  { key: "recuperaciones_promedio", src: "tac", name: "Recuperaciones", short: "Recupe-\nraciones", suffix: "" },
  { key: "tackles_promedio", src: "tac", name: "Tackles ganados", short: "Tackles", suffix: "" },
  { key: "intercepciones_promedio", src: "tac", name: "Intercepciones", short: "Inter-\ncepciones", suffix: "" },
  { key: "quiebres_linea_promedio", src: "tac", name: "Quiebres de línea", short: "Quiebres\nde línea", suffix: "" },
];

interface Props {
  physicalRows: TeamPhysicalRankingRow[];
  tacticalRows: TeamTacticalRankingRow[];
}

export default function TeamProfileRadar({ physicalRows, tacticalRows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  // Índice por métrica sobre las 48 selecciones (fuente física o táctica según la métrica).
  const indexers = useMemo(() => {
    const map: Record<string, (v: number) => number> = {};
    for (const m of METRICS) {
      const src = m.src === "phys" ? physicalRows : tacticalRows;
      const vals = src.map((r) => Number((r as Record<string, unknown>)[m.key])).filter((v) => Number.isFinite(v));
      map[m.key] = makeIndexer(vals);
    }
    return map;
  }, [physicalRows, tacticalRows]);

  // Perfil combinado por selección: valores oficiales + índice de cada factor.
  const teams = useMemo(() => {
    const phys = new Map(physicalRows.map((r) => [r.team, r]));
    const tac = new Map(tacticalRows.map((r) => [r.team, r]));
    const names = [...new Set([...phys.keys()].filter((t) => tac.has(t)))].sort();
    const map = new Map<string, { team: string; factors: { key: string; idx: number; raw: number }[] }>();
    for (const team of names) {
      const rowP = phys.get(team) as Record<string, unknown> | undefined;
      const rowT = tac.get(team) as Record<string, unknown> | undefined;
      const factors = METRICS.map((m) => {
        const row = m.src === "phys" ? rowP : rowT;
        const raw = Number(row?.[m.key]);
        return { key: m.key, idx: Number.isFinite(raw) ? indexers[m.key](raw) : 0, raw };
      });
      map.set(team, { team, factors });
    }
    return map;
  }, [physicalRows, tacticalRows, indexers]);

  const options = useMemo(() => [...teams.keys()], [teams]);
  const [aTeam, setATeam] = useState("");
  const [bTeam, setBTeam] = useState("");
  const effA = options.includes(aTeam) ? aTeam : options.includes("Argentina") ? "Argentina" : options[0] ?? "";
  const effB = options.includes(bTeam) ? bTeam : options.includes("Brazil") ? "Brazil" : options[1] ?? options[0] ?? "";
  const a = teams.get(effA);
  const b = teams.get(effB);

  const idxOf = (t: typeof a, key: string) => t?.factors.find((f) => f.key === key)?.idx ?? 0;
  const rawOf = (t: typeof a, key: string) => t?.factors.find((f) => f.key === key)?.raw ?? NaN;
  const fmtRaw = (m: Metric, v: number) => (Number.isFinite(v) ? `${Math.round(v * 10) / 10}${m.suffix}` : "—");
  const globalOf = (t: typeof a) => (t ? Math.round(t.factors.reduce((s, f) => s + f.idx, 0) / t.factors.length) : 0);

  const ratings = useMemo(() => {
    if (!a || !b) return undefined;
    return {
      entities: [
        { name: effA, color: tokens["--series-6"], ovr: globalOf(a) },
        { name: effB, color: tokens["--series-1"], ovr: globalOf(b) },
      ],
      factors: METRICS.map((m) => ({ label: m.name, values: [idxOf(a, m.key), idxOf(b, m.key)] })),
    };
  }, [a, b, effA, effB, tokens]);

  const insights = useMemo(() => {
    if (!a || !b) return [];
    const metrics: VsBestMetric[] = METRICS.map((m) => ({
      label: m.name.toLowerCase(),
      aPct: idxOf(a, m.key),
      bPct: idxOf(b, m.key),
      aRaw: rawOf(a, m.key),
      bRaw: rawOf(b, m.key),
      suffix: m.suffix,
    }));
    return generateVsBestInsights(effA, effB, metrics);
  }, [a, b, effA, effB]);

  const option = useMemo(() => {
    if (!a || !b) return {};
    const tooltip = (t: typeof a, name: string) =>
      `<strong>${name}</strong><br/>` +
      METRICS.map((m) => `${m.name}: índice <strong>${idxOf(t, m.key)}</strong> · ${fmtRaw(m, rawOf(t, m.key))}`).join("<br/>");
    return {
      color: [tokens["--series-6"], tokens["--series-1"]],
      tooltip: {
        confine: true,
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"], fontSize: 12 },
        formatter: (p: any) => tooltip(p.seriesIndex === 0 ? a : b, p.seriesIndex === 0 ? effA : effB),
      },
      legend: { bottom: 0, textStyle: { color: tokens["--text-secondary"] } },
      radar: {
        indicator: METRICS.map((m) => ({ name: narrow ? m.short : m.name, min: 0, max: 100 })),
        radius: narrow ? "62%" : "72%",
        axisName: { color: tokens["--text-secondary"], fontSize: narrow ? 8 : 10 },
        splitLine: { lineStyle: { color: tokens["--gridline"] } },
        splitArea: { areaStyle: { color: ["transparent", "transparent"] } },
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
      },
      series: [
        {
          type: "radar",
          data: [
            { name: effA, value: METRICS.map((m) => idxOf(a, m.key)), areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 } },
            { name: effB, value: METRICS.map((m) => idxOf(b, m.key)), areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 } },
          ],
        },
      ],
    };
  }, [a, b, effA, effB, tokens, narrow]);

  if (options.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay selecciones con perfil físico y táctico cargado.</p>;
  }

  return (
    <div>
      <div className="controls-row">
        <select value={effA} onChange={(e) => setATeam(e.target.value)} aria-label="Primera selección">
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span style={{ color: "var(--text-muted)" }}>vs.</span>
        <select value={effB} onChange={(e) => setBTeam(e.target.value)} aria-label="Segunda selección">
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
          style={{ height: narrow ? 380 : 460 }}
          share={{
            title: `${effA} vs ${effB}`,
            subtitle: "Perfil completo · físico + táctico · Mundial 2026",
            insight: insights[0],
            shareText: `${effA} vs ${effB} · perfil físico y táctico completo`,
            filenameBase: `${effA}-vs-${effB}-perfil`,
            ratings,
          }}
          shareLabel="🖼️ Compartir radar"
        />
      ) : (
        <p>Elegí dos selecciones.</p>
      )}

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
            Índice de rendimiento (0–100) por factor y GLOBAL como promedio, calibrados al rango de las 48 selecciones.
            Combina físico (FIFA Training Centre) y táctico de equipo (derivado de la estadística por jugador de FIFA).
          </p>
        </div>
      )}

      {a && b && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {flagFor(effA)} {effA} vs {flagFor(effB)} {effB}. 12 factores físicos y tácticos en un solo radar; el GLOBAL es
          el promedio del índice de todos. Correr o presionar más no es automáticamente "mejor": leelo junto al contexto.
        </p>
      )}
    </div>
  );
}

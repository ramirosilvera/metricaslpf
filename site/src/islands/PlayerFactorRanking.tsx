import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { DerivedPlayerMetricRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";
import { flagOrCrestHtml, escapeHtml } from "../lib/flags";
import { makeIndexer, isLowerBetter } from "../lib/normalize";
import { PLAYER_METRIC_LABELS, PLAYER_RADAR_ORDER } from "../lib/playerMetrics";
import { sampleTier } from "../lib/playerSampleGate";
import { CATEGORIES_BY_POSITION } from "../lib/playerCategories";

// Ranking por FACTOR: elegí cualquiera de las 37 categorías de FotMob (goles,
// xG, tackles, atajadas, etc.) y mirá qué jugador manda en ese factor — entre
// TODOS los clubes o dentro de uno solo. Ordena por el valor real de la
// métrica; el índice (0-100, calibrado a todos los jugadores medidos) va en el
// tooltip para dimensionar. Complementa al índice global: uno resume, éste te
// deja bucear factor por factor.

const ALL = "__all__";
const TOP_ALL = 25;
const POS_LABEL: Record<string, string> = { GK: "Arquero", DF: "Defensor", MF: "Mediocampista", FW: "Delantero" };

// El selector de 37 factores sueltos se agrupa en <optgroup> con la MISMA
// partición que las categorías EA-FC del resto de la app (ver
// playerCategories.ts) -- así "Ataque" acá es lo mismo que "Ataque" en la
// ficha de jugador, no una segunda taxonomía inventada aparte. Las 3
// categorías de arquero (Atajadas/Valla/Pies) se juntan en un solo grupo
// "Portería" -- son pocos factores cada una, 3 optgroups de 2-3 ítems
// estorban más de lo que ordenan. Lo que no pertenece a ninguna categoría
// (totales crudos con variante ya cubierta, eventos rarísimos, minutos/
// partidos jugados) cae en "Datos crudos y contexto", al final.
type OptGroupKey = "ATA" | "CRE" | "PAS" | "DEF" | "VAL" | "GK" | "OTHER";
const OPTGROUP_LABEL: Record<OptGroupKey, string> = {
  ATA: "Ataque",
  CRE: "Creación",
  PAS: "Pase",
  DEF: "Defensa",
  VAL: "Valoración",
  GK: "Portería",
  OTHER: "Datos crudos y contexto",
};
const OPTGROUP_ORDER: OptGroupKey[] = ["ATA", "CRE", "PAS", "DEF", "VAL", "GK", "OTHER"];

const METRIC_OPTGROUP: ReadonlyMap<string, OptGroupKey> = (() => {
  const map = new Map<string, OptGroupKey>();
  // FW/MF/DF comparten exactamente las mismas 5 categorías de campo (ver
  // CATEGORIES_BY_POSITION) -- alcanza con recorrer una sola.
  for (const [key, members] of Object.entries(CATEGORIES_BY_POSITION.FW)) {
    for (const m of members) if (!map.has(m.metric)) map.set(m.metric, key as OptGroupKey);
  }
  for (const [, members] of Object.entries(CATEGORIES_BY_POSITION.GK)) {
    for (const m of members) if (!map.has(m.metric)) map.set(m.metric, "GK");
  }
  return map;
})();

interface Props {
  rows: DerivedPlayerMetricRow[];
  positions?: Record<string, string>;
  crests?: Record<string, string>;
}

interface Row {
  player: string;
  team: string;
  value: number;
  idx: number;
  position: string | null;
}

export default function PlayerFactorRanking({ rows, positions = {}, crests }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  const [metric, setMetric] = useState(PLAYER_RADAR_ORDER[0]);
  const [team, setTeam] = useState(ALL);

  const def = PLAYER_METRIC_LABELS[metric];
  const label = def.label.replace(" / partido", "");
  const suffix = def.suffix;

  const groupedMetrics = useMemo(() => {
    const buckets = new Map<OptGroupKey, string[]>(OPTGROUP_ORDER.map((g) => [g, []]));
    for (const m of PLAYER_RADAR_ORDER) {
      const g = METRIC_OPTGROUP.get(m) ?? "OTHER";
      buckets.get(g)!.push(m);
    }
    return buckets;
  }, []);

  // matches_played/mins_played por jugador -- gate de muestra mínima (mismo
  // criterio que el ranking de índice global, ver playerSampleGate.ts). Sin
  // esto un jugador de pocos minutos podía liderar una tasa "cada 90'" por
  // pura casualidad de muestra chica (ej. un delantero con 14 partidos
  // liderando goles cada 90', o alguien con 27 minutos en el top de
  // tarjetas amarillas).
  const sampleByPlayer = useMemo(() => {
    const map = new Map<string, { matchesPlayed: number | null; minsPlayed: number | null }>();
    for (const r of rows) {
      if (r.metric !== "matches_played" && r.metric !== "mins_played") continue;
      const key = `${r.team}|${r.player_name}`;
      const e = map.get(key) ?? { matchesPlayed: null, minsPlayed: null };
      if (r.metric === "matches_played") e.matchesPlayed = r.value;
      if (r.metric === "mins_played") e.minsPlayed = r.value;
      map.set(key, e);
    }
    return map;
  }, [rows]);

  // índice del factor elegido sobre todos los jugadores medidos.
  const indexer = useMemo(() => {
    const vals = rows.filter((r) => r.metric === metric && r.value != null).map((r) => r.value as number);
    return makeIndexer(vals, isLowerBetter(metric));
  }, [rows, metric]);

  // filas del factor elegido, con posición -- sólo jugadores con muestra
  // suficiente ("ranked").
  const factorRows = useMemo<Row[]>(() => {
    return rows
      .filter((r) => r.metric === metric && r.value != null)
      .filter((r) => {
        const s = sampleByPlayer.get(`${r.team}|${r.player_name}`);
        return sampleTier(s?.matchesPlayed, s?.minsPlayed) === "ranked";
      })
      .map((r) => ({
        player: r.player_name,
        team: r.team,
        value: r.value as number,
        idx: indexer(r.value as number),
        position: positions[`${r.team}|${r.player_name}`] ?? null,
      }));
  }, [rows, metric, indexer, positions, sampleByPlayer]);

  const teams = useMemo(() => [...new Set(factorRows.map((r) => r.team))].sort(), [factorRows]);
  const effTeam = team === ALL || teams.includes(team) ? team : ALL;

  const filtered = useMemo(() => {
    const lower = isLowerBetter(metric);
    const base = effTeam === ALL ? factorRows : factorRows.filter((r) => r.team === effTeam);
    const sorted = [...base].sort((a, b) => (lower ? a.value - b.value : b.value - a.value));
    return effTeam === ALL ? sorted.slice(0, TOP_ALL) : sorted;
  }, [factorRows, effTeam, metric]);

  const fmt = (v: number) => `${Math.round(v * 10) / 10}${suffix}`;

  const option = useMemo(() => {
    if (filtered.length === 0) return {};
    const ordered = [...filtered].reverse(); // mejor arriba
    const labels = ordered.map((r) => (effTeam === ALL ? `${r.player} · ${r.team}` : r.player));
    return {
      // margen derecho holgado: la etiqueta muestra valor + unidad (ej. "37.6 km/h")
      // y con poco margen se recortaba en el borde del canvas.
      grid: { left: 8, right: 88, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        confine: true,
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"], fontSize: 12 },
        formatter: (ps: any) => {
          const i = Array.isArray(ps) ? ps[0]?.dataIndex : ps?.dataIndex;
          const r = ordered[i];
          if (!r) return "";
          const pos = r.position ? ` · ${POS_LABEL[r.position] ?? r.position}` : "";
          return `${flagOrCrestHtml(r.team, crests)} <strong>${escapeHtml(r.player)}</strong> · ${escapeHtml(r.team)}${pos}<br/>${label}: <strong>${fmt(r.value)}</strong> · índice ${r.idx}`;
        },
      },
      xAxis: {
        type: "value",
        // Menos ticks en mobile -- si no, el eje termina con los números
        // pegados unos a otros (ilegible en pantallas angostas).
        splitNumber: narrow ? 4 : 5,
        splitLine: { lineStyle: { color: tokens["--gridline"] } },
        axisLabel: { color: tokens["--text-secondary"], fontSize: narrow ? 10 : 12 },
      },
      yAxis: {
        type: "category",
        data: labels,
        axisLabel: { color: tokens["--text-secondary"], fontSize: narrow ? 10 : 12 },
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
      },
      series: [
        {
          type: "bar",
          data: ordered.map((r) => Math.round(r.value * 100) / 100),
          barMaxWidth: 20,
          itemStyle: { color: tokens["--series-3"], borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: "right",
            color: tokens["--text-primary"],
            fontWeight: 700,
            fontFamily: "ui-monospace, Menlo, monospace",
            formatter: (p: any) => fmt(ordered[p.dataIndex].value),
          },
        },
      ],
    };
  }, [filtered, effTeam, tokens, narrow, label, suffix]);

  if (factorRows.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay datos de este factor cargados.</p>;
  }

  const chartHeight = Math.max(240, filtered.length * (narrow ? 26 : 30) + 40);
  const leader = filtered[0];
  const subtitle =
    effTeam === ALL ? `Top ${filtered.length} de la liga · ${label}` : `${effTeam} · ${label}`;

  return (
    <div>
      <div className="controls-row" style={{ flexWrap: "wrap" }}>
        <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Factor">
          {OPTGROUP_ORDER.map((g) => {
            const items = groupedMetrics.get(g) ?? [];
            if (items.length === 0) return null;
            return (
              <optgroup key={g} label={OPTGROUP_LABEL[g]}>
                {items.map((m) => (
                  <option key={m} value={m}>
                    {PLAYER_METRIC_LABELS[m].label.replace(" / partido", "")}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <select value={effTeam} onChange={(e) => setTeam(e.target.value)} aria-label="Club">
          <option value={ALL}>⚽ Todos los clubes (top {TOP_ALL})</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <ShareableChart
        option={option}
        style={{ height: chartHeight }}
        share={{
          title: `${label} — ${effTeam === ALL ? "top de la liga" : effTeam}`,
          subtitle,
          insight: leader ? `${leader.player} (${leader.team}) lidera en ${label.toLowerCase()} con ${fmt(leader.value)} (índice ${leader.idx}).` : undefined,
          filenameBase: `ranking-${metric}-${effTeam === ALL ? "liga" : effTeam}`,
        }}
        shareLabel="🖼️ Compartir ranking"
      />

      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Elegí una de las <strong>37 categorías de FotMob</strong> (goles, xG, tackles, atajadas y más) y un
        <strong> club</strong> (o "todos") para ver quién manda en ese factor. Ordena por el valor real; el
        <strong> índice</strong> (0–100, calibrado al rango de todos los jugadores medidos) aparece en el tooltip para
        dimensionar. Sólo entran jugadores con muestra suficiente (≥11 partidos, ≥600 minutos -- mismo criterio que el
        índice global), para que un par de eventos en poca cancha no lidere una tasa "cada 90'". Fuente: FotMob —
        agregado de TEMPORADA (no de partido), cobertura completa de los 30 clubes.
      </p>
    </div>
  );
}

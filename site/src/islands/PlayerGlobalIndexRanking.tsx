import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { DerivedPlayerMetricRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";
import { flagOrCrestHtml, escapeHtml } from "../lib/flags";
import { buildIndexers } from "../lib/normalize";
import { PLAYER_METRIC_LABELS, PLAYER_RADAR_ORDER } from "../lib/playerMetrics";
import { computeGlobalIndex } from "../lib/globalIndex";
import { sampleTier, MIN_MATCHES_QUALIFIED, MIN_MINUTES_RANKED } from "../lib/playerSampleGate";
import { buildCategoryContext, computeCategoryScores, CATEGORY_LABELS, type CategoryKey } from "../lib/playerCategories";

// Ranking por ÍNDICE GLOBAL (estilo "GLOBAL/OVR" de EA SPORTS FC): para cada
// jugador se calcula el índice de rendimiento de cada factor (calibrado al rango
// de TODOS los jugadores medidos, agregado de TEMPORADA -- ver FotMob en
// etl/fetch_fotmob_lpf.py) y se combina con PESOS SEGÚN LA POSICIÓN, así un
// delantero no pierde por "pocos tackles" ni un central por "poco xG". Incluye
// arqueros (FotMob publica atajadas, vallas invictas y goles evitados). Se
// puede ver por club o el top de la liga. Al tocar un jugador, el tooltip
// muestra el desglose de cada factor (índice + valor oficial).
//
// Sólo entran al ranking jugadores con muestra suficiente (>={MIN_MATCHES_QUALIFIED}
// partidos y >={MIN_MINUTES_RANKED} minutos) -- ver lib/playerSampleGate.ts.
// Por debajo de eso un par de eventos (una racha de goles, una tarjeta)
// mueven el índice de forma artificial.

const POS_LABEL: Record<string, string> = { GK: "Arquero", DF: "Defensor", MF: "Mediocampista", FW: "Delantero" };

const ALL = "__all__";
const TOP_ALL = 25;

/** GLOBAL (todo el perfil ponderado) + las 8 categorías EA-FC -- VAL es la
 *  misma categoría (rating) para jugadores de campo y arqueros, así que no
 *  hace falta duplicarla. Elegir una categoría de arquero (ATJ/VLL/PIE) deja
 *  la lista vacía de jugadores de campo de forma natural (no tienen esa
 *  categoría, ver playerCategories.ts) y viceversa con ATA/CRE/PAS/DEF.
 */
type MetricSel = "GLOBAL" | CategoryKey;
const METRIC_OPTIONS: MetricSel[] = ["GLOBAL", "ATA", "CRE", "PAS", "DEF", "VAL", "ATJ", "VLL", "PIE"];
const METRIC_SEL_LABEL: Record<MetricSel, string> = { GLOBAL: "GLOBAL", ...CATEGORY_LABELS };

interface Factor {
  metric: string;
  label: string;
  idx: number;
  raw: number;
  suffix: string;
}
interface PlayerRow {
  player: string;
  team: string;
  position: string | null;
  value: number;
  factors: Factor[];
}

interface Props {
  rows: DerivedPlayerMetricRow[];
  /** Posición por jugador, clave `${team}|${player_name}` (nombre de las métricas). */
  positions?: Record<string, string>;
  crests?: Record<string, string>;
}

export default function PlayerGlobalIndexRanking({ rows, positions = {}, crests }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();
  const [metric, setMetric] = useState<MetricSel>("GLOBAL");

  // Un indexador por métrica sobre TODOS los jugadores medidos (mismo criterio
  // que la ficha de scout): estira el rango real a 40-100. metricsWithData
  // marca qué métricas de las tablas de peso tienen al menos un dato real.
  const { indexers, metricsWithData } = useMemo(() => buildIndexers(rows, PLAYER_RADAR_ORDER), [rows]);

  // Contexto de categorías EA-FC (indexadores + medianas por posición para el
  // encogimiento de muestra chica) -- se calibra UNA vez sobre todo el pool,
  // igual que en la ficha de jugador (ver playerCategories.ts).
  const categoryCtx = useMemo(() => buildCategoryContext(rows, positions), [rows, positions]);

  // Agrupar por jugador -> factores + valor (GLOBAL o la categoría elegida).
  const players = useMemo<PlayerRow[]>(() => {
    const byPlayer = new Map<
      string,
      { player: string; team: string; factors: Factor[]; raw: Map<string, number>; matchesPlayed: number | null; minsPlayed: number | null }
    >();
    for (const r of rows) {
      const def = PLAYER_METRIC_LABELS[r.metric];
      if (!def || r.value == null) continue;
      const key = `${r.team}|${r.player_name}`;
      let e = byPlayer.get(key);
      if (!e) {
        e = { player: r.player_name, team: r.team, factors: [], raw: new Map(), matchesPlayed: null, minsPlayed: null };
        byPlayer.set(key, e);
      }
      if (r.metric === "matches_played") e.matchesPlayed = r.value;
      if (r.metric === "mins_played") e.minsPlayed = r.value;
      e.raw.set(r.metric, r.value);
      e.factors.push({
        metric: r.metric,
        label: def.label.replace(" / partido", ""),
        idx: indexers[r.metric](r.value),
        raw: r.value,
        suffix: def.suffix,
      });
    }
    // GLOBAL normalizado DENTRO de cada posición (ver globalIndex.ts) --
    // necesita el pool completo de una sola vez, no jugador por jugador.
    const withPosition = [...byPlayer.entries()].map(([key, e]) => ({
      key,
      position: positions[`${e.team}|${e.player}`] ?? null,
      factors: e.factors,
      matchesPlayed: e.matchesPlayed,
      minsPlayed: e.minsPlayed,
    }));
    const globals = metric === "GLOBAL" ? computeGlobalIndex(withPosition, indexers, metricsWithData) : null;

    const out: PlayerRow[] = [];
    for (const [key, e] of byPlayer) {
      if (sampleTier(e.matchesPlayed, e.minsPlayed) !== "ranked") continue;
      const position = positions[`${e.team}|${e.player}`] ?? null;

      if (metric === "GLOBAL") {
        const global = globals!.get(key);
        if (global == null) continue;
        const factors = [...e.factors].sort(
          (a, b) => PLAYER_RADAR_ORDER.indexOf(a.metric) - PLAYER_RADAR_ORDER.indexOf(b.metric),
        );
        out.push({ player: e.player, team: e.team, position, value: global, factors });
        continue;
      }

      // Ranking por categoría: mismo estándar de integridad que GLOBAL --
      // sólo entra si la categoría quedó "solid" (sin estimación de muestra
      // chica ni huecos, ver playerCategories.ts). Un arquero nunca tiene
      // ATA/CRE/PAS/DEF y un jugador de campo nunca tiene ATJ/VLL/PIE -- la
      // lista se filtra sola por posición sin lógica extra acá.
      const scores = computeCategoryScores(position, e.matchesPlayed, e.minsPlayed, e.raw, categoryCtx);
      const score = scores.find((s) => s.key === metric);
      if (!score || score.idx == null || score.state !== "solid") continue;
      const factors: Factor[] = score.factors.map((f) => ({
        metric: f.metric,
        label: PLAYER_METRIC_LABELS[f.metric]?.label.replace(" / partido", "") ?? f.metric,
        idx: f.idx,
        raw: f.raw,
        suffix: PLAYER_METRIC_LABELS[f.metric]?.suffix ?? "",
      }));
      out.push({ player: e.player, team: e.team, position, value: score.idx, factors });
    }
    return out;
  }, [rows, indexers, metricsWithData, positions, metric, categoryCtx]);

  const teams = useMemo(() => [...new Set(players.map((p) => p.team))].sort(), [players]);
  const [team, setTeam] = useState(() => (teams.includes("Argentina") ? "Argentina" : teams[0] ?? ALL));
  const effectiveTeam = team === ALL || teams.includes(team) ? team : teams[0] ?? ALL;

  // Filtrar por selección (o todas), ordenar por valor desc.
  const filtered = useMemo(() => {
    const base = effectiveTeam === ALL ? players : players.filter((p) => p.team === effectiveTeam);
    const sorted = [...base].sort((a, b) => b.value - a.value);
    return effectiveTeam === ALL ? sorted.slice(0, TOP_ALL) : sorted;
  }, [players, effectiveTeam]);

  const num = (v: number, suffix: string) => `${Math.round(v * 10) / 10}${suffix}`;

  const option = useMemo(() => {
    if (filtered.length === 0) return {};
    // ECharts pone la primera categoría abajo; invertimos para que el mejor
    // quede ARRIBA.
    const ordered = [...filtered].reverse();
    const labels = ordered.map((p) => (effectiveTeam === ALL ? `${p.player} · ${p.team}` : p.player));
    return {
      grid: { left: 8, right: 44, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        confine: true, // el tooltip no se sale de la pantalla en móvil
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"], fontSize: 12 },
        formatter: (ps: any) => {
          const i = Array.isArray(ps) ? ps[0]?.dataIndex : ps?.dataIndex;
          const p = ordered[i];
          if (!p) return "";
          const posTxt = p.position ? ` · ${POS_LABEL[p.position] ?? p.position}` : "";
          const metricTxt = metric === "GLOBAL" ? "índice global" : `${METRIC_SEL_LABEL[metric]}`;
          const head = `${flagOrCrestHtml(p.team, crests)} <strong>${escapeHtml(p.player)}</strong> · ${escapeHtml(p.team)}${posTxt}<br/>${metricTxt} <strong>${p.value}</strong> · ${p.factors.length} factores`;
          const body = p.factors
            .map((f) => `${escapeHtml(f.label)}: índice <strong>${f.idx}</strong> · ${num(f.raw, f.suffix)}`)
            .join("<br/>");
          return `${head}<hr style="border:none;border-top:1px solid ${tokens["--gridline"]};margin:6px 0"/>${body}`;
        },
      },
      xAxis: {
        type: "value",
        min: 0,
        max: 100,
        splitLine: { lineStyle: { color: tokens["--gridline"] } },
        axisLabel: { color: tokens["--text-secondary"] },
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
          data: ordered.map((p) => p.value),
          barMaxWidth: 20,
          itemStyle: { color: tokens["--brand"], borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: "right",
            color: tokens["--text-primary"],
            fontWeight: 700,
            fontFamily: "ui-monospace, Menlo, monospace",
          },
        },
      ],
    };
  }, [filtered, effectiveTeam, tokens, narrow, metric]);

  const metricLabel = METRIC_SEL_LABEL[metric];

  if (players.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)" }}>
        {metric === "GLOBAL"
          ? `Todavía no hay jugadores con muestra suficiente (≥${MIN_MATCHES_QUALIFIED} partidos, ≥${MIN_MINUTES_RANKED} minutos) para calcular el índice global.`
          : `Ningún jugador tiene todavía la categoría "${metricLabel}" con muestra sólida (o no aplica a esa posición) -- probá con otra categoría.`}
      </p>
    );
  }

  const chartHeight = Math.max(240, filtered.length * (narrow ? 26 : 30) + 40);
  const leader = filtered[0];
  const metricTitle = metric === "GLOBAL" ? "índice global" : metricLabel;
  const subtitle =
    effectiveTeam === ALL
      ? `Top ${filtered.length} de la liga por ${metricTitle} · Liga Profesional`
      : `${effectiveTeam} · jugadores por ${metricTitle} · Liga Profesional`;

  return (
    <div>
      <div className="controls-row">
        <select value={effectiveTeam} onChange={(e) => setTeam(e.target.value)} aria-label="Club">
          <option value={ALL}>⚽ Todos los clubes (top {TOP_ALL})</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={metric} onChange={(e) => setMetric(e.target.value as MetricSel)} aria-label="Categoría">
          {METRIC_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m === "GLOBAL" ? "🌐 GLOBAL" : METRIC_SEL_LABEL[m]}
            </option>
          ))}
        </select>
      </div>

      <ShareableChart
        option={option}
        style={{ height: chartHeight }}
        share={{
          title: effectiveTeam === ALL ? `${metricTitle} — top del torneo` : `${metricTitle} — ${effectiveTeam}`,
          subtitle,
          insight: leader
            ? `${leader.player} lidera con ${metricTitle} ${leader.value}${leader.position ? ` (${POS_LABEL[leader.position] ?? leader.position})` : ""}${metric === "GLOBAL" ? ", ponderado por posición" : ""} sobre sus ${leader.factors.length} factores medidos.`
            : undefined,
          filenameBase: `${metric.toLowerCase()}-${effectiveTeam === ALL ? "torneo" : effectiveTeam}`,
        }}
        shareLabel="🖼️ Compartir ranking"
      />

      {metric === "GLOBAL" ? (
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          <strong>Índice global</strong>: el índice de rendimiento de cada factor (0–100, calibrado al rango de todos los
          jugadores medidos) combinado con <strong>pesos según la posición</strong>, como el overall de EA SPORTS FC. A un
          delantero le pesan más los goles, el xG y los remates al arco; a un defensor, los tackles, intercepciones y
          despejes; a un mediocampista, el pase y la creación; a un arquero, las atajadas y los goles evitados. Los
          totales crudos de temporada (goles, ocasiones falladas, tarjetas) no puntúan directo -- se usan sus tasas por
          90' para no premiar minutos jugados. Tocá un jugador para ver el desglose factor por factor con su valor
          oficial. Sólo se rankean jugadores con <strong>al menos {MIN_MATCHES_QUALIFIED} partidos y {MIN_MINUTES_RANKED}{" "}
          minutos</strong> jugados, para que un par de eventos en poca muestra no distorsione el número.
          Fuente: FotMob — agregado de TEMPORADA (no de partido), 37 categorías, cobertura completa de los 30 clubes.
        </p>
      ) : (
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          <strong>{metricLabel}</strong>: uno de los 8 "atributos" en los que se agrupan las 37 categorías de FotMob
          (ver ficha de jugador en Analizar), estilo EA SPORTS FC. Este ranking sólo incluye a quien tiene esa
          categoría con <strong>muestra sólida</strong> ({MIN_MATCHES_QUALIFIED}+ partidos, sin estimaciones de
          encogimiento) -- por eso puede listar menos jugadores que el ranking GLOBAL. Tocá un jugador para ver el
          desglose de los factores que componen esta categoría.
        </p>
      )}
    </div>
  );
}

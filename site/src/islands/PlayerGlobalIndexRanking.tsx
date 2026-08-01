import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { DerivedPlayerMetricRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";
import { flagOrCrestHtml, escapeHtml } from "../lib/flags";
import { buildIndexers } from "../lib/normalize";
import { PLAYER_METRIC_LABELS, PLAYER_RADAR_ORDER } from "../lib/playerMetrics";
import { computeGlobalIndex } from "../lib/globalIndex";
import { sampleTier, MIN_MATCHES_QUALIFIED, MIN_MINUTES_RANKED } from "../lib/playerSampleGate";

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
  global: number;
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

  // Un indexador por métrica sobre TODOS los jugadores medidos (mismo criterio
  // que la ficha de scout): estira el rango real a 40-100. metricsWithData
  // marca qué métricas de las tablas de peso tienen al menos un dato real.
  const { indexers, metricsWithData } = useMemo(() => buildIndexers(rows, PLAYER_RADAR_ORDER), [rows]);

  // Agrupar por jugador -> factores + índice global (ponderado por posición).
  const players = useMemo<PlayerRow[]>(() => {
    const byPlayer = new Map<
      string,
      { player: string; team: string; factors: Factor[]; matchesPlayed: number | null; minsPlayed: number | null }
    >();
    for (const r of rows) {
      const def = PLAYER_METRIC_LABELS[r.metric];
      if (!def || r.value == null) continue;
      const key = `${r.team}|${r.player_name}`;
      let e = byPlayer.get(key);
      if (!e) {
        e = { player: r.player_name, team: r.team, factors: [], matchesPlayed: null, minsPlayed: null };
        byPlayer.set(key, e);
      }
      if (r.metric === "matches_played") e.matchesPlayed = r.value;
      if (r.metric === "mins_played") e.minsPlayed = r.value;
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
    const globals = computeGlobalIndex(withPosition, indexers, metricsWithData);

    const out: PlayerRow[] = [];
    for (const [key, e] of byPlayer) {
      if (sampleTier(e.matchesPlayed, e.minsPlayed) !== "ranked") continue;
      const global = globals.get(key);
      if (global == null) continue;
      const position = positions[`${e.team}|${e.player}`] ?? null;
      e.factors.sort((a, b) => PLAYER_RADAR_ORDER.indexOf(a.metric) - PLAYER_RADAR_ORDER.indexOf(b.metric));
      out.push({ player: e.player, team: e.team, position, global, factors: e.factors });
    }
    return out;
  }, [rows, indexers, metricsWithData, positions]);

  const teams = useMemo(() => [...new Set(players.map((p) => p.team))].sort(), [players]);
  const [team, setTeam] = useState(() => (teams.includes("Argentina") ? "Argentina" : teams[0] ?? ALL));
  const effectiveTeam = team === ALL || teams.includes(team) ? team : teams[0] ?? ALL;

  // Filtrar por selección (o todas), ordenar por índice global desc.
  const filtered = useMemo(() => {
    const base = effectiveTeam === ALL ? players : players.filter((p) => p.team === effectiveTeam);
    const sorted = [...base].sort((a, b) => b.global - a.global);
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
          const head = `${flagOrCrestHtml(p.team, crests)} <strong>${escapeHtml(p.player)}</strong> · ${escapeHtml(p.team)}${posTxt}<br/>índice global <strong>${p.global}</strong> · ponderado por posición · ${p.factors.length} factores`;
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
          data: ordered.map((p) => p.global),
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
  }, [filtered, effectiveTeam, tokens, narrow]);

  if (players.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)" }}>
        Todavía no hay jugadores con muestra suficiente (≥{MIN_MATCHES_QUALIFIED} partidos, ≥{MIN_MINUTES_RANKED}{" "}
        minutos) para calcular el índice global.
      </p>
    );
  }

  const chartHeight = Math.max(240, filtered.length * (narrow ? 26 : 30) + 40);
  const leader = filtered[0];
  const subtitle =
    effectiveTeam === ALL
      ? `Top ${filtered.length} de la liga por índice global · Liga Profesional`
      : `${effectiveTeam} · jugadores por índice global · Liga Profesional`;

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
      </div>

      <ShareableChart
        option={option}
        style={{ height: chartHeight }}
        share={{
          title: effectiveTeam === ALL ? "Índice global — top del torneo" : `Índice global — ${effectiveTeam}`,
          subtitle,
          insight: leader
            ? `${leader.player} lidera con índice global ${leader.global}${leader.position ? ` (${POS_LABEL[leader.position] ?? leader.position})` : ""}, ponderado por posición sobre sus ${leader.factors.length} factores medidos.`
            : undefined,
          filenameBase: `indice-global-${effectiveTeam === ALL ? "torneo" : effectiveTeam}`,
        }}
        shareLabel="🖼️ Compartir ranking"
      />

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
    </div>
  );
}

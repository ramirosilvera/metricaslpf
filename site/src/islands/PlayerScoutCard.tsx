import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { DerivedPlayerMetricRow } from "../lib/data";
import { useChartTokens, useIsNarrow, wrapAxisName } from "../lib/theme";
import { flagFor } from "../lib/flags";

const METRIC_LABELS: Record<string, { label: string; suffix: string; group: "físico" | "táctico" }> = {
  distancia_promedio_km: { label: "Distancia / partido", suffix: " km", group: "físico" },
  alta_intensidad_promedio_m: { label: "Alta intensidad / partido", suffix: " m", group: "físico" },
  sprints_promedio: { label: "Sprints / partido", suffix: "", group: "físico" },
  velocidad_punta_kmh: { label: "Velocidad punta", suffix: " km/h", group: "físico" },
  pases_completados_promedio: { label: "Pases completados / partido", suffix: "", group: "táctico" },
  precision_pases_promedio: { label: "Precisión de pase", suffix: "%", group: "táctico" },
  progresiones_promedio: { label: "Progresiones de balón / partido", suffix: "", group: "táctico" },
  tackles_ganados_promedio: { label: "Tackles ganados / partido", suffix: "", group: "táctico" },
  intercepciones_promedio: { label: "Intercepciones / partido", suffix: "", group: "táctico" },
  presion_directa_promedio: { label: "Presiones directas / partido", suffix: "", group: "táctico" },
  recuperaciones_promedio: { label: "Recuperaciones de posesión / partido", suffix: "", group: "táctico" },
};

const RADAR_ORDER = Object.keys(METRIC_LABELS);

// Datos de plantel (squads.json) ya cruzados por nombre en build — la clave es
// `${team}|${player_name}` con el nombre tal como aparece en las métricas.
export interface SquadInfo {
  jersey_number: number | null;
  position: string | null;
  club: string | null;
  caps: number | null;
  captain: boolean;
  wc2026_apps: number | null;
  wc2026_goals: number | null;
}

interface Props {
  rows: DerivedPlayerMetricRow[];
  squad?: Record<string, SquadInfo>;
}

export default function PlayerScoutCard({ rows, squad }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  const teams = useMemo(() => [...new Set(rows.map((r) => r.team))].sort(), [rows]);
  const [team, setTeam] = useState(teams.includes("Argentina") ? "Argentina" : teams[0] ?? "");

  const playersByTeam = useMemo(
    () => [...new Set(rows.filter((r) => r.team === team).map((r) => r.player_name))].sort(),
    [rows, team],
  );
  const [player, setPlayer] = useState(playersByTeam[0] ?? "");
  const currentPlayer = playersByTeam.includes(player) ? player : playersByTeam[0] ?? "";

  const playerRows = useMemo(
    () => rows.filter((r) => r.team === team && r.player_name === currentPlayer),
    [rows, team, currentPlayer],
  );

  const squadInfo = squad?.[`${team}|${currentPlayer}`] ?? null;

  const radarMetrics = RADAR_ORDER.filter((m) => playerRows.some((r) => r.metric === m && r.percentile != null));

  // Link "compartir por WhatsApp" con las métricas reales del jugador elegido.
  // Componente client:only, así que window está disponible; se guarda igual por prudencia.
  const waLink = useMemo(() => {
    if (typeof window === "undefined" || !currentPlayer) return null;
    const shareUrl = window.location.href;
    const fmt = (v: number) => Math.round(v * 10) / 10;

    const metricName = (m: string) => METRIC_LABELS[m].label.toLowerCase().replace(" / partido", " por partido");
    const distance = playerRows.find((r) => r.metric === "distancia_promedio_km");
    const known = playerRows.filter((r) => METRIC_LABELS[r.metric] && r.percentile != null);
    const best = [...known].sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0))[0];

    let insight: string;
    if (distance) {
      insight = `corre ${fmt(distance.value)} km promedio por partido en el Mundial 2026${
        distance.percentile != null ? ` (percentil ${Math.round(distance.percentile)} entre los jugadores medidos)` : ""
      }`;
      if (best && best.metric !== "distancia_promedio_km") {
        insight += ` y está en el percentil ${Math.round(best.percentile ?? 0)} en ${metricName(best.metric)}`;
      }
    } else if (best) {
      insight = `registra ${fmt(best.value)}${METRIC_LABELS[best.metric].suffix} de ${metricName(best.metric)} en el Mundial 2026 (percentil ${Math.round(best.percentile ?? 0)} entre los jugadores medidos)`;
    } else {
      return null;
    }

    const message = `¿Sabías que ${currentPlayer} (${team}) ${insight}? Ficha completa acá: ${shareUrl}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [playerRows, currentPlayer, team]);

  const option = useMemo(() => {
    if (radarMetrics.length < 3) return null;
    return {
      tooltip: {
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"] },
        formatter: (p: any) => {
          const idx = p.dataIndex ?? 0;
          return radarMetrics
            .map((m, i) => `${METRIC_LABELS[m].label}: percentil ${Math.round(p.value?.[i] ?? p.data?.value?.[i] ?? 0)}`)
            .join("<br/>");
        },
      },
      radar: {
        indicator: radarMetrics.map((m) => ({
          name: narrow ? wrapAxisName(METRIC_LABELS[m].label, 13) : METRIC_LABELS[m].label,
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
            {
              name: currentPlayer,
              value: radarMetrics.map((m) => playerRows.find((r) => r.metric === m)?.percentile ?? 0),
              areaStyle: { opacity: 0.2, color: tokens["--series-3"] },
              lineStyle: { width: 2, color: tokens["--series-3"] },
              itemStyle: { color: tokens["--series-3"] },
            },
          ],
        },
      ],
    };
  }, [radarMetrics, playerRows, currentPlayer, tokens, narrow]);

  if (rows.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay métricas por jugador cargadas.</p>;
  }

  return (
    <div>
      <div className="controls-row">
        <select
          value={team}
          onChange={(e) => {
            setTeam(e.target.value);
            setPlayer("");
          }}
        >
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={currentPlayer} onChange={(e) => setPlayer(e.target.value)}>
          {playersByTeam.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {waLink && (
          <a className="btn btn-share" href={waLink} target="_blank" rel="noreferrer">
            📲 Compartir ficha
          </a>
        )}
      </div>

      {squadInfo && (
        <div
          style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", margin: "0 0 0.75rem" }}
        >
          <strong style={{ fontSize: "0.95rem" }}>
            {flagFor(team)} {currentPlayer}
          </strong>
          {squadInfo.jersey_number != null && <span className="badge">#{squadInfo.jersey_number}</span>}
          {squadInfo.position && (
            <span className="badge">
              {squadInfo.position}
              {squadInfo.club ? ` · ${squadInfo.club}` : ""}
            </span>
          )}
          {squadInfo.captain && (
            <span className="badge status-ok">
              <span className="dot" />
              capitán
            </span>
          )}
        </div>
      )}

      {option ? (
        <ReactECharts option={option} style={{ height: narrow ? 330 : 380 }} notMerge={true} />
      ) : (
        <p style={{ color: "var(--text-muted)" }}>
          {currentPlayer ? `${currentPlayer} todavía no tiene suficientes métricas cargadas para el radar.` : "Elegí un jugador."}
        </p>
      )}

      <div className="stat-tiles" style={{ marginTop: "1rem" }}>
        {squadInfo?.caps != null && (
          <div className="stat-tile">
            <div className="value">{squadInfo.caps}</div>
            <div className="label">partidos internacionales (caps)</div>
          </div>
        )}
        {squadInfo?.wc2026_apps != null && (
          <div className="stat-tile">
            <div className="value">{squadInfo.wc2026_apps}</div>
            <div className="label">partidos · Mundial 2026</div>
          </div>
        )}
        {squadInfo?.wc2026_goals != null && (
          <div className="stat-tile">
            <div className="value">{squadInfo.wc2026_goals}</div>
            <div className="label">goles · Mundial 2026</div>
          </div>
        )}
        {playerRows
          .filter((r) => METRIC_LABELS[r.metric])
          .map((r) => (
            <div className="stat-tile" key={r.metric}>
              <div className="value">
                {Math.round(r.value * 10) / 10}
                {METRIC_LABELS[r.metric].suffix}
              </div>
              <div className="label">
                {METRIC_LABELS[r.metric].label}
                {r.percentile != null ? ` · percentil ${Math.round(r.percentile)}` : ""}
              </div>
            </div>
          ))}
      </div>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Percentil calculado dentro del propio dataset cargado (no es un ranking mundial completo). Combina métricas
        físicas (FIFA Training Centre) y tácticas (mismos reportes, Mundial 2026 en curso) cuando ambas están
        disponibles para el jugador. Los datos de plantel (dorsal, club, caps, partidos y goles del torneo) vienen de
        Wikipedia y se cruzan por nombre — puede faltar en algunos jugadores.
      </p>
    </div>
  );
}

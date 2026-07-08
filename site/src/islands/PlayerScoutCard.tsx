import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { DerivedPlayerMetricRow } from "../lib/data";
import { useChartTokens } from "../lib/theme";

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

interface Props {
  rows: DerivedPlayerMetricRow[];
}

export default function PlayerScoutCard({ rows }: Props) {
  const tokens = useChartTokens();

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

  const radarMetrics = RADAR_ORDER.filter((m) => playerRows.some((r) => r.metric === m && r.percentile != null));

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
        indicator: radarMetrics.map((m) => ({ name: METRIC_LABELS[m].label, min: 0, max: 100 })),
        axisName: { color: tokens["--text-secondary"], fontSize: 10 },
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
  }, [radarMetrics, playerRows, currentPlayer, tokens]);

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
      </div>

      {option ? (
        <ReactECharts option={option} style={{ height: 380 }} notMerge={true} />
      ) : (
        <p style={{ color: "var(--text-muted)" }}>
          {currentPlayer ? `${currentPlayer} todavía no tiene suficientes métricas cargadas para el radar.` : "Elegí un jugador."}
        </p>
      )}

      <div className="stat-tiles" style={{ marginTop: "1rem" }}>
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
        disponibles para el jugador.
      </p>
    </div>
  );
}

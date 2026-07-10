import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { DerivedPlayerMetricRow } from "../lib/data";
import { useChartTokens, useIsNarrow, wrapAxisName } from "../lib/theme";
import { flagFor } from "../lib/flags";
import ShareCardButton from "./ShareCardButton";
import type { ShareStat } from "../lib/shareCard";
import { generatePlayerInsights, type PlayerMetricPoint } from "../lib/insights";
import { makeIndexer, isLowerBetter } from "../lib/normalize";

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

  // Índice de rendimiento por métrica sobre TODOS los jugadores medidos: estira
  // el rango real a 40-100 para que las diferencias entre jugadores se VEAN en el
  // radar (si no, quedan todos pegados al borde). Estilo EA SPORTS FC.
  const normalizers = useMemo(() => {
    const map: Record<string, (v: number) => number> = {};
    for (const m of RADAR_ORDER) {
      const vals = rows.filter((r) => r.metric === m && r.value != null).map((r) => r.value as number);
      map[m] = makeIndexer(vals, isLowerBetter(m));
    }
    return map;
  }, [rows]);
  const pctFor = (m: string, v: number | null | undefined) => (v == null ? null : normalizers[m]?.(v) ?? null);

  const radarMetrics = RADAR_ORDER.filter((m) => playerRows.some((r) => r.metric === m && r.value != null));

  // Link "compartir por WhatsApp" con las métricas reales del jugador elegido.
  // Componente client:only, así que window está disponible; se guarda igual por prudencia.
  const waLink = useMemo(() => {
    if (typeof window === "undefined" || !currentPlayer) return null;
    const shareUrl = window.location.href;
    const fmt = (v: number) => Math.round(v * 10) / 10;

    const metricName = (m: string) => METRIC_LABELS[m].label.toLowerCase().replace(" / partido", " por partido");
    const distance = playerRows.find((r) => r.metric === "distancia_promedio_km");
    const known = playerRows.filter((r) => METRIC_LABELS[r.metric] && r.value != null);
    const best = [...known].sort((a, b) => (pctFor(b.metric, b.value) ?? 0) - (pctFor(a.metric, a.value) ?? 0))[0];

    let insight: string;
    if (distance) {
      const dp = pctFor("distancia_promedio_km", distance.value);
      insight = `corre ${fmt(distance.value)} km promedio por partido en el Mundial 2026${
        dp != null ? ` (índice ${dp}/100 en distancia)` : ""
      }`;
      if (best && best.metric !== "distancia_promedio_km") {
        insight += ` y saca índice ${pctFor(best.metric, best.value) ?? 0} en ${metricName(best.metric)}`;
      }
    } else if (best) {
      insight = `registra ${fmt(best.value)}${METRIC_LABELS[best.metric].suffix} de ${metricName(best.metric)} en el Mundial 2026 (índice ${pctFor(best.metric, best.value) ?? 0}/100)`;
    } else {
      return null;
    }

    const message = `¿Sabías que ${currentPlayer} (${team}) ${insight}? Ficha completa acá: ${shareUrl}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [playerRows, currentPlayer, team]);

  // Datos para la tarjeta-imagen compartible: hasta 3 métricas destacadas
  // (prioriza percentil alto) tomadas de lo que ya se muestra en la ficha.
  const shareStats = useMemo<ShareStat[]>(() => {
    const fmt = (v: number) => `${Math.round(v * 10) / 10}`;
    const known = playerRows.filter((r) => METRIC_LABELS[r.metric]);
    const ranked = [...known].sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0));
    return ranked.slice(0, 3).map((r) => ({
      label: METRIC_LABELS[r.metric].label.replace(" / partido", ""),
      value: `${fmt(r.value)}${METRIC_LABELS[r.metric].suffix}`,
    }));
  }, [playerRows]);

  const shareSubtitle = useMemo(() => {
    const parts = [squadInfo?.position, squadInfo?.club].filter(Boolean);
    return parts.length ? `${parts.join(" · ")} · ${team}` : team;
  }, [squadInfo, team]);

  // Lectura automática del perfil: heurística determinística sobre los
  // percentiles ya calculados (no hay llamada a ninguna API).
  const insightPoints = useMemo<PlayerMetricPoint[]>(
    () =>
      playerRows
        .filter((r) => METRIC_LABELS[r.metric])
        .map((r) => ({
          key: r.metric,
          label: METRIC_LABELS[r.metric].label.toLowerCase().replace(" / partido", " por partido"),
          value: r.value,
          percentile: pctFor(r.metric, r.value), // ahora es el índice de rendimiento (0-100), no percentil
          suffix: METRIC_LABELS[r.metric].suffix,
          group: METRIC_LABELS[r.metric].group,
        })),
    [playerRows],
  );
  const insights = useMemo(
    () => (currentPlayer ? generatePlayerInsights(currentPlayer, insightPoints) : []),
    [currentPlayer, insightPoints],
  );

  const option = useMemo(() => {
    if (radarMetrics.length < 3) return null;
    return {
      tooltip: {
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"] },
        formatter: () => {
          return radarMetrics
            .map((m) => {
              const row = playerRows.find((r) => r.metric === m);
              const pct = pctFor(m, row?.value ?? null) ?? 0;
              const raw = row?.value != null ? `${Math.round(row.value * 10) / 10}${METRIC_LABELS[m].suffix}` : "—";
              return `${METRIC_LABELS[m].label}: índice <strong>${pct}</strong> · ${raw}`;
            })
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
              value: radarMetrics.map((m) => pctFor(m, playerRows.find((r) => r.metric === m)?.value ?? null) ?? 0),
              areaStyle: { opacity: 0.2, color: tokens["--series-3"] },
              lineStyle: { width: 2, color: tokens["--series-3"] },
              itemStyle: { color: tokens["--series-3"] },
            },
          ],
        },
      ],
    };
  }, [radarMetrics, playerRows, currentPlayer, tokens, narrow, normalizers]);

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
        <ShareableChart
          option={option}
          style={{ height: narrow ? 330 : 380 }}
          share={{
            title: currentPlayer,
            subtitle: `${team} · ficha física y táctica (índice de rendimiento) · Mundial 2026`,
            insight: insights[0],
            filenameBase: `scout-${team}-${currentPlayer}`,
          }}
          shareLabel="🖼️ Compartir radar"
        />
      ) : (
        <p style={{ color: "var(--text-muted)" }}>
          {currentPlayer ? `${currentPlayer} todavía no tiene suficientes métricas cargadas para el radar.` : "Elegí un jugador."}
        </p>
      )}

      {insights.length > 0 && (
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
            Resumen generado en tu navegador a partir de los valores oficiales, expresados como índice de rendimiento (0–100, calibrado al rango del torneo) (no es una respuesta de IA en
            vivo). ¿Querés profundizar? Preguntale al asistente.
          </p>
        </div>
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
                {(() => {
                  const p = pctFor(r.metric, r.value);
                  return p != null ? ` · índice ${p}` : "";
                })()}
              </div>
            </div>
          ))}
      </div>
      {currentPlayer && shareStats.length > 0 && (
        <div className="share-block">
          <div className="share-label">
            <strong>Compartir esta ficha</strong>
            <span>
              {flagFor(team)} {currentPlayer} · {team}
            </span>
          </div>
          <div className="share-actions">
            {waLink && (
              <a className="btn btn-share" href={waLink} target="_blank" rel="noreferrer">
                📲 WhatsApp
              </a>
            )}
            <ShareCardButton
              title={currentPlayer}
              subtitle={shareSubtitle}
              flag={flagFor(team)}
              stats={shareStats}
              tagline="Rendimiento físico y táctico · Mundial 2026"
              shareText={`${currentPlayer} (${team}) — ficha de rendimiento · Métricas Mundial 2026`}
              filenameBase={`${team}-${currentPlayer}`}
              label="🖼️ Imagen"
            />
          </div>
        </div>
      )}

      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        El radar usa un índice de rendimiento (0–100) calibrado al rango de los jugadores medidos — 100 = el mejor del
        dataset, ~40 = el más flojo (estira las diferencias para que se vean, estilo EA SPORTS FC); no es un ranking
        mundial completo. Combina métricas físicas (FIFA Training Centre) y tácticas (mismos reportes, Mundial 2026 en
        curso) cuando ambas están disponibles para el jugador. Los datos de plantel (dorsal, club, caps, partidos y
        goles del torneo) vienen de Wikipedia y se cruzan por nombre — puede faltar en algunos jugadores.
      </p>
    </div>
  );
}

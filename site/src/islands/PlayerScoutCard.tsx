import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { DerivedPlayerMetricRow } from "../lib/data";
import { useChartTokens, useIsNarrow, wrapAxisName } from "../lib/theme";
import { flagFor } from "../lib/flags";
import TeamBadge from "./TeamBadge";
import ShareCardButton from "./ShareCardButton";
import type { ShareStat } from "../lib/shareCard";
import { generatePlayerInsights, type PlayerMetricPoint } from "../lib/insights";
import { buildIndexers } from "../lib/normalize";
import { PLAYER_METRIC_LABELS as METRIC_LABELS, PLAYER_RADAR_ORDER as RADAR_ORDER, INSIGHT_EXCLUDED_METRICS } from "../lib/playerMetrics";
import { computeGlobalIndex } from "../lib/globalIndex";
import { sampleTier, MIN_MATCHES_QUALIFIED } from "../lib/playerSampleGate";
import {
  buildCategoryContext,
  computeCategoryScores,
  isPosition,
  CATEGORY_ORDER,
  FALLBACK_CATEGORY_ORDER,
  CATEGORY_LABELS,
  PER90_TO_RAW,
  type CategoryScore,
} from "../lib/playerCategories";

const CATEGORY_STATE_LABEL: Record<string, string> = {
  solid: "muestra sólida",
  small_sample: "muestra chica (con GLOBAL)",
  partial: "estimado · muy pocos minutos",
};

const POS_LABEL: Record<string, string> = { GK: "Arquero", DF: "Defensor", MF: "Mediocampista", FW: "Delantero" };

// Crudo hermano de una métrica-categoría, para no duplicarlo en "Aporte y
// contexto" cuando ya se ve envuelto en una categoría (como tasa o ratio).
function rawSiblingOf(metric: string): string | undefined {
  if (metric === "clean_sheet_ratio") return "clean_sheet";
  return PER90_TO_RAW[metric];
}

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

// Un partido con datos FIFA del jugador (de qué partido salen sus métricas).
export interface PlayerMatchLite {
  label: string;
  date: string;
  stage: string;
}

interface Props {
  rows: DerivedPlayerMetricRow[];
  squad?: Record<string, SquadInfo>;
  /** Partidos con datos FIFA por jugador, clave `${team}|${player_name}`. */
  matches?: Record<string, PlayerMatchLite[]>;
  crests?: Record<string, string>;
  /** Posición GK/DF/MF/FW resuelta con la cascada completa (ver
   *  playerPositions.ts::buildPlayerPositions) -- más cobertura que `squad`
   *  a secas (recupera nombres compuestos y arqueros por firma de datos), es
   *  la base de las categorías y del GLOBAL de esta ficha. */
  positions?: Record<string, string>;
}

export default function PlayerScoutCard({ rows, squad, matches, crests, positions = {} }: Props) {
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
  const playerMatches = matches?.[`${team}|${currentPlayer}`] ?? [];

  // Índice de rendimiento por métrica sobre TODOS los jugadores medidos: estira
  // el rango real a 40-100 para que las diferencias entre jugadores se VEAN en el
  // radar (si no, quedan todos pegados al borde). Estilo EA SPORTS FC.
  const { indexers: normalizers, metricsWithData } = useMemo(() => buildIndexers(rows, RADAR_ORDER), [rows]);
  const pctFor = (m: string, v: number | null | undefined) => (v == null ? null : normalizers[m]?.(v) ?? null);

  const matchesPlayed = playerRows.find((r) => r.metric === "matches_played")?.value ?? null;
  const minsPlayed = playerRows.find((r) => r.metric === "mins_played")?.value ?? null;
  const tier = sampleTier(matchesPlayed, minsPlayed);

  // GLOBAL normalizado DENTRO de cada posición (ver globalIndex.ts) -- se
  // calcula sobre TODO el pool de `rows`, no sólo el jugador elegido, porque
  // necesita la distribución real de su posición como referencia. Se hace acá
  // (no en el componente padre) porque este es el único lugar con acceso a
  // `squad` (la posición real de cada jugador).
  const globalByKey = useMemo(() => {
    const byPlayer = new Map<
      string,
      { factors: { metric: string; idx: number }[]; matchesPlayed: number | null; minsPlayed: number | null }
    >();
    for (const r of rows) {
      if (!METRIC_LABELS[r.metric] || r.value == null) continue;
      const key = `${r.team}|${r.player_name}`;
      let e = byPlayer.get(key);
      if (!e) {
        e = { factors: [], matchesPlayed: null, minsPlayed: null };
        byPlayer.set(key, e);
      }
      if (r.metric === "matches_played") e.matchesPlayed = r.value;
      if (r.metric === "mins_played") e.minsPlayed = r.value;
      e.factors.push({ metric: r.metric, idx: normalizers[r.metric](r.value) });
    }
    const withPosition = [...byPlayer.entries()].map(([key, e]) => ({
      key,
      position: positions[key] ?? squad?.[key]?.position ?? null,
      factors: e.factors,
      matchesPlayed: e.matchesPlayed,
      minsPlayed: e.minsPlayed,
    }));
    return computeGlobalIndex(withPosition, normalizers, metricsWithData);
  }, [rows, normalizers, metricsWithData, squad, positions]);

  // Se excluyen del radar/GLOBAL los totales crudos con variante _per_90 ya
  // disponible y los eventos censurados en 0 (ver INSIGHT_EXCLUDED_METRICS) --
  // igual criterio que el índice GLOBAL, para no mostrar ejes duplicados
  // (goles Y goles cada 90') ni "logros" fabricados sobre listas censuradas.
  const radarMetrics = RADAR_ORDER.filter(
    (m) => !INSIGHT_EXCLUDED_METRICS.has(m) && playerRows.some((r) => r.metric === m && r.value != null),
  );

  // --- Categorías estilo EA SPORTS FC (ver playerCategories.ts) ------------
  // Contexto calibrado UNA vez sobre todo el pool (indexadores + medianas
  // posicionales para el encogimiento de muestra chica).
  const categoryCtx = useMemo(() => buildCategoryContext(rows, positions), [rows, positions]);

  const resolvedPosition = positions[`${team}|${currentPlayer}`] ?? squadInfo?.position ?? null;

  const playerRawByMetric = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of playerRows) if (r.value != null) m.set(r.metric, r.value);
    return m;
  }, [playerRows]);

  const categoryScores = useMemo<CategoryScore[]>(
    () => computeCategoryScores(resolvedPosition, matchesPlayed, minsPlayed, playerRawByMetric, categoryCtx),
    [resolvedPosition, matchesPlayed, minsPlayed, playerRawByMetric, categoryCtx],
  );
  const visibleCategories = categoryScores.filter((s) => s.state !== "none");

  // Métricas ya mostradas ENVUELTAS en una categoría (como tasa o ratio) --
  // no se repiten sueltas en "Aporte y contexto" más abajo.
  const shownInCategories = useMemo(() => {
    const set = new Set<string>();
    for (const s of categoryScores) {
      for (const f of s.factors) {
        set.add(f.metric);
        const sibling = rawSiblingOf(f.metric);
        if (sibling) set.add(sibling);
      }
    }
    return set;
  }, [categoryScores]);

  // computeGlobalIndex ya excluye internamente a quien tiene <11 partidos
  // (ver globalIndex.ts) -- no hace falta repetir el gate acá.
  const ovr = globalByKey.get(`${team}|${currentPlayer}`) ?? null;

  // Link "compartir por WhatsApp" con las métricas reales del jugador elegido.
  // Componente client:only, así que window está disponible; se guarda igual por prudencia.
  const waLink = useMemo(() => {
    if (typeof window === "undefined" || !currentPlayer) return null;
    const shareUrl = window.location.href;
    const fmt = (v: number) => Math.round(v * 10) / 10;

    const metricName = (m: string) => METRIC_LABELS[m].label.toLowerCase();
    const known = playerRows.filter((r) => METRIC_LABELS[r.metric] && r.value != null && !INSIGHT_EXCLUDED_METRICS.has(r.metric));
    const best = [...known].sort((a, b) => (pctFor(b.metric, b.value) ?? 0) - (pctFor(a.metric, a.value) ?? 0))[0];

    if (!best) return null;
    const insight = `registra ${fmt(best.value)}${METRIC_LABELS[best.metric].suffix} de ${metricName(best.metric)} en la Liga Profesional (índice ${pctFor(best.metric, best.value) ?? 0}/100)`;

    const message = `¿Sabías que ${currentPlayer} (${team}) ${insight}? Ficha completa acá: ${shareUrl}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [playerRows, currentPlayer, team]);

  // Datos para la tarjeta-imagen compartible: hasta 3 métricas destacadas
  // (prioriza percentil alto) tomadas de lo que ya se muestra en la ficha.
  const shareStats = useMemo<ShareStat[]>(() => {
    const fmt = (v: number) => `${Math.round(v * 10) / 10}`;
    const known = playerRows.filter((r) => METRIC_LABELS[r.metric] && !INSIGHT_EXCLUDED_METRICS.has(r.metric));
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
        .filter((r) => METRIC_LABELS[r.metric] && !INSIGHT_EXCLUDED_METRICS.has(r.metric))
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
  // Sin muestra suficiente no se genera lectura automática -- un puñado de
  // eventos en pocos minutos no alcanza para decir "su fortaleza es...".
  const insights = useMemo(
    () => (currentPlayer && tier !== "insufficient" ? generatePlayerInsights(currentPlayer, insightPoints) : []),
    [currentPlayer, insightPoints, tier],
  );

  // Desglose "carta EA FC": GLOBAL (ponderado por posición) + índice por factor.
  // Sin muestra suficiente (ver playerSampleGate.ts) no se calcula GLOBAL --
  // el radar de factores igual se muestra con los valores crudos que tenga.
  const ratings = useMemo(() => {
    if (radarMetrics.length < 3) return undefined;
    const perFactor = radarMetrics.map((m) => ({
      metric: m,
      label: METRIC_LABELS[m].label.replace(" / partido", ""),
      idx: pctFor(m, playerRows.find((r) => r.metric === m)?.value ?? null) ?? 0,
    }));
    return {
      entities: [
        {
          name: currentPlayer,
          color: tokens["--series-3"],
          // Mismo GLOBAL que el resto del sitio (ranking, comparador): ya viene
          // normalizado dentro de la posición, calculado sobre el perfil
          // COMPLETO del jugador (no sólo radarMetrics).
          ovr,
        },
      ],
      factors: perFactor.map((f) => ({ label: f.label, values: [f.idx] })),
    };
  }, [radarMetrics, playerRows, currentPlayer, tokens, ovr]);

  const option = useMemo(() => {
    if (radarMetrics.length < 3) return null;
    return {
      tooltip: {
        confine: true, // el tooltip no se sale de la pantalla en móvil
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
            <TeamBadge team={team} crests={crests} /> {currentPlayer}
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

      {tier === "small_sample" && (
        <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 0.75rem" }}>
          ⚠️ <strong>Muestra chica</strong>: {currentPlayer} tiene GLOBAL calculado pero menos de 600' jugados -- no
          entra al ranking ni a los podios de la liga, sólo se muestra en esta ficha.
        </p>
      )}

      {(matchesPlayed ?? 0) < MIN_MATCHES_QUALIFIED && visibleCategories.some((s) => s.state === "partial") && (
        <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 0.75rem" }}>
          🔎 <strong>Estimación con pocos minutos</strong>: {currentPlayer} lleva {matchesPlayed ?? 0}{" "}
          {(matchesPlayed ?? 0) === 1 ? "partido" : "partidos"} ({minsPlayed ?? 0}'). FotMob recién publica sus
          categorías "cada 90'" desde los {MIN_MATCHES_QUALIFIED} partidos -- las barras de abajo son una{" "}
          <strong>tasa estimada</strong>, encogida hacia la mediana de su posición (le "prestamos" ~5 partidos de
          referencia para que un par de eventos sueltos no disparen el número), no un valor oficial de FotMob. No
          entra a ningún ranking ni podio.
        </p>
      )}

      {playerMatches.length > 0 && (
        <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 0.75rem" }}>
          📅 Métricas calculadas sobre {playerMatches.length}{" "}
          {playerMatches.length === 1 ? "partido con datos de FIFA" : "partidos con datos de FIFA"}:{" "}
          {playerMatches.map((m, i) => (
            <span key={i}>
              {i > 0 ? " · " : ""}
              <strong>{m.label}</strong> ({m.date}
              {m.stage ? ` · ${m.stage}` : ""})
            </span>
          ))}
          . Con muestra chica, leé los números con cautela.
        </p>
      )}

      {visibleCategories.length > 0 && (
        <>
          <div className="ovr-hero">
            {ovr != null && (
              <div className="ovr-badge">
                <span className="num">{ovr}</span>
                <span className="tag">GLOBAL</span>
              </div>
            )}
            <span className="ovr-caption">
              {resolvedPosition ? POS_LABEL[resolvedPosition] ?? resolvedPosition : "posición no resuelta"} · índice
              de rendimiento por categoría (0–100, estilo EA SPORTS FC) — tocá una para ver el detalle.
            </span>
          </div>

          <div className="attr-grid">
            {visibleCategories.map((s) => (
              <details className={`attr-card is-${s.state}`} key={s.key}>
                <summary>
                  <div className="attr-head">
                    <span className="attr-label">{CATEGORY_LABELS[s.key]}</span>
                    <span className="attr-num">{s.idx}</span>
                  </div>
                  <div className="attr-bar-track">
                    <div className="attr-bar-fill" style={{ width: `${s.idx}%` }} />
                  </div>
                  {s.state !== "solid" && (
                    <div className="attr-flag">
                      {CATEGORY_STATE_LABEL[s.state]} · {s.factorsPresent}/{s.factorsTotal} factores
                    </div>
                  )}
                </summary>
                <div className="attr-factors">
                  {s.factors.map((f) => (
                    <div key={f.metric}>
                      {METRIC_LABELS[f.metric]?.label ?? f.metric}: índice <strong>{f.idx}</strong> ·{" "}
                      {Math.round(f.raw * 10) / 10}
                      {METRIC_LABELS[f.metric]?.suffix ?? ""}
                      {f.estimated ? <span className="estimated"> (estimado)</span> : null}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </>
      )}

      {option && (
        <details style={{ marginTop: visibleCategories.length > 0 ? "0.25rem" : 0, marginBottom: "1rem" }}>
          <summary style={{ cursor: "pointer", fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>
            Ver radar completo de factores individuales ({radarMetrics.length})
          </summary>
          <div style={{ marginTop: "0.75rem" }}>
            <ShareableChart
              option={option}
              style={{ height: narrow ? 330 : 380 }}
              share={{
                title: currentPlayer,
                subtitle: `${team} · ficha de rendimiento (índice) · Liga Profesional`,
                insight: insights[0],
                filenameBase: `scout-${team}-${currentPlayer}`,
                ratings,
              }}
              shareLabel="🖼️ Compartir radar"
            />
          </div>
        </details>
      )}

      {!option && visibleCategories.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          {currentPlayer
            ? `${currentPlayer} todavía no tiene suficientes métricas cargadas.`
            : "Elegí un jugador."}
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

      {visibleCategories.length > 0 && (
        <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", margin: "1rem 0 0.4rem" }}>
          Aporte y contexto — lo que no entra en ninguna categoría de arriba
        </p>
      )}
      <div className="stat-tiles" style={{ marginTop: visibleCategories.length > 0 ? 0 : "1rem" }}>
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
          .filter((r) => METRIC_LABELS[r.metric] && !shownInCategories.has(r.metric))
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
              <TeamBadge team={team} crests={crests} /> {currentPlayer} · {team}
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
              tagline="Rendimiento de temporada · Liga Profesional"
              shareText={`${currentPlayer} (${team}) — ficha de rendimiento · Métricas LPF`}
              filenameBase={`${team}-${currentPlayer}`}
              label="🖼️ Imagen"
            />
          </div>
        </div>
      )}

      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Cada categoría agrupa los factores de FotMob de esa familia (0–100, 100 = el mejor del dataset) en vez de
        mostrar 30+ ejes sueltos. Alcanza con <strong>1 factor cargado</strong> para verla — si faltan otros, la
        barra se recalcula sobre lo que sí hay (no se rellena con un promedio inventado) y el estado lo avisa: sin
        marca = muestra sólida, "muestra chica" = tiene GLOBAL pero pocos minutos, "estimado" = FotMob todavía no le
        publica esa categoría (menos de {MIN_MATCHES_QUALIFIED} partidos) y la tasa se deriva de sus goles/asistencias
        reales encogidos hacia la mediana de su posición. El <strong>GLOBAL</strong> combina las mismas categorías
        ponderadas por posición, normalizado contra jugadores de esa misma posición (estilo EA SPORTS FC). Agregado
        de TEMPORADA (no de partido). Los datos de plantel (dorsal, club, posición) vienen del roster de ESPN y se
        cruzan por nombre — puede faltar en algunos jugadores.
      </p>
    </div>
  );
}

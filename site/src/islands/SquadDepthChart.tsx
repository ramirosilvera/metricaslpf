import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { SquadPlayerRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";
import { normName } from "../lib/playerPositions";
import { escapeHtml } from "../lib/flags";

// Perfil de plantel: edad vs. minutos jugados en la temporada, por jugador,
// color por posición. Deja ver de un vistazo si un club es joven o veterano,
// y quiénes acumulan más rodaje. Plantel real (roster de ESPN); minutos
// jugados reales (FotMob, agregado de temporada -- ver etl/fetch_fotmob_lpf.py,
// cruzado por nombre normalizado). ESPN no publica caps ni goles de carrera
// para esta liga, así que esas columnas no se muestran (siempre vienen nulas).
const POS_COLORS: Record<string, string> = {};
const POS_ORDER = ["GK", "DF", "MF", "FW"];
const POS_LABEL: Record<string, string> = { GK: "Arquero", DF: "Defensor", MF: "Mediocampista", FW: "Delantero" };

interface Props {
  rows: SquadPlayerRow[];
  /** Minutos jugados en la temporada (FotMob), clave `${team}|${normName(player_name)}`. */
  minutesByPlayer?: Record<string, number>;
}

export default function SquadDepthChart({ rows, minutesByPlayer = {} }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  POS_COLORS.GK = tokens["--series-3"];
  POS_COLORS.DF = tokens["--series-1"];
  POS_COLORS.MF = tokens["--series-2"];
  POS_COLORS.FW = tokens["--series-6"];

  const teams = useMemo(() => [...new Set(rows.map((r) => r.team))].sort(), [rows]);
  const [team, setTeam] = useState(teams.includes("Boca Juniors") ? "Boca Juniors" : teams[0] ?? "");
  const effTeam = teams.includes(team) ? team : teams[0] ?? "";

  const squad = useMemo(
    () =>
      rows
        .filter((r) => r.team === effTeam && r.age_years != null)
        .map((r) => ({ ...r, minutes: minutesByPlayer[`${r.team}|${normName(r.player_name)}`] ?? 0 })),
    [rows, effTeam, minutesByPlayer],
  );

  const stats = useMemo(() => {
    if (!squad.length) return null;
    const ages = squad.map((p) => p.age_years as number);
    const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
    const youngest = squad.reduce((m, p) => ((p.age_years as number) < (m.age_years as number) ? p : m));
    const mostMinutes = squad.reduce((m, p) => (p.minutes > m.minutes ? p : m));
    return { n: squad.length, avgAge, youngest, mostMinutes };
  }, [squad]);

  const seriesByPos = useMemo(() => {
    return POS_ORDER.filter((pos) => squad.some((p) => p.position === pos)).map((pos) => ({
      name: POS_LABEL[pos],
      type: "scatter" as const,
      color: POS_COLORS[pos],
      symbolSize: (d: any) => 8 + Math.min(24, Math.sqrt(Math.max(0, d[2])) * 1.4),
      data: squad
        .filter((p) => p.position === pos)
        .map((p) => [p.age_years, p.minutes, p.minutes, p.player_name, p.jersey_number, p.captain]),
    }));
  }, [squad]);

  const option = {
    grid: { left: narrow ? 44 : 64, right: narrow ? 14 : 30, top: 30, bottom: narrow ? 54 : 46 },
    legend: { top: 0, textStyle: { color: tokens["--text-secondary"] }, data: POS_ORDER.filter((pos) => squad.some((p) => p.position === pos)).map((pos) => POS_LABEL[pos]) },
    tooltip: {
      confine: true,
      backgroundColor: tokens["--surface-1"],
      borderColor: tokens["--gridline"],
      textStyle: { color: tokens["--text-primary"] },
      formatter: (p: any) => {
        const [age, minutes, , name, jersey, captain] = p.data;
        return `<strong>${escapeHtml(name)}</strong>${jersey != null ? ` #${jersey}` : ""}${captain ? " (C)" : ""}<br/>${p.seriesName} · ${age} años<br/>${minutes} minutos jugados`;
      },
    },
    xAxis: {
      type: "value",
      name: "edad",
      scale: true,
      nameTextStyle: { color: tokens["--text-muted"] },
      axisLine: { lineStyle: { color: tokens["--baseline"] } },
      axisLabel: { color: tokens["--text-muted"], formatter: "{value}" },
      splitLine: { lineStyle: { color: tokens["--gridline"] } },
    },
    yAxis: {
      type: "value",
      scale: true,
      name: narrow ? "" : "minutos jugados",
      nameTextStyle: { color: tokens["--text-muted"] },
      axisLine: { lineStyle: { color: tokens["--baseline"] } },
      axisLabel: { color: tokens["--text-muted"] },
      splitLine: { lineStyle: { color: tokens["--gridline"] } },
    },
    series: seriesByPos,
  };

  if (rows.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay datos de plantel cargados.</p>;
  }

  return (
    <div>
      <div className="controls-row">
        <select value={effTeam} onChange={(e) => setTeam(e.target.value)} aria-label="Club">
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {stats && (
        <div className="stat-tiles" style={{ marginBottom: "0.75rem" }}>
          <div className="stat-tile">
            <div className="value">{stats.avgAge.toFixed(1)}</div>
            <div className="label">edad promedio del plantel</div>
          </div>
          <div className="stat-tile">
            <div className="value">{stats.n}</div>
            <div className="label">jugadores en el plantel</div>
          </div>
          <div className="stat-tile">
            <div className="value">{(stats.youngest.age_years as number).toFixed(1)}</div>
            <div className="label">más joven · {stats.youngest.player_name}</div>
          </div>
          <div className="stat-tile">
            <div className="value">{stats.mostMinutes.minutes}</div>
            <div className="label">más minutos · {stats.mostMinutes.player_name}</div>
          </div>
        </div>
      )}

      <ShareableChart
        option={option}
        style={{ height: narrow ? 330 : 400 }}
        share={{
          title: `${effTeam} · edad vs. minutos jugados`,
          subtitle: "Plantel · Liga Profesional",
          filenameBase: `plantel-${effTeam}`,
        }}
      />
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        {effTeam} — plantel: roster de ESPN. Minutos jugados: FotMob (agregado de temporada, cruzado por nombre). Cada
        punto es un jugador: edad en el eje horizontal, minutos jugados en el vertical, color por posición. ESPN no
        publica caps ni goles de carrera para esta liga.
      </p>
    </div>
  );
}

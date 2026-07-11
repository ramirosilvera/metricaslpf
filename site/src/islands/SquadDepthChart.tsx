import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { SquadPlayerRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";
import { flagFor } from "../lib/flags";

// Perfil de plantel: edad vs. experiencia (caps) por jugador, color por
// posición. Deja ver de un vistazo si una selección es joven o veterana, y
// dónde está concentrada su experiencia. Todo dato real (26worldcup/Wikipedia);
// el valor de mercado NO se grafica porque esa columna todavía viene vacía.
const POS_COLORS: Record<string, string> = {};
const POS_ORDER = ["GK", "DF", "MF", "FW"];

const Y_METRICS: { key: keyof SquadPlayerRow; label: string }[] = [
  { key: "caps", label: "Partidos internacionales (caps)" },
  { key: "career_goals", label: "Goles de carrera" },
  { key: "wc2026_apps", label: "Partidos jugados · Mundial 2026" },
];

interface Props {
  rows: SquadPlayerRow[];
}

export default function SquadDepthChart({ rows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  POS_COLORS.GK = tokens["--series-3"];
  POS_COLORS.DF = tokens["--series-1"];
  POS_COLORS.MF = tokens["--series-2"];
  POS_COLORS.FW = tokens["--series-6"];

  const teams = useMemo(() => [...new Set(rows.map((r) => r.team))].sort(), [rows]);
  const [team, setTeam] = useState(teams.includes("Argentina") ? "Argentina" : teams[0] ?? "");
  const [yKey, setYKey] = useState<string>(Y_METRICS[0].key as string);
  const yMetric = Y_METRICS.find((m) => m.key === yKey)!;

  const squad = useMemo(
    () => rows.filter((r) => r.team === team && r.age_years != null),
    [rows, team],
  );

  const stats = useMemo(() => {
    if (!squad.length) return null;
    const ages = squad.map((p) => p.age_years as number);
    const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
    const youngest = squad.reduce((m, p) => ((p.age_years as number) < (m.age_years as number) ? p : m));
    const oldest = squad.reduce((m, p) => ((p.age_years as number) > (m.age_years as number) ? p : m));
    const capsVals = squad.map((p) => p.caps ?? 0);
    const mostCapped = squad.reduce((m, p) => ((p.caps ?? 0) > (m.caps ?? 0) ? p : m));
    return {
      n: squad.length,
      avgAge,
      youngest,
      oldest,
      avgCaps: capsVals.reduce((a, b) => a + b, 0) / capsVals.length,
      mostCapped,
    };
  }, [squad]);

  const seriesByPos = useMemo(() => {
    return POS_ORDER.filter((pos) => squad.some((p) => p.position === pos)).map((pos) => ({
      name: pos,
      type: "scatter" as const,
      color: POS_COLORS[pos],
      symbolSize: (d: any) => 10 + Math.min(22, Math.sqrt(Math.max(0, d[2])) * 2.2),
      data: squad
        .filter((p) => p.position === pos)
        .map((p) => [p.age_years, (p[yKey as keyof SquadPlayerRow] as number) ?? 0, (p[yKey as keyof SquadPlayerRow] as number) ?? 0, p.player_name, p.jersey_number, p.captain]),
    }));
  }, [squad, yKey]);

  const option = {
    grid: { left: narrow ? 44 : 60, right: narrow ? 14 : 30, top: 30, bottom: narrow ? 54 : 46 },
    legend: { top: 0, textStyle: { color: tokens["--text-secondary"] }, data: POS_ORDER.filter((pos) => squad.some((p) => p.position === pos)) },
    tooltip: {
        confine: true, // el tooltip no se sale de la pantalla en móvil
      backgroundColor: tokens["--surface-1"],
      borderColor: tokens["--gridline"],
      textStyle: { color: tokens["--text-primary"] },
      formatter: (p: any) => {
        const [age, y, , name, jersey, captain] = p.data;
        return `<strong>${name}</strong>${jersey != null ? ` #${jersey}` : ""}${captain ? " (C)" : ""}<br/>${p.seriesName} · ${age} años<br/>${yMetric.label}: ${y}`;
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
      name: narrow ? "" : yMetric.label,
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
        <select value={team} onChange={(e) => setTeam(e.target.value)}>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={yKey} onChange={(e) => setYKey(e.target.value)}>
          {Y_METRICS.map((m) => (
            <option key={m.key as string} value={m.key as string}>
              {m.label}
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
            <div className="value">{stats.mostCapped.caps}</div>
            <div className="label">más internacional · {stats.mostCapped.player_name}</div>
          </div>
        </div>
      )}

      <ShareableChart
        option={option}
        style={{ height: narrow ? 330 : 400 }}
        share={{
          title: `${team} · ${yMetric.label}`,
          subtitle: "Plantel: edad vs. trayectoria · Mundial 2026",
          filenameBase: `plantel-${team}`,
        }}
      />
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        {flagFor(team)} {team} — fuente: 26worldcup (mirror de Wikipedia, CC BY-SA). Cada punto es un jugador: edad en
        el eje horizontal, experiencia en el vertical, color por posición y tamaño proporcional al valor elegido. El
        valor de mercado no se muestra porque esa columna todavía viene vacía en la fuente.
      </p>
    </div>
  );
}

import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { TimelineRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";

// Evolución partido a partido de un club (posesión-proxy y precisión de pase),
// en orden cronológico. Única fuente de estadística de equipo por partido real
// para LPF: team_match_stats_tactical (ESPN) -- ver etl/fetch_espn_lpf.py. No
// hay boxscore.players en esta liga, así que no existe una versión "por
// jugador" de esta evolución (a diferencia del Mundial, que sí la tenía vía
// FIFA Training Centre).

interface Props {
  rows: TimelineRow[];
}

export default function TimelineChart({ rows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  const teamSeasons = useMemo(() => [...new Set(rows.map((r) => `${r.team} ${r.season}`))].sort(), [rows]);
  const [sel, setSel] = useState(teamSeasons.find((t) => t.startsWith("Boca Juniors")) ?? teamSeasons[0] ?? "");
  const effSel = teamSeasons.includes(sel) ? sel : teamSeasons[0] ?? "";

  const filtered = useMemo(
    () => rows.filter((r) => `${r.team} ${r.season}` === effSel).sort((a, b) => a.match_date.localeCompare(b.match_date)),
    [rows, effSel],
  );

  const option = useMemo(
    () => ({
      color: [tokens["--series-1"], tokens["--series-3"]],
      grid: { left: narrow ? 38 : 55, right: narrow ? 12 : 55, top: narrow ? 48 : 30, bottom: narrow ? 70 : 60 },
      tooltip: {
        confine: true, // el tooltip no se sale de la pantalla en móvil
        trigger: "axis",
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"] },
      },
      legend: { top: 0, textStyle: { color: tokens["--text-secondary"] } },
      xAxis: {
        type: "category",
        data: filtered.map((r) => `${r.stage}\n${r.match_date}`),
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
        axisLabel: { color: tokens["--text-muted"], fontSize: narrow ? 9 : 10, interval: 0, rotate: narrow ? 35 : 20 },
      },
      yAxis: [
        {
          type: "value",
          name: narrow ? "" : "posesión proxy (%)",
          min: 0,
          max: 100,
          axisLabel: { color: tokens["--text-muted"] },
          splitLine: { lineStyle: { color: tokens["--gridline"] } },
        },
      ],
      series: [
        {
          name: "Posesión (proxy, %)",
          type: "line",
          smooth: false,
          symbolSize: 8,
          lineStyle: { width: 2 },
          data: filtered.map((r) => Math.round(r.possession_share_proxy * 1000) / 10),
        },
        {
          name: "Precisión de pase (%)",
          type: "line",
          smooth: false,
          symbolSize: 8,
          lineStyle: { width: 2, type: "dashed" },
          data: filtered.map((r) => r.pass_accuracy_pct),
        },
      ],
    }),
    [filtered, tokens, narrow],
  );

  return (
    <div>
      <div className="controls-row">
        <select value={effSel} onChange={(e) => setSel(e.target.value)} aria-label="Club">
          {teamSeasons.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>Este club todavía no tiene partidos con datos cargados.</p>
      ) : (
        <ShareableChart
          option={option}
          style={{ height: narrow ? 320 : 380 }}
          share={{
            title: effSel,
            subtitle: "Evolución por partido · Liga Profesional",
            filenameBase: `timeline-${effSel}`,
          }}
        />
      )}

      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Un punto por partido, en orden cronológico — se actualiza a medida que avanza la temporada. Posesión-proxy y
        precisión de pase del equipo (ESPN).
      </p>
    </div>
  );
}

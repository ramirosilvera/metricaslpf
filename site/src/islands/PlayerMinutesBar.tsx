import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { PlayerMinutesRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";

interface Props {
  rows: PlayerMinutesRow[];
}

export default function PlayerMinutesBar({ rows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();
  const teams = useMemo(() => [...new Set(rows.map((r) => r.team))].sort(), [rows]);
  const [team, setTeam] = useState(teams.includes("Argentina") ? "Argentina" : teams[0]);

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => r.team === team)
        .sort((a, b) => b.minutos_totales - a.minutos_totales)
        .slice(0, 14),
    [rows, team],
  );

  const option = {
    grid: { left: narrow ? 112 : 170, right: narrow ? 16 : 40, top: 10, bottom: 30 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "none" },
      backgroundColor: tokens["--surface-1"],
      borderColor: tokens["--gridline"],
      textStyle: { color: tokens["--text-primary"] },
      formatter: (params: any) => {
        const p = params[0];
        const row = filtered[p.dataIndex];
        return `<strong>${row.player_name}</strong><br/>${row.position}<br/>${row.minutos_totales} min · ${row.partidos} partidos`;
      },
    },
    xAxis: {
      type: "value",
      // en móvil el nombre del eje se superpone con los ticks de 4 cifras
      name: narrow ? "" : "minutos jugados",
      splitNumber: narrow ? 3 : 5,
      axisLine: { lineStyle: { color: tokens["--baseline"] } },
      axisLabel: { color: tokens["--text-muted"], fontSize: narrow ? 10 : 12, hideOverlap: true },
      splitLine: { lineStyle: { color: tokens["--gridline"] } },
    },
    yAxis: {
      type: "category",
      data: filtered.map((r) => r.player_name),
      inverse: true,
      axisLine: { lineStyle: { color: tokens["--baseline"] } },
      axisLabel: {
        color: tokens["--text-secondary"],
        fontSize: narrow ? 10 : 12,
        width: narrow ? 102 : undefined,
        overflow: "truncate",
      },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        barWidth: 14,
        data: filtered.map((r) => r.minutos_totales),
        itemStyle: { color: tokens["--series-2"], borderRadius: [0, 4, 4, 0] },
      },
    ],
  };

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
      </div>
      <ReactECharts option={option} style={{ height: Math.max(320, filtered.length * 28) }} notMerge={true} />
    </div>
  );
}

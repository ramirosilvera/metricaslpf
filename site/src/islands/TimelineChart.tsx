import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { TimelineRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";

interface Props {
  rows: TimelineRow[];
}

export default function TimelineChart({ rows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();
  const teamSeasons = useMemo(() => {
    const s = new Set(rows.map((r) => `${r.team} ${r.season}`));
    return [...s].sort();
  }, [rows]);
  const [selected, setSelected] = useState(teamSeasons.find((t) => t.startsWith("Argentina")) ?? teamSeasons[0]);

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => `${r.team} ${r.season}` === selected)
        .sort((a, b) => a.match_date.localeCompare(b.match_date)),
    [rows, selected],
  );

  const option = {
    color: [tokens["--series-1"], tokens["--series-3"]],
    grid: { left: narrow ? 38 : 55, right: narrow ? 12 : 55, top: narrow ? 48 : 30, bottom: narrow ? 70 : 60 },
    tooltip: {
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
  };

  return (
    <div>
      <div className="controls-row">
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {teamSeasons.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <ReactECharts option={option} style={{ height: narrow ? 320 : 380 }} notMerge={true} />
    </div>
  );
}

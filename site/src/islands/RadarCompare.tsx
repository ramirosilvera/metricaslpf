import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { RadarRow } from "../lib/data";
import { useChartTokens } from "../lib/theme";

const INDICATORS = [
  { key: "posesion_promedio_proxy_percentil", name: "Posesión (percentil)" },
  { key: "precision_pases_promedio_percentil", name: "Precisión de pase (percentil)" },
  { key: "remates_promedio_percentil", name: "Remates (percentil)" },
  { key: "remates_al_arco_promedio_percentil", name: "Remates al arco (percentil)" },
] as const;

interface Props {
  rows: RadarRow[];
}

export default function RadarCompare({ rows }: Props) {
  const tokens = useChartTokens();
  const options = rows.map((r) => `${r.team} ${r.season}`);
  const [aLabel, setALabel] = useState(options.find((o) => o.startsWith("Argentina")) ?? options[0]);
  const [bLabel, setBLabel] = useState(options.find((o) => o.startsWith("France")) ?? options[1] ?? options[0]);

  const find = (label: string) => rows.find((r) => `${r.team} ${r.season}` === label);
  const a = find(aLabel);
  const b = find(bLabel);

  const option = useMemo(() => {
    if (!a || !b) return {};
    return {
      color: [tokens["--series-6"], tokens["--series-1"]],
      tooltip: {
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"] },
      },
      legend: {
        bottom: 0,
        textStyle: { color: tokens["--text-secondary"] },
      },
      radar: {
        indicator: INDICATORS.map((i) => ({ name: i.name, min: 0, max: 100 })),
        axisName: { color: tokens["--text-secondary"], fontSize: 11 },
        splitLine: { lineStyle: { color: tokens["--gridline"] } },
        splitArea: { areaStyle: { color: ["transparent", "transparent"] } },
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
      },
      series: [
        {
          type: "radar",
          data: [
            {
              name: aLabel,
              value: INDICATORS.map((i) => a[i.key]),
              areaStyle: { opacity: 0.15 },
              lineStyle: { width: 2 },
            },
            {
              name: bLabel,
              value: INDICATORS.map((i) => b[i.key]),
              areaStyle: { opacity: 0.15 },
              lineStyle: { width: 2 },
            },
          ],
        },
      ],
    };
  }, [a, b, tokens, aLabel, bLabel]);

  return (
    <div>
      <div className="controls-row">
        <select value={aLabel} onChange={(e) => setALabel(e.target.value)}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span style={{ color: "var(--text-muted)" }}>vs.</span>
        <select value={bLabel} onChange={(e) => setBLabel(e.target.value)}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      {a && b ? (
        <ReactECharts option={option} style={{ height: 420 }} notMerge={true} />
      ) : (
        <p>Elegí dos selecciones/torneos para comparar.</p>
      )}
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Valores expresados como percentil dentro del propio dataset (0–100), no valor absoluto — son variables de
        contexto táctico (StatsBomb), no métricas físicas.
      </p>
    </div>
  );
}

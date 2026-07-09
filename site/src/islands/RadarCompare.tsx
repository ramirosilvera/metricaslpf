import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { RadarRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";

const INDICATORS = [
  { key: "posesion_promedio_proxy_percentil", name: "Posesión (percentil)", short: "Posesión" },
  { key: "precision_pases_promedio_percentil", name: "Precisión de pase (percentil)", short: "Precisión\nde pase" },
  { key: "remates_promedio_percentil", name: "Remates (percentil)", short: "Remates" },
  { key: "remates_al_arco_promedio_percentil", name: "Remates al arco (percentil)", short: "Remates\nal arco" },
] as const;

interface Props {
  rows: RadarRow[];
}

export default function RadarCompare({ rows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();
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
        // en móvil se usan nombres cortos (la nota al pie ya aclara que todo
        // es percentil) para que las puntas izquierda/derecha no se recorten
        indicator: INDICATORS.map((i) => ({ name: narrow ? i.short : i.name, min: 0, max: 100 })),
        radius: narrow ? "56%" : "70%",
        axisName: {
          color: tokens["--text-secondary"],
          fontSize: narrow ? 10 : 11,
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
  }, [a, b, tokens, aLabel, bLabel, narrow]);

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
        <ReactECharts option={option} style={{ height: narrow ? 340 : 420 }} notMerge={true} />
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

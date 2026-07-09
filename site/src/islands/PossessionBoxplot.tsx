import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import type { BoxplotRow } from "../lib/data";
import { useChartTokens } from "../lib/theme";

interface Props {
  rows: BoxplotRow[];
}

export default function PossessionBoxplot({ rows }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const tokens = useChartTokens();

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";

    const grouped = new Map<string, number>();
    const labelOf = (r: BoxplotRow) => `${r.team} ${r.season}`;
    for (const r of rows) grouped.set(labelOf(r), (grouped.get(labelOf(r)) ?? 0) + 1);
    const order = [...grouped.keys()].sort((a, b) => grouped.get(b)! - grouped.get(a)!);

    // en viewports angostos se achica el margen izquierdo y se truncan las
    // etiquetas largas para que el gráfico no quede aplastado ni desborde
    const width = Math.min(920, ref.current.clientWidth || 920);
    const isNarrow = width < 520;

    const plot = Plot.plot({
      width,
      height: isNarrow ? 380 : 420,
      marginLeft: isNarrow ? 96 : 130,
      style: {
        background: "transparent",
        color: tokens["--text-secondary"],
        fontFamily: "system-ui, sans-serif",
        fontSize: isNarrow ? "10px" : "12px",
      },
      x: {
        label: isNarrow ? "posesión (proxy, %)" : "posesión (proxy, % del tiempo de evento del partido)",
        percent: true,
        grid: true,
      },
      y: {
        label: null,
        domain: order,
        tickFormat: isNarrow ? (d: string) => (d.length > 14 ? `${d.slice(0, 13)}…` : d) : undefined,
      },
      marks: [
        Plot.gridX({ stroke: tokens["--gridline"] }),
        Plot.boxX(rows, {
          y: labelOf,
          x: "possession_share_proxy",
          fill: (d: BoxplotRow) => (d.team === "Argentina" ? tokens["--series-6"] : tokens["--series-1"]),
          fillOpacity: 0.18,
          stroke: (d: BoxplotRow) => (d.team === "Argentina" ? tokens["--series-6"] : tokens["--series-1"]),
          strokeWidth: 1.4,
          r: 2.5,
        }),
        Plot.ruleX([0.5], { stroke: tokens["--baseline"], strokeDasharray: "2,3" }),
      ],
    });

    ref.current.appendChild(plot);
    return () => plot.remove();
  }, [rows, tokens]);

  return (
    <div>
      <div ref={ref} />
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        Cada caja resume la dispersión partido a partido, no un promedio único — con pocos partidos por selección,
        el rango importa más que el punto central. Línea punteada en 50% = paridad de posesión.
      </p>
    </div>
  );
}

import { useMemo } from "react";
import ShareableChart from "./ShareableChart";
import type { ClubConsistencyRow } from "../lib/clubConsistency";
import { useChartTokens, useIsNarrow } from "../lib/theme";
import { flagOrCrestHtml, escapeHtml } from "../lib/flags";

// Cruce club-jugador: puntos de la tabla de referencia (eje X) vs. mediana
// del índice GLOBAL de los jugadores del club con muestra suficiente (eje
// Y). Si el rendimiento colectivo y el individual fueran perfectamente
// consistentes, los puntos se alinearían en una diagonal; el color marca el
// desvío (gap) -- verde = el club rinde MÁS que sus individualidades, rojo =
// tiene mejores jugadores de lo que el resultado colectivo muestra.

interface Props {
  rows: ClubConsistencyRow[];
  crests?: Record<string, string>;
}

const GAP_LABEL_THRESHOLD = 0.9; // |gap| en desvíos estándar a partir del cual se etiqueta el punto

export default function ClubConsistencyScatter({ rows, crests }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  const plotted = useMemo(() => rows.filter((r) => r.medianGlobal != null), [rows]);

  const option = useMemo(() => {
    if (plotted.length === 0) return {};
    const gaps = plotted.map((r) => r.gap ?? 0);
    const maxAbsGap = Math.max(1, ...gaps.map((g) => Math.abs(g)));

    const colorFor = (gap: number) => {
      const t = Math.max(-1, Math.min(1, gap / maxAbsGap)); // -1..1
      // rojo (individual > tabla, el equipo rinde por debajo de su talento)
      // <-> verde (tabla > individual, el equipo rinde por encima de su talento)
      if (t >= 0) return tokens["--status-critical"];
      return tokens["--status-good"];
    };

    return {
      grid: { left: narrow ? 46 : 60, right: narrow ? 18 : 34, top: 20, bottom: narrow ? 50 : 46 },
      tooltip: {
        confine: true,
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"], fontSize: 12 },
        formatter: (p: any) => {
          const r: ClubConsistencyRow = p.data[2];
          const gapTxt =
            r.gap == null
              ? ""
              : r.gap > 0.15
                ? `<br/>Rinde individualmente <strong>más</strong> de lo que el resultado colectivo muestra`
                : r.gap < -0.15
                  ? `<br/>El club rinde <strong>más</strong> que la suma de sus individualidades`
                  : `<br/>Consistente con lo esperado`;
          return `${flagOrCrestHtml(r.team, crests)} <strong>${escapeHtml(r.team)}</strong><br/>${r.points} pts · DG ${r.gd > 0 ? "+" : ""}${r.gd} · ${r.played} PJ<br/>mediana GLOBAL <strong>${r.medianGlobal}</strong> (${r.nRanked} jugadores con muestra suficiente)${gapTxt}`;
        },
      },
      xAxis: {
        type: "value",
        name: "puntos",
        scale: true,
        nameTextStyle: { color: tokens["--text-muted"] },
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
        axisLabel: { color: tokens["--text-muted"] },
        splitLine: { lineStyle: { color: tokens["--gridline"] } },
      },
      yAxis: {
        type: "value",
        name: narrow ? "" : "mediana GLOBAL",
        scale: true,
        min: 40,
        max: 100,
        nameTextStyle: { color: tokens["--text-muted"] },
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
        axisLabel: { color: tokens["--text-muted"] },
        splitLine: { lineStyle: { color: tokens["--gridline"] } },
      },
      series: [
        {
          type: "scatter",
          symbolSize: (d: any) => 10 + Math.min(14, d[2].nRanked / 2),
          itemStyle: { color: (p: any) => colorFor(p.data[2].gap ?? 0), opacity: 0.85 },
          label: {
            show: true,
            formatter: (p: any) => (Math.abs(p.data[2].gap ?? 0) >= GAP_LABEL_THRESHOLD ? p.data[2].team : ""),
            position: "top",
            fontSize: 10,
            color: tokens["--text-secondary"],
          },
          // En el cúmulo de clubes de puntaje/GLOBAL parecido las etiquetas se
          // pisan (más en mobile, menos ancho) -- ECharts las esconde solas
          // cuando se superponen en vez de renderizar texto ilegible.
          labelLayout: { hideOverlap: true, moveOverlap: "shiftY" },
          data: plotted.map((r) => [r.points, r.medianGlobal, r]),
        },
      ],
    };
  }, [plotted, tokens, narrow, crests]);

  if (plotted.length < 4) {
    return (
      <p style={{ color: "var(--text-muted)" }}>
        Todavía no hay suficientes clubes con jugadores de muestra suficiente para graficar la consistencia.
      </p>
    );
  }

  const chartHeight = narrow ? 360 : 460;
  const mismatches = [...plotted]
    .filter((r) => r.gap != null)
    .sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0))
    .slice(0, 6);

  return (
    <div>
      <ShareableChart
        option={option}
        style={{ height: chartHeight }}
        share={{
          title: "Consistencia club-jugador",
          subtitle: "Puntos de tabla vs. mediana del índice GLOBAL · Liga Profesional",
          insight:
            mismatches[0] && mismatches[0].gap != null
              ? `${mismatches[0].team} es el mayor desvío: ${mismatches[0].gap > 0 ? "rinde individualmente más de lo que muestra la tabla" : "el equipo rinde más que la suma de sus individualidades"}.`
              : undefined,
          filenameBase: "consistencia-club-jugador",
        }}
        shareLabel="🖼️ Compartir gráfico"
      />

      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.5rem 0 0" }}>
        <span style={{ color: "var(--status-critical)" }}>●</span> individual &gt; tabla (el equipo rinde por debajo
        de su talento) &nbsp;·&nbsp; <span style={{ color: "var(--status-good)" }}>●</span> tabla &gt; individual (el
        equipo rinde por encima de su talento). El tamaño del punto es la cantidad de jugadores con muestra
        suficiente que entraron en la mediana del club -- clubes con pocos (dot chico) son una lectura menos firme.
      </p>

      {mismatches.length > 0 && (
        <div className="table-scroll" style={{ marginTop: "0.75rem" }}>
          <table>
            <thead>
              <tr>
                <th>Club</th>
                <th>Lectura</th>
                <th>Pts</th>
                <th>DG</th>
                <th>Mediana GLOBAL</th>
                <th>Jugadores</th>
              </tr>
            </thead>
            <tbody>
              {mismatches.map((r) => (
                <tr key={r.team}>
                  <td>{r.team}</td>
                  <td>
                    {r.gap != null && r.gap > 0
                      ? "individual > tabla"
                      : r.gap != null && r.gap < 0
                        ? "tabla > individual"
                        : "—"}
                  </td>
                  <td>{r.points}</td>
                  <td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                  <td>
                    <strong>{r.medianGlobal}</strong>
                  </td>
                  <td>{r.nRanked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

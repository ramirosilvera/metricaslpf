import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { DerivedPlayerMetricRow, TeamPhysicalRankingRow, TeamTacticalRankingRow } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";
import { flagFor } from "../lib/flags";
import { buildPredictor, type TeamStrength } from "../lib/prediction";

interface Props {
  physicalRows: TeamPhysicalRankingRow[];
  tacticalRows: TeamTacticalRankingRow[];
  playerRows: DerivedPlayerMetricRow[];
  positions?: Record<string, string>;
}

// Reparte pA/pDraw/pB (0..1) en tres enteros que suman 100 (mayor resto).
function pct100(parts: number[]): number[] {
  const raw = parts.map((p) => p * 100);
  const floor = raw.map((v) => Math.floor(v));
  let rem = 100 - floor.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  const out = [...floor];
  for (let k = 0; k < order.length && rem > 0; k++, rem--) out[order[k].i]++;
  return out;
}

export default function MatchPredictor({ physicalRows, tacticalRows, playerRows, positions = {} }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  const { strengths, predict } = useMemo(
    () => buildPredictor(physicalRows as any, tacticalRows as any, playerRows as any, positions),
    [physicalRows, tacticalRows, playerRows, positions],
  );

  const teams = useMemo(() => [...strengths.keys()].sort(), [strengths]);
  const [aTeam, setATeam] = useState("");
  const [bTeam, setBTeam] = useState("");
  const effA = teams.includes(aTeam) ? aTeam : teams.includes("Argentina") ? "Argentina" : teams[0] ?? "";
  const effB = teams.includes(bTeam) ? bTeam : teams.includes("Brazil") ? "Brazil" : teams[1] ?? teams[0] ?? "";

  const A = strengths.get(effA);
  const B = strengths.get(effB);
  const pred = useMemo(() => (A && B ? predict(A, B) : null), [A, B, predict]);

  const colorA = tokens["--series-6"];
  const colorB = tokens["--series-1"];
  const colorDraw = tokens["--text-muted"];

  const probs = pred ? pct100([pred.pA, pred.pDraw, pred.pB]) : [0, 0, 0];

  const option = useMemo(() => {
    if (!pred) return {};
    return {
      grid: { left: 2, right: 2, top: 6, bottom: 34, containLabel: false },
      tooltip: {
        confine: true,
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"] },
        formatter: (p: any) => `${p.seriesName}: <strong>${p.value}%</strong>`,
      },
      legend: {
        bottom: 0,
        textStyle: { color: tokens["--text-secondary"] },
        data: [effA, "Empate", effB],
      },
      xAxis: { type: "value", max: 100, show: false },
      yAxis: { type: "category", data: [""], show: false },
      series: [
        { name: effA, type: "bar", stack: "p", data: [probs[0]], itemStyle: { color: colorA, borderRadius: [8, 0, 0, 8] }, label: { show: probs[0] >= 8, formatter: `${probs[0]}%`, color: "#fff", fontWeight: 700 } },
        { name: "Empate", type: "bar", stack: "p", data: [probs[1]], itemStyle: { color: colorDraw }, label: { show: probs[1] >= 8, formatter: `${probs[1]}%`, color: "#fff", fontWeight: 700 } },
        { name: effB, type: "bar", stack: "p", data: [probs[2]], itemStyle: { color: colorB, borderRadius: [0, 8, 8, 0] }, label: { show: probs[2] >= 8, formatter: `${probs[2]}%`, color: "#fff", fontWeight: 700 } },
      ],
    };
  }, [pred, probs, effA, effB, tokens, colorA, colorB, colorDraw]);

  if (teams.length === 0) {
    return <p style={{ color: "var(--text-muted)" }}>Todavía no hay selecciones con datos suficientes para predecir.</p>;
  }

  const headline =
    pred && A && B
      ? probs[0] > probs[2] && probs[0] >= probs[1]
        ? `${effA} es favorito (${probs[0]}% de ganar)`
        : probs[2] > probs[0] && probs[2] >= probs[1]
          ? `${effB} es favorito (${probs[2]}% de ganar)`
          : `Partido parejo (empate ${probs[1]}%)`
      : "";

  const rows: { label: string; a: number; b: number }[] = A && B
    ? [
        { label: "Físico colectivo", a: A.fisico, b: B.fisico },
        { label: "Ofensivo", a: A.ofensivo, b: B.ofensivo },
        { label: "Control (pelota)", a: A.control, b: B.control },
        { label: "Defensivo", a: A.defensivo, b: B.defensivo },
        { label: "Individual (mejores 11)", a: A.individual, b: B.individual },
      ]
    : [];

  return (
    <div>
      <div className="controls-row" style={{ flexWrap: "wrap" }}>
        <select value={effA} onChange={(e) => setATeam(e.target.value)} aria-label="Primera selección">
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span style={{ color: "var(--text-muted)" }}>vs.</span>
        <select value={effB} onChange={(e) => setBTeam(e.target.value)} aria-label="Segunda selección">
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {pred && A && B ? (
        <>
          <div className="predict-head">
            <span style={{ color: colorA }}>{flagFor(effA)} {effA}</span>
            <strong className="predict-score">
              {Math.round(pred.xA * 10) / 10} – {Math.round(pred.xB * 10) / 10}
            </strong>
            <span style={{ color: colorB }}>{effB} {flagFor(effB)}</span>
          </div>
          <p className="predict-sub">goles esperados por el modelo · {headline}</p>

          <ShareableChart
            option={option}
            style={{ height: 130 }}
            share={{
              title: `${effA} vs ${effB} — predicción`,
              subtitle: `Probabilidad 1-X-2 y goles esperados · modelo por rendimiento · Mundial 2026`,
              insight: `${headline}. Marcador más probable ${pred.topScores[0].a}-${pred.topScores[0].b}. ${pred.scenarios[0] ?? ""}`,
              shareText: `${effA} ${probs[0]}% · empate ${probs[1]}% · ${effB} ${probs[2]}% — predicción por rendimiento`,
              filenameBase: `prediccion-${effA}-vs-${effB}`,
            }}
            shareLabel="🖼️ Compartir predicción"
          />

          <div className="predict-scores">
            <span className="predict-scores-label">Marcadores más probables:</span>
            {pred.topScores.map((s, i) => (
              <span key={i} className="predict-score-chip">
                {s.a}–{s.b} <span className="predict-score-p">{Math.round(s.p * 100)}%</span>
              </span>
            ))}
          </div>

          <div className="predict-breakdown">
            <div className="predict-fuerza">
              <span className="predict-fuerza-num" style={{ color: colorA }}>{A.fuerza}</span>
              <span className="predict-fuerza-mid">FUERZA · rendimiento observado</span>
              <span className="predict-fuerza-num" style={{ color: colorB }}>{B.fuerza}</span>
            </div>
            {rows.map((r, i) => {
              const best = r.a === r.b ? 0 : r.a > r.b ? -1 : 1;
              return (
                <div className="predict-row" key={i}>
                  <span className="predict-cell">
                    <span className="predict-minibar"><span className="predict-fill" style={{ width: `${r.a}%`, background: colorA }} /></span>
                    <span className={`predict-val${best === -1 ? " is-best" : ""}`} style={best === -1 ? { color: colorA } : undefined}>{r.a}</span>
                  </span>
                  <span className="predict-row-label">{r.label}</span>
                  <span className="predict-cell predict-cell-r">
                    <span className={`predict-val${best === 1 ? " is-best" : ""}`} style={best === 1 ? { color: colorB } : undefined}>{r.b}</span>
                    <span className="predict-minibar"><span className="predict-fill" style={{ width: `${r.b}%`, background: colorB }} /></span>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="insight-card">
            <div className="insight-head">
              <span className="insight-dot" />
              Cómo se puede desarrollar
            </div>
            <ul className="insight-list">
              {pred.scenarios.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>

          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            <strong>Es un modelo heurístico y transparente, no una predicción profesional.</strong> Combina el
            rendimiento observado hasta ahora en el Mundial 2026 —físico y táctico colectivo (por equipo) e individual
            ponderado por posición (mejores 11)— en una "Fuerza" 0–100; la diferencia de Fuerza se traduce a goles
            esperados y las probabilidades salen de una distribución de Poisson. <strong>No</strong> usa cuotas,
            historial, localía, lesiones, clima ni el momento del torneo. Sirve para dimensionar quién llega mejor, no
            para acertar el resultado.
          </p>
        </>
      ) : (
        <p>Elegí dos selecciones.</p>
      )}
    </div>
  );
}

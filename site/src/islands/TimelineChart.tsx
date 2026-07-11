import { useMemo, useState } from "react";
import ShareableChart from "./ShareableChart";
import type { TimelineRow, TimelineTactical2026Row } from "../lib/data";
import { useChartTokens, useIsNarrow } from "../lib/theme";

type Mode = "2026" | "historico";

interface Props {
  /** Evolución táctica por partido del Mundial 2026 (en curso). */
  rows2026: TimelineTactical2026Row[];
  /** Timeline histórico de StatsBomb (2018/2022). */
  rows: TimelineRow[];
}

export default function TimelineChart({ rows2026, rows }: Props) {
  const tokens = useChartTokens();
  const narrow = useIsNarrow();

  const [mode, setMode] = useState<Mode>(rows2026.length ? "2026" : "historico");

  // --- opciones de selección según el modo ---
  const teams2026 = useMemo(() => [...new Set(rows2026.map((r) => r.team))].sort(), [rows2026]);
  const teamSeasons = useMemo(() => [...new Set(rows.map((r) => `${r.team} ${r.season}`))].sort(), [rows]);

  const [team26, setTeam26] = useState(teams2026.find((t) => t === "Argentina") ?? teams2026[0] ?? "");
  const [selHist, setSelHist] = useState(teamSeasons.find((t) => t.startsWith("Argentina")) ?? teamSeasons[0] ?? "");

  // ---------- datos del modo 2026 ----------
  const f26 = useMemo(
    () => rows2026.filter((r) => r.team === team26).sort((a, b) => a.match_date.localeCompare(b.match_date)),
    [rows2026, team26],
  );

  const option2026 = useMemo(
    () => ({
      color: [tokens["--series-1"], tokens["--series-4"]],
      grid: { left: narrow ? 40 : 55, right: narrow ? 40 : 58, top: narrow ? 48 : 30, bottom: narrow ? 82 : 64 },
      tooltip: {
        confine: true, // el tooltip no se sale de la pantalla en móvil
        trigger: "axis",
        backgroundColor: tokens["--surface-1"],
        borderColor: tokens["--gridline"],
        textStyle: { color: tokens["--text-primary"] },
        formatter: (params: any[]) => {
          const i = params[0]?.dataIndex ?? 0;
          const r = f26[i];
          if (!r) return "";
          return `<strong>${r.stage} · vs ${r.rival}</strong><br/>${r.match_date}<br/>Precisión de pase: ${r.pass_accuracy_pct}%<br/>Progresiones: ${r.progresiones}`;
        },
      },
      legend: { top: 0, textStyle: { color: tokens["--text-secondary"] } },
      xAxis: {
        type: "category",
        data: f26.map((r) => `${r.stage}\n${r.match_date}`),
        axisLine: { lineStyle: { color: tokens["--baseline"] } },
        axisLabel: { color: tokens["--text-muted"], fontSize: narrow ? 9 : 10, interval: 0, rotate: narrow ? 35 : 20 },
      },
      yAxis: [
        {
          type: "value",
          name: narrow ? "" : "precisión pase (%)",
          min: 60,
          max: 100,
          axisLabel: { color: tokens["--text-muted"] },
          splitLine: { lineStyle: { color: tokens["--gridline"] } },
        },
        {
          type: "value",
          name: narrow ? "" : "progresiones",
          min: 0,
          axisLabel: { color: tokens["--text-muted"] },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "Precisión de pase (%)",
          type: "line",
          yAxisIndex: 0,
          smooth: false,
          symbolSize: 8,
          lineStyle: { width: 2 },
          data: f26.map((r) => r.pass_accuracy_pct),
        },
        {
          name: "Progresiones de balón",
          type: "line",
          yAxisIndex: 1,
          smooth: false,
          symbolSize: 8,
          lineStyle: { width: 2, type: "dashed" },
          data: f26.map((r) => r.progresiones),
        },
      ],
    }),
    [f26, tokens, narrow],
  );

  // ---------- datos del modo histórico ----------
  const fHist = useMemo(
    () => rows.filter((r) => `${r.team} ${r.season}` === selHist).sort((a, b) => a.match_date.localeCompare(b.match_date)),
    [rows, selHist],
  );

  const optionHist = useMemo(
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
        data: fHist.map((r) => `${r.stage}\n${r.match_date}`),
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
          data: fHist.map((r) => Math.round(r.possession_share_proxy * 1000) / 10),
        },
        {
          name: "Precisión de pase (%)",
          type: "line",
          smooth: false,
          symbolSize: 8,
          lineStyle: { width: 2, type: "dashed" },
          data: fHist.map((r) => r.pass_accuracy_pct),
        },
      ],
    }),
    [fHist, tokens, narrow],
  );

  const is2026 = mode === "2026";
  const shareTitle = is2026 ? team26 : selHist;

  return (
    <div>
      <div className="mode-toggle" role="tablist" aria-label="Época de la evolución">
        <button
          type="button"
          role="tab"
          aria-selected={is2026}
          className={is2026 ? "is-active" : undefined}
          onClick={() => setMode("2026")}
          disabled={rows2026.length === 0}
        >
          Mundial 2026 <span className="mode-count">en curso</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!is2026}
          className={!is2026 ? "is-active" : undefined}
          onClick={() => setMode("historico")}
        >
          Histórico 2018/2022
        </button>
      </div>

      <div className="controls-row">
        {is2026 ? (
          <select value={team26} onChange={(e) => setTeam26(e.target.value)} aria-label="Selección">
            {teams2026.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : (
          <select value={selHist} onChange={(e) => setSelHist(e.target.value)} aria-label="Selección y torneo">
            {teamSeasons.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>

      {is2026 && f26.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>Esta selección todavía no tiene partidos con datos tácticos cargados.</p>
      ) : (
        <ShareableChart
          option={is2026 ? option2026 : optionHist}
          style={{ height: narrow ? 320 : 380 }}
          share={{
            title: shareTitle,
            subtitle: is2026
              ? "Evolución táctica por partido · Mundial 2026 (en curso)"
              : "Evolución táctica por partido · 2018/2022",
            filenameBase: `timeline-${shareTitle}`,
          }}
        />
      )}

      {is2026 && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Un punto por partido, en orden cronológico — se actualiza a medida que avanza el Mundial. Precisión de pase del
          equipo y progresiones de balón por partido (FIFA Training Centre).
        </p>
      )}
    </div>
  );
}

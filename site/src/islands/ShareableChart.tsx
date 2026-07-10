import { useRef, useState, type CSSProperties } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsInstance } from "echarts-for-react";
import { composeChartCard } from "../lib/shareChart";
import { shareCardBlob } from "../lib/shareCard";
import RatingsPanel from "./RatingsPanel";
import type { RatingsData } from "../lib/ratings";

// Wrapper universal: dibuja un gráfico de ECharts y le agrega, debajo, un botón
// "Compartir imagen" que exporta EL PROPIO gráfico (getDataURL) montado en una
// tarjeta de marca y lo manda a la hoja nativa de compartir (WhatsApp, etc.) o
// lo descarga. Reemplaza el uso directo de <ReactECharts> en las islas para que
// TODO gráfico del sitio sea compartible con el mismo patrón.

interface ShareMeta {
  /** Qué muestra el gráfico (título de la tarjeta). */
  title: string;
  /** Contexto (métrica, torneo, cobertura…). */
  subtitle?: string;
  /** Lectura automática / conclusión corta que acompaña la imagen. */
  insight?: string;
  /** Texto para la hoja de compartir (cae al title si falta). */
  shareText?: string;
  /** Base del nombre de archivo. */
  filenameBase?: string;
  /** Desglose "estilo EA FC" (GLOBAL + índice por factor): se muestra bajo el
   *  gráfico en pantalla y se replica en el exportable. */
  ratings?: RatingsData;
}

interface Props {
  option: Record<string, unknown>;
  style?: CSSProperties;
  notMerge?: boolean;
  /** Passthrough opcional a ReactECharts (opts, onEvents, etc.). */
  opts?: Record<string, unknown>;
  onEvents?: Record<string, (...args: unknown[]) => void>;
  share: ShareMeta;
  /** Etiqueta del botón. */
  shareLabel?: string;
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "metricas-mundial-2026"
  );
}

export default function ShareableChart({
  option,
  style,
  notMerge = true,
  opts,
  onEvents,
  share,
  shareLabel = "🖼️ Compartir imagen",
}: Props) {
  const chartRef = useRef<ReactECharts>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const inst: EChartsInstance | undefined = chartRef.current?.getEchartsInstance();
      if (!inst) throw new Error("Gráfico no disponible");

      // El gráfico se exporta con el color de superficie actual, así la imagen
      // es legible tanto en tema claro como oscuro (se pinta el panel igual).
      const cs = getComputedStyle(document.documentElement);
      const panelBg = cs.getPropertyValue("--surface-1").trim() || "#ffffff";

      // getDataURL toma el/los canvas del chart y los aplana a un PNG. pixelRatio
      // 2 -> nítido en pantallas retina y al reescalar en la tarjeta.
      const chartDataUrl = inst.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: panelBg });

      const pageUrl = typeof window !== "undefined" ? window.location.href : undefined;
      const blob = await composeChartCard({
        chartDataUrl,
        title: share.title,
        subtitle: share.subtitle,
        insight: share.insight,
        url: pageUrl,
        panelBg,
        ratings: share.ratings,
      });

      const result = await shareCardBlob(blob, {
        filename: `${slug(share.filenameBase ?? share.title)}-metricas-mundial-2026.png`,
        title: `${share.title} · Métricas Mundial 2026`,
        text: share.shareText ?? `${share.title} — Métricas Mundial 2026`,
        url: pageUrl,
      });
      if (result === "downloaded") {
        setNote("Imagen descargada ✓");
        setTimeout(() => setNote(null), 4000);
      }
    } catch {
      setNote("No se pudo generar la imagen");
      setTimeout(() => setNote(null), 4000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chart-shareable">
      <ReactECharts ref={chartRef} option={option} style={style} notMerge={notMerge} opts={opts} onEvents={onEvents} />
      {share.ratings && <RatingsPanel data={share.ratings} />}
      <div className="chart-share-bar">
        <button
          type="button"
          className="btn btn-share btn-share-sm"
          onClick={handleShare}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "Generando…" : shareLabel}
        </button>
        {note && (
          <span role="status" className="chart-share-note">
            {note}
          </span>
        )}
      </div>
    </div>
  );
}

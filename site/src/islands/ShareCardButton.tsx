import { useState } from "react";
import { renderShareCard, shareCardBlob, type ShareStat } from "../lib/shareCard";

interface Props {
  /** Nombre principal (jugador o selección). */
  title: string;
  subtitle?: string;
  flag?: string;
  stats: ShareStat[];
  tagline?: string;
  /** URL a compartir; por defecto la página actual. */
  url?: string;
  /** Texto que acompaña la imagen en la hoja de compartir. */
  shareText?: string;
  /** Etiqueta del botón. */
  label?: string;
  /** Base para el nombre de archivo del PNG. */
  filenameBase?: string;
}

function slug(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "metricas-mundial-2026";
}

export default function ShareCardButton({
  title,
  subtitle,
  flag,
  stats,
  tagline,
  url,
  shareText,
  label = "🖼️ Compartir imagen",
  filenameBase,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const pageUrl = url ?? (typeof window !== "undefined" ? window.location.href : undefined);
      const blob = await renderShareCard({ title, subtitle, flag, stats, tagline, url: pageUrl });
      const result = await shareCardBlob(blob, {
        filename: `${slug(filenameBase ?? title)}-metricas-mundial-2026.png`,
        title: `${title} · Métricas Mundial 2026`,
        text: shareText ?? `${title} — Métricas Mundial 2026`,
        url: pageUrl,
      });
      setNote(result === "downloaded" ? "Imagen descargada ✓" : null);
    } catch {
      setNote("No se pudo generar la imagen");
    } finally {
      setBusy(false);
      if (note) setTimeout(() => setNote(null), 4000);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-share"
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? "Generando…" : label}
      </button>
      {note && (
        <span role="status" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {note}
        </span>
      )}
    </>
  );
}

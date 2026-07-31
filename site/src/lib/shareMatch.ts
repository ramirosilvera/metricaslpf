// Genera una imagen de marca ("cancha") para compartir un PARTIDO por WhatsApp,
// 100% en el cliente sobre <canvas>. Reusa shareCardBlob() para la hoja nativa
// de compartir / descarga. Datos oficiales; sin xG (usamos remates como proxy).

import { shareCardBlob, type ShareResult } from "./shareCard";
import type { MatchSummary } from "./data";

const W = 1080;
const PAD = 72;
const BRAND = "#1d5fd6";
const BRAND_DEEP = "#0b2d6b";
const FOOTER = "#0b2d6b";
const WHITE = "#ffffff";
const SOFT = "rgba(255,255,255,0.92)";
const SOFTER = "rgba(255,255,255,0.66)";
const LINE = "rgba(255,255,255,0.85)";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function clip(ctx: CanvasRenderingContext2D, s: string, max: number): string {
  if (ctx.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 2 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(trial).width <= maxW || !cur) cur = trial;
    else {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  return lines;
}

const num = (v: number | null, digits: number, unit: string) =>
  v == null ? "—" : `${Number(v.toFixed(digits))}${unit}`;

export function composeMatchCard(m: MatchSummary, url?: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const H = 1350;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas no disponible"));
      const innerW = W - PAD * 2;

      // fondo cancha
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, BRAND);
      g.addColorStop(1, BRAND_DEEP);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // línea de mitad
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2, 40);
      ctx.lineTo(W / 2, 470);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(W / 2, 300, 120, 0, Math.PI * 2);
      ctx.stroke();

      ctx.textBaseline = "alphabetic";

      // kicker + fase/fecha
      ctx.textAlign = "left";
      ctx.fillStyle = SOFTER;
      ctx.font = `700 26px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.fillText("MÉTRICAS LPF", PAD, 84);
      ctx.textAlign = "right";
      ctx.fillStyle = SOFT;
      ctx.font = `600 26px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.fillText(`${(m.stage || "Fase de grupos").toUpperCase()} · ${m.match_date}`, W - PAD, 84);

      // marcador
      const cy = 250;
      ctx.textAlign = "center";
      ctx.fillStyle = WHITE;
      ctx.font = `700 120px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.fillText(`${m.home_score} – ${m.away_score}`, W / 2, cy + 42);

      // nombres a los costados (con bandera)
      ctx.font = `800 44px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillStyle = m.home_score >= m.away_score ? WHITE : SOFT;
      ctx.fillText(clip(ctx, m.home_team, innerW / 2 - 120), PAD, cy);
      ctx.textAlign = "right";
      ctx.fillStyle = m.away_score >= m.home_score ? WHITE : SOFT;
      ctx.fillText(clip(ctx, m.away_team, innerW / 2 - 120), W - PAD, cy);

      // goleadores (una línea por lado, debajo del marcador para no chocar con
      // los dígitos grandes; con un hueco central reservado al score)
      const hg = m.goleadores.filter((x) => x.team === m.home_team).map((x) => `${x.player} ${x.minute}'`).join(", ");
      const ag = m.goleadores.filter((x) => x.team === m.away_team).map((x) => `${x.player} ${x.minute}'`).join(", ");
      const goalY = cy + 120;
      const goalMax = innerW / 2 - 24;
      ctx.font = `500 24px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.fillStyle = SOFTER;
      if (hg) {
        ctx.textAlign = "left";
        wrap(ctx, hg, goalMax, 2).forEach((ln, i) => ctx.fillText(ln, PAD, goalY + i * 30));
      }
      if (ag) {
        ctx.textAlign = "right";
        wrap(ctx, ag, goalMax, 2).forEach((ln, i) => ctx.fillText(ln, W - PAD, goalY + i * 30));
      }

      // jugador destacado (⭐) — igual que en la tarjeta del sitio
      if (m.destacado) {
        ctx.textAlign = "center";
        ctx.fillStyle = SOFT;
        ctx.font = `600 27px system-ui, -apple-system, Roboto, sans-serif`;
        ctx.fillText(clip(ctx, `⭐ ${m.destacado.player} (${m.destacado.team}) · ${m.destacado.note}`, innerW), W / 2, cy + 200);
      }

      // filas de stats: TODAS las que tengan dato en ambos (mismas 6 que la
      // tarjeta del sitio: posesión, remates, distancia, alta intensidad,
      // sprints, velocidad punta)
      const defs: { label: string; hv: number | null; av: number | null; d: number; u: string }[] = [
        { label: "Posesión", hv: m.home.posesion_pct, av: m.away.posesion_pct, d: 0, u: "%" },
        { label: "Remates", hv: m.home.remates, av: m.away.remates, d: 0, u: "" },
        { label: "Distancia", hv: m.home.distancia_km, av: m.away.distancia_km, d: 1, u: " km" },
        { label: "Alta intensidad", hv: m.home.alta_intensidad_m, av: m.away.alta_intensidad_m, d: 0, u: " m" },
        { label: "Sprints", hv: m.home.sprints, av: m.away.sprints, d: 0, u: "" },
        { label: "Velocidad punta", hv: m.home.velocidad_punta_kmh, av: m.away.velocidad_punta_kmh, d: 1, u: " km/h" },
      ].filter((r) => r.hv != null && r.av != null);

      let y = 540;
      const rowH = 70;
      for (const r of defs.slice(0, 6)) {
        const total = (r.hv as number) + (r.av as number);
        const hpct = total > 0 ? (r.hv as number) / total : 0.5;
        // barra
        const barY = y + 10;
        const barH = 30;
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        roundRect(ctx, PAD, barY, innerW, barH, 8);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        roundRect(ctx, PAD, barY, Math.max(6, innerW * hpct), barH, 8);
        ctx.fill();
        // valores + label
        ctx.font = `700 30px ui-monospace, Menlo, monospace`;
        ctx.fillStyle = WHITE;
        ctx.textAlign = "left";
        ctx.fillText(num(r.hv, r.d, r.u), PAD, barY - 8);
        ctx.textAlign = "right";
        ctx.fillText(num(r.av, r.d, r.u), W - PAD, barY - 8);
        ctx.textAlign = "center";
        ctx.font = `600 24px system-ui, -apple-system, Roboto, sans-serif`;
        ctx.fillStyle = SOFT;
        ctx.fillText(r.label, W / 2, barY - 8);
        y += rowH;
      }

      // insight (envuelto)
      ctx.textAlign = "left";
      ctx.fillStyle = SOFT;
      ctx.font = `500 28px system-ui, -apple-system, Roboto, sans-serif`;
      const lines = wrap(ctx, m.insight, innerW, 3);
      let iy = Math.max(y + 30, 858);
      for (const ln of lines) {
        ctx.fillText(ln, PAD, iy);
        iy += 38;
      }

      // pie: se mide primero la URL para recortar el texto izquierdo y que
      // nunca se superpongan.
      ctx.fillStyle = FOOTER;
      ctx.fillRect(0, H - 88, W, 88);
      let urlText = "";
      let urlW = 0;
      if (url) {
        ctx.font = `500 22px ui-monospace, Menlo, monospace`;
        urlText = clip(ctx, url.replace(/^https?:\/\//, "").replace(/\/$/, ""), innerW * 0.42);
        urlW = ctx.measureText(urlText).width;
      }
      ctx.fillStyle = WHITE;
      ctx.font = `700 25px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(clip(ctx, "⚽ remates como proxy (no xG)", innerW - urlW - 24), PAD, H - 32);
      if (urlText) {
        ctx.fillStyle = SOFTER;
        ctx.font = `500 22px ui-monospace, Menlo, monospace`;
        ctx.textAlign = "right";
        ctx.fillText(urlText, W - PAD, H - 33);
      }

      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen"))), "image/png");
    } catch (e) {
      reject(e instanceof Error ? e : new Error("Error al componer la imagen del partido"));
    }
  });
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "partido"
  );
}

export async function shareMatch(m: MatchSummary): Promise<ShareResult> {
  const url = typeof window !== "undefined" ? window.location.href : undefined;
  const blob = await composeMatchCard(m, url);
  const title = `${m.home_team} ${m.home_score}-${m.away_score} ${m.away_team}`;
  return shareCardBlob(blob, {
    filename: `${slug(`${m.home_team}-${m.away_team}`)}-mundial-2026.png`,
    title: `${title} · Métricas LPF`,
    text: `${title} — ${m.insight}`,
    url,
  });
}

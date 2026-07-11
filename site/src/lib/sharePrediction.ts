// Tarjeta de marca para compartir una PREDICCIÓN por WhatsApp, 100% en cliente
// sobre <canvas>. Muestra el cruce completo: goles esperados, barra de
// probabilidad 1-X-2, marcadores más probables, Fuerza y el escenario clave, con
// el aviso de que es un modelo heurístico. Reusa shareCardBlob() para la hoja
// nativa de compartir / descarga. Sin emojis en el canvas (no renderizan fiable).

import { shareCardBlob, type ShareResult } from "./shareCard";

const W = 1080;
const PAD = 72;
const BRAND = "#15a94f";
const BRAND_DEEP = "#0a7a39";
const FOOTER = "#043c1e";
const WHITE = "#ffffff";
const SOFT = "rgba(255,255,255,0.92)";
const SOFTER = "rgba(255,255,255,0.64)";
const DRAW = "#7c8a83";

export interface PredictionCardData {
  teamA: string;
  teamB: string;
  colorA: string;
  colorB: string;
  xA: number;
  xB: number;
  probs: [number, number, number]; // A, empate, B (enteros que suman 100)
  topScores: { a: number; b: number; p: number }[];
  fuerzaA: number;
  fuerzaB: number;
  /** Sub-índices (mismos que muestra la app): Físico, Ofensivo, Control, Defensivo, Individual. */
  breakdown: { label: string; a: number; b: number }[];
  /** Todos los escenarios de "cómo se puede desarrollar". */
  scenarios: string[];
  url?: string;
}

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
  let i = 0;
  for (; i < words.length; i++) {
    const trial = cur ? `${cur} ${words[i]}` : words[i];
    if (ctx.measureText(trial).width <= maxW || !cur) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = words[i];
      if (lines.length === maxLines - 1) {
        i++;
        break;
      }
    }
  }
  // lo que sobró (si se cortó por maxLines) va a la última línea, recortada con …
  const rest = words.slice(i).join(" ");
  if (rest) cur = `${cur} ${rest}`;
  if (cur) lines.push(clip(ctx, cur, maxW));
  return lines;
}

const SCEN_FONT = `500 27px system-ui, -apple-system, Roboto, sans-serif`;
const SCEN_LH = 37;

export function composePredictionCard(d: PredictionCardData): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas no disponible"));
      const innerW = W - PAD * 2;

      // --- posiciones fijas de la parte superior ---
      const barY = 400;
      const barH = 60;
      const legY = barY + barH + 44; // 504
      const scY = legY + 74; // 578 (marcadores)
      const fY = scY + 128; // 706 (Fuerza)
      const bdTop = fY + 96; // 802 (arranca el desglose)
      const rowH = 50;
      const bdBottom = bdTop + d.breakdown.length * rowH;
      const scenHeadY = bdBottom + 40;
      const scenFirstY = scenHeadY + 46;

      // --- medir escenarios para el alto dinámico ---
      ctx.font = SCEN_FONT;
      const scenLines = d.scenarios.map((s) => wrap(ctx, s, innerW - 34, 3));
      const scenBlockH = scenLines.reduce((sum, ls) => sum + ls.length * SCEN_LH + 18, 0);
      const footerH = 88;
      const totalH = scenFirstY + scenBlockH + 24 + footerH;

      canvas.width = W;
      canvas.height = totalH;

      // fondo
      const g = ctx.createLinearGradient(0, 0, 0, totalH);
      g.addColorStop(0, BRAND);
      g.addColorStop(1, BRAND_DEEP);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, totalH);
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(W - 70, 130, 210, 0, Math.PI * 2);
      ctx.stroke();
      ctx.textBaseline = "alphabetic";

      // kicker
      ctx.textAlign = "left";
      ctx.fillStyle = SOFTER;
      ctx.font = `700 26px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.fillText("MÉTRICAS MUNDIAL 2026 · PREDICCIÓN", PAD, 82);

      // equipos
      ctx.font = `800 46px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillStyle = d.colorA;
      ctx.fillText(clip(ctx, d.teamA, innerW / 2 - 60), PAD, 168);
      ctx.textAlign = "right";
      ctx.fillStyle = d.colorB;
      ctx.fillText(clip(ctx, d.teamB, innerW / 2 - 60), W - PAD, 168);
      ctx.textAlign = "center";
      ctx.fillStyle = SOFTER;
      ctx.font = `600 30px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.fillText("vs", W / 2, 162);

      // goles esperados
      ctx.textAlign = "center";
      ctx.fillStyle = WHITE;
      ctx.font = `800 110px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.fillText(`${round1(d.xA)} – ${round1(d.xB)}`, W / 2, 300);
      ctx.fillStyle = SOFTER;
      ctx.font = `500 26px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.fillText("goles esperados por el modelo", W / 2, 344);

      // barra de probabilidad 1-X-2
      ctx.save();
      roundRect(ctx, PAD, barY, innerW, barH, 16);
      ctx.clip();
      const segs = [
        { w: d.probs[0], c: d.colorA, label: `${d.probs[0]}%` },
        { w: d.probs[1], c: DRAW, label: `${d.probs[1]}%` },
        { w: d.probs[2], c: d.colorB, label: `${d.probs[2]}%` },
      ];
      let x = PAD;
      for (const s of segs) {
        const w = (innerW * s.w) / 100;
        ctx.fillStyle = s.c;
        ctx.fillRect(x, barY, w, barH);
        x += w;
      }
      ctx.restore();
      x = PAD;
      ctx.textBaseline = "middle";
      ctx.font = `800 30px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.fillStyle = WHITE;
      for (const s of segs) {
        const w = (innerW * s.w) / 100;
        if (s.w >= 9) {
          ctx.textAlign = "center";
          ctx.fillText(s.label, x + w / 2, barY + barH / 2 + 2);
        }
        x += w;
      }
      ctx.textBaseline = "alphabetic";

      // leyenda
      ctx.font = `600 26px system-ui, -apple-system, Roboto, sans-serif`;
      const legend = [
        { c: d.colorA, t: `${clip(ctx, d.teamA, 240)} ganar` },
        { c: DRAW, t: "Empate" },
        { c: d.colorB, t: `${clip(ctx, d.teamB, 240)} ganar` },
      ];
      const dot = 20;
      const gap = 18;
      const itemGap = 40;
      const widths = legend.map((l) => dot + gap + ctx.measureText(l.t).width);
      const totalLeg = widths.reduce((a, b) => a + b, 0) + itemGap * 2;
      let lx = W / 2 - totalLeg / 2;
      legend.forEach((l, i) => {
        ctx.fillStyle = l.c;
        roundRect(ctx, lx, legY - dot + 4, dot, dot, 5);
        ctx.fill();
        ctx.fillStyle = SOFT;
        ctx.textAlign = "left";
        ctx.fillText(l.t, lx + dot + gap, legY);
        lx += widths[i] + itemGap;
      });

      // marcadores
      ctx.textAlign = "center";
      ctx.fillStyle = SOFTER;
      ctx.font = `600 26px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.fillText("MARCADORES MÁS PROBABLES", W / 2, scY);
      ctx.fillStyle = WHITE;
      ctx.font = `700 40px ui-monospace, Menlo, monospace`;
      const chips = d.topScores.slice(0, 3).map((s) => `${s.a}-${s.b} (${Math.round(s.p * 100)}%)`).join("    ");
      ctx.fillText(clip(ctx, chips, innerW), W / 2, scY + 52);

      // Fuerza (número grande) + desglose de sub-índices
      ctx.font = `500 26px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.fillStyle = SOFTER;
      ctx.textAlign = "center";
      ctx.fillText("FUERZA · rendimiento observado", W / 2, fY);
      ctx.font = `800 50px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillStyle = d.colorA;
      ctx.fillText(String(d.fuerzaA), PAD, fY + 52);
      ctx.textAlign = "right";
      ctx.fillStyle = d.colorB;
      ctx.fillText(String(d.fuerzaB), W - PAD, fY + 52);

      // sub-índices: [val A][barra A]  etiqueta  [barra B][val B], ganador resaltado
      const sbW = 150;
      const sbH = 8;
      d.breakdown.forEach((r, i) => {
        const by = bdTop + i * rowH + 30;
        const barMid = by - 10;
        const aBest = r.a > r.b;
        const bBest = r.b > r.a;
        // etiqueta
        ctx.textAlign = "center";
        ctx.fillStyle = SOFT;
        ctx.font = `500 25px system-ui, -apple-system, Roboto, sans-serif`;
        ctx.fillText(clip(ctx, r.label, innerW - (sbW + 70) * 2), W / 2, by);
        // A
        ctx.textAlign = "left";
        ctx.font = `${aBest ? 800 : 600} 27px ui-monospace, Menlo, monospace`;
        ctx.fillStyle = aBest ? d.colorA : SOFT;
        ctx.fillText(String(r.a), PAD, by);
        const aBarX = PAD + 52;
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        roundRect(ctx, aBarX, barMid, sbW, sbH, 4);
        ctx.fill();
        ctx.fillStyle = d.colorA;
        roundRect(ctx, aBarX, barMid, Math.max(4, (sbW * clampPct(r.a)) / 100), sbH, 4);
        ctx.fill();
        // B
        ctx.textAlign = "right";
        ctx.font = `${bBest ? 800 : 600} 27px ui-monospace, Menlo, monospace`;
        ctx.fillStyle = bBest ? d.colorB : SOFT;
        ctx.fillText(String(r.b), W - PAD, by);
        const bBarX = W - PAD - 52 - sbW;
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        roundRect(ctx, bBarX, barMid, sbW, sbH, 4);
        ctx.fill();
        const bFill = Math.max(4, (sbW * clampPct(r.b)) / 100);
        ctx.fillStyle = d.colorB;
        roundRect(ctx, bBarX + sbW - bFill, barMid, bFill, sbH, 4);
        ctx.fill();
      });

      // escenarios (todos)
      ctx.textAlign = "left";
      ctx.fillStyle = SOFTER;
      ctx.font = `700 24px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.fillText("CÓMO SE PUEDE DESARROLLAR", PAD, scenHeadY);
      let cy = scenFirstY;
      scenLines.forEach((lines) => {
        // viñeta
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.arc(PAD + 6, cy - 9, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = SOFT;
        ctx.font = SCEN_FONT;
        lines.forEach((ln, li) => ctx.fillText(ln, PAD + 30, cy + li * SCEN_LH));
        cy += lines.length * SCEN_LH + 18;
      });

      // pie
      ctx.fillStyle = FOOTER;
      ctx.fillRect(0, totalH - footerH, W, footerH);
      let urlText = "";
      let urlW = 0;
      if (d.url) {
        ctx.font = `500 22px ui-monospace, Menlo, monospace`;
        urlText = clip(ctx, d.url.replace(/^https?:\/\//, "").replace(/\/$/, ""), innerW * 0.4);
        urlW = ctx.measureText(urlText).width;
      }
      ctx.fillStyle = WHITE;
      ctx.font = `700 24px system-ui, -apple-system, Roboto, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(clip(ctx, "modelo por rendimiento · no es una predicción profesional", innerW - urlW - 24), PAD, totalH - 34);
      if (urlText) {
        ctx.fillStyle = SOFTER;
        ctx.font = `500 22px ui-monospace, Menlo, monospace`;
        ctx.textAlign = "right";
        ctx.fillText(urlText, W - PAD, totalH - 33);
      }

      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen"))), "image/png");
    } catch (e) {
      reject(e instanceof Error ? e : new Error("Error al componer la predicción"));
    }
  });
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

const round1 = (v: number) => Math.round(v * 10) / 10;

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "prediccion"
  );
}

export async function sharePrediction(d: PredictionCardData): Promise<ShareResult> {
  const url = typeof window !== "undefined" ? window.location.href : undefined;
  const blob = await composePredictionCard({ ...d, url: d.url ?? url });
  const title = `${d.teamA} vs ${d.teamB} · predicción`;
  const text = `${d.teamA} ${d.probs[0]}% · empate ${d.probs[1]}% · ${d.teamB} ${d.probs[2]}% — predicción por rendimiento · Métricas Mundial 2026`;
  return shareCardBlob(blob, {
    filename: `prediccion-${slug(d.teamA)}-vs-${slug(d.teamB)}.png`,
    title,
    text,
    url,
  });
}

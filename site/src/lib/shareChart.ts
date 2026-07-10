// Compositor de "tarjeta para compartir" a partir de un GRÁFICO real.
// A diferencia de shareCard.ts (que dibuja una tarjeta de estadísticas
// sintética), acá tomamos el PNG del propio chart de ECharts (getDataURL) y lo
// montamos en un marco de marca "cancha" (verde) con encabezado, panel del
// gráfico, lectura automática opcional y pie con la URL. Así lo que se comparte
// por WhatsApp ES el gráfico que el usuario está viendo, con contexto y marca.
//
// 100% cliente, sin dependencias ni APIs pagas. Reutiliza shareCardBlob() de
// shareCard.ts para el share nativo / descarga.

const W = 1080;
const PAD = 64;

// Paleta fija de marca (igual que shareCard.ts) para que la imagen se vea
// siempre consistente sin importar el tema del visitante.
const BRAND = "#15a94f";
const BRAND_STRONG = "#0a7a39";
const FOOTER = "#043c1e";
const WHITE = "#ffffff";
const SOFT = "rgba(255,255,255,0.92)";
const SOFTER = "rgba(255,255,255,0.66)";

export interface ChartCardData {
  /** PNG del gráfico (data URL de echarts getDataURL). */
  chartDataUrl: string;
  /** Título de la tarjeta (qué muestra el gráfico). */
  title: string;
  /** Segunda línea de contexto. */
  subtitle?: string;
  /** Lectura automática / conclusión corta (se envuelve hasta 3 líneas). */
  insight?: string;
  /** URL a mostrar en el pie. */
  url?: string;
  /** Color de superficie con el que se exportó el gráfico (para pintar el panel
   *  del mismo color y que la imagen sea legible en claro y oscuro). */
  panelBg: string;
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

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number, minPx: number, weight = "800") {
  let px = startPx;
  const family = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  do {
    ctx.font = `${weight} ${px}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 3;
  } while (px > minPx);
  return px;
}

function clip(ctx: CanvasRenderingContext2D, s: string, max: number) {
  if (ctx.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 4 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(trial).width <= maxWidth || !cur) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  // si quedó texto sin entrar, marcar con elipsis en la última línea
  const consumed = lines.join(" ");
  if (consumed.length < text.length && lines.length) {
    lines[lines.length - 1] = clip(ctx, lines[lines.length - 1] + "…", maxWidth);
  }
  return lines;
}

export function composeChartCard(data: ChartCardData): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        // se fija width y una height provisoria solo para poder medir texto;
        // al re-asignar height más abajo el contexto se reinicia (se dibuja
        // después de fijar el tamaño definitivo).
        canvas.width = W;
        canvas.height = 100;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas no disponible"));

        const innerW = W - PAD * 2;
        const imgAreaW = innerW - 32;
        const scale = imgAreaW / img.width;
        const chartH = Math.round(img.height * scale);

        // --- medición del encabezado ---
        const kickerY = 96;
        const titlePx = fitFont(ctx, data.title, innerW, 62, 40, "800");
        const titleY = kickerY + 30 + titlePx;
        const subY = data.subtitle ? titleY + 44 : titleY;
        const headerH = subY + 40;

        // --- panel del gráfico ---
        const panelY = headerH;
        const panelH = chartH + 32;

        // --- lectura automática (opcional) ---
        let insightLines: string[] = [];
        if (data.insight) {
          ctx.font = `500 28px system-ui, -apple-system, Roboto, sans-serif`;
          insightLines = wrapLines(ctx, data.insight, innerW, 3);
        }
        const insightH = insightLines.length ? insightLines.length * 38 + 28 : 0;

        const footerH = 92;
        const totalH = panelY + panelH + insightH + 28 + footerH;

        // --- tamaño definitivo y dibujo ---
        canvas.height = totalH;

        // fondo verde de marca
        const g = ctx.createLinearGradient(0, 0, 0, totalH);
        g.addColorStop(0, BRAND);
        g.addColorStop(1, BRAND_STRONG);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, totalH);

        // guiño de cancha: círculo tenue arriba a la derecha
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(W - 70, 120, 200, 0, Math.PI * 2);
        ctx.stroke();

        // encabezado
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = SOFTER;
        ctx.font = `700 28px system-ui, -apple-system, Roboto, sans-serif`;
        ctx.fillText("MÉTRICAS MUNDIAL 2026", PAD, kickerY);

        ctx.fillStyle = WHITE;
        ctx.font = `800 ${titlePx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText(clip(ctx, data.title, innerW), PAD, titleY);

        if (data.subtitle) {
          ctx.fillStyle = SOFT;
          ctx.font = `500 32px system-ui, -apple-system, Roboto, sans-serif`;
          ctx.fillText(clip(ctx, data.subtitle, innerW), PAD, subY);
        }

        // panel del gráfico (mismo color con el que se exportó -> legible en
        // claro y oscuro) + el PNG del chart adentro
        ctx.fillStyle = data.panelBg || WHITE;
        roundRect(ctx, PAD, panelY, innerW, panelH, 24);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 2;
        roundRect(ctx, PAD, panelY, innerW, panelH, 24);
        ctx.stroke();
        ctx.drawImage(img, PAD + 16, panelY + 16, imgAreaW, chartH);

        // lectura automática
        if (insightLines.length) {
          ctx.fillStyle = SOFT;
          ctx.font = `500 28px system-ui, -apple-system, Roboto, sans-serif`;
          let y = panelY + panelH + 46;
          for (const line of insightLines) {
            ctx.fillText(line, PAD, y);
            y += 38;
          }
        }

        // pie con marca + URL (medido para no superponerse)
        ctx.fillStyle = FOOTER;
        ctx.fillRect(0, totalH - footerH, W, footerH);
        const urlFont = `500 24px ui-monospace, Menlo, monospace`;
        let urlText = "";
        let urlWidth = 0;
        if (data.url) {
          ctx.font = urlFont;
          urlText = data.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
          urlText = clip(ctx, urlText, innerW * 0.42);
          urlWidth = ctx.measureText(urlText).width;
        }
        ctx.font = `700 27px system-ui, -apple-system, Roboto, sans-serif`;
        ctx.fillStyle = WHITE;
        ctx.textAlign = "left";
        const foot = clip(ctx, "⚽ datos abiertos · metodología a la vista", innerW - (urlWidth ? urlWidth + 24 : 0));
        ctx.fillText(foot, PAD, totalH - 34);
        if (urlText) {
          ctx.fillStyle = SOFTER;
          ctx.font = urlFont;
          ctx.textAlign = "right";
          ctx.fillText(urlText, W - PAD, totalH - 33);
          ctx.textAlign = "left";
        }

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("No se pudo generar la imagen"));
        }, "image/png");
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Error al componer la imagen"));
      }
    };
    img.onerror = () => reject(new Error("No se pudo cargar el gráfico"));
    img.src = data.chartDataUrl;
  });
}

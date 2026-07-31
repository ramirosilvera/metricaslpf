// Generador de tarjeta para compartir (imagen PNG) 100% en el cliente.
// Sin dependencias ni APIs pagas: dibuja sobre <canvas> con los datos que ya
// están en la página (bandera, nombre, 1-3 métricas) y produce un Blob PNG.
// En móviles con soporte usa navigator.share({ files }) -> hoja nativa (WhatsApp,
// etc.); si no, cae a descarga del archivo. Estética alineada a la marca
// "cancha/transmisión" (verde) para que se vea consistente en cualquier tema.

export interface ShareStat {
  label: string;
  value: string;
}

export interface ShareCardData {
  /** Nombre principal (jugador o selección). */
  title: string;
  /** Segunda línea (posición · club, o estado del torneo). */
  subtitle?: string;
  /** Bandera emoji. */
  flag?: string;
  /** Hasta 3 métricas destacadas. */
  stats: ShareStat[];
  /** Frase inferior corta (opcional). */
  tagline?: string;
  /** URL a mostrar en el pie. */
  url?: string;
}

// Paleta fija de marca (independiente del tema del visitante) para que la
// imagen compartida se vea siempre igual.
const C = {
  brand: "#1d5fd6",
  brandStrong: "#123a86",
  ink: "#050d1a",
  white: "#ffffff",
  soft: "rgba(255,255,255,0.90)",
  softer: "rgba(255,255,255,0.62)",
  tile: "rgba(255,255,255,0.10)",
  tileBorder: "rgba(255,255,255,0.22)",
  footer: "#0b2d6b",
};

const W = 1080;
const H = 1080;

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

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number, minPx: number, weight = "800") {
  let px = startPx;
  do {
    ctx.font = `${weight} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 4;
  } while (px > minPx);
  return px;
}

export function renderShareCard(data: ShareCardData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas no disponible"));

  // Fondo con gradiente vertical de marca.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.brand);
  g.addColorStop(1, C.brandStrong);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Círculo central tenue (guiño a la cancha) en la esquina.
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(W - 80, 150, 220, 0, Math.PI * 2);
  ctx.stroke();

  const PAD = 80;
  const INNER = W - PAD * 2;
  const clip = (s: string, max: number) => {
    if (ctx.measureText(s).width <= max) return s;
    let t = s;
    while (t.length > 4 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
    return t + "…";
  };

  // Kicker.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = C.softer;
  ctx.font = `700 30px system-ui, -apple-system, Roboto, sans-serif`;
  ctx.fillText("MÉTRICAS LPF", PAD, 120);

  // Bandera (emoji grande). Baseline en 250 -> ocupa ~150-250.
  if (data.flag) {
    ctx.font = `96px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui`;
    ctx.fillStyle = C.white;
    ctx.fillText(data.flag, PAD, 250);
  }

  // Título (nombre) — ajusta tamaño para no desbordar.
  const titlePx = fitText(ctx, data.title, INNER, 84, 44);
  ctx.fillStyle = C.white;
  ctx.font = `800 ${titlePx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const titleY = data.flag ? 380 : 320;
  ctx.fillText(clip(data.title, INNER), PAD, titleY);

  // Subtítulo.
  if (data.subtitle) {
    ctx.fillStyle = C.soft;
    ctx.font = `500 36px system-ui, -apple-system, Roboto, sans-serif`;
    ctx.fillText(clip(data.subtitle, INNER), PAD, titleY + 56);
  }

  // Tarjetas de métricas (hasta 3, apiladas). Geometría calculada para no
  // chocar con la franja de pie ni con el tagline.
  const stats = data.stats.slice(0, 3);
  const tileH = 128;
  const gap = 20;
  const tilesTop = 520;
  const tilesBottom = tilesTop + stats.length * (tileH + gap) - gap;
  stats.forEach((s, i) => {
    const y = tilesTop + i * (tileH + gap);
    ctx.fillStyle = C.tile;
    roundRect(ctx, PAD, y, INNER, tileH, 22);
    ctx.fill();
    ctx.strokeStyle = C.tileBorder;
    ctx.lineWidth = 2;
    roundRect(ctx, PAD, y, INNER, tileH, 22);
    ctx.stroke();

    const mid = y + tileH / 2;
    // valor (mono, grande) a la derecha, centrado verticalmente
    ctx.fillStyle = C.white;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const valPx = fitText(ctx, s.value, INNER / 2 - 40, 60, 32, "800");
    ctx.font = `800 ${valPx}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    ctx.fillText(s.value, W - PAD - 34, mid + 2);

    // etiqueta a la izquierda
    ctx.textAlign = "left";
    ctx.fillStyle = C.soft;
    ctx.font = `600 30px system-ui, -apple-system, Roboto, sans-serif`;
    ctx.fillText(clip(s.label, INNER / 2), PAD + 34, mid + 2);
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // tagline opcional: solo si hay espacio real bajo las tarjetas (<=2 métricas).
  if (data.tagline && tilesBottom + 70 < H - 120) {
    ctx.fillStyle = C.softer;
    ctx.font = `500 28px system-ui, -apple-system, Roboto, sans-serif`;
    ctx.fillText(clip(data.tagline, INNER), PAD, tilesBottom + 62);
  }

  // Franja de pie con marca / URL. Se reserva espacio para ambos textos en la
  // misma línea para que nunca se superpongan (medido antes de dibujar).
  ctx.fillStyle = C.footer;
  ctx.fillRect(0, H - 92, W, 92);

  const footFont = `700 28px system-ui, -apple-system, Roboto, sans-serif`;
  const urlFont = `500 24px ui-monospace, Menlo, monospace`;
  let urlText = "";
  let urlWidth = 0;
  if (data.url) {
    ctx.font = urlFont;
    urlText = data.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    urlWidth = ctx.measureText(urlText).width;
    // si es muy larga, se recorta a un tercio del ancho disponible
    urlText = clip(urlText, INNER * 0.4);
    urlWidth = ctx.measureText(urlText).width;
  }
  const gapFoot = 24;
  ctx.font = footFont;
  ctx.fillStyle = C.white;
  const footText = clip("⚽ datos abiertos · metodología a la vista", INNER - (urlWidth ? urlWidth + gapFoot : 0));
  ctx.textAlign = "left";
  ctx.fillText(footText, PAD, H - 34);
  if (urlText) {
    ctx.fillStyle = C.softer;
    ctx.font = urlFont;
    ctx.textAlign = "right";
    ctx.fillText(urlText, W - PAD, H - 33);
    ctx.textAlign = "left";
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("No se pudo generar la imagen"));
    }, "image/png");
  });
}

export type ShareResult = "shared" | "downloaded";

// Comparte el Blob como archivo si el navegador lo soporta (hoja nativa ->
// WhatsApp/Instagram/etc.); si no, descarga el PNG. Devuelve qué camino tomó.
export async function shareCardBlob(
  blob: Blob,
  opts: { filename: string; title: string; text: string; url?: string },
): Promise<ShareResult> {
  const file = new File([blob], opts.filename, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data?: ShareData) => Promise<void>;
  };

  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: opts.title, text: opts.text });
      return "shared";
    } catch (err) {
      // Cancelación del usuario: no es error real, no forzamos descarga.
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
      // Cualquier otro fallo: caemos a descarga.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}

import { rgbToHsl } from "./color";
import type { HSL } from "./types";

const MAX_LADO = 800;
const CALIDAD_WEBP = 0.8;

export interface FotoProcesada {
  color: HSL;
  blob: Blob;
}

/**
 * Procesa una foto de prenda: la orienta según EXIF (createImageBitmap ya lo
 * hace solo con imageOrientation:"from-image"), la redimensiona a ~800px de
 * lado mayor, extrae el color dominante del área central, y devuelve el
 * blob WebP comprimido listo para subir -- el mismo canvas hace las dos
 * cosas, no hay paso extra.
 *
 * Sin esto, una foto de celular sin comprimir (3-6MB) agotaría el free tier
 * de Storage/egress de Supabase en pocas decenas de prendas.
 */
export async function procesarFoto(file: File): Promise<FotoProcesada> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener contexto 2D de canvas");
  ctx.drawImage(bitmap, 0, 0, w, h);

  const color = muestrearColorCentral(ctx, w, h);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo generar el blob WebP"))),
      "image/webp",
      CALIDAD_WEBP,
    );
  });

  return { color, blob };
}

/** Promedia los píxeles de un óvalo central (evita fondo) y convierte a HSL. */
function muestrearColorCentral(ctx: CanvasRenderingContext2D, w: number, h: number): HSL {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w * 0.25;
  const ry = h * 0.25;

  const x0 = Math.max(0, Math.round(cx - rx));
  const y0 = Math.max(0, Math.round(cy - ry));
  const sw = Math.min(w, Math.round(rx * 2));
  const sh = Math.min(h, Math.round(ry * 2));

  const { data } = ctx.getImageData(x0, y0, sw, sh);

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  // Solo píxeles dentro de la elipse (no del rectángulo que la contiene).
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const dx = (x - sw / 2) / (sw / 2);
      const dy = (y - sh / 2) / (sh / 2);
      if (dx * dx + dy * dy > 1) continue;
      const i = (y * sw + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }

  if (n === 0) return { h: 0, s: 0, l: 50 };
  return rgbToHsl(r / n, g / n, b / n);
}

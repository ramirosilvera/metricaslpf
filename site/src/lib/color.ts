import type { HSL } from "./types";

/** '#RRGGBB' (o '#RGB') -> {r,g,b} en 0-255. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/** RGB (0-255) -> HSL (h: 0-360, s/l: 0-100). */
export function rgbToHsl(r: number, g: number, b: number): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }

  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  switch (max) {
    case rn:
      h = ((gn - bn) / d) % 6;
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
  }
  h *= 60;
  if (h < 0) h += 360;

  // % 360 tras el redondeo: Math.round(359.6) = 360, que viola el CHECK
  // color_h < 360 del schema (0006_armario_schema.sql) -- se dispara con
  // rojos reales (ej. #FF0002), no un caso de laboratorio.
  return { h: Math.round(h) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** HSL (h: 0-360, s/l: 0-100) -> RGB (0-255). */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;

  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];

  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 };
}

export function hexToHsl(hex: string): HSL {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

export function hslToHex(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

// Pedido explícito del usuario: marrón y beige son colores centrales en
// indumentaria (cuero, gabardina, chino, sweater) y NO son "naranja" en el
// uso real de la moda, aunque compartan la misma familia de matiz (rojo-
// anaranjado a amarillo-anaranjado, h 15-49 -- el mismo rango que ya usaba
// "Naranja"). Lo que distingue un naranja de verdad de un marrón/beige es
// la SATURACIÓN, no el matiz: un naranja de indumentaria real (una campera
// de seguridad, un buzo naranja liso) es vívido; marrón y beige son, por
// definición, colores TERROSOS -- se obtienen mezclando ese mismo matiz con
// negro/gris, así que nunca llegan a esa saturación. Auditado contra el
// catálogo completo + el placard real del usuario (ver conversación): hoy,
// sin excepción, todo color en este rango de matiz es marrón o beige real
// (cuero, chino, sweater) -- ninguno es un naranja de verdad -- y el máximo
// de saturación real encontrado fue 47. 60 deja margen de sobra sin
// arriesgar clasificar un naranja vívido como marrón (test explícito: h=30
// s=80 sigue siendo "Naranja").
const SATURACION_NARANJA_REAL = 60;

// Azul marino -- mismo motivo: es el color más común de la ropa de vestir
// (pantalón/sweater/campera "azul marino" del catálogo) pero nombreColor()
// le ponía "Azul oscuro", una inconsistencia real con el nombre que la
// propia prenda ya usa. Rango acotado al azul oscuro Y saturado real que
// existe en catálogo+placard (h=222, s=37, l=19): un azul intenso, no
// cualquier azul oscuro -- uno muy desaturado ya cae en el bucket de gris
// más arriba, así que no hay solapamiento.
const AZUL_MARINO_HUE_MIN = 210;
const AZUL_MARINO_HUE_MAX = 230;
const AZUL_MARINO_L_MAX = 30;

/** Nombre de color en español, para no depender solo del color renderizado
 *  del ícono -- con poco brillo de pantalla dos colores parecidos se leen
 *  igual. Los umbrales de "neutro" (s<=15, l<=12, l>=88) son los mismos que
 *  usa el algoritmo de combinación en recommend.ts (esNeutro), repetidos acá
 *  a propósito para no crear una dependencia cruzada entre este archivo
 *  (utilidades de color puras) y la lógica de recomendación -- si se tocan
 *  ahí, hay que tocarlos acá también. */
export function nombreColor(h: number, s: number, l: number): string {
  if (l <= 12) return "Negro";
  if (l >= 88) return s <= 15 ? "Blanco" : "Blanco roto";
  if (s <= 15) {
    if (l < 35) return "Gris oscuro";
    if (l < 65) return "Gris";
    return "Gris claro";
  }

  if (h >= 15 && h < 50 && s < SATURACION_NARANJA_REAL) {
    if (l >= 65) return "Beige";
    return l < 30 ? "Marrón oscuro" : "Marrón";
  }

  if (h >= AZUL_MARINO_HUE_MIN && h < AZUL_MARINO_HUE_MAX && l < AZUL_MARINO_L_MAX) {
    return "Azul marino";
  }

  const matiz =
    h < 15 || h >= 345
      ? "Rojo"
      : h < 45
        ? "Naranja"
        : h < 65
          ? "Amarillo"
          : h < 160
            ? "Verde"
            : h < 195
              ? "Turquesa"
              : h < 250
                ? "Azul"
                : h < 290
                  ? "Violeta"
                  : h < 330
                    ? "Magenta"
                    : "Rosa";

  if (l < 30) return `${matiz} oscuro`;
  if (l > 78) return `${matiz} claro`;
  return matiz;
}

/** Contorno de una prenda derivado de su propio matiz (Maniqui.tsx), en vez
 *  de un gris genérico -- un contorno negro al 15% es invisible sobre una
 *  prenda oscura y casi invisible sobre una blanca; uno del mismo matiz,
 *  más oscuro y algo más saturado, se ve en cualquier prenda. clamp(l, 4,
 *  92) evita blanco puro (l=100 -18 -> 82, aceptable) y negro puro sin
 *  contorno visible (l=0 -18 -> clampeado a 4, no a un negativo sin
 *  sentido para hsl()). */
export function contornoHsl(h: number, s: number, l: number): string {
  const s2 = Math.min(100, s + 5);
  const l2 = Math.max(4, Math.min(92, l) - 18);
  return `hsl(${h} ${s2}% ${l2}%)`;
}

/** Tono más oscuro del mismo matiz, para el lado "sombra" de un degradé
 *  simple de dos paradas que le da algo de volumen a una prenda de color
 *  plano (Maniqui.tsx) sin necesitar texturas ni assets. */
export function sombraHsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${Math.max(2, l - 10)}%)`;
}

/** Tono más claro del mismo matiz, lado "luz" del degradé de sombraHsl. */
export function luzHsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${Math.min(98, l + 7)}%)`;
}

/** Tono de "detalle" (cuello, dobladillo, cinturilla) con contraste
 *  garantizado contra la prenda, sea cual sea su color real -- reporte
 *  real del usuario en una prenda negra (Maniqui.tsx): sombraHsl sola no
 *  alcanza para un color ya oscuro, porque restarle 10% de luz más lo deja
 *  casi en el mismo tono que el propio degradé de sombra de la prenda
 *  (que ya llega hasta l-10) -- el cuello se volvía casi invisible. Acá,
 *  si la prenda es clara (l>=50) se oscurece bastante (como una sombra
 *  marcada); si es oscura, se ACLARA en vez de oscurecer más -- mismo
 *  criterio que un pliegue de tela real, que puede leerse por sombra o
 *  por brillo según de qué lado cae la luz, pero elegido acá por
 *  contraste garantizado, no por estética. */
export function detalleHsl(h: number, s: number, l: number): string {
  if (l >= 50) return `hsl(${h} ${s}% ${Math.max(4, l - 25)}%)`;
  return `hsl(${h} ${Math.min(100, s + 10)}% ${Math.min(92, l + 22)}%)`;
}

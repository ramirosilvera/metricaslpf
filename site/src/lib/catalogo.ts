import type { Categoria, Estacion, Estilo, Ocasion, Prenda, Textura } from "./types";
import { hexToHsl } from "./color";

export interface PresetPrenda {
  id: string;
  nombre: string;
  categoria: Categoria;
  colorHex: string;
  textura?: Textura;
  estilo?: Estilo;
  ocasion?: Ocasion;
  estacion?: Estacion;
  /** Ver Prenda.suela_contraste en types.ts. Solo tiene sentido en calzado;
   *  se omite (== false) en el resto de las categorías. */
  suelaContraste?: boolean;
}

/**
 * Catálogo fijo de prendas comunes, para agregar al placard con un toque en
 * vez de configurar categoría+color+tags a mano cada vez. Curado a
 * propósito, no generado -- criterios:
 *
 * - Cubre tanto casual como ropa de oficina (pedido explícito), en las 8
 *   categorías que soporta el placard.
 * - Colores reales y de uso común, no una paleta arcoíris -- para cada
 *   prenda, los 2-4 colores que de verdad se usan más (ej. camisa: blanca/
 *   celeste/negra, no "camisa violeta").
 * - `estilo`/`ocasion` se completan solo cuando son inequívocos para esa
 *   prenda (una camisa de oficina es "laburo" sin duda; un buzo, sea cual
 *   sea su color, es casual sin ambigüedad real -- por eso las 3 entradas
 *   de buzo sí llevan ocasion:"casual").
 * - `estacion` se deja SIEMPRE vacía: es la dimensión más dependiente del
 *   clima real de cada usuario (una remera blanca sirve en verano Y en
 *   entretiempo) -- forzar una estación acá haría más daño que bien.
 * - `textura` solo cuando el nombre de la prenda ya la implica sin
 *   ambigüedad (zapatos de cuero -> cuero_liso, jean -> denim, campera de
 *   pluma -> acolchado). Las zapatillas y las camperas "genéricas" (negra,
 *   verde militar) quedan sin textura a propósito: el material varía
 *   demasiado (cuero, lona, nylon...) para asumir uno sin inventar un dato
 *   que no es real.
 */
export const CATALOGO_PRENDAS: PresetPrenda[] = [
  // --- Remeras ---
  { id: "remera-blanca", nombre: "Remera blanca", categoria: "remera", colorHex: "#F5F5F0", textura: "algodon", estilo: "casual", ocasion: "casual" },
  { id: "remera-negra", nombre: "Remera negra", categoria: "remera", colorHex: "#1A1A1A", textura: "algodon", estilo: "casual", ocasion: "casual" },
  { id: "remera-gris", nombre: "Remera gris", categoria: "remera", colorHex: "#8C8C8C", textura: "algodon", estilo: "casual", ocasion: "casual" },
  { id: "remera-azul-marino", nombre: "Remera azul marino", categoria: "remera", colorHex: "#1F2A44", textura: "algodon", estilo: "casual", ocasion: "casual" },

  // --- Camisas (oficina) ---
  { id: "camisa-blanca", nombre: "Camisa blanca", categoria: "camisa", colorHex: "#FAFAF7", textura: "algodon", estilo: "clasico", ocasion: "laburo" },
  { id: "camisa-celeste", nombre: "Camisa celeste", categoria: "camisa", colorHex: "#B7D2EC", textura: "algodon", estilo: "clasico", ocasion: "laburo" },
  // "urbano" a propósito, no un descuido: una camisa negra lee más
  // "urban professional" que clásica, a diferencia de blanca/celeste/gris.
  { id: "camisa-negra", nombre: "Camisa negra", categoria: "camisa", colorHex: "#232323", textura: "algodon", estilo: "urbano", ocasion: "laburo" },
  { id: "camisa-gris", nombre: "Camisa gris", categoria: "camisa", colorHex: "#9A9A94", textura: "algodon", estilo: "clasico", ocasion: "laburo" },

  // --- Pantalones ---
  { id: "jean-azul", nombre: "Jean azul", categoria: "pantalon", colorHex: "#3B5998", textura: "denim", estilo: "casual", ocasion: "casual" },
  { id: "jean-negro", nombre: "Jean negro", categoria: "pantalon", colorHex: "#232323", textura: "denim", estilo: "casual", ocasion: "casual" },
  { id: "pantalon-vestir-negro", nombre: "Pantalón de vestir negro", categoria: "pantalon", colorHex: "#1A1A1A", textura: "lana", estilo: "formal", ocasion: "laburo" },
  { id: "pantalon-vestir-gris", nombre: "Pantalón de vestir gris", categoria: "pantalon", colorHex: "#6E6E6E", textura: "lana", estilo: "formal", ocasion: "laburo" },
  { id: "pantalon-vestir-azul", nombre: "Pantalón de vestir azul marino", categoria: "pantalon", colorHex: "#1F2A44", textura: "lana", estilo: "formal", ocasion: "laburo" },
  { id: "pantalon-beige", nombre: "Pantalón chino beige", categoria: "pantalon", colorHex: "#D8C7A1", textura: "algodon", estilo: "clasico", ocasion: "laburo" },

  // --- Buzos ---
  { id: "buzo-gris", nombre: "Buzo gris", categoria: "buzo", colorHex: "#8C8C8C", textura: "tejido_grueso", estilo: "casual", ocasion: "casual" },
  { id: "buzo-negro", nombre: "Buzo negro", categoria: "buzo", colorHex: "#1A1A1A", textura: "tejido_grueso", estilo: "casual", ocasion: "casual" },
  { id: "buzo-azul-marino", nombre: "Buzo azul marino", categoria: "buzo", colorHex: "#1F2A44", textura: "tejido_grueso", estilo: "casual", ocasion: "casual" },

  // --- Sweaters (oficina/vestir) ---
  { id: "sweater-gris", nombre: "Sweater gris", categoria: "sweater", colorHex: "#8C8C8C", textura: "lana", estilo: "clasico", ocasion: "laburo" },
  { id: "sweater-azul-marino", nombre: "Sweater azul marino", categoria: "sweater", colorHex: "#1F2A44", textura: "lana", estilo: "clasico", ocasion: "laburo" },
  { id: "sweater-bordo", nombre: "Sweater bordo", categoria: "sweater", colorHex: "#6B2737", textura: "lana", estilo: "clasico", ocasion: "laburo" },
  { id: "sweater-negro", nombre: "Sweater negro", categoria: "sweater", colorHex: "#232323", textura: "lana", estilo: "clasico", ocasion: "laburo" },

  // --- Calzado ---
  // Las zapatillas negras y marrones aparecen dos veces a propósito -- una
  // versión monocromática de verdad (suela a tono, tan real como la de
  // suela blanca) y otra con la suela de goma en blanco/crema, que es el
  // otro look real y común. Ninguna de las dos es "la correcta": conviven
  // como dos prendas distintas (`suelaContraste`, ver types.ts) para que el
  // catálogo no le imponga una sola variante a todas las zapatillas del
  // mismo color -- eso fue justamente el error de una revisión anterior.
  { id: "zapatillas-blancas", nombre: "Zapatillas blancas", categoria: "calzado", colorHex: "#F5F5F0", estilo: "urbano", ocasion: "casual" },
  { id: "zapatillas-negras", nombre: "Zapatillas negras", categoria: "calzado", colorHex: "#1A1A1A", estilo: "urbano", ocasion: "casual" },
  { id: "zapatillas-negras-suela-blanca", nombre: "Zapatillas negras (suela blanca)", categoria: "calzado", colorHex: "#1A1A1A", estilo: "urbano", ocasion: "casual", suelaContraste: true },
  { id: "zapatillas-grises", nombre: "Zapatillas grises", categoria: "calzado", colorHex: "#8C8C8C", estilo: "urbano", ocasion: "casual" },
  // marrón de gamuza/lona (mate), distinto del marrón de cuero lustroso de
  // los zapatos de vestir un par de líneas más abajo -- son materiales que
  // se ven distintos en la vida real, no el mismo color reusado sin razón.
  { id: "zapatillas-marrones", nombre: "Zapatillas marrones", categoria: "calzado", colorHex: "#6F4E37", estilo: "urbano", ocasion: "casual" },
  { id: "zapatillas-marrones-suela-blanca", nombre: "Zapatillas marrones (suela blanca)", categoria: "calzado", colorHex: "#6F4E37", estilo: "urbano", ocasion: "casual", suelaContraste: true },
  { id: "zapatos-cuero-negro", nombre: "Zapatos de cuero negros", categoria: "calzado", colorHex: "#1C1210", textura: "cuero_liso", estilo: "formal", ocasion: "laburo" },
  { id: "zapatos-cuero-marron", nombre: "Zapatos de cuero marrones", categoria: "calzado", colorHex: "#5C3A21", textura: "cuero_liso", estilo: "formal", ocasion: "laburo" },

  // --- Camperas ---
  { id: "campera-negra", nombre: "Campera negra", categoria: "campera", colorHex: "#1A1A1A", estilo: "urbano", ocasion: "casual" },
  { id: "campera-jean", nombre: "Campera de jean", categoria: "campera", colorHex: "#5B7FA6", textura: "denim", estilo: "casual", ocasion: "casual" },
  { id: "campera-verde-militar", nombre: "Campera verde militar", categoria: "campera", colorHex: "#5A5F3D", estilo: "urbano", ocasion: "casual" },
  // pluma/puffer (tipo Uniqlo) -- colores reusados de otras categorías, ver
  // criterio de "Accesorios" más abajo.
  { id: "campera-pluma-negra", nombre: "Campera de pluma negra", categoria: "campera", colorHex: "#1A1A1A", textura: "acolchado", estilo: "casual", ocasion: "casual" },
  { id: "campera-pluma-azul-marino", nombre: "Campera de pluma azul marino", categoria: "campera", colorHex: "#1F2A44", textura: "acolchado", estilo: "casual", ocasion: "casual" },
  { id: "campera-pluma-beige", nombre: "Campera de pluma beige", categoria: "campera", colorHex: "#D8C7A1", textura: "acolchado", estilo: "casual", ocasion: "casual" },

  // --- Accesorios ---
  // Reusa hex ya presentes en otras categorías (azul marino, bordo) a
  // propósito, no por pereza: mantiene la consistencia cross-categoría del
  // catálogo (una corbata azul marino combina con las prendas azul marino
  // ya cargadas, no con un azul ligeramente distinto).
  { id: "cinturon-negro", nombre: "Cinturón negro de cuero", categoria: "accesorio", colorHex: "#1A1A1A", textura: "cuero_liso", estilo: "clasico" },
  { id: "cinturon-marron", nombre: "Cinturón marrón de cuero", categoria: "accesorio", colorHex: "#5C3A21", textura: "cuero_liso", estilo: "clasico" },
  { id: "corbata-azul-marino", nombre: "Corbata azul marino", categoria: "accesorio", colorHex: "#1F2A44", textura: "seda", estilo: "formal", ocasion: "laburo" },
  { id: "corbata-bordo", nombre: "Corbata bordo", categoria: "accesorio", colorHex: "#6B2737", textura: "seda", estilo: "formal", ocasion: "laburo" },
  { id: "bufanda-gris", nombre: "Bufanda gris", categoria: "accesorio", colorHex: "#8C8C8C", textura: "lana", estilo: "casual", ocasion: "casual" },
];

/** Deriva h/s/l de cada preset una sola vez (no en cada render). */
export const CATALOGO_CON_HSL = CATALOGO_PRENDAS.map((p) => ({
  ...p,
  hsl: hexToHsl(p.colorHex),
}));

/** Convierte un preset del catálogo en una Prenda sintética -- misma forma
 *  que una fila real de Supabase, para poder pasarla a Maniqui/recomendar()
 *  sin que les importe que no está guardada. Se usa para mostrar "esto es
 *  lo que te sugerimos comprar" en Outfits (armarOutfitsParaComprar en
 *  recommend.ts). El id lleva el prefijo "sugerida-" a propósito: es lo que
 *  Outfits.tsx usa para marcar visualmente esa prenda como "no la tenés
 *  todavía" en el maniquí, y para no intentar guardarla como si fuera una
 *  prenda real del usuario. */
export function presetAPrendaSintetica(preset: PresetPrenda & { hsl: { h: number; s: number; l: number } }): Prenda {
  return {
    id: `sugerida-${preset.id}`,
    user_id: "",
    categoria: preset.categoria,
    color_hex: preset.colorHex,
    color_h: preset.hsl.h,
    color_s: preset.hsl.s,
    color_l: preset.hsl.l,
    textura: preset.textura ?? null,
    estilo: preset.estilo ?? null,
    ocasion: preset.ocasion ?? null,
    estacion: preset.estacion ?? null,
    foto_path: null,
    suela_contraste: preset.suelaContraste ?? false,
    created_at: "",
    updated_at: "",
  };
}

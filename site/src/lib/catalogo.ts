import type { Categoria, Estacion, Estilo, Ocasion, Textura } from "./types";
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
 *   ambigüedad (zapatos de cuero -> cuero_liso, jean -> denim). Las
 *   zapatillas y las camperas no-jean quedan sin textura a propósito: el
 *   material varía demasiado (cuero, lona, nylon...) para asumir uno sin
 *   inventar un dato que no es real.
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
  { id: "zapatillas-blancas", nombre: "Zapatillas blancas", categoria: "calzado", colorHex: "#F5F5F0", estilo: "urbano", ocasion: "casual" },
  { id: "zapatillas-negras", nombre: "Zapatillas negras", categoria: "calzado", colorHex: "#1A1A1A", estilo: "urbano", ocasion: "casual" },
  { id: "zapatos-cuero-negro", nombre: "Zapatos de cuero negros", categoria: "calzado", colorHex: "#1C1210", textura: "cuero_liso", estilo: "formal", ocasion: "laburo" },
  { id: "zapatos-cuero-marron", nombre: "Zapatos de cuero marrones", categoria: "calzado", colorHex: "#5C3A21", textura: "cuero_liso", estilo: "formal", ocasion: "laburo" },

  // --- Camperas ---
  { id: "campera-negra", nombre: "Campera negra", categoria: "campera", colorHex: "#1A1A1A", estilo: "urbano", ocasion: "casual" },
  { id: "campera-jean", nombre: "Campera de jean", categoria: "campera", colorHex: "#5B7FA6", textura: "denim", estilo: "casual", ocasion: "casual" },
  { id: "campera-verde-militar", nombre: "Campera verde militar", categoria: "campera", colorHex: "#5A5F3D", estilo: "urbano", ocasion: "casual" },

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

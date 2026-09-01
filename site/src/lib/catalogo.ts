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
  /** Ver Prenda.requiere_cuello en types.ts. Solo tiene sentido en
   *  accesorios tipo corbata; se omite (== false) en el resto. */
  requiereCuello?: boolean;
  /** Ver Prenda.posicion_accesorio en types.ts. Solo tiene sentido en
   *  categoria="accesorio"; se omite (== "cintura", cinturón) en el resto. */
  posicionAccesorio?: "cuello" | "cintura";
}

/**
 * Catálogo fijo de prendas comunes, para agregar al placard con un toque en
 * vez de configurar categoría+color+tags a mano cada vez. Curado a
 * propósito, no generado -- criterios:
 *
 * - Cubre casual, ropa de oficina, urbana, clásica y deportiva (pedido
 *   explícito -- el catálogo original no tenía NINGUNA prenda con estilo
 *   "deportivo"), en las 10 categorías que soporta el placard (incluye
 *   bermuda y short_deportivo, agregadas después junto con pantalon como
 *   las tres categorías de "piernas"). Ver CatalogoPicker.tsx para cómo se
 *   agrupa/filtra esto en la UI.
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
  // mismo beige (#D8C7A1) que ya usan pantalon-beige/jogger-beige/campera-
  // pluma-beige/bermuda-beige -- reusa el mismo tono en vez de inventar un
  // beige levemente distinto, mismo criterio que ya documenta el archivo
  // para mantener consistente la paleta entre categorías.
  { id: "remera-beige", nombre: "Remera beige", categoria: "remera", colorHex: "#D8C7A1", textura: "algodon", estilo: "casual", ocasion: "casual" },

  // --- Remeras deportivas (agregadas en la ampliación del catálogo: el
  // estilo "deportivo" no tenía NINGUNA prenda cargada en todo el catálogo
  // hasta acá, un vacío real, no una omisión menor). Sin textura a
  // propósito -- una remera técnica dry-fit es sintética, y ninguna Textura
  // del enum (algodón/lino/lana/etc.) describe eso sin inventar un dato. */
  { id: "remera-deportiva-negra", nombre: "Remera deportiva negra", categoria: "remera", colorHex: "#1A1A1A", estilo: "deportivo", ocasion: "casual" },
  { id: "remera-deportiva-gris", nombre: "Remera deportiva gris", categoria: "remera", colorHex: "#8C8C8C", estilo: "deportivo", ocasion: "casual" },

  // --- Camisas (oficina) ---
  { id: "camisa-blanca", nombre: "Camisa blanca", categoria: "camisa", colorHex: "#FAFAF7", textura: "algodon", estilo: "clasico", ocasion: "laburo" },
  { id: "camisa-celeste", nombre: "Camisa celeste", categoria: "camisa", colorHex: "#B7D2EC", textura: "algodon", estilo: "clasico", ocasion: "laburo" },
  // "urbano" a propósito, no un descuido: una camisa negra lee más
  // "urban professional" que clásica, a diferencia de blanca/celeste/gris.
  { id: "camisa-negra", nombre: "Camisa negra", categoria: "camisa", colorHex: "#232323", textura: "algodon", estilo: "urbano", ocasion: "laburo" },
  { id: "camisa-gris", nombre: "Camisa gris", categoria: "camisa", colorHex: "#9A9A94", textura: "algodon", estilo: "clasico", ocasion: "laburo" },
  { id: "camisa-cuadros", nombre: "Camisa a cuadros", categoria: "camisa", colorHex: "#4A5A3C", textura: "algodon", estilo: "urbano", ocasion: "casual" },
  // mismo beige que el resto del catálogo (ver remera-beige) -- clasico/
  // laburo, mismo registro que blanca/celeste/gris: una camisa beige es
  // tan de oficina como esas, no informal como la de cuadros.
  { id: "camisa-beige", nombre: "Camisa beige", categoria: "camisa", colorHex: "#D8C7A1", textura: "algodon", estilo: "clasico", ocasion: "laburo" },

  // --- Pantalones ---
  { id: "jean-azul", nombre: "Jean azul", categoria: "pantalon", colorHex: "#3B5998", textura: "denim", estilo: "casual", ocasion: "casual" },
  { id: "jean-negro", nombre: "Jean negro", categoria: "pantalon", colorHex: "#232323", textura: "denim", estilo: "casual", ocasion: "casual" },
  { id: "pantalon-vestir-negro", nombre: "Pantalón de vestir negro", categoria: "pantalon", colorHex: "#1A1A1A", textura: "lana", estilo: "formal", ocasion: "laburo" },
  { id: "pantalon-vestir-gris", nombre: "Pantalón de vestir gris", categoria: "pantalon", colorHex: "#6E6E6E", textura: "lana", estilo: "formal", ocasion: "laburo" },
  { id: "pantalon-vestir-azul", nombre: "Pantalón de vestir azul marino", categoria: "pantalon", colorHex: "#1F2A44", textura: "lana", estilo: "formal", ocasion: "laburo" },
  { id: "pantalon-beige", nombre: "Pantalón chino beige", categoria: "pantalon", colorHex: "#D8C7A1", textura: "algodon", estilo: "clasico", ocasion: "laburo" },
  // joggers -- casual como el jean (no "clasico" como el chino: no van a
  // la oficina), textura "algodon" sin ambigüedad porque el usuario la dio
  // así directamente. Colores reusados del resto del catálogo (negro
  // estándar, el mismo beige del chino, el gris de siempre) por la misma
  // razón de consistencia de paleta que ya documenta el resto del archivo.
  { id: "jogger-negro", nombre: "Jogger negro", categoria: "pantalon", colorHex: "#1A1A1A", textura: "algodon", estilo: "casual", ocasion: "casual" },
  { id: "jogger-beige", nombre: "Jogger beige", categoria: "pantalon", colorHex: "#D8C7A1", textura: "algodon", estilo: "casual", ocasion: "casual" },
  { id: "jogger-gris", nombre: "Jogger gris", categoria: "pantalon", colorHex: "#8C8C8C", textura: "algodon", estilo: "casual", ocasion: "casual" },
  // pantalón deportivo (entrenamiento) -- distinto del jogger de arriba:
  // mismo corte ancho, pero tela técnica sintética, no algodón, por eso sin
  // textura (mismo criterio que la remera deportiva de arriba).
  { id: "pantalon-deportivo-negro", nombre: "Pantalón deportivo negro", categoria: "pantalon", colorHex: "#1A1A1A", estilo: "deportivo", ocasion: "casual" },

  // --- Bermudas (chino/algodón, hasta la rodilla) --- agregadas a pedido
  // explícito del usuario: el catálogo no tenía ninguna prenda de piernas
  // más corta que un pantalón largo. Mismo criterio de textura/estilo que
  // el pantalón chino de arriba -- de hecho es la misma prenda en versión
  // corta, así que reusa su mismo estilo ("clasico") y textura
  // ("algodon"). El beige/caqui es a propósito el color más asociado a
  // "bermuda" en el uso real, no una elección arbitraria.
  { id: "bermuda-beige", nombre: "Bermuda beige", categoria: "bermuda", colorHex: "#D8C7A1", textura: "algodon", estilo: "clasico", ocasion: "casual" },
  { id: "bermuda-azul-marino", nombre: "Bermuda azul marino", categoria: "bermuda", colorHex: "#1F2A44", textura: "algodon", estilo: "clasico", ocasion: "casual" },
  // variante denim -- tan real como el jean largo de arriba, mismo criterio
  // de textura/estilo ("casual", no "clasico": un jean corto lee más
  // informal que un chino corto, igual que el jean largo vs. el pantalón
  // de vestir).
  { id: "bermuda-jean", nombre: "Bermuda de jean", categoria: "bermuda", colorHex: "#3B5998", textura: "denim", estilo: "casual", ocasion: "casual" },
  { id: "bermuda-gris", nombre: "Bermuda gris", categoria: "bermuda", colorHex: "#8C8C8C", textura: "algodon", estilo: "clasico", ocasion: "casual" },

  // --- Shorts deportivos (tela técnica, hasta medio muslo) --- distintos
  // de la bermuda de arriba, no una variante del mismo dibujo: son mucho
  // más cortos (Maniqui.tsx los dibuja hasta la mitad del muslo, la
  // bermuda hasta la rodilla) y de tela sintética, no chino/denim -- mismo
  // motivo por el que la remera y el pantalón deportivos de arriba tampoco
  // llevan textura (ninguna Textura del enum describe una tela técnica sin
  // inventar un dato que la prenda real no tiene).
  { id: "short-deportivo-negro", nombre: "Short deportivo negro", categoria: "short_deportivo", colorHex: "#1A1A1A", estilo: "deportivo", ocasion: "casual" },
  { id: "short-deportivo-gris", nombre: "Short deportivo gris", categoria: "short_deportivo", colorHex: "#8C8C8C", estilo: "deportivo", ocasion: "casual" },
  { id: "short-deportivo-azul", nombre: "Short deportivo azul", categoria: "short_deportivo", colorHex: "#3366CC", estilo: "deportivo", ocasion: "casual" },

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
  // sin textura a propósito, mismo criterio que las demás -- una etiqueta
  // real de composición de zapatilla ("capellada 85% sintético / 15%
  // cuero, forro 100% textil sintético") no es "cuero" para nada del
  // motor: la mayoría es sintético, y ninguna Textura del enum describe
  // "sintético" sin inventar un dato que la prenda real no tiene.
  { id: "zapatillas-azul-marino", nombre: "Zapatillas azul marino", categoria: "calzado", colorHex: "#1F2A44", estilo: "urbano", ocasion: "casual" },
  // marrón de gamuza/lona (mate), distinto del marrón de cuero lustroso de
  // los zapatos de vestir un par de líneas más abajo -- son materiales que
  // se ven distintos en la vida real, no el mismo color reusado sin razón.
  { id: "zapatillas-marrones", nombre: "Zapatillas marrones", categoria: "calzado", colorHex: "#6F4E37", estilo: "urbano", ocasion: "casual" },
  { id: "zapatillas-marrones-suela-blanca", nombre: "Zapatillas marrones (suela blanca)", categoria: "calzado", colorHex: "#6F4E37", estilo: "urbano", ocasion: "casual", suelaContraste: true },
  { id: "zapatos-cuero-negro", nombre: "Zapatos de cuero negros", categoria: "calzado", colorHex: "#1C1210", textura: "cuero_liso", estilo: "formal", ocasion: "laburo" },
  { id: "zapatos-cuero-marron", nombre: "Zapatos de cuero marrones", categoria: "calzado", colorHex: "#5C3A21", textura: "cuero_liso", estilo: "formal", ocasion: "laburo" },
  // zapatillas de running -- distintas de las "zapatillas" urbanas de
  // arriba (mismo criterio de siempre: el estilo importa más que el color
  // acá, es la sección que estaba vacía en el catálogo).
  { id: "zapatillas-running-blancas", nombre: "Zapatillas running blancas", categoria: "calzado", colorHex: "#F5F5F0", estilo: "deportivo", ocasion: "casual" },
  { id: "zapatillas-running-negras", nombre: "Zapatillas running negras", categoria: "calzado", colorHex: "#1A1A1A", estilo: "deportivo", ocasion: "casual" },

  // --- Camperas ---
  { id: "campera-negra", nombre: "Campera negra", categoria: "campera", colorHex: "#1A1A1A", estilo: "urbano", ocasion: "casual" },
  { id: "campera-jean", nombre: "Campera de jean", categoria: "campera", colorHex: "#5B7FA6", textura: "denim", estilo: "casual", ocasion: "casual" },
  { id: "campera-verde-militar", nombre: "Campera verde militar", categoria: "campera", colorHex: "#5A5F3D", estilo: "urbano", ocasion: "casual" },
  // pluma/puffer (tipo Uniqlo) -- colores reusados de otras categorías, ver
  // criterio de "Accesorios" más abajo.
  { id: "campera-pluma-negra", nombre: "Campera de pluma negra", categoria: "campera", colorHex: "#1A1A1A", textura: "acolchado", estilo: "casual", ocasion: "casual" },
  { id: "campera-pluma-azul-marino", nombre: "Campera de pluma azul marino", categoria: "campera", colorHex: "#1F2A44", textura: "acolchado", estilo: "casual", ocasion: "casual" },
  { id: "campera-pluma-beige", nombre: "Campera de pluma beige", categoria: "campera", colorHex: "#D8C7A1", textura: "acolchado", estilo: "casual", ocasion: "casual" },
  // rompeviento -- deportivo, distinto de la campera de jean/pluma de
  // arriba (esas son casual/urbano, no para entrenar).
  { id: "campera-rompeviento-negra", nombre: "Campera rompeviento negra", categoria: "campera", colorHex: "#1A1A1A", estilo: "deportivo", ocasion: "casual" },
  { id: "campera-rompeviento-azul", nombre: "Campera rompeviento azul", categoria: "campera", colorHex: "#3366CC", estilo: "deportivo", ocasion: "casual" },

  // --- Accesorios ---
  // Reusa hex ya presentes en otras categorías (azul marino, bordo) a
  // propósito, no por pereza: mantiene la consistencia cross-categoría del
  // catálogo (una corbata azul marino combina con las prendas azul marino
  // ya cargadas, no con un azul ligeramente distinto).
  { id: "cinturon-negro", nombre: "Cinturón negro de cuero", categoria: "accesorio", colorHex: "#1A1A1A", textura: "cuero_liso", estilo: "clasico" },
  { id: "cinturon-marron", nombre: "Cinturón marrón de cuero", categoria: "accesorio", colorHex: "#5C3A21", textura: "cuero_liso", estilo: "clasico" },
  { id: "corbata-azul-marino", nombre: "Corbata azul marino", categoria: "accesorio", colorHex: "#1F2A44", textura: "seda", estilo: "formal", ocasion: "laburo", requiereCuello: true, posicionAccesorio: "cuello" },
  { id: "corbata-bordo", nombre: "Corbata bordo", categoria: "accesorio", colorHex: "#6B2737", textura: "seda", estilo: "formal", ocasion: "laburo", requiereCuello: true, posicionAccesorio: "cuello" },
  { id: "bufanda-gris", nombre: "Bufanda gris", categoria: "accesorio", colorHex: "#8C8C8C", textura: "lana", estilo: "casual", ocasion: "casual", posicionAccesorio: "cuello" },
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
    requiere_cuello: preset.requiereCuello ?? false,
    posicion_accesorio: preset.posicionAccesorio ?? "cintura",
    created_at: "",
    updated_at: "",
  };
}

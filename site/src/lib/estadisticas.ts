import { nombreColor } from "./color";
import { categoriasAusentes, ESTILO_LABEL } from "./recommend";
import { CATEGORIA_LABEL, type Categoria, type Estilo, type Prenda } from "./types";

/** Mismo orden que CATEGORIA_LABEL en types.ts -- se deriva de sus claves en
 *  vez de repetir el array a mano para no poder desincronizarse si se agrega
 *  una categoría nueva ahí y no acá. Exportada: Placard.tsx la reusa para
 *  agrupar el placard en secciones en ese mismo orden fijo. */
export const TODAS_LAS_CATEGORIAS = Object.keys(CATEGORIA_LABEL) as Categoria[];

/** pantalon/bermuda/short_deportivo son, para el motor de recomendación
 *  (recommend.ts, CATEGORIAS_PIERNAS), el "ancla" de un outfit: sin ninguna
 *  prenda de esta lista, armarOutfitsSugeridos no genera nada. Duplicado a
 *  propósito acá (mismo criterio que el resto del archivo ya documenta para
 *  no crear una dependencia cruzada por 3 strings): recommend.ts no la
 *  exporta. */
const CATEGORIAS_PIERNAS: Categoria[] = ["pantalon", "bermuda", "short_deportivo"];

const ESTILOS: Estilo[] = ["formal", "clasico", "urbano", "casual", "deportivo"];

export interface ConteoCategoria {
  categoria: Categoria;
  label: string;
  cantidad: number;
}

/** Cantidad de prendas por categoría, TODAS las categorías incluidas (con
 *  0 las que no tenés todavía) -- una categoría en cero es justo la
 *  información que "dónde tengo oportunidades de mejora" necesita, no algo
 *  para ocultar. Orden: mayor a menor cantidad. */
export function contarPorCategoria(placard: Prenda[]): ConteoCategoria[] {
  const conteos = new Map<Categoria, number>(TODAS_LAS_CATEGORIAS.map((c) => [c, 0]));
  for (const p of placard) conteos.set(p.categoria, (conteos.get(p.categoria) ?? 0) + 1);
  return TODAS_LAS_CATEGORIAS.map((categoria) => ({
    categoria,
    label: CATEGORIA_LABEL[categoria],
    cantidad: conteos.get(categoria) ?? 0,
  })).sort((a, b) => b.cantidad - a.cantidad);
}

export interface ConteoEstilo {
  estilo: Estilo;
  label: string;
  cantidad: number;
}

/** Cantidad de prendas por estilo, los 5 estilos incluidos. Una prenda sin
 *  `estilo` cargado (null) no cuenta para ninguno -- no se le inventa un
 *  valor por defecto, igual que el resto de la app (ver registroOutfit en
 *  recommend.ts). */
export function contarPorEstilo(placard: Prenda[]): ConteoEstilo[] {
  const conteos = new Map<Estilo, number>(ESTILOS.map((e) => [e, 0]));
  for (const p of placard) {
    if (p.estilo) conteos.set(p.estilo, (conteos.get(p.estilo) ?? 0) + 1);
  }
  return ESTILOS.map((estilo) => ({
    estilo,
    label: ESTILO_LABEL[estilo],
    cantidad: conteos.get(estilo) ?? 0,
  })).sort((a, b) => b.cantidad - a.cantidad);
}

export interface ConteoColor {
  nombre: string;
  cantidad: number;
  /** color_hex real de una de las prendas de este grupo, para pintar el
   *  swatch -- no es un promedio ni un color inventado. */
  hex: string;
}

/** Agrupa el placard por el mismo nombre de color que ya usa el resto de la
 *  app (nombreColor, color.ts) -- así "Azul" y "Azul oscuro" son grupos
 *  distintos igual que en cualquier otra pantalla, en vez de inventar una
 *  segunda forma de agrupar colores. Orden: mayor a menor cantidad. */
export function contarPorColor(placard: Prenda[]): ConteoColor[] {
  const grupos = new Map<string, ConteoColor>();
  for (const p of placard) {
    const nombre = nombreColor(p.color_h, p.color_s, p.color_l);
    const actual = grupos.get(nombre);
    if (actual) actual.cantidad += 1;
    else grupos.set(nombre, { nombre, cantidad: 1, hex: p.color_hex });
  }
  return [...grupos.values()].sort((a, b) => b.cantidad - a.cantidad);
}

export interface AnalisisPlacard {
  totalPrendas: number;
  variedadColores: number;
  fortalezas: string[];
  oportunidades: string[];
}

// Umbrales del análisis: no salen de una fórmula, son un piso razonable
// para no marcar como "fortaleza" o "oportunidad" algo que en un placard
// recién arrancado (2-3 prendas) todavía no dice nada. 3 prendas en un
// estilo ya alcanza para armar más de una combinación real; 4 colores
// distintos es lo mínimo para no repetir combinación de color en cada
// outfit.
const MIN_PRENDAS_FORTALEZA_ESTILO = 3;
const MIN_COLORES_VARIEDAD_BUENA = 4;
const MAX_COLORES_VARIEDAD_BAJA = 2;

/** Lectura "de gerente" del placard: no solo cuenta, dice qué está fuerte y
 *  dónde conviene invertir la próxima compra -- reusando el mismo motor que
 *  ya usa el resto de la app (categoriasAusentes) en vez de inventar un
 *  criterio nuevo de qué categoría "falta". */
export function analizarPlacard(placard: Prenda[]): AnalisisPlacard {
  const totalPrendas = placard.length;
  const porColor = contarPorColor(placard);
  const variedadColores = porColor.length;
  const fortalezas: string[] = [];
  const oportunidades: string[] = [];

  if (totalPrendas === 0) {
    oportunidades.push("Todavía no cargaste ninguna prenda -- empezá por tu placard para ver indicadores reales.");
    return { totalPrendas, variedadColores, fortalezas, oportunidades };
  }

  const piernas = placard.filter((p) => CATEGORIAS_PIERNAS.includes(p.categoria));
  if (piernas.length === 0) {
    oportunidades.push(
      "No tenés ningún pantalón, bermuda o short cargado: es la prenda ancla del armado automático de outfits, sin una no hay sugerencias.",
    );
  } else {
    fortalezas.push(
      `Tenés ${piernas.length} prenda${piernas.length === 1 ? "" : "s"} de piernas (pantalón/bermuda/short): la base para armar outfits automáticos.`,
    );
  }

  // pantalon/bermuda/short_deportivo compiten por el mismo lugar del
  // outfit (CATEGORIAS_PIERNAS) -- ya tienen su propio mensaje arriba, así
  // que se excluyen acá para no repetir "te falta pantalón" cuando el
  // usuario ya tiene un bermuda cargado.
  const ausentes = categoriasAusentes(placard).filter((c) => !CATEGORIAS_PIERNAS.includes(c));
  if (ausentes.length > 0) {
    const lista = ausentes.map((c) => CATEGORIA_LABEL[c]).join(", ");
    oportunidades.push(`Categorías sin ninguna prenda todavía: ${lista}.`);
  }

  const porEstilo = contarPorEstilo(placard);
  const conCarga = porEstilo.filter((e) => e.cantidad > 0);
  const fuertes = porEstilo.filter((e) => e.cantidad >= MIN_PRENDAS_FORTALEZA_ESTILO);
  for (const e of fuertes) {
    fortalezas.push(`Estilo ${e.label}: ${e.cantidad} prendas, suficiente para variar combinaciones en ese registro.`);
  }
  const sinCarga = ESTILOS.filter((estilo) => !conCarga.some((e) => e.estilo === estilo));
  if (sinCarga.length > 0 && sinCarga.length < ESTILOS.length) {
    const lista = sinCarga.map((e) => ESTILO_LABEL[e]).join(", ");
    oportunidades.push(`Sin ninguna prenda de estilo ${lista}: no podés armar outfits para ese registro todavía.`);
  }

  if (variedadColores >= MIN_COLORES_VARIEDAD_BUENA) {
    fortalezas.push(`Buena variedad de colores: ${variedadColores} tonos distintos en el placard.`);
  } else if (totalPrendas >= 3 && variedadColores <= MAX_COLORES_VARIEDAD_BAJA) {
    oportunidades.push(`Poca variedad de colores (solo ${variedadColores}): limita cuántas combinaciones distintas podés armar.`);
  }

  return { totalPrendas, variedadColores, fortalezas, oportunidades };
}

/** Buscador libre del placard (Placard.tsx): compara contra los mismos
 *  textos que ya se ven en cada card (categoría, color, estilo) -- nunca
 *  contra datos crudos que el usuario no tiene forma de escribir (hex,
 *  h/s/l). Substring, sin distinguir mayúsculas/acentos de más ni nada
 *  raro: "azul" matchea "Azul oscuro". Query vacía o solo espacios ->
 *  matchea todo (comportamiento de "sin filtro", no de "sin resultados"). */
export function coincideBusqueda(p: Prenda, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const textos = [CATEGORIA_LABEL[p.categoria], nombreColor(p.color_h, p.color_s, p.color_l), p.estilo ? ESTILO_LABEL[p.estilo] : ""];
  return textos.some((t) => t.toLowerCase().includes(q));
}

import { nombreColor } from "./color";
import { categoriasAusentes, ESTILO_LABEL, estilosDe, sugerenciaDeAncla, sugerenciaDeVariedad } from "./recommend";
import { CATEGORIA_LABEL, descripcionPrenda, ESTACION_LABEL, type Categoria, type Estacion, type Estilo, type Prenda } from "./types";

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

/** sweater/campera son, a partir de la revisión que diferenció abrigos de
 *  entretiempo/invierno, las únicas dos categorías que se tagean por
 *  `estacion` sin ambigüedad (ver el criterio largo en catalogo.ts) --
 *  buzo queda afuera a propósito (pedido explícito del usuario: "tampoco
 *  los llamaría de invierno o de entretiempo"). Duplicado acá, mismo
 *  motivo que CATEGORIAS_PIERNAS arriba: recommend.ts no la exporta. */
const CATEGORIAS_ABRIGO_CON_ESTACION: Categoria[] = ["sweater", "campera"];

const ESTILOS: Estilo[] = ["formal", "clasico", "urbano", "casual", "deportivo"];
const ESTACIONES: Estacion[] = ["verano", "entretiempo", "invierno"];

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

/** Cantidad de prendas por estilo, los 5 estilos incluidos. Una prenda
 *  cuenta para TODOS sus estilos (principal + secundarios vía estilosDe) --
 *  una prenda versátil (ej. sweater mostaza clásico+casual) suma en los dos
 *  registros, no solo el principal. Sin ningún estilo cargado no cuenta
 *  para ninguno -- no se le inventa un valor por defecto, igual que el
 *  resto de la app (ver registroOutfit en recommend.ts). */
export function contarPorEstilo(placard: Prenda[]): ConteoEstilo[] {
  const conteos = new Map<Estilo, number>(ESTILOS.map((e) => [e, 0]));
  for (const p of placard) {
    for (const estilo of estilosDe(p)) conteos.set(estilo, (conteos.get(estilo) ?? 0) + 1);
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

export interface ConteoEstacion {
  estacion: Estacion;
  label: string;
  cantidad: number;
}

/** Cantidad de prendas por estación cargada -- pedido explícito del
 *  usuario: un filtro real de "mostrame solo mis abrigos de invierno" en
 *  Placard. Sin `estacion` cargada no cuenta para ninguna (no se inventa
 *  un valor por defecto), mismo criterio que contarPorEstilo. A diferencia
 *  de estilo, acá no hay "estilosDe" -- una prenda tiene UNA sola estación
 *  o ninguna, no varias. Orden fijo (verano -> entretiempo -> invierno, el
 *  ciclo real del año), no por cantidad: son solo 3 valores, un orden
 *  estable se lee mejor que uno que se reordena cada vez que cambia el
 *  placard. */
export function contarPorEstacion(placard: Prenda[]): ConteoEstacion[] {
  const conteos = new Map<Estacion, number>(ESTACIONES.map((e) => [e, 0]));
  for (const p of placard) {
    if (p.estacion) conteos.set(p.estacion, (conteos.get(p.estacion) ?? 0) + 1);
  }
  return ESTACIONES.map((estacion) => ({
    estacion,
    label: ESTACION_LABEL[estacion],
    cantidad: conteos.get(estacion) ?? 0,
  }));
}

export interface AnalisisFoda {
  totalPrendas: number;
  variedadColores: number;
  /** Interno + positivo: lo que ya funciona bien. */
  fortalezas: string[];
  /** Interno + negativo: huecos propios del placard (mismo contenido que
   *  antes vivía bajo "oportunidades de mejora" -- ver el comentario de
   *  analizarFoda más abajo sobre por qué ese nombre estaba mal puesto en
   *  términos de la metodología FODA real). */
  debilidades: string[];
  /** Externo + positivo: qué ofrece el catálogo (el "mercado" de esta app)
   *  para cerrar un hueco concreto -- a diferencia de debilidades (un
   *  diagnóstico), esto es siempre una acción puntual y comprable. */
  oportunidades: string[];
  /** Externo + negativo: riesgos de estructura, no solo huecos -- qué pasa
   *  si una prenda puntual deja de estar disponible, o si cambia el clima. */
  amenazas: string[];
  /** Lectura general de salud del placard -- severidad real (sólido/con
   *  huecos/frágil), no un cuadrante más. Ver diagnosticoGeneral más abajo
   *  para los umbrales. */
  nivelSalud: NivelSaludFoda;
  /** Síntesis de una línea, la frase con la que un gerente abriría el
   *  informe -- pedido explícito del usuario ("informe resumido, visual y
   *  ejecutivo"). Deriva de nivelSalud, nunca al revés. */
  veredicto: string;
  /** Estrategias cruzadas -- matriz TOWS (Weihrich), el paso estándar
   *  "después" de un FODA/SWOT clásico: en vez de solo listar los 4
   *  cuadrantes por separado, los cruza en 4 acciones concretas. Ver el
   *  comentario largo en analizarFoda más abajo. 0 a 4 elementos -- solo se
   *  genera un cruce cuando los dos cuadrantes que lo alimentan tienen
   *  contenido real. */
  estrategias: EstrategiaFoda[];
}

export type NivelSaludFoda = "solido" | "con_huecos" | "fragil";

export interface EstrategiaFoda {
  /** Los 4 cuadrantes cruzados de la matriz TOWS: FO (fortalezas+
   *  oportunidades), DO (debilidades+oportunidades), FA (fortalezas+
   *  amenazas), DA (debilidades+amenazas). */
  tipo: "FO" | "DO" | "FA" | "DA";
  /** Nombre de la acción TOWS estándar para ese cruce (Explotar/Reforzar/
   *  Proteger/Prioridad). */
  titulo: string;
  texto: string;
}

// Umbrales del análisis: no salen de una fórmula, son un piso razonable
// para no marcar como "fortaleza" o "debilidad" algo que en un placard
// recién arrancado (2-3 prendas) todavía no dice nada. 3 prendas en un
// estilo ya alcanza para armar más de una combinación real; 4 colores
// distintos es lo mínimo para no repetir combinación de color en cada
// outfit.
const MIN_PRENDAS_FORTALEZA_ESTILO = 3;
const MIN_COLORES_VARIEDAD_BUENA = 4;
const MAX_COLORES_VARIEDAD_BAJA = 2;
// Concentración de color: a partir de qué participación un solo color
// "domina" el placard lo suficiente como para ser un riesgo real (perder o
// ensuciar esa prenda puntual golpea desproporcionado). Con menos de 4
// prendas en total no dice nada -- mismo piso de "muestra chica" que el
// resto del análisis.
const MIN_PRENDAS_PARA_CONCENTRACION = 4;
const UMBRAL_CONCENTRACION_COLOR = 0.5;
// Umbral de "frágil": no hace falta que debilidades y amenazas empaten en
// cantidad con las fortalezas para que el placard esté en problemas -- 3
// debilidades internas o 2 amenazas de estructura ya alcanzan para que el
// diagnóstico deje de ser "con huecos puntuales" y pase a "resolvé esto
// antes de seguir sumando variedad". Mismo criterio de piso razonable (no
// una fórmula) que el resto de los umbrales de este archivo.
const UMBRAL_FRAGIL_DEBILIDADES = 3;
const UMBRAL_FRAGIL_AMENAZAS = 2;
// Largo máximo de un ítem citado dentro de una estrategia TOWS -- las
// frases de fortalezas/debilidades/oportunidades/amenazas ya son oraciones
// completas (pensadas para leerse solas en su propio cuadrante); citarlas
// enteras dentro de otra oración las vuelve ilegibles. Se corta en el
// último espacio antes del límite, nunca a mitad de palabra.
const MAX_LARGO_CITA_ESTRATEGIA = 70;

function contarSustantivo(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function resumir(texto: string, maxLen = MAX_LARGO_CITA_ESTRATEGIA): string {
  if (texto.length <= maxLen) return texto;
  const corte = texto.lastIndexOf(" ", maxLen);
  return `${texto.slice(0, corte > 0 ? corte : maxLen).trimEnd()}…`;
}

/** Cruces de la matriz TOWS (Weihrich) -- el paso estándar "después" de un
 *  FODA/SWOT clásico en cualquier curso de estrategia de MBA: en vez de
 *  dejar los 4 cuadrantes como 4 listas separadas, los cruza de a pares
 *  (interno x externo) en una acción concreta:
 *  - FO "Explotar": la fortaleza más fuerte + la oportunidad más fuerte --
 *    el movimiento de mayor impacto y menor esfuerzo.
 *  - DO "Reforzar": la oportunidad más fuerte usada para tapar la
 *    debilidad más urgente.
 *  - FA "Proteger": la fortaleza más fuerte usada como colchón contra la
 *    amenaza más urgente (amortigua, no la elimina).
 *  - DA "Prioridad": debilidad + amenaza más urgentes juntas -- el combo
 *    más frágil del placard, lo primero a resolver.
 *  Cada cruce usa el PRIMER ítem real de cada cuadrante (el que
 *  analizarFoda ya empuja primero, en su propio orden de prioridad -- ver
 *  ese comentario) resumido con `resumir`, nunca un texto inventado acá.
 *  Sin contenido real en los dos cuadrantes que alimentan un cruce, ese
 *  cruce no se genera -- 4 cruces es el techo, no un piso forzado. */
function estrategiasTows(fortalezas: string[], debilidades: string[], oportunidades: string[], amenazas: string[]): EstrategiaFoda[] {
  const estrategias: EstrategiaFoda[] = [];
  if (fortalezas.length > 0 && oportunidades.length > 0) {
    estrategias.push({
      tipo: "FO",
      titulo: "Explotar",
      texto: `Tu fortaleza más clara -- "${resumir(fortalezas[0])}" -- combina directo con "${resumir(oportunidades[0])}": el movimiento de mayor impacto y menor esfuerzo ahora mismo.`,
    });
  }
  if (debilidades.length > 0 && oportunidades.length > 0) {
    estrategias.push({
      tipo: "DO",
      titulo: "Reforzar",
      texto: `"${resumir(oportunidades[0])}" es el camino más directo para cerrar "${resumir(debilidades[0])}".`,
    });
  }
  if (fortalezas.length > 0 && amenazas.length > 0) {
    estrategias.push({
      tipo: "FA",
      titulo: "Proteger",
      texto: `"${resumir(fortalezas[0])}" amortigua el riesgo de "${resumir(amenazas[0])}", pero no lo elimina -- vale la pena resolverlo antes de que se note.`,
    });
  }
  if (debilidades.length > 0 && amenazas.length > 0) {
    estrategias.push({
      tipo: "DA",
      titulo: "Prioridad",
      texto: `El combo más frágil: "${resumir(debilidades[0])}" + "${resumir(amenazas[0])}". Resolvé esto antes que el resto del placard.`,
    });
  }
  return estrategias;
}

/** Veredicto de una línea + nivel de salud -- la síntesis con la que un
 *  gerente abriría el informe, en vez de arrancar directo por la lista de
 *  hallazgos. "Sólido" exige CERO debilidades y CERO amenazas (no alcanza
 *  con tener más fortalezas que problemas); "frágil" dispara apenas se
 *  cruza cualquiera de los dos pisos de UMBRAL_FRAGIL_* -- de ahí para
 *  abajo, "con huecos puntuales" es el estado intermedio por default. */
function diagnosticoGeneral(
  fortalezas: string[],
  debilidades: string[],
  amenazas: string[],
  totalPrendas: number,
): { nivelSalud: NivelSaludFoda; veredicto: string } {
  if (totalPrendas === 0) {
    return { nivelSalud: "con_huecos", veredicto: "Sin prendas cargadas todavía: no hay diagnóstico posible." };
  }
  if (debilidades.length === 0 && amenazas.length === 0) {
    return {
      nivelSalud: "solido",
      veredicto: `Placard sólido: ${contarSustantivo(fortalezas.length, "fortaleza identificada", "fortalezas identificadas")}, sin debilidades ni amenazas de estructura pendientes.`,
    };
  }
  if (debilidades.length >= UMBRAL_FRAGIL_DEBILIDADES || amenazas.length >= UMBRAL_FRAGIL_AMENAZAS) {
    return {
      nivelSalud: "fragil",
      veredicto: `Placard frágil: ${contarSustantivo(debilidades.length, "debilidad", "debilidades")} y ${contarSustantivo(amenazas.length, "amenaza", "amenazas")}, sin fortalezas suficientes para compensarlas -- conviene resolver estructura antes de sumar variedad nueva.`,
    };
  }
  const fraseDebilidad =
    debilidades.length === 1 ? "una debilidad interna que vale la pena cerrar" : `${debilidades.length} debilidades internas que valen la pena cerrar`;
  return {
    nivelSalud: "con_huecos",
    veredicto: `Placard funcional, con huecos puntuales: tenés ${fraseDebilidad}.`,
  };
}

/** Lectura "de MBA" del placard vía la matriz FODA/SWOT clásica -- pedido
 *  explícito del usuario, reemplazando el "fortalezas y oportunidades de
 *  mejora" anterior. Esa versión anterior, con la mejor intención, mezclaba
 *  dos ejes distintos de la metodología real bajo un solo nombre
 *  ("oportunidades" ahí eran en realidad huecos INTERNOS del placard, no
 *  oportunidades del entorno) -- acá se separan en los 4 cuadrantes
 *  correctos: interno/externo cruzado con positivo/negativo.
 *
 *  - Fortalezas y Debilidades reusan exactamente el mismo análisis interno
 *    que ya existía (categoriasAusentes, conteo por estilo/color) -- ver el
 *    comentario de cada bloque.
 *  - Oportunidades es nuevo: reusa el mismo motor de sugerencias que ya usa
 *    "Vestite hoy" (sugerenciaDeAncla/sugerenciaDeVariedad en
 *    recommend.ts) -- el catálogo real hace de "mercado externo" del que
 *    surge la oportunidad concreta, nunca una sugerencia inventada acá.
 *  - Amenazas es nuevo: riesgos de estructura (un registro que depende de
 *    una sola prenda ancla, sin abrigo de invierno cargado, un color que
 *    concentra la mitad del placard) -- directamente motivado por el
 *    trabajo reciente de diferenciar abrigos de entretiempo/invierno. */
export function analizarFoda(placard: Prenda[]): AnalisisFoda {
  const totalPrendas = placard.length;
  const porColor = contarPorColor(placard);
  const variedadColores = porColor.length;
  const fortalezas: string[] = [];
  const debilidades: string[] = [];
  const oportunidades: string[] = [];
  const amenazas: string[] = [];

  if (totalPrendas === 0) {
    debilidades.push("Todavía no cargaste ninguna prenda -- empezá por tu placard para ver indicadores reales.");
    const { nivelSalud, veredicto } = diagnosticoGeneral(fortalezas, debilidades, amenazas, totalPrendas);
    return { totalPrendas, variedadColores, fortalezas, debilidades, oportunidades, amenazas, nivelSalud, veredicto, estrategias: [] };
  }

  const piernas = placard.filter((p) => CATEGORIAS_PIERNAS.includes(p.categoria));
  if (piernas.length === 0) {
    debilidades.push(
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
    debilidades.push(`Categorías sin ninguna prenda todavía: ${lista}.`);
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
    debilidades.push(`Sin ninguna prenda de estilo ${lista}: no podés armar outfits para ese registro todavía.`);
  }

  if (variedadColores >= MIN_COLORES_VARIEDAD_BUENA) {
    fortalezas.push(`Buena variedad de colores: ${variedadColores} tonos distintos en el placard.`);
  } else if (totalPrendas >= 3 && variedadColores <= MAX_COLORES_VARIEDAD_BAJA) {
    debilidades.push(`Poca variedad de colores (solo ${variedadColores}): limita cuántas combinaciones distintas podés armar.`);
  }

  // Oportunidades: por cada estilo, lo que el catálogo (CATALOGO_CON_HSL,
  // default de las dos funciones) ofrece para cerrar un hueco real de
  // ancla o de variedad -- nunca los dos a la vez para el mismo estilo:
  // sugerenciaDeAncla ya devuelve null si el estilo SÍ tiene ancla, así que
  // no compiten por el mismo hueco.
  for (const estilo of ESTILOS) {
    const deAncla = sugerenciaDeAncla(estilo, placard);
    if (deAncla) oportunidades.push(deAncla.mensaje);
    const deVariedad = sugerenciaDeVariedad(estilo, placard);
    if (deVariedad) oportunidades.push(deVariedad.mensaje);
  }

  // Amenazas -- 3 riesgos de estructura, no de contenido:
  // 1. Ancla única: un registro que hoy arma outfits pero depende de UNA
  //    sola prenda de piernas se cae entero si esa prenda no está
  //    disponible (lavado, rota, de viaje).
  for (const estilo of ESTILOS) {
    const piernasEstilo = piernas.filter((p) => estilosDe(p).includes(estilo));
    if (piernasEstilo.length === 1) {
      amenazas.push(`El registro ${ESTILO_LABEL[estilo]} depende de una sola prenda de piernas: sin ella no hay outfits de ese estilo.`);
    }
  }
  // 2. Sin abrigo de invierno real cargado -- directamente motivado por la
  //    diferenciación de esta ronda: sweater/campera son las dos
  //    categorías que sí llevan estacion, así que si el placard tiene
  //    abrigos pero NINGUNO tageado "invierno", no hay con qué responder
  //    cuando baje la temperatura de verdad (solo se avisa si hay al menos
  //    un abrigo cargado -- sin ninguno, ya lo cubre "Categorías sin
  //    ninguna prenda" arriba, no hace falta duplicar el aviso).
  const abrigos = placard.filter((p) => CATEGORIAS_ABRIGO_CON_ESTACION.includes(p.categoria));
  if (abrigos.length > 0 && !abrigos.some((p) => p.estacion === "invierno")) {
    amenazas.push("No tenés ningún sweater o campera tageado como de invierno: vas a quedar corto cuando baje la temperatura de verdad.");
  }
  // 3. Concentración de color: un solo color explica la mitad o más del
  //    placard -- perder o ensuciar esa prenda puntual golpea
  //    desproporcionado.
  if (totalPrendas >= MIN_PRENDAS_PARA_CONCENTRACION && porColor[0] && porColor[0].cantidad / totalPrendas >= UMBRAL_CONCENTRACION_COLOR) {
    const pct = Math.round((porColor[0].cantidad / totalPrendas) * 100);
    amenazas.push(`${porColor[0].nombre} concentra ${porColor[0].cantidad} de tus ${totalPrendas} prendas (${pct}%): mucha dependencia de un solo color.`);
  }

  const estrategias = estrategiasTows(fortalezas, debilidades, oportunidades, amenazas);
  const { nivelSalud, veredicto } = diagnosticoGeneral(fortalezas, debilidades, amenazas, totalPrendas);
  return { totalPrendas, variedadColores, fortalezas, debilidades, oportunidades, amenazas, nivelSalud, veredicto, estrategias };
}

/** Buscador libre del placard (Placard.tsx): compara contra los mismos
 *  textos que ya se ven en cada card (nombre específico, categoría genérica,
 *  color, estilo/s, estación) -- nunca contra datos crudos que el usuario
 *  no tiene forma de escribir (hex, h/s/l). Incluye estilos secundarios
 *  (estilosDe): buscar "casual" también encuentra una prenda clásica con
 *  casual como secundario. Incluye tanto descripcionPrenda ("Jean",
 *  "Jogger", "Pantalón chino"...) como CATEGORIA_LABEL crudo ("pantalon") --
 *  pedido explícito del usuario al reportar el bug de "Jean azul": las
 *  cards ahora muestran el nombre específico, así que buscar "jean" tiene
 *  que encontrarlo igual que buscar "pantalon" (alguien puede seguir
 *  pensando en la categoría genérica). Substring, sin distinguir mayúsculas/
 *  acentos de más ni nada raro: "azul" matchea "Azul oscuro". Query vacía o
 *  solo espacios -> matchea todo (comportamiento de "sin filtro", no de
 *  "sin resultados"). */
export function coincideBusqueda(p: Prenda, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const textos = [
    descripcionPrenda(p),
    CATEGORIA_LABEL[p.categoria],
    nombreColor(p.color_h, p.color_s, p.color_l),
    ...estilosDe(p).map((e) => ESTILO_LABEL[e]),
    p.estacion ? ESTACION_LABEL[p.estacion] : "",
  ];
  return textos.some((t) => t.toLowerCase().includes(q));
}

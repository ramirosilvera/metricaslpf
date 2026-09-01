import type { Categoria, HSL, NivelCompatibilidad, Prenda } from "./types";
import { CATALOGO_CON_HSL, presetAPrendaSintetica, type PresetPrenda } from "./catalogo";

// Umbrales calibrados en la revisión de Consejo (rondas 1-2). Nombrados y
// ajustables sin tocar la lógica del árbol.
const HUE_ANALOGO = 0.15; // ~27°
const HUE_MONOCROMATICO = 0.05; // ~9°
const HUE_COMPLEMENTARIO = 0.78; // ~140° (no 0.72/130°, que cae en zona triádica)
const VALUE_AUDAZ = 0.3;
const VALUE_MONOCROMATICO = 0.15;
const VALUE_FUNDIDO = 0.12;
const SATURACION_BAJA = 45;
// Piso agregado en la 2da ronda de revisión de Consejo, auditando la regla
// 5 ("se funden") contra el catálogo real completo: SIN este piso, la
// regla generaba el 95% de todos los con_cuidado del motor, y CADA UNO de
// esos pares era una combinación real bien vista (marino+marrón,
// marino+bordó, marrón+verde militar -- la paleta "tierra"/de sastrería
// clásica), con saturación máxima 47 en el catálogo. El supuesto de la
// regla ("mismo valor + matiz distinto = mancha") solo se sostiene cuando
// AMBOS colores están bien saturados: ahí sí compiten por atención en pie
// de igualdad (ninguno domina en luminosidad NI se apaga en saturación) y
// se leen como caóticos en vez de intencionales -- que es distinto de la
// regla 4 (audaz), que funciona porque el contraste de VALOR marca cuál es
// la base y cuál el golpe de color. Dos tonos tierra opacos al mismo valor
// no compiten así: ninguno grita, así que no chocan. 50 deja afuera el
// máximo real del catálogo (47) y adentro los casos ya cubiertos por test
// (60, 70). 55, no 50: mismo argumento que NEUTRO_L_MIN/MAX un poco más
// abajo -- un margen más chico deja la misma prenda, fotografiada con otra
// luz, cruzando el umbral y cambiando de veredicto (detectado en la 3ra
// ronda de revisión). 55 deja 8 puntos de margen abajo (47) y 5 arriba (60).
const SATURACION_ALTA_MINIMA = 55;
// Banda de neutro ampliada (12/88, no 8/92): con un margen más chico, la
// misma prenda fotografiada dos veces con luz distinta podía cruzar el
// umbral y recibir veredictos opuestos entre una foto y otra.
const NEUTRO_L_MIN = 12;
const NEUTRO_L_MAX = 88;
const NEUTRO_S_MAX = 15;

export function hueDist(h0: number, h1: number): number {
  const diff = Math.abs(h0 - h1);
  return Math.min(diff, 360 - diff) / 180;
}

export function valueDist(l0: number, l1: number): number {
  return Math.abs(l0 - l1) / 100;
}

export function esNeutro(s: number, l: number): boolean {
  return s <= NEUTRO_S_MAX || l <= NEUTRO_L_MIN || l >= NEUTRO_L_MAX;
}

export interface ScoreColor {
  nivel: NivelCompatibilidad;
  tag?: "tono_sobre_tono" | "combinacion_audaz";
  explicacion: string;
}

/** Núcleo puro del motor: compara dos colores HSL y devuelve nivel + por qué. */
export function scoreColor(base: HSL, candidato: HSL): ScoreColor {
  const hd = hueDist(base.h, candidato.h);
  const vd = valueDist(base.l, candidato.l);
  const baseNeutro = esNeutro(base.s, base.l);
  const candNeutro = esNeutro(candidato.s, candidato.l);

  // 1. Neutro de por medio.
  if (baseNeutro || candNeutro) {
    return {
      nivel: "excelente",
      explicacion: "El neutro no compite con ningún color: combina con lo que sea.",
    };
  }

  // 2. Análogo + saturación baja.
  if (hd <= HUE_ANALOGO && Math.max(base.s, candidato.s) <= SATURACION_BAJA) {
    return {
      nivel: "excelente",
      explicacion: "Matices cercanos y tonos suaves: combinación segura.",
    };
  }

  // 3. Monocromático / tono sobre tono.
  if (hd <= HUE_MONOCROMATICO && vd <= VALUE_MONOCROMATICO) {
    return {
      nivel: "excelente",
      tag: "tono_sobre_tono",
      explicacion: "Es básicamente el mismo color repetido: combinación seguísima.",
    };
  }

  // 4. Complementario audaz.
  if (hd >= HUE_COMPLEMENTARIO && vd >= VALUE_AUDAZ) {
    return {
      nivel: "muy_bueno",
      tag: "combinacion_audaz",
      explicacion:
        "Colores opuestos en el círculo cromático con buen contraste de luminosidad: funciona, pero se nota.",
    };
  }

  // 5. Se funden -- solo si ambos están bien saturados (ver
  // SATURACION_ALTA_MINIMA arriba para el motivo real, no es un capricho).
  if (
    vd < VALUE_FUNDIDO &&
    !baseNeutro &&
    !candNeutro &&
    hd > HUE_ANALOGO &&
    Math.min(base.s, candidato.s) >= SATURACION_ALTA_MINIMA
  ) {
    return {
      nivel: "con_cuidado",
      explicacion: "Dos colores bien saturados al mismo valor compiten en pie de igualdad: se leen caóticos, no intencionales.",
    };
  }

  // 6. Resto.
  return {
    nivel: "muy_bueno",
    explicacion:
      hd < 0.5
        ? "Matices relacionados, buen equilibrio general."
        : "Contraste moderado, combinación prolija.",
  };
}

// Faltaban "denim" y "acolchado" acá -- el mapa se armó cuando el enum
// Textura solo tenía 8 valores, y quedó desactualizado cuando se agregaron
// esos dos (rondas de catálogo "jean"/"campera de pluma"). Consecuencia
// real verificada: la técnica de rescate "separar por textura" nunca se
// ofrecía para un jean, aunque sea el ejemplo más obvio de textura marcada
// que tiene el catálogo. Ambas van a "texturado": el tejido cruzado del
// denim y el acolchado de la campera de pluma se notan a simple vista,
// igual que la lana o la pana.
const FAMILIA_TEXTURA: Record<string, "liso" | "texturado"> = {
  algodon: "liso",
  seda: "liso",
  cuero_liso: "liso",
  lino: "liso",
  lana: "texturado",
  pana: "texturado",
  corderoy: "texturado",
  tejido_grueso: "texturado",
  denim: "texturado",
  acolchado: "texturado",
};

/**
 * Técnica de rescate para un match "con_cuidado". Orden: puente neutro (si
 * hay un neutro disponible en el placard) -> separar por textura (si ambas
 * prendas tienen textura conocida y son de familias distintas) -> repetir
 * color (catch-all, siempre disponible, va al final).
 */
export function tecnicaRescate(
  base: Prenda,
  candidato: Prenda,
  placard: Prenda[],
): string {
  const neutroDisponible = placard.find(
    (p) =>
      p.id !== base.id &&
      p.id !== candidato.id &&
      p.categoria !== base.categoria &&
      p.categoria !== candidato.categoria &&
      esNeutro(p.color_s, p.color_l),
  );
  if (neutroDisponible) {
    return `Sumá tu ${neutroDisponible.categoria} ${neutroDisponible.color_hex} entre las dos para separarlas.`;
  }

  if (base.textura && candidato.textura) {
    const famBase = FAMILIA_TEXTURA[base.textura];
    const famCand = FAMILIA_TEXTURA[candidato.textura];
    if (famBase && famCand && famBase !== famCand) {
      return "Si son de texturas bien distintas, el contraste de textura compensa el de color.";
    }
  }

  return "Repetí uno de los dos colores en un accesorio (cinturón, medias, gorra) para que se lea intencional.";
}

const CATEGORIAS_CUERO: Categoria[] = ["calzado", "accesorio"];

function prendaDeCuero(p: Prenda): boolean {
  return p.textura === "cuero_liso" && CATEGORIAS_CUERO.includes(p.categoria);
}

/** true si la prenda es un pantalón de vestir/clásico -- chino, pantalón de
 *  vestir -- no un jean ni un pantalón deportivo. Es la mitad "de abajo" de
 *  la convención de coordinar el cuero: el cuero no solo se coordina
 *  cinturón-con-zapato, también zapato/cinturón-con-pantalón, pero SOLO
 *  cuando el pantalón en sí es de vestir -- un jean con zapatos de cuero
 *  marrones es un combo "smart casual" real, no una descoordinación. */
function esPantalonDeVestir(p: Prenda): boolean {
  return p.categoria === "pantalon" && (p.estilo === "formal" || p.estilo === "clasico");
}

/** Cuero negro + cuero (o pantalón de vestir) de otro color (marrón,
 *  tostado...): por convención clásica de vestimenta el cuero se coordina
 *  aparte del resto de la ropa -- cinturón a tono con el calzado, y ambos a
 *  tono con un pantalón de vestir -- a diferencia de una remera, donde el
 *  negro sí es un neutro que combina con cualquier cosa. scoreColor no lo
 *  puede saber por sí solo (solo ve HSL, no categoría ni material), así
 *  que se corrige acá, con el Prenda completo disponible.
 *
 *  Cubre dos casos reales, verificados corriendo el motor contra el
 *  catálogo:
 *  - cuero + cuero: cinturón negro + zapatos de cuero marrones (reportado
 *    por el usuario) -- daba "excelente" porque negro es neutro en HSL.
 *  - cuero + pantalón de vestir: pantalón de vestir negro + zapatos/
 *    cinturón de cuero marrones, y pantalón beige + zapatos/cinturón de
 *    cuero negros -- mismo error, un escalón más arriba (encontrado en la
 *    segunda ronda de revisión, no en el reporte original). */
// 3ra ronda de revisión: la versión anterior de chocanEnAcromia usaba
// esNeutro (cualquier acromático) de cada lado, y eso generaba falsos
// positivos reales contra el pantalón -- un pantalón de vestir AZUL MARINO
// (no neutro por esNeutro, pero se lee como neutro de sastrería) chocaba
// con zapatos negros, y uno GRIS (sí neutro por esNeutro) chocaba con
// zapatos marrones. Marino+negro y gris+marrón son de los combos más
// estándar que existen -- el motor los estaba rechazando. La convención
// real es más chica que "acromático vs no acromático": es específicamente
// negro (de verdad oscuro) contra la familia tierra (marrón/tostado/
// camel), en cualquier dirección. Gris y marino son neutros de sastrería
// que van con las dos familias de cuero sin problema.
function esNegroProfundo(p: Prenda): boolean {
  return p.color_l <= NEUTRO_L_MIN;
}
function esTierraCalida(p: Prenda): boolean {
  return p.color_s >= 20 && p.color_h >= 15 && p.color_h <= 60;
}

function esDescoordinacionDeCuero(base: Prenda, candidato: Prenda): boolean {
  const chocanEnAcromia = (a: Prenda, b: Prenda) =>
    (esNegroProfundo(a) && esTierraCalida(b)) || (esTierraCalida(a) && esNegroProfundo(b));

  if (prendaDeCuero(base) && prendaDeCuero(candidato)) {
    return chocanEnAcromia(base, candidato);
  }

  const cuero = prendaDeCuero(base) ? base : prendaDeCuero(candidato) ? candidato : null;
  const otro = cuero === base ? candidato : base;
  if (cuero && esPantalonDeVestir(otro)) {
    return chocanEnAcromia(cuero, otro);
  }

  return false;
}

// Formalidad relativa de estilo -- mayor es más formal. "urbano" y
// "casual" quedan parejos a propósito: ninguno es más formal que el otro,
// son archetypes distintos del mismo registro relajado, no una escala.
const FORMALIDAD_ESTILO: Partial<Record<NonNullable<Prenda["estilo"]>, number>> = {
  formal: 3,
  clasico: 2,
  urbano: 1,
  casual: 1,
  deportivo: 0,
};

/** El calzado no puede ser MENOS formal que el pantalón -- zapatillas con
 *  un pantalón de vestir es la asimetría real (62 de los outfits que arma
 *  armarOutfitsSugeridos hoy la tienen, verificado en la revisión de
 *  Consejo). La regla es asimétrica a propósito: al revés (zapatos de
 *  cuero con un jean) es un combo "smart casual" real y no se toca -- acá
 *  el pie SUBE por encima del pantalón en formalidad, no baja. Solo se usa
 *  cuando ambas prendas declaran `estilo` (si no, no hay con qué comparar,
 *  y no se inventa un valor por defecto). */
function calzadoMenosFormalQuePantalon(base: Prenda, candidato: Prenda): boolean {
  const pantalon = base.categoria === "pantalon" ? base : candidato.categoria === "pantalon" ? candidato : null;
  const calzado = pantalon === base ? candidato : base;
  if (!pantalon || calzado.categoria !== "calzado") return false;
  if (!pantalon.estilo || !calzado.estilo) return false;
  const rangoPantalon = FORMALIDAD_ESTILO[pantalon.estilo];
  const rangoCalzado = FORMALIDAD_ESTILO[calzado.estilo];
  if (rangoPantalon === undefined || rangoCalzado === undefined) return false;
  return rangoCalzado < rangoPantalon;
}

// duplicado a propósito -- ver el comentario sobre CATEGORIAS_TORSO más
// abajo (esa constante se declara después porque la usa armarOutfits*, que
// vive más abajo en el archivo; acá hace falta antes).
const CATEGORIAS_CON_TORSO: Categoria[] = ["remera", "camisa", "buzo", "sweater", "campera"];

/** Una corbata (u otro accesorio con `requiere_cuello`) necesita una camisa
 *  con cuello debajo -- no es una cuestión de color, es que no hay dónde
 *  apoyarla. Hallazgo de la 2da ronda de revisión de Consejo: el motor
 *  recomendaba "excelente" para una corbata sobre un buzo o una remera,
 *  porque scoreColor solo ve HSL y esas combinaciones suelen matchear en
 *  color. No aplica contra pantalón/calzado (ahí el color de la corbata sí
 *  importa como en cualquier otro accesorio) ni contra una camisa. */
function esCorbataSinCuello(base: Prenda, candidato: Prenda): boolean {
  const conCuello = base.requiere_cuello ? base : candidato.requiere_cuello ? candidato : null;
  const otro = conCuello === base ? candidato : base;
  if (!conCuello) return false;
  return CATEGORIAS_CON_TORSO.includes(otro.categoria) && otro.categoria !== "camisa";
}

/** Recomienda, sobre un placard completo, las mejores prendas para combinar con `base`. */
export function recomendar(
  base: Prenda,
  candidatas: Prenda[],
  placard: Prenda[],
): Array<{ prenda: Prenda; score: ScoreColor; tecnicaRescate?: string }> {
  return candidatas
    .filter((c) => c.id !== base.id)
    .map((c) => {
      const cueroDescoordinado = esDescoordinacionDeCuero(base, c);
      const corbataSinCuello = !cueroDescoordinado && esCorbataSinCuello(base, c);
      let score: ScoreColor = cueroDescoordinado
        ? {
            nivel: "con_cuidado",
            explicacion:
              "El cuero se coordina aparte del resto de la ropa: negro con negro, marrón con marrón. Acá se mezclan tonos de cuero distintos -- no combina, aunque el negro sea neutro para todo lo demás.",
          }
        : corbataSinCuello
          ? {
              nivel: "con_cuidado",
              explicacion: "Una corbata necesita una camisa con cuello debajo -- no hay dónde apoyarla sobre esto.",
            }
          : scoreColor(
              { h: base.color_h, s: base.color_s, l: base.color_l },
              { h: c.color_h, s: c.color_s, l: c.color_l },
            );

      // El color puede combinar perfecto y el conjunto igual desentonar --
      // un pantalón de vestir con zapatillas es "excelente" en HSL (los dos
      // suelen ser neutros) pero no en formalidad. No se toca si el color
      // ya venía con problemas (con_cuidado): ese motivo pesa más y no hay
      // técnica de rescate que arregle "cambiá de calzado a uno más
      // formal" en el mismo sentido que las demás.
      if (score.nivel === "excelente" && calzadoMenosFormalQuePantalon(base, c)) {
        score = {
          nivel: "muy_bueno",
          explicacion: "El color combina, pero el calzado es más informal que el pantalón -- se nota el salto de registro.",
        };
      }

      return {
        prenda: c,
        score,
        tecnicaRescate:
          score.nivel !== "con_cuidado"
            ? undefined
            : cueroDescoordinado
              ? "Usá cinturón y calzado del mismo tono de cuero -- los dos marrones o los dos negros."
              : corbataSinCuello
                ? "Ponete una camisa con cuello debajo -- con buzo, remera, sweater o campera solos no hay dónde llevarla."
                : tecnicaRescate(base, c, placard),
      };
    })
    .sort((a, b) => nivelOrden(b.score.nivel) - nivelOrden(a.score.nivel));
}

function nivelOrden(nivel: NivelCompatibilidad): number {
  return { excelente: 2, muy_bueno: 1, con_cuidado: 0 }[nivel];
}

// duplicado a propósito de CAPA en Maniqui.tsx -- esa es la agrupación
// "de presentación" (cómo se dibuja); esta es la agrupación "de datos"
// (qué categorías compiten por el mismo lugar del outfit). Mismo criterio
// que color.ts ya documenta para NEUTRO_*: evitar una dependencia cruzada
// entre capas por repetir 5 strings.
const CATEGORIAS_TORSO: Categoria[] = ["remera", "camisa", "buzo", "sweater", "campera"];
const TODAS_LAS_CATEGORIAS: Categoria[] = [
  "remera",
  "camisa",
  "buzo",
  "sweater",
  "campera",
  "pantalon",
  "calzado",
  "accesorio",
];

/** Tanda de `cantidad` elementos de un pool arrancando en `offset`, dando la
 *  vuelta al llegar al final -- para que un botón de "otras opciones" en la
 *  UI nunca choque contra un límite mientras el pool no esté vacío. Un pool
 *  más chico que `cantidad` se muestra entero. Genérico y puro a propósito:
 *  lo usa Outfits.tsx para rotar tanto por armarOutfitsSugeridos como por
 *  armarOutfitsParaComprar sin duplicar la lógica de módulo. */
export function tanda<T>(pool: T[], offset: number, cantidad: number): T[] {
  if (pool.length === 0) return [];
  const vista: T[] = [];
  for (let i = 0; i < Math.min(cantidad, pool.length); i++) {
    vista.push(pool[(offset + i) % pool.length]);
  }
  return vista;
}

export interface OutfitSugerido {
  /** estable por composición: mismo set de prendas -> mismo id, para
   *  deduplicar contra outfits ya guardados y para key en React. */
  id: string;
  prendas: Prenda[];
}

function mejorPropia(
  ancla: Prenda,
  candidatas: Prenda[],
  placard: Prenda[],
): { prenda: Prenda; score: ScoreColor } | undefined {
  const [mejor] = recomendar(ancla, candidatas, placard);
  return mejor && mejor.score.nivel !== "con_cuidado" ? mejor : undefined;
}

/** true si dos prendas puntuales chocan (con_cuidado) entre sí. `mejorPropia`
 *  y `candidatasPropias` solo comparan cada prenda contra el ANCLA (el
 *  pantalón) -- nunca entre sí. Eso deja pasar outfits donde, por ejemplo,
 *  el calzado y el accesorio combinan bien cada uno por separado con el
 *  pantalón pero chocan entre sí (cuero descoordinado), o el torso elegido
 *  y el accesorio (una corbata sobre un buzo). Hallazgo de la 3ra ronda de
 *  revisión de Consejo: sin este chequeo, el mismo bug que motivó toda esta
 *  ronda ("cinturón negro + zapato marrón") podía reaparecer armado
 *  automáticamente por armarOutfitsSugeridos, según qué prenda ganara el
 *  slot de calzado/accesorio por orden de inserción del placard. */
function chocan(a: Prenda, b: Prenda, placard: Prenda[]): boolean {
  return recomendar(a, [b], placard)[0]?.score.nivel === "con_cuidado";
}

/** Todas las candidatas propias que combinan al menos "muy_bueno" con el
 *  ancla, mejor primero -- a diferencia de `mejorPropia`, no se queda solo
 *  con la primera: es la base para ofrecer variantes ("otras opciones") en
 *  vez de una única combinación fija. */
function candidatasPropias(
  ancla: Prenda,
  candidatas: Prenda[],
  placard: Prenda[],
): Array<{ prenda: Prenda; score: ScoreColor }> {
  return recomendar(ancla, candidatas, placard).filter((r) => r.score.nivel !== "con_cuidado");
}

/** Arma outfits completos automáticamente a partir del placard real, sin
 *  que el usuario elija nada -- un outfit por cada pantalón (es la
 *  categoría que conecta con todas las demás en CATEGORIAS_COMPLEMENTARIAS,
 *  el ancla natural) y por cada torso propio que combine al menos
 *  "muy_bueno" con ese pantalón -- nunca fuerza un "con cuidado". Varía el
 *  torso (no calzado/accesorio) porque es la prenda que más define la
 *  identidad visual de un outfit en el maniquí; esto es lo que le da al
 *  usuario "otras opciones" para ir rotando en vez de una sola combinación
 *  fija por pantalón. Devuelve el pool completo, mejor primero por ancla --
 *  la UI decide cuántas mostrar de una vez. */
export function armarOutfitsSugeridos(placard: Prenda[]): OutfitSugerido[] {
  const pantalones = placard.filter((p) => p.categoria === "pantalon");
  const resultados: OutfitSugerido[] = [];
  const vistos = new Set<string>();

  for (const ancla of pantalones) {
    const torsos = candidatasPropias(
      ancla,
      placard.filter((p) => CATEGORIAS_TORSO.includes(p.categoria)),
      placard,
    );
    const calzado = mejorPropia(
      ancla,
      placard.filter((p) => p.categoria === "calzado"),
      placard,
    );
    const accesorio = mejorPropia(
      ancla,
      placard.filter((p) => p.categoria === "accesorio"),
      placard,
    );

    for (const torso of torsos) {
      // calzado/accesorio se eligieron solo contra el pantalón -- acá se
      // valida que además no choquen entre sí ni con ESTE torso puntual
      // (cada variante de torso puede convivir distinto con el mismo
      // calzado/accesorio). El accesorio es el que se cae si hay choque:
      // es el único slot opcional de los tres, y sacarlo deja un outfit
      // igual de válido en vez de uno con una combinación real mala.
      const accesorioOk =
        accesorio &&
        !(calzado && chocan(accesorio.prenda, calzado.prenda, placard)) &&
        !chocan(accesorio.prenda, torso.prenda, placard);

      const prendas = [ancla, torso.prenda, calzado?.prenda, accesorioOk ? accesorio?.prenda : undefined].filter(
        (p): p is Prenda => p !== undefined,
      );

      const clave = [...prendas]
        .map((p) => p.id)
        .sort()
        .join("-");
      if (vistos.has(clave)) continue;
      vistos.add(clave);

      resultados.push({ id: clave, prendas });
    }
  }

  return resultados;
}

export interface OutfitParaComprar {
  id: string;
  /** prendas reales del placard que forman parte del outfit. */
  prendasPropias: Prenda[];
  /** la prenda del catálogo que no tiene y se sugiere comprar -- con hsl
   *  incluido (no solo PresetPrenda) para que quien la use después (p.ej.
   *  presetAPrendaSintetica en catalogo.ts) no tenga que recalcularlo. */
  sugerida: PresetPrenda & { hsl: HSL };
  categoriaSugerida: Categoria;
}

/** Categorías del placard que hoy están en cero -- sin ninguna prenda ahí,
 *  el usuario literalmente no puede armar nada que las use. */
export function categoriasAusentes(placard: Prenda[]): Categoria[] {
  const presentes = new Set(placard.map((p) => p.categoria));
  return TODAS_LAS_CATEGORIAS.filter((c) => !presentes.has(c));
}

/** Para cada pantalón y cada categoría ausente del placard, busca en el
 *  catálogo TODAS las prendas de esa categoría que combinan al menos
 *  "muy_bueno" con ese pantalón (mismo motor de color que el resto de la
 *  app, no una sugerencia inventada) -- una variante por cada una, mejor
 *  primero -- y arma el outfit resultante combinando cada prenda sugerida
 *  con lo mejor que el usuario YA tiene para los demás lugares. No se
 *  ofrece comprar algo que no va a combinar bien. Devuelve el pool
 *  completo; la UI decide cuántas mostrar de una vez. */
export function armarOutfitsParaComprar(
  placard: Prenda[],
  catalogo: (PresetPrenda & { hsl: HSL })[] = CATALOGO_CON_HSL,
): OutfitParaComprar[] {
  const pantalones = placard.filter((p) => p.categoria === "pantalon");
  const ausentes = categoriasAusentes(placard);
  const resultados: OutfitParaComprar[] = [];

  for (const ancla of pantalones) {
    // no depende de categoriaSugerida -- se calcula una sola vez por ancla.
    const torsoPropio = mejorPropia(
      ancla,
      placard.filter((p) => CATEGORIAS_TORSO.includes(p.categoria)),
      placard,
    );

    for (const categoriaSugerida of ausentes) {
      if (categoriaSugerida === "pantalon") continue; // el ancla ya es un pantalón

      const candidatosCatalogo = catalogo.filter((p) => p.categoria === categoriaSugerida);
      if (candidatosCatalogo.length === 0) continue;

      // Vía recomendar() (no scoreColor crudo) para que las prendas
      // sintéticas del catálogo pasen por las mismas reglas que cualquier
      // prenda real -- cuero, corbata/cuello, formalidad calzado/pantalón.
      // Antes de la 3ra ronda de revisión esto llamaba scoreColor()
      // directo y las tres reglas nuevas quedaban completamente afuera acá
      // (verificado: le sugería comprar zapatos de cuero negros para un
      // pantalón chino beige, exactamente lo que recomendar() marca
      // con_cuidado con ese pantalón).
      const sugeridosCandidatos = candidatosCatalogo
        .map((preset) => {
          const prendaSintetica = presetAPrendaSintetica(preset);
          const [r] = recomendar(ancla, [prendaSintetica], placard);
          return { preset, prendaSintetica, score: r.score };
        })
        .filter((c) => c.score.nivel !== "con_cuidado")
        .sort((a, b) => nivelOrden(b.score.nivel) - nivelOrden(a.score.nivel));
      if (sugeridosCandidatos.length === 0) continue;

      // "ausente" es por categoría puntual, no por grupo -- si falta
      // "campera" el usuario puede perfectamente tener una remera o un
      // sweater que ya combinan bien. Para una sugerencia de torso se
      // arma CON esa prenda propia de por medio (la campera sugerida se ve
      // como una capa extra encima, no como reemplazo -- Maniqui ya sabe
      // priorizar cuál mostrar como principal según PRIORIDAD_TORSO). Para
      // calzado/accesorio no hay ambigüedad: si esa categoría está
      // ausente, no hay nada propio con qué competir por ese lugar.
      const calzadoPropio =
        categoriaSugerida === "calzado"
          ? undefined
          : mejorPropia(
              ancla,
              placard.filter((p) => p.categoria === "calzado"),
              placard,
            );
      const accesorioPropio =
        categoriaSugerida === "accesorio"
          ? undefined
          : mejorPropia(
              ancla,
              placard.filter((p) => p.categoria === "accesorio"),
              placard,
            );

      const prendasPropias = [ancla, torsoPropio?.prenda, calzadoPropio?.prenda, accesorioPropio?.prenda].filter(
        (p): p is Prenda => p !== undefined,
      );
      // el resto de prendasPropias, sin el ancla -- torsoPropio/calzadoPropio/
      // accesorioPropio ya combinan con el pantalón (mejorPropia lo
      // garantiza), pero nunca se validaron entre sí. La sugerida es la
      // protagonista de esta idea puntual: si choca con algo que el
      // usuario YA tiene puesto acá, no tiene sentido ofrecerle comprarla
      // -- se descarta esa variante en vez de armar el outfit igual.
      const propiasSinAncla = prendasPropias.filter((p) => p.id !== ancla.id);

      for (const candidato of sugeridosCandidatos) {
        if (propiasSinAncla.some((p) => chocan(candidato.prendaSintetica, p, placard))) continue;

        resultados.push({
          id: `comprar-${ancla.id}-${candidato.preset.id}`,
          prendasPropias,
          sugerida: candidato.preset,
          categoriaSugerida,
        });
      }
    }
  }

  return resultados;
}

/** Diff entre las prendas actuales de un outfit guardado y las que el
 *  usuario dejó tildadas al editarlo -- qué hay que agregar y qué hay que
 *  sacar en la base. Función pura a propósito: quien la llama (Outfits.tsx)
 *  debe hacer el INSERT de `aAgregar` ANTES del DELETE de `aQuitar`, nunca
 *  al revés. Motivo real, no defensivo: si el usuario reemplaza TODAS las
 *  prendas del outfit por otras completamente distintas, `aQuitar` termina
 *  siendo igual a `actuales` -- borrar primero dejaría outfit_prendas en
 *  cero para ese outfit, y el trigger de la migración 0011 borra la fila de
 *  `outfits` apenas se queda sin prendas. El insert posterior fallaría por
 *  FK inexistente. Insertando primero, siempre queda al menos una fila viva. */
export function diffPrendasEdicion(
  actuales: Set<string>,
  deseadas: Set<string>,
): { aAgregar: string[]; aQuitar: string[] } {
  return {
    aAgregar: [...deseadas].filter((id) => !actuales.has(id)),
    aQuitar: [...actuales].filter((id) => !deseadas.has(id)),
  };
}

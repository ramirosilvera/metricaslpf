import { CATEGORIA_LABEL, type Categoria, type CorteCalzado, type Estacion, type Estilo, type HSL, type NivelCompatibilidad, type Prenda } from "./types";
import { CATALOGO_CON_HSL, presetAPrendaSintetica, type PresetPrenda } from "./catalogo";
import { nombreColor } from "./color";

// Umbrales calibrados en la revisión de Consejo (rondas 1-2). Nombrados y
// ajustables sin tocar la lógica del árbol.
const HUE_ANALOGO = 0.15; // ~27°
const HUE_MONOCROMATICO = 0.05; // ~9°
const HUE_COMPLEMENTARIO = 0.78; // ~140° (no 0.72/130°, que cae en zona triádica)
const VALUE_AUDAZ = 0.3;
const VALUE_MONOCROMATICO = 0.15;
const VALUE_FUNDIDO = 0.12;
// Piso de separación de valor para el degradé monocromático real (regla 1b
// de scoreColor) -- auditoría de color/textiles (Consejo, ronda siguiente).
// Entre VALUE_MONOCROMATICO (0.15) y este piso no hay ninguna regla propia:
// cae en el catch-all de la regla 6 ("Matices relacionados"), que sigue
// siendo un veredicto razonable para esa franja intermedia (ni plano del
// todo ni degradé marcado).
const VALUE_DEGRADE_MIN = 0.25;
// Piso de saturación (no croma -- ver el comentario largo en la regla 5 de
// scoreColor sobre por qué) agregado en la 2da ronda de revisión de
// Consejo, auditando la regla 5 ("se funden") contra el catálogo real
// completo: SIN este piso, la regla generaba el 95% de todos los
// con_cuidado del motor, y CADA UNO de esos pares era una combinación real
// bien vista (marino+marrón, marino+bordó, marrón+verde militar -- la
// paleta "tierra"/de sastrería clásica), con saturación máxima 47 en el
// catálogo. El supuesto de la regla ("mismo valor + matiz distinto =
// mancha") solo se sostiene cuando AMBOS colores están bien saturados: ahí
// sí compiten por atención en pie de igualdad (ninguno domina en
// luminosidad NI se apaga en saturación) y se leen como caóticos en vez de
// intencionales -- que es distinto de la regla 4 (audaz), que funciona
// porque el contraste de VALOR marca cuál es la base y cuál el golpe de
// color. Dos tonos tierra opacos al mismo valor no compiten así: ninguno
// grita, así que no chocan. 50 deja afuera el máximo real del catálogo (47)
// y adentro los casos ya cubiertos por test (60, 70). 55, no 50: mismo
// argumento que NEUTRO_L_MIN/MAX un poco más abajo -- un margen más chico
// deja la misma prenda, fotografiada con otra luz, cruzando el umbral y
// cambiando de veredicto (detectado en la 3ra ronda de revisión). 55 deja 8
// puntos de margen abajo (47) y 5 arriba (60).
const SATURACION_ALTA_MINIMA = 55;
// Banda de neutro ampliada (12/88, no 8/92): con un margen más chico, la
// misma prenda fotografiada dos veces con luz distinta podía cruzar el
// umbral y recibir veredictos opuestos entre una foto y otra.
const NEUTRO_L_MIN = 12;
const NEUTRO_L_MAX = 88;
const NEUTRO_S_MAX = 15;
// Tope de saturación en el extremo CLARO -- auditoría de color/textiles
// (Consejo, ronda siguiente), verificada corriendo el catálogo completo
// (máximo real 20 entre las prendas con l>=NEUTRO_L_MAX, así que no cambia
// ningún veredicto del catálogo curado). No es una simetría rota respecto
// del extremo oscuro (NEUTRO_L_MIN, sin tope de saturación): los dos
// extremos no son perceptualmente simétricos. Debajo de l=12 la
// discriminación de matiz colapsa (marino, verde botella y negro se leen
// todos como "oscuro"), así que cualquier oscuro funciona como neutro sin
// importar su saturación. Arriba de l=88 el matiz sigue siendo perfectamente
// legible -- un rosa pastel saturado es inconfundiblemente rosa, no un
// blanco -- así que sin este tope, dos tintes pastel bien distintos (rosa +
// menta, por ejemplo) daban "excelente" por ser ambos "neutros", cuando en
// realidad son dos colores compitiendo sin ninguna jerarquía de valor.
const NEUTRO_S_MAX_CLARO = 40;

export function hueDist(h0: number, h1: number): number {
  const diff = Math.abs(h0 - h1);
  return Math.min(diff, 360 - diff) / 180;
}

export function valueDist(l0: number, l1: number): number {
  return Math.abs(l0 - l1) / 100;
}

export function esNeutro(s: number, l: number): boolean {
  return s <= NEUTRO_S_MAX || l <= NEUTRO_L_MIN || (l >= NEUTRO_L_MAX && s <= NEUTRO_S_MAX_CLARO);
}

/** Croma HSL real (0-100): a diferencia de `s`, no está normalizado por `l`
 *  -- un celeste pastel (s=58 l=82) y un mostaza (s=62 l=47) tienen `s`
 *  parecido pero intensidad percibida MUY distinta (croma 21 vs 58).
 *  Auditoría de color/textiles (Consejo, ronda siguiente), verificada
 *  corriendo el catálogo completo: es esta magnitud, no `s`, la que separa
 *  la paleta base textil (croma <= 30: bordó, rosa, marrón, verde botella,
 *  beige, celeste, marino, oliva) de los acentos reales (croma >= 48:
 *  mostaza, rojo, azul deportivo) -- usada en las reglas 2, 4 y 4b de acá
 *  abajo (reemplazó a SATURACION_BAJA de la regla 2). La regla 5 sigue con
 *  `s` cruda a propósito -- ver su comentario, es un caso distinto: el
 *  croma castiga con fuerza a los colores oscuros (a l=20, ni s=100% llega
 *  a un croma de 40), así que reusar el mismo umbral casi anulaba esa regla
 *  para cualquier par oscuro saturado (detectado escribiendo el test de
 *  esta migración, no por inspección). Verificado por ejecución completa
 *  del catálogo real: 0 veredictos cambian en las reglas 2/4/4b. */
function croma(c: HSL): number {
  return c.s * (1 - Math.abs((2 * c.l) / 100 - 1));
}
// Umbral para las tres reglas (2, 4, 4b) que distinguen "paleta apagada/
// base" de "acento/color que compite" -- recalibrado contra el catálogo
// real (ver
// `croma` arriba): la paleta base vive en croma <= 30, los acentos reales
// arrancan en ~48.
const CROMA_ACENTO = 40;

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

  // 1b. Mismo matiz con luminosidades bien separadas: el degradé
  // monocromático real (marino + celeste, camel + chocolate). Auditoría de
  // color/textiles (Consejo, ronda siguiente): en teoría del color un
  // esquema monocromático funciona POR la variación de valor, no a pesar de
  // ella. Sin gate de croma a propósito: acá no hay dos matices compitiendo,
  // así que la intensidad de color no cambia el veredicto. Va ANTES de la
  // regla 2 (no después, como en su primera versión): al migrar la regla 2
  // de `s` a croma, empezó a absorber estos mismos pares (croma bajo +
  // matiz cercano) antes de que llegaran acá, devolviendo "excelente" pero
  // con el mensaje genérico en vez del de degradé -- mismo nivel, peor
  // mensaje. Puesta primero, esta regla se queda con el caso más específico
  // (vd grande) y la 2 solo ve lo que le queda (vd chico).
  if (hd <= HUE_ANALOGO && vd >= VALUE_DEGRADE_MIN) {
    return {
      nivel: "excelente",
      tag: "tono_sobre_tono",
      explicacion: "Mismo matiz en dos luminosidades bien distintas: el degradé tono sobre tono clásico.",
    };
  }

  // 2. Análogo + croma apagado (no `s` crudo -- ver `croma` más arriba).
  if (hd <= HUE_ANALOGO && Math.max(croma(base), croma(candidato)) <= CROMA_ACENTO) {
    return {
      nivel: "excelente",
      explicacion: "Matices cercanos y tonos suaves: combinación segura.",
    };
  }

  // 3. Monocromático / tono sobre tono (plano: mismo valor).
  if (hd <= HUE_MONOCROMATICO && vd <= VALUE_MONOCROMATICO) {
    return {
      nivel: "excelente",
      tag: "tono_sobre_tono",
      explicacion: "Es básicamente el mismo color repetido: combinación seguísima.",
    };
  }

  // 4. Complementarios.
  if (hd >= HUE_COMPLEMENTARIO && vd >= VALUE_AUDAZ) {
    // Complementarios APAGADOS con buen contraste de luminosidad: no es un
    // statement, es la base de la paleta de sastrería clásica (camel +
    // marino, celeste + marrón). Auditoría de color/textiles (Consejo,
    // ronda siguiente), verificada corriendo el catálogo completo (155
    // pares con tag "audaz", 126 de ellos con croma bajo): lo que hace
    // "audaz" a un complementario es su croma, no el ángulo de matiz -- el
    // matiz del beige (h=41) es formalmente complementario del azul marino,
    // pero los dos están tan rebajados que no compiten como statement.
    if (Math.max(croma(base), croma(candidato)) < CROMA_ACENTO) {
      return {
        nivel: "excelente",
        explicacion: "Complementarios apagados con buen contraste de luminosidad: la base de la paleta clásica.",
      };
    }
    return {
      nivel: "muy_bueno",
      tag: "combinacion_audaz",
      explicacion:
        "Colores opuestos en el círculo cromático con buen contraste de luminosidad: funciona, pero se nota.",
    };
  }

  // 4b. Complementarios de croma alto SIN separación de luminosidad: el
  // contraste simultáneo real (el borde "vibra", ninguno de los dos manda).
  // Es la contracara de la regla 4: ahí el contraste de valor es lo que
  // hace que el par funcione: sin él, dos complementarios intensos no
  // pueden caer en el catch-all "combinación prolija" de la regla 6.
  if (hd >= HUE_COMPLEMENTARIO && vd < VALUE_AUDAZ && Math.min(croma(base), croma(candidato)) >= CROMA_ACENTO) {
    return {
      nivel: "con_cuidado",
      explicacion: "Colores opuestos, los dos intensos y casi con la misma luminosidad: se pelean en vez de contrastar.",
    };
  }

  // 5. Se funden -- solo si ambos están bien saturados de verdad (ver
  // SATURACION_ALTA_MINIMA arriba para el motivo real, no es un capricho).
  // A propósito NO usa `croma` (a diferencia de las reglas 2/4/4b, ver
  // CROMA_ACENTO): la fórmula de croma castiga con fuerza a los colores
  // OSCUROS (a l=20, ni s=100% llega a un croma de 40) -- reusar el mismo
  // umbral acá casi anulaba la regla para cualquier par oscuro saturado,
  // sin importar cuánto compitieran de verdad (detectado escribiendo el
  // test de esta migración: un rojo oscuro s90 l20 + un azul oscuro s60
  // l24, ambos claramente saturados y compitiendo, dejaban de chocar). El
  // croma SÍ es la métrica correcta para separar "acento" de "paleta base"
  // en las reglas 2/4/4b, pensadas para pares de cualquier luminosidad
  // comparados contra un umbral fijo -- pero acá, con `vd` ya forzado casi
  // a cero, la saturación cruda sigue siendo el proxy más fiel de cuánto
  // "grita" cada color.
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
  // tela técnica de ropa deportiva -- plana/lisa (no tejida en trama
  // visible como la lana o el tejido grueso), con el mismo leve brillo
  // sintético que la seda o el cuero liso (ver TEXTURA_BRILLO en
  // Maniqui.tsx): por eso "liso", no "texturado".
  poliester: "liso",
  // fibra de caída lisa y suave (el sweater liviano de entretiempo, ver
  // catalogo.ts) -- sin la trama tejida marcada de la lana, mismo brillo
  // sutil que seda/poliéster (ver TEXTURA_BRILLO en Maniqui.tsx).
  viscosa: "liso",
  lana: "texturado",
  pana: "texturado",
  corderoy: "texturado",
  tejido_grueso: "texturado",
  // afelpado/cepillado -- misma familia visual y táctil que tejido_grueso
  // (trama de punto marcada, no lisa), agregado junto con el valor nuevo de
  // Textura para diferenciar buzos livianos de pesados (pedido explícito
  // del usuario, revisado como ingeniero textil -- ver el comentario largo
  // en catalogo.ts sobre por qué esto es un dato de textura y no de
  // estación).
  frisado: "texturado",
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

// pantalon, bermuda y short_deportivo son las tres categorías "de piernas"
// del placard (ver el mismo criterio en Maniqui.tsx/CAPA y en
// CATEGORIAS_COMPLEMENTARIAS de types.ts) -- todo lo que en este archivo
// usaba literalmente "pantalon" como el ancla del outfit (formalidad,
// registro, armado automático de combinaciones) se generaliza a esta lista,
// para que un placard con un bermuda o un short deportivo pero SIN ningún
// pantalón largo no quede invisible para el motor de recomendación: antes
// de este cambio, agregar un bermuda al placard lo dejaba disponible para
// combinar manualmente (Probar/Combinar, que ya andan por
// CATEGORIAS_COMPLEMENTARIAS) pero totalmente ausente de "outfits
// sugeridos", "para comprar" y el badge de registro -- una prenda cargada
// que el resto de la app trata como si no existiera, justo la clase de
// funcionalidad a medias que hay que evitar.
const CATEGORIAS_PIERNAS: Categoria[] = ["pantalon", "bermuda", "short_deportivo"];

const CATEGORIAS_CUERO: Categoria[] = ["calzado", "accesorio"];

// Segunda opinión de sastrería (Consejo, ronda siguiente): `corte_calzado`
// existía en el modelo de datos hace varias rondas (zapatilla_urbana/
// running/zapato_vestir/mocasin/zapatilla_lona) pero el motor nunca lo
// leía -- toda la sastrería del calzado (coordinación de cuero, choque
// contra un ancla deportiva) dependía por completo de `textura ===
// "cuero_liso"`, un campo opcional que el formulario manual no completa
// por defecto. Verificado por ejecución: un zapato de vestir o un mocasín
// cargado por foto (sin abrir "Tags opcionales" y elegir "cuero_liso" a
// mano) apagaba la coordinación de cuero entera -- daba "excelente" con un
// cinturón de otro tono, el mismo bug insignia de esta app. Ahora
// `corte_calzado` cuenta por sí solo: un zapato_vestir o un mocasín SON
// cuero de vestir por definición (es el dato que el usuario sí reconoce
// sin ambigüedad al cargar la prenda -- "¿es un mocasín o una
// zapatilla?"), sin necesitar que además haya tildado la textura.
const CORTES_DE_VESTIR: CorteCalzado[] = ["zapato_vestir", "mocasin"];

function prendaDeCuero(p: Prenda): boolean {
  if (!CATEGORIAS_CUERO.includes(p.categoria)) return false;
  if (p.textura === "cuero_liso") return true;
  return p.categoria === "calzado" && CORTES_DE_VESTIR.includes(p.corte_calzado);
}

/** true si la prenda es una prenda de piernas de vestir/clásica -- chino,
 *  pantalón de vestir, o un bermuda del mismo registro -- no un jean, un
 *  jogger ni un short deportivo. Es la mitad "de abajo" de la convención de
 *  coordinar el cuero: el cuero no solo se coordina cinturón-con-zapato,
 *  también zapato/cinturón-con-pantalón (o bermuda), pero SOLO cuando la
 *  prenda en sí es de vestir -- un jean (o un bermuda de jean) con zapatos
 *  de cuero marrones es un combo "smart casual" real, no una
 *  descoordinación. Generalizada de "pantalon" a CATEGORIAS_PIERNAS: un
 *  bermuda de chino clasico (ver catalogo.ts) es tan "de vestir" como el
 *  pantalón chino del que sale -- no hay motivo real para tratarlos
 *  distinto acá. short_deportivo nunca entra por esta puerta en la
 *  práctica: ninguna entrada del catálogo le carga estilo "formal" ni
 *  "clasico" (siempre "deportivo"), pero el chequeo de estilo abajo lo
 *  filtraría igual aunque algún día se cargara mal.
 *
 *  Multi-estilo: alcanza con que formal/clasico sea CUALQUIERA de los
 *  estilos declarados (principal o secundario, vía estilosDe) -- si un
 *  pantalón es "clasico" además de "casual", sigue siendo lo bastante de
 *  vestir como para que aplique la convención del cuero. */
function esPantalonDeVestir(p: Prenda): boolean {
  if (!CATEGORIAS_PIERNAS.includes(p.categoria)) return false;
  const estilos = estilosDe(p);
  return estilos.includes("formal") || estilos.includes("clasico");
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
// Auditoría de Consejo (revisor de QA, verificado por ejecución): sin el
// `&& !esTierraCalida(p)` de acá abajo, esNegroProfundo (l<=12) y
// esTierraCalida (s>=20, h 15-60) se solapan -- un cuero marrón oscuro
// real y saturado ("espresso", ej. h=30 s=40 l=10) cumple las DOS
// definiciones a la vez. chocanEnAcromia(a, b) con a=b ese mismo color
// entonces daba true (esNegroProfundo(a) && esTierraCalida(b), ambas
// ciertas sobre el mismo objeto), así que dos prendas de cuero espresso
// EXACTAMENTE DEL MISMO TONO se marcaban con_cuidado -- exactamente el
// caso que esta regla existe para aprobar, no para rechazar.
// Primer intento de fix: agregar un piso de saturación fijo (`s < 20`) a
// esNegroProfundo -- ROTO, verificado con vitest: el negro de cuero real
// que ya usa el catálogo (#1C1210 -> h=10 s=27 l=9, un negro con un
// dejo cálido, común en cuero teñido de verdad) tiene s=27, así que ese
// corte fijo lo sacaba de "negro profundo" sin meterlo en "tierra
// cálida" (su h=10 igual queda fuera del rango 15-60) -- quedaba sin
// clasificar en ninguna familia y dejaba de chocar contra el beige de
// vestir, rompiendo un test ya existente y bien fundado. La saturación
// sola no alcanza para distinguir "negro" de "marrón oscuro": lo que
// definía a esTierraCalida ya es la franja exacta de matiz+saturación
// que hace "marrón", así que basta con excluirla explícitamente en vez
// de inventar un segundo piso de saturación aparte -- un negro con
// cualquier matiz fuera de esa franja (o con matiz adentro pero
// insuficiente saturación) sigue siendo "negro profundo" real.
function esTierraCalida(p: Prenda): boolean {
  return p.color_s >= 20 && p.color_h >= 15 && p.color_h <= 60;
}
function esNegroProfundo(p: Prenda): boolean {
  return p.color_l <= NEUTRO_L_MIN && !esTierraCalida(p);
}
/** Tercera familia real de cuero de vestir -- burdeos/oxblood/cordovan.
 *  Auditoría de color/textiles (Consejo, ronda siguiente): no es un color
 *  exótico, es un básico de zapatería/marroquinería clásica (junto con
 *  negro y marrón), y hasta ahora no encajaba en ninguna de las otras dos
 *  familias -- no en esTierraCalida (su matiz está del otro lado del 0, no
 *  en la franja 15-60 de marrón/tostado/camel) ni en esNegroProfundo (no
 *  es oscuro de verdad, l>NEUTRO_L_MIN). Un cuero burdeos caía entonces sin
 *  clasificar y volvía a colarse por el mismo agujero que motivó toda esta
 *  regla: contra un cinturón negro, "el negro es neutro" en HSL y daba
 *  "excelente" -- exactamente el bug original, reaparecido en la familia
 *  que no se modeló. No está en el catálogo hoy (0 impacto real todavía),
 *  pero el calzado es la categoría que más se carga por foto. l acotado a
 *  (NEUTRO_L_MIN, 40]: dejar afuera el negro de cuero real del catálogo
 *  (#1C1210, h10 l9, que ya cae en esNegroProfundo) y no confundirse con un
 *  burdeos casi claro (que ya no se lee como cuero oscuro). h en
 *  [325,360]∪[0,8]: la franja real de rojo-violáceo/vino, disjunta a
 *  propósito de los 15-60 de esTierraCalida -- un burdeos y un marrón NO
 *  chocan entre sí (es una coordinación real y aceptada, mismo criterio que
 *  ya vale para dos tierras cualquiera). */
function esBurdeosDeCuero(p: Prenda): boolean {
  return p.color_s >= 20 && p.color_l > NEUTRO_L_MIN && p.color_l <= 40 && (p.color_h >= 325 || p.color_h <= 8);
}

function esDescoordinacionDeCuero(base: Prenda, candidato: Prenda): boolean {
  const esDeColor = (p: Prenda) => esTierraCalida(p) || esBurdeosDeCuero(p);
  const chocanEnAcromia = (a: Prenda, b: Prenda) =>
    (esNegroProfundo(a) && esDeColor(b)) || (esDeColor(a) && esNegroProfundo(b));

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

/** Todos los estilos en los que una prenda funciona: el principal
 *  (`estilo`) más los adicionales (`estilos_secundarios`) -- pedido
 *  explícito del usuario: "algunas prendas pueden funcionar para más de un
 *  estilo" (ej. un sweater mostaza tan válido para oficina/clásico como
 *  para casual). `registroOutfit` (más abajo) sigue usando solo el
 *  principal para el badge del outfit completo -- este helper es para las
 *  reglas de COMPATIBILIDAD (¿esta prenda choca con esa otra?), donde
 *  cualquiera de sus registros declarados cuenta. Nunca duplica si el
 *  principal está repetido en los secundarios (no debería pasar por UI,
 *  pero no hay que confiar en eso acá). */
export function estilosDe(p: Prenda): Estilo[] {
  const todos = p.estilo ? [p.estilo, ...p.estilos_secundarios] : p.estilos_secundarios;
  return [...new Set(todos)];
}

// Formalidad relativa de estilo -- mayor es más formal, agrupada en 3
// escalones, no 5. "formal" y "clasico" quedan parejos a propósito: un
// pantalón de vestir con una camisa blanca (formal + clasico) es la
// combinación de vestir más estándar que existe, no una donde la camisa
// "le queda abajo" al pantalón -- bug real encontrado escribiendo los
// tests de esta misma regla (un sweater "clasico" con un pantalón
// "formal" se degradaba a muy_bueno, y así también la camisa). Mismo
// criterio para "urbano"/"casual": son archetypes distintos del mismo
// registro relajado, ninguno es más formal que el otro.
const FORMALIDAD_ESTILO: Partial<Record<NonNullable<Prenda["estilo"]>, number>> = {
  formal: 2,
  clasico: 2,
  urbano: 1,
  casual: 1,
  deportivo: 0,
};

// duplicado a propósito -- ver el comentario sobre CATEGORIAS_TORSO más
// abajo (esa constante se declara después porque la usa armarOutfits*, que
// vive más abajo en el archivo; acá hace falta antes). "saco" agregado a
// pedido explícito del usuario ("un traje azul marino") -- es una prenda
// de torso tanto como campera/sweater/buzo, así que entra por la misma
// puerta a todas las reglas de formalidad/registro de acá abajo (cuero,
// corbata sin cuello, formalidad vs. pantalón).
const CATEGORIAS_CON_TORSO: Categoria[] = ["remera", "camisa", "buzo", "sweater", "campera", "saco"];

/** El calzado O el torso no pueden ser MENOS formales que la prenda de
 *  piernas (pantalón, bermuda o short deportivo) -- zapatillas con un
 *  pantalón de vestir, o un buzo (hoodie casual) con un pantalón de vestir,
 *  son la misma asimetría real. Reportado dos veces con ejemplos concretos
 *  en la revisión de Consejo: primero calzado (zapatillas + pantalón de
 *  vestir), después el usuario mismo señaló el caso de torso (pantalón de
 *  vestir + buzo + camisa, una combinación que le sonó rara -- y con
 *  razón: "sweater" (de vestir) y "buzo" (hoodie casual) son categorías
 *  DISTINTAS en el catálogo, con estilo distinto, y el motor no las
 *  diferenciaba). La regla es asimétrica a propósito: al revés (zapatos de
 *  cuero o un sweater de vestir con un jean) es un combo "smart casual"
 *  real y no se toca -- acá lo que sube por encima de la prenda de piernas
 *  en formalidad no baja el nivel, solo lo que se queda por debajo. Solo
 *  se usa cuando el pantalón declara `estilo` y la otra prenda declara al
 *  menos un estilo -- propio o secundario -- (si no, no hay con qué
 *  comparar, y no se inventa un valor por defecto). El nombre de la
 *  función sigue diciendo "Pantalon" (no se renombra en esta pasada, para
 *  no ensuciar el diff con un rename masivo) pero desde acá se aplica por
 *  igual a las tres categorías de CATEGORIAS_PIERNAS.
 *
 *  Multi-estilo: el pantalón ancla la comparación con su estilo PRINCIPAL
 *  únicamente (es el que define el registro del outfit completo, igual que
 *  registroOutfit) -- pero la otra prenda se evalúa por el MEJOR (más
 *  formal) de TODOS sus estilos declarados, principal o secundario. Un
 *  sweater tageado "clasico" + "casual" no se degrada contra un pantalón
 *  "casual": tiene un estilo (el secundario) que alcanza esa formalidad,
 *  aunque su estilo principal sea otro. */
function prendaMenosFormalQuePantalon(base: Prenda, candidato: Prenda): boolean {
  const pantalon = CATEGORIAS_PIERNAS.includes(base.categoria)
    ? base
    : CATEGORIAS_PIERNAS.includes(candidato.categoria)
      ? candidato
      : null;
  const otra = pantalon === base ? candidato : base;
  if (!pantalon) return false;
  if (otra.categoria !== "calzado" && !CATEGORIAS_CON_TORSO.includes(otra.categoria)) return false;
  if (!pantalon.estilo) return false;
  const rangosOtra = estilosDe(otra)
    .map((e) => FORMALIDAD_ESTILO[e])
    .filter((r): r is number => r !== undefined);
  if (rangosOtra.length === 0) return false;
  const rangoPantalon = FORMALIDAD_ESTILO[pantalon.estilo];
  if (rangoPantalon === undefined) return false;
  return Math.max(...rangosOtra) < rangoPantalon;
}

/** Volumen/proporción: tercer eje real de un conjunto (después de color y
 *  registro/formalidad), auditoría de sastrería (Consejo, ronda de
 *  auditoría del motor) -- el único que hasta esta ronda no tenía ningún
 *  dato (ver Calce en types.ts). Volumen arriba pide volumen contenido
 *  abajo (y al revés); acumular volumen en las dos puntas (campera oversize
 *  + jogger holgado + zapatilla voluminosa) es el error de proporción más
 *  común de un placard urbano real. A diferencia del registro o el cuero,
 *  esto NO es un choque -- es una cuestión de GRADO, así que solo degrada
 *  "excelente" a "muy_bueno" (ver su uso en recomendar(), mismo patrón que
 *  prendaMenosFormalQuePantalon un poco más arriba), nunca bloquea la
 *  combinación ni la saca del pool de armarOutfits*. Solo entre piernas y
 *  torso (CATEGORIAS_PIERNAS/CATEGORIAS_CON_TORSO) -- calzado y accesorio
 *  no tienen un calce real que compita en volumen (mismo criterio que ya
 *  explica Calce en types.ts). "regular" (el default de toda prenda sin
 *  este dato cargado a mano) nunca dispara la regla: hace falta que las DOS
 *  declaren "holgado" de verdad -- no se inventa un choque por falta de
 *  dato, mismo criterio que el resto de las reglas de esta familia. */
function chocanEnVolumen(base: Prenda, candidato: Prenda): boolean {
  const pierna = CATEGORIAS_PIERNAS.includes(base.categoria)
    ? base
    : CATEGORIAS_PIERNAS.includes(candidato.categoria)
      ? candidato
      : null;
  if (!pierna) return false;
  const torso = pierna === base ? candidato : base;
  if (!CATEGORIAS_CON_TORSO.includes(torso.categoria)) return false;
  return pierna.calce === "holgado" && torso.calce === "holgado";
}

/** El registro "deportivo" no es solo "el escalón más informal" de la
 *  escala de FORMALIDAD_ESTILO -- es funcionalmente distinto (tela técnica,
 *  corte pensado para moverse), y no se puede "elevar" con una prenda de
 *  vestir de la misma forma que un jean sube con un blazer o zapatos de
 *  cuero (esa es justo la excepción "smart casual" que prendaMenosFormal-
 *  QuePantalon deja pasar a propósito). Reportado por el usuario con un
 *  ejemplo concreto y grave: el motor sugería un short deportivo con
 *  cinturón de cuero y, en otros casos, con sweater de lana -- ninguna de
 *  las dos existe en indumentaria real. Dos motivos por los que
 *  prendaMenosFormalQuePantalon no lo atrapaba:
 *  1. Es asimétrica a propósito (sube-sí-baja-no) -- un sweater "clasico"
 *     (rango 2) nunca cuenta como "menos formal" que un pantalón
 *     "deportivo" (rango 0), así que la regla lo deja pasar como si fuera
 *     una elevación válida.
 *  2. Excluye accesorio explícitamente (`otra.categoria !== "calzado" &&
 *     !CATEGORIAS_CON_TORSO.includes(...)`) -- un cinturón nunca pasa por
 *     ese chequeo en absoluto, chocara o no.
 *  Esta función es la contraparte: simétrica (no importa qué lado es el
 *  ancla) y sin excepción de categoría (aplica también a accesorio). Solo
 *  choca contra "formal"/"clasico" -- "urbano" sigue siendo válido con
 *  deportivo (zapatillas urbanas, campera urbana con jogger: combinación
 *  real de calle, no un error).
 *
 *  Multi-estilo: usa TODOS los estilos declarados de cada prenda (principal
 *  + secundarios, vía estilosDe). "Es deportivo" alcanza con que uno de sus
 *  estilos sea "deportivo" -- si además tiene otro, sigue siendo deportivo
 *  para este chequeo. "Es de vestir" es más estricto a propósito: solo si
 *  TODOS sus estilos son formal/clasico (ninguno casual/urbano/deportivo).
 *  Así, un sweater tageado "clasico" + "casual" ya NO choca con deportivo
 *  -- tiene un registro casual real declarado, que alcanza como "escape" --
 *  mientras que un sweater puramente "clasico" (sin ningún otro estilo)
 *  sigue chocando como antes. */
function chocaRegistroDeportivo(a: Prenda, b: Prenda): boolean {
  const esDeportivo = (p: Prenda) => estilosDe(p).includes("deportivo");
  const esDeVestir = (p: Prenda) => {
    // Un zapato de vestir o un mocasín (cuero_liso) es cuero de suela dura,
    // categóricamente ajeno a un look deportivo, sea cual sea su estilo
    // declarado -- a diferencia de "chocan por color", acá no hay excepción
    // real posible. Auditoría de sastrería (Consejo, ronda siguiente):
    // mocasines-negras/marrones tienen estilo "clasico" + secundario
    // "casual" (a propósito, para combinar con jean/chino sin choque) --
    // pero ese mismo secundario "casual" rompía `estilos.every(formal/
    // clasico)` de acá abajo y dejaba pasar mocasín + short/jogger
    // deportivo sin ningún choque (armarOutfitsSugeridos no restringe
    // calzado contra un ancla deportiva a propósito, para que una
    // zapatilla urbana sí combine -- ver el comentario ahí -- pero eso
    // también dejaba pasar el cuero de vestir por la misma puerta).
    // Verificado: sin este caso, un short deportivo negro + mocasines
    // negros terminaba "excelente" (ambos neutros en HSL). Vía
    // prendaDeCuero (no el textura crudo): esa función ahora también
    // reconoce corte_calzado="zapato_vestir"/"mocasin" sin necesitar
    // textura="cuero_liso" cargada a mano -- mismo motivo, ver su
    // comentario más arriba.
    if (prendaDeCuero(p)) return true;
    const estilos = estilosDe(p);
    return estilos.length > 0 && estilos.every((e) => e === "formal" || e === "clasico");
  };
  return (esDeportivo(a) && esDeVestir(b)) || (esDeportivo(b) && esDeVestir(a));
}

export const ESTILO_LABEL: Record<Estilo, string> = {
  formal: "Formal",
  clasico: "Clásico",
  urbano: "Urbano",
  casual: "Casual",
  deportivo: "Deportivo",
};

/** Pedido explícito del usuario: que la app diga a qué registro (laboral,
 *  casual, urbano, clásico...) corresponde un outfit, no solo que evite
 *  combinaciones raras en silencio. Usa el `estilo` de la prenda de piernas
 *  (pantalón, bermuda o short deportivo -- CATEGORIAS_PIERNAS) como
 *  referencia del outfit completo -- es el ancla de todas las reglas de
 *  formalidad de acá arriba, así que ya es "la" prenda que define el
 *  registro en el resto del motor; no es un dato inventado nuevo, es el
 *  mismo que ya se usa para decidir si el resto combina. Sin ninguna
 *  prenda de piernas en el outfit, o sin `estilo` cargado en ella, no hay
 *  de dónde sacarlo -- no se inventa un valor por defecto. */
export function registroOutfit(prendas: Prenda[]): string | null {
  const pantalon = prendas.find((p) => CATEGORIAS_PIERNAS.includes(p.categoria));
  return pantalon?.estilo ? ESTILO_LABEL[pantalon.estilo] : null;
}

/** true si el outfit sirve para la ocasión pedida -- usado por "Vestite
 *  hoy" (Outfits.tsx) para filtrar, tanto los outfits armados solos como
 *  los ya guardados. A diferencia de registroOutfit (que etiqueta el
 *  outfit con el estilo PRINCIPAL del pantalón, para el badge), acá se
 *  chequean TODOS los estilos declarados del pantalón (principal +
 *  secundarios, vía estilosDe): un pantalón "clasico" con "casual" como
 *  estilo secundario aparece tanto si el usuario elige Clásico como
 *  Casual, no solo el principal. */
export function outfitSirveParaEstilo(prendas: Prenda[], estilo: Estilo): boolean {
  const pantalon = prendas.find((p) => CATEGORIAS_PIERNAS.includes(p.categoria));
  if (!pantalon) return false;
  return estilosDe(pantalon).includes(estilo);
}

/** Mensajes puntuales de por qué una prenda del outfit desentona en
 *  registro con la prenda de piernas (no en color -- eso ya lo cubre
 *  `recomendar`), para mostrar junto al outfit en vez de dejar la
 *  democión a muy_bueno escondida adentro del `explicacion` de un par que
 *  la UI de outfits armados no siempre muestra. */
export function advertenciasDeRegistro(prendas: Prenda[]): string[] {
  const pantalon = prendas.find((p) => CATEGORIAS_PIERNAS.includes(p.categoria));
  if (!pantalon) return [];
  const avisos: string[] = [];
  for (const p of prendas) {
    if (p.id === pantalon.id) continue;
    if (prendaMenosFormalQuePantalon(pantalon, p)) {
      // "el" concuerda con las tres categorías de CATEGORIAS_PIERNAS (el
      // pantalón, el bermuda, el short deportivo) -- no hace falta variar
      // el artículo por categoría.
      avisos.push(`${CATEGORIA_LABEL[p.categoria]} más informal que el ${CATEGORIA_LABEL[pantalon.categoria]}`);
    }
  }
  return avisos;
}

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

/** Un bermuda/short "de calle" (no deportivo) no combina con una prenda "de
 *  oficina" real (`ocasion` laburo o formal) -- ver esDeOficina más abajo
 *  (definida después en el archivo porque también la usa armarOutfits*, que
 *  vive más abajo; acá hace falta antes, mismo criterio que ya explica el
 *  duplicado de CATEGORIAS_CON_TORSO/CATEGORIAS_TORSO). Auditoría de
 *  sastrería (Consejo, ronda siguiente), verificada por ejecución directa:
 *  esDeOficina hasta esta ronda SOLO se aplicaba como pre-filtro de
 *  candidatas dentro de armarOutfitsSugeridos/armarOutfitsParaComprar (el
 *  armado automático de "Vestite hoy"/"Ideas para comprar") -- pero
 *  `recomendar()`, la función que llaman directo las pantallas MANUALES
 *  "Combinar" y "Recomendaciones" (Recomendaciones.tsx), nunca la
 *  chequeaba. Resultado real: un bermuda + una camisa de oficina, o un
 *  bermuda + zapatos de vestir, daban "excelente"/"muy_bueno" en Combinar,
 *  la misma combinación que "Vestite hoy" ya rechaza para ese mismo
 *  placard -- una inconsistencia entre las dos pantallas, no solo un hueco
 *  aislado. Simétrica (no importa qué lado es la base) y sin excepción de
 *  deportivo: ni siquiera un short deportivo combina con ropa de oficina
 *  real, mismo criterio que ya rige en armarOutfits* (ver esDeOficina). */
function esDescoordinacionDeOficina(base: Prenda, candidato: Prenda): boolean {
  const veraniega = CATEGORIAS_PIERNAS_VERANIEGAS.includes(base.categoria)
    ? base
    : CATEGORIAS_PIERNAS_VERANIEGAS.includes(candidato.categoria)
      ? candidato
      : null;
  if (!veraniega) return false;
  const otra = veraniega === base ? candidato : base;
  return esDeOficina(otra);
}

/** Mismo agujero que esDescoordinacionDeOficina de arriba, mismo motivo:
 *  `excluirAbrigo`/`excluirSaco` (ver armarOutfitsSugeridos más abajo) solo
 *  se aplicaban como pre-filtro dentro del armado automático -- nunca
 *  dentro de `recomendar()`. Segunda opinión de sastrería (Consejo, ronda
 *  siguiente), verificada por ejecución directa contra el catálogo real:
 *  18-20 de 30 abrigos del catálogo (buzo/sweater/campera) pasaban como
 *  combinables con un bermuda/short en Combinar/Recomendaciones, muchos en
 *  "excelente" -- exactamente el reporte original del usuario ("bermuda con
 *  sweater, ambos beige"), que hoy solo se salva de casualidad cuando el
 *  torso en cuestión es un sweater (todos ocasion="laburo" en el catálogo,
 *  atrapados por esDescoordinacionDeOficina) pero no con un buzo o una
 *  campera equivalente. Incluye saco por el mismo motivo que excluirSaco:
 *  nunca combina con las piernas al aire, por categoría, sin depender de
 *  otro campo -- hoy tampoco estaba cubierto dentro de recomendar() (un
 *  saco formal no es "menos formal" que ningún bermuda, así que
 *  prendaMenosFormalQuePantalon nunca lo atrapaba).
 *
 *  Excepción deportiva: exige que las DOS prendas sean deportivas, no solo
 *  la de piernas -- un short genuinamente deportivo SÍ combina con un
 *  abrigo también deportivo (hoodie + short de entrenamiento es real), pero
 *  no con un abrigo urbano/casual/de vestir (una campera urbana, aunque no
 *  sea "de vestir", tampoco es un hoodie deportivo). A diferencia de
 *  `excluirAbrigo` en armarOutfits* (que solo mira la ancla, porque ahí hay
 *  un filtro aparte -- `esAnclaDeportiva && !estilosDe(p).includes
 *  ("deportivo")` -- que ya saca cualquier torso no deportivo del pool),
 *  `recomendar()` no tiene ese filtro previo: sin este chequeo de las dos
 *  puntas, un short deportivo + campera urbana pasaba "excelente" por el
 *  mismo agujero que esta función corrige, solo que con un falso negativo
 *  nuevo si la excepción se armaba mirando un solo lado (verificado
 *  escribiendo el test y viéndolo fallar antes de este ajuste).
 *
 *  Bufanda de lana: hallazgo del revisor de color/textiles, verificado por
 *  ejecución contra el catálogo real (`bufanda-gris`/`bufanda-roja`,
 *  textura "lana", posicion_accesorio "cuello") -- es una prenda de abrigo
 *  tanto como un sweater, pero vive en categoria="accesorio", que ni
 *  CATEGORIAS_ABRIGO ni el chequeo de arriba miran. Sin esto, una bufanda
 *  de lana se colaba en outfits de bermuda/short (y hasta ganaba
 *  `mejorPropia` contra cualquier cinturón por ser gris/neutra) -- el mismo
 *  error de registro ya corregido para buzo/sweater/campera, reaparecido
 *  por la puerta de los accesorios. */
function esAbrigoDeCuello(p: Prenda): boolean {
  return p.categoria === "accesorio" && p.posicion_accesorio === "cuello" && p.textura === "lana";
}

function esAbrigoConPiernasAlAire(base: Prenda, candidato: Prenda): boolean {
  const veraniega = CATEGORIAS_PIERNAS_VERANIEGAS.includes(base.categoria)
    ? base
    : CATEGORIAS_PIERNAS_VERANIEGAS.includes(candidato.categoria)
      ? candidato
      : null;
  if (!veraniega) return false;
  const otra = veraniega === base ? candidato : base;
  if (!CATEGORIAS_ABRIGO.includes(otra.categoria) && otra.categoria !== "saco" && !esAbrigoDeCuello(otra)) return false;
  if (estilosDe(veraniega).includes("deportivo") && estilosDe(otra).includes("deportivo")) return false;
  return true;
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
      const registroDeportivoChoca = !cueroDescoordinado && !corbataSinCuello && chocaRegistroDeportivo(base, c);
      const oficinaDescoordinada =
        !cueroDescoordinado && !corbataSinCuello && !registroDeportivoChoca && esDescoordinacionDeOficina(base, c);
      const abrigoConPiernasAlAire =
        !cueroDescoordinado &&
        !corbataSinCuello &&
        !registroDeportivoChoca &&
        !oficinaDescoordinada &&
        esAbrigoConPiernasAlAire(base, c);
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
          : registroDeportivoChoca
            ? {
                nivel: "con_cuidado",
                explicacion:
                  "Ropa deportiva y una prenda de vestir no combinan por más que el color coincida: son registros funcionalmente distintos, no hay forma de \"elevar\" un look deportivo con algo formal/clásico.",
              }
            : oficinaDescoordinada
              ? {
                  nivel: "con_cuidado",
                  explicacion:
                    "Con las piernas al aire no va ropa de oficina, por más que el color coincida -- ni con un bermuda ni con un short deportivo.",
                }
              : abrigoConPiernasAlAire
                ? {
                    nivel: "con_cuidado",
                    explicacion:
                      "Un abrigo (buzo, sweater, campera, saco o una bufanda de lana) no combina con las piernas al aire, por más que el color coincida -- salvo que el look sea genuinamente deportivo de punta a punta.",
                  }
                : scoreColor(
                    { h: base.color_h, s: base.color_s, l: base.color_l },
                    { h: c.color_h, s: c.color_s, l: c.color_l },
                  );

      // El color puede combinar perfecto y el conjunto igual desentonar --
      // un pantalón de vestir con zapatillas (o un buzo casual) es
      // "excelente" en HSL (los dos suelen ser neutros) pero no en
      // formalidad. No se toca si el color ya venía con problemas
      // (con_cuidado): ese motivo pesa más y no hay técnica de rescate que
      // arregle "cambiá esto por algo más formal" en el mismo sentido que
      // las demás.
      if (score.nivel === "excelente" && prendaMenosFormalQuePantalon(base, c)) {
        score = {
          nivel: "muy_bueno",
          explicacion: `El color combina, pero ${c.categoria === "calzado" ? "el calzado" : "esta prenda"} es más informal que el pantalón -- se nota el salto de registro.`,
        };
      }

      // Mismo patrón que la degradación de formalidad de arriba -- el
      // volumen no es un choque, es una cuestión de grado, así que solo
      // baja "excelente" a "muy_bueno" con una sugerencia concreta, nunca
      // bloquea. Ver chocanEnVolumen y Calce en types.ts.
      if (score.nivel === "excelente" && chocanEnVolumen(base, c)) {
        score = {
          nivel: "muy_bueno",
          explicacion: "El color combina, pero las dos prendas son holgadas: el conjunto pierde silueta -- probá una de las dos más ajustada.",
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
                : registroDeportivoChoca
                  ? "No hay técnica de rescate acá -- cambiá una de las dos: una prenda deportiva o urbana, o dejá esta para otro look."
                  : oficinaDescoordinada
                    ? "No hay técnica de rescate acá -- cambiá el bermuda/short por un pantalón largo, o dejá la ropa de oficina para otro look."
                    : abrigoConPiernasAlAire
                      ? "No hay técnica de rescate acá -- cambiá el bermuda/short por un pantalón largo, o dejá el abrigo para otro look."
                      : tecnicaRescate(base, c, placard),
      };
    })
    .sort((a, b) => nivelOrden(b.score.nivel) - nivelOrden(a.score.nivel));
}

function nivelOrden(nivel: NivelCompatibilidad): number {
  return { excelente: 2, muy_bueno: 1, con_cuidado: 0 }[nivel];
}

export interface PuntajeOutfit {
  /** 1-10. Promedio de PUNTOS_POR_NIVEL sobre TODOS los pares de prendas
   *  del outfit (no solo contra el ancla) -- el mismo conjunto de
   *  comparaciones que ya arma/valida armarOutfitsSugeridos (torso-ancla,
   *  calzado-ancla, accesorio-ancla, calzado-torso, accesorio-torso,
   *  accesorio-calzado), reusado acá en vez de inventar una escala aparte.
   *  10 es exclusivo de "todos los pares excelente" -- el redondeo nunca
   *  sube a 10 con un par por debajo, aunque el promedio dé 9.5+ (ver el
   *  comentario en el cuerpo de la función). */
  puntaje: number;
  /** Motivo ejecutivo, 1-2 oraciones: por qué no es (o si es) un 10. No
   *  repite el registro (Formal/Casual/...) -- eso ya lo muestra
   *  RegistroBadge en Outfits.tsx aparte; esto se concentra en color. */
  explicacion: string;
}

const PUNTOS_POR_NIVEL: Record<NivelCompatibilidad, number> = { excelente: 10, muy_bueno: 7, con_cuidado: 3 };

/** Pedido explícito del usuario: "quiero un sistema de valoración por
 *  puntos... este outfit es un nueve de diez por esto y por esto". No es
 *  una escala nueva ni un modelo aparte -- es el mismo scoreColor/
 *  recomendar() de siempre, agregado sobre TODOS los pares del outfit y
 *  expresado en una nota de 1 a 10 en vez de en tres niveles con nombre.
 *  Un outfit de una sola prenda (o vacío) no tiene ningún par que evaluar
 *  -- 10 por default, no hay con qué chocar. */
export function puntuarOutfit(prendas: Prenda[]): PuntajeOutfit {
  const pares: Array<{ a: Prenda; b: Prenda; score: ScoreColor }> = [];
  for (let i = 0; i < prendas.length; i++) {
    for (let j = i + 1; j < prendas.length; j++) {
      const a = prendas[i];
      const b = prendas[j];
      const [r] = recomendar(a, [b], [a, b]);
      pares.push({ a, b, score: r.score });
    }
  }
  if (pares.length === 0) {
    return { puntaje: 10, explicacion: "Una sola prenda: no hay con qué chocar." };
  }

  // Auditoría de Consejo (lógica/motor, verificado por ejecución sobre el
  // catálogo real -- ver el hallazgo completo en el historial de la
  // sesión): con 4 prendas (6 pares) un solo par muy_bueno entre cinco
  // excelente promedia 9.5 ((5*10+7)/6) y Math.round sube a 10 -- un
  // outfit de 4 prendas con un salto de registro real (ej. pantalón de
  // vestir + zapatillas urbanas) mostraba el badge "10/10" al lado de una
  // explicación citando el defecto, una contradicción directa (confirmado
  // con el catálogo real: 180 de los outfits que arma armarOutfitsSugeridos
  // caían en este caso). `todosExcelentes` se calcula ANTES que el puntaje
  // y lo topea en 9 -- un 10/10 pasa a significar, siempre, "ningún par
  // por debajo de excelente", nunca "el redondeo dio justo".
  const todosExcelentes = pares.every((p) => p.score.nivel === "excelente");
  const promedio = pares.reduce((acc, p) => acc + PUNTOS_POR_NIVEL[p.score.nivel], 0) / pares.length;
  const puntaje = todosExcelentes ? 10 : Math.max(1, Math.min(9, Math.round(promedio)));

  // el par que más pesa en contra -- el de nivel más bajo (con_cuidado
  // antes que muy_bueno); a igualdad de nivel, el primero en orden de
  // evaluación alcanza (no hay un criterio de desempate más fino que
  // valga la pena, el objetivo es UNA razón concreta, no todas).
  const peor = [...pares].sort((x, y) => nivelOrden(x.score.nivel) - nivelOrden(y.score.nivel))[0];
  const tieneToneSobreTono = pares.some((p) => p.score.tag === "tono_sobre_tono");
  const tieneAudaz = pares.some((p) => p.score.tag === "combinacion_audaz");

  let explicacion: string;
  if (peor.score.nivel === "con_cuidado") {
    // no debería pasar en un outfit armado por armarOutfitsSugeridos (esos
    // pares ya se filtran antes de llegar acá) -- pero puntuarOutfit
    // también se usa sobre outfits YA GUARDADOS por el usuario a mano
    // (Combinar/Probar no bloquean nada, solo avisan), así que si de
    // verdad hay un con_cuidado, es la razón real y se cita tal cual.
    explicacion = peor.score.explicacion;
  } else if (todosExcelentes) {
    explicacion = tieneToneSobreTono
      ? "Combinación segura: tono sobre tono en la base del outfit."
      : "Combinación segura en color, sin nada que ajustar.";
  } else {
    // al menos un par en muy_bueno: cita el motivo real y puntual (ya es
    // un texto ejecutivo, generado por scoreColor/recomendar -- "el color
    // combina, pero...", "funciona, pero se nota"), sin inventar una
    // redacción aparte.
    explicacion = peor.score.explicacion;
    if (tieneAudaz && peor.score.tag !== "combinacion_audaz") {
      explicacion += " Además tiene un toque audaz en otra parte del outfit.";
    }
  }

  return { puntaje, explicacion };
}

// duplicado a propósito de CAPA en Maniqui.tsx -- esa es la agrupación
// "de presentación" (cómo se dibuja); esta es la agrupación "de datos"
// (qué categorías compiten por el mismo lugar del outfit). Mismo criterio
// que color.ts ya documenta para NEUTRO_*: evitar una dependencia cruzada
// entre capas por repetir 5 strings. "saco" agregado a pedido explícito
// del usuario -- ver el comentario de CATEGORIAS_CON_TORSO más arriba.
const CATEGORIAS_TORSO: Categoria[] = ["remera", "camisa", "buzo", "sweater", "campera", "saco"];
const TODAS_LAS_CATEGORIAS: Categoria[] = [
  "remera",
  "camisa",
  "buzo",
  "sweater",
  "campera",
  "saco",
  "pantalon",
  "bermuda",
  "short_deportivo",
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
    // Auditoría de Consejo (QA): el % de JS no normaliza negativos --
    // offset negativo daba pool[-1] === undefined en vez de dar la vuelta
    // hacia atrás. Ningún llamador actual pasa un offset negativo (todos
    // arrancan en 0 y solo incrementan), pero tanda() es pública y está
    // tipada para aceptar cualquier number -- el +pool.length de más
    // adelante asegura un resto siempre no negativo sea cual sea el signo
    // de offset.
    vista.push(pool[(((offset + i) % pool.length) + pool.length) % pool.length]);
  }
  return vista;
}

export interface OutfitSugerido {
  /** estable por composición: mismo set de prendas -> mismo id, para
   *  deduplicar contra outfits ya guardados y para key en React. */
  id: string;
  prendas: Prenda[];
  /** ver puntuarOutfit -- calculado una sola vez acá, no en la UI, para que
   *  Outfits.tsx no tenga que reimportar la lógica de puntaje por outfit. */
  puntaje: number;
  explicacionPuntaje: string;
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

/** Estación real de hoy según el mes -- hemisferio sur (el catálogo y el
 *  placard son de Argentina): verano dic/ene/feb, invierno jun/jul/ago,
 *  entretiempo el resto (el tipo Estacion no separa otoño de primavera, así
 *  que ambos cuadran ahí). Recibe la fecha como parámetro, con
 *  `new Date()` de default, para que el resto del motor sea testeable de
 *  forma determinística en vez de depender de una llamada oculta al reloj. */
export function estacionActual(hoy: Date = new Date()): Estacion {
  const mes = hoy.getMonth(); // 0-11
  if (mes === 11 || mes === 0 || mes === 1) return "verano";
  if (mes >= 5 && mes <= 7) return "invierno";
  return "entretiempo";
}

/** Prioriza, dentro de un pool de torsos ya ordenado por color
 *  (candidatasPropias), las prendas cuya `estacion` coincide con la de hoy
 *  por sobre las que no. Motivada por el trabajo de diferenciar abrigos de
 *  entretiempo/invierno: antes de esto, "con abrigo" en Vestite hoy
 *  mostraba por defecto la prenda que mejor combinaba en COLOR con el
 *  pantalón, sin mirar si era, por ejemplo, un sweater de lana de invierno
 *  o uno de viscosa de entretiempo -- verificado contra el placard real del
 *  usuario: en "clásico" hay 4 sweaters de entretiempo y 1 de invierno
 *  compitiendo por el mismo lugar, y en "urbano" 2 buzos de entretiempo
 *  contra 1 campera de invierno, así que la estación SÍ podía cambiar cuál
 *  se mostraba primero. Sort estable (estable en toda la especificación JS
 *  desde ES2019): dentro del mismo rango de estación, se mantiene el orden
 *  por color que ya traía el pool. Una prenda sin `estacion` cargada
 *  (remera, camisa -- ver el comentario de catalogo.ts: solo buzo/sweater/
 *  campera se tagean) cae en el rango neutro, ni antes ni después por este
 *  criterio -- no cambia su orden actual. */
function ordenarPorEstacion<T extends { prenda: Prenda }>(items: T[], hoy: Estacion): T[] {
  const rango = (p: Prenda) => (!p.estacion ? 1 : p.estacion === hoy ? 0 : 2);
  return [...items].sort((a, b) => rango(a.prenda) - rango(b.prenda));
}

// Prendas de torso que hacen de "abrigo" (capa extra sobre una remera o
// camisa) -- subconjunto de CATEGORIAS_TORSO. remera/camisa quedan afuera a
// propósito: son la capa base, no un abrigo. saco (agregado a pedido del
// usuario, "un traje azul marino") también queda afuera a propósito: es
// una capa de FORMALIDAD, no de temperatura -- un saco de traje no se
// elige por "cuando hace frío", así que agruparlo acá lo pondría en el
// mismo bucket binario que un buzo de invierno sin que la distinción
// tenga sentido real. Cae en "sin abrigo" junto con remera/camisa por
// descarte (no encaja del todo en ninguno de los dos baldes, pero es la
// aproximación menos incorrecta del modelo binario actual).
const CATEGORIAS_ABRIGO: Categoria[] = ["buzo", "sweater", "campera"];

/** bermuda/short_deportivo -- las dos categorías de piernas que exponen las
 *  piernas, a diferencia de pantalon. Revisado como modista, reporte real
 *  del usuario ("bermuda con sweater, ambos beige"): el problema no era el
 *  color (combinaban perfecto) -- es que nadie se pone un sweater/buzo/
 *  campera con las piernas al aire salvo que el look sea genuinamente
 *  deportivo (un hoodie con un short de entrenamiento sí es real). Ver el
 *  uso de esta lista más abajo, junto a esAnclaDeportiva. */
const CATEGORIAS_PIERNAS_VERANIEGAS: Categoria[] = ["bermuda", "short_deportivo"];

/** true si la prenda es de registro "de oficina" real (`ocasion` laburo o
 *  formal) -- pedido explícito del usuario, con el mismo ejemplo repetido
 *  dos rondas seguidas ("bermuda con camisa"): revisando el catálogo real
 *  se encontró la causa exacta -- `ocasion` (casual/laburo/formal) está
 *  cargado en cada prenda desde el principio de la app, pero NUNCA se
 *  usaba en ninguna regla de recomendar()/armarOutfits* hasta esta ronda.
 *  Por eso "camisa blanca" (estilo clasico, ocasion LABURO -- una camisa
 *  de vestir de oficina real) combinaba sin fricción con un bermuda: por
 *  `estilo`, clasico(2) no es "menos formal" que el bermuda clasico(2)
 *  (rangos iguales, ver prendaMenosFormalQuePantalon), así que esa regla
 *  nunca lo atrapaba -- hacía falta esta dimensión distinta (ocasión de
 *  uso real, no registro de estilo) para la que sí existe una respuesta
 *  inequívoca: nadie usa una camisa de oficina, un zapato de vestir o una
 *  corbata con las piernas al aire, sea cual sea su `estilo`. Ver el uso
 *  más abajo, junto a CATEGORIAS_PIERNAS_VERANIEGAS.
 *
 *  Excepción del mocasín: segunda opinión de sastrería (Consejo, ronda
 *  siguiente). Un ban por `ocasion` es demasiado grueso para el calzado --
 *  el mocasín/náutico sin medias es EL zapato de verano con bermuda, el
 *  look que un asesor de imagen recomienda, no el que desaconseja. Hoy
 *  zafa de casualidad porque el catálogo carga los mocasines con
 *  ocasion="casual" -- pero cualquier mocasín cargado por foto con
 *  ocasion="laburo" (donde mucha gente los usa de verdad) quedaría
 *  bloqueado igual que un zapato de vestir. `ocasion` describe DÓNDE usa
 *  el usuario la prenda; el arquetipo real del calzado lo describe
 *  `corte_calzado` (ver types.ts) -- acá se lo usa como señal de primera
 *  clase por primera vez en el motor. zapato_vestir SIGUE bloqueado (no
 *  está en la excepción): un zapato de vestir con cordones nunca es un
 *  calzado de verano informal, a diferencia del mocasín. */
function esDeOficina(p: Prenda): boolean {
  if (p.categoria === "calzado" && p.corte_calzado === "mocasin") return false;
  return p.ocasion === "laburo" || p.ocasion === "formal";
}

/** Arma outfits completos automáticamente a partir del placard real, sin
 *  que el usuario elija nada -- un outfit por cada prenda de piernas
 *  (pantalón, bermuda o short deportivo -- CATEGORIAS_PIERNAS, la categoría
 *  que conecta con todas las demás en CATEGORIAS_COMPLEMENTARIAS, el ancla
 *  natural) y por cada torso propio que combine al menos "muy_bueno" con
 *  esa ancla -- nunca fuerza un "con cuidado". Varía el torso (no calzado/
 *  accesorio) porque es la prenda que más define la identidad visual de un
 *  outfit en el maniquí; esto es lo que le da al usuario "otras opciones"
 *  para ir rotando en vez de una sola combinación fija por ancla. Devuelve
 *  el pool completo, mejor primero por ancla y, entre opciones parejas en
 *  color, con `clima` primero (ver ordenarPorEstacion) -- la UI decide
 *  cuántas mostrar de una vez.
 *
 *  `clima` -- pedido explícito del usuario: "quiero que en cada sección me
 *  preguntes si hace frío, entretiempo o calor". Antes la única noción de
 *  estación era la fecha REAL de hoy (estacionActual), usada solo para
 *  ORDENAR (nunca para filtrar) -- así un sweater de invierno y uno de
 *  entretiempo podían convivir en el mismo pool sin distinción real más
 *  que el orden. Ahora `clima` es la respuesta explícita del usuario (no
 *  la fecha del calendario) y filtra de verdad, con 2 reglas de vestuario
 *  real, revisadas como modista:
 *  1. Un bermuda/short "de calle" (no deportivo) NUNCA combina con un
 *     torso de abrigo (buzo/sweater/campera) -- sin importar el clima
 *     elegido, esto no es una cuestión de temperatura sino de que esa
 *     combinación no existe en el vestir real. El caso deportivo (short
 *     de entrenamiento + hoodie) sigue funcionando: ya está cubierto por
 *     el filtro `esAnclaDeportiva` de abajo, que exige un torso
 *     genuinamente deportivo -- esta regla nueva solo aplica cuando la
 *     ancla NO es deportiva.
 *  2. clima="verano": ningún abrigo combina con NADA, ni siquiera con un
 *     pantalón largo -- con calor de verdad no se usa buzo/sweater/
 *     campera. clima="invierno": un bermuda/short directamente no ancla
 *     ningún outfit -- con frío de verdad no se usan las piernas al aire,
 *     sea cual sea el torso. clima="entretiempo" no agrega ninguna
 *     restricción extra sobre la regla 1. */
export function armarOutfitsSugeridos(placard: Prenda[], clima: Estacion = estacionActual()): OutfitSugerido[] {
  const pantalones = placard
    .filter((p) => CATEGORIAS_PIERNAS.includes(p.categoria))
    // con frío real, un bermuda/short no ancla ningún outfit -- ver el
    // comentario largo de arriba, regla 2.
    .filter((p) => clima !== "invierno" || !CATEGORIAS_PIERNAS_VERANIEGAS.includes(p.categoria));
  const resultados: OutfitSugerido[] = [];
  const vistos = new Set<string>();

  for (const ancla of pantalones) {
    // Reporte real del usuario: un pantalón deportivo terminaba armado con
    // un buzo puramente casual (sin "deportivo" en sus estilos) y hasta
    // con un cinturón de cuero -- ninguna de las dos existe en un look
    // deportivo real. prendaMenosFormalQuePantalon nunca lo atrapa: el
    // deportivo es el escalón MÁS bajo de FORMALIDAD_ESTILO, así que nada
    // cuenta ahí como "menos formal" que él, y cualquier prenda de un
    // registro más alto (casual/urbano/clasico/formal) se toma como una
    // "elevación" válida -- la misma lógica que sí es correcta para un
    // jean con zapatos de cuero, pero no para un jogger. A diferencia de
    // chocaRegistroDeportivo (que solo bloquea lo puramente formal/
    // clasico), acá hace falta lo contrario: una lista blanca, no una
    // negra. Cuando el ancla es deportiva (estilosDe, no solo el
    // principal): el TORSO tiene que ser genuinamente deportivo -- no
    // alcanza con "no chocar". El calzado NO se restringe: zapatillas
    // urbanas con jogger siguen siendo una combinación real de calle (ver
    // el test de chocaRegistroDeportivo). El ACCESORIO se excluye
    // directamente: un cinturón no tiene función real con un jogger o un
    // short deportivo (sin pretinas de tela para pasarlo), sea cual sea
    // su estilo declarado.
    const esAnclaDeportiva = estilosDe(ancla).includes("deportivo");
    // ver el comentario largo de armarOutfitsSugeridos (reglas 1 y 2):
    // bermuda/short "de calle" nunca combina con un torso de abrigo, y con
    // clima="verano" ningún ancla (ni pantalón) combina con un abrigo.
    const esAnclaVeraniega = CATEGORIAS_PIERNAS_VERANIEGAS.includes(ancla.categoria);
    const excluirAbrigo = clima === "verano" || (esAnclaVeraniega && !esAnclaDeportiva);
    // ver esDeOficina más arriba: un bermuda/short (deportivo o no) nunca
    // combina con una prenda "de oficina" real (ocasion laburo/formal) --
    // a diferencia de excluirAbrigo, no depende de esAnclaDeportiva: ni
    // siquiera un short deportivo combina con zapatos de vestir.
    const excluirOficina = esAnclaVeraniega;
    // Auditoría de Consejo (QA): saco queda afuera de CATEGORIAS_ABRIGO a
    // propósito (es formalidad, no temperatura -- ver ese comentario), y
    // CATEGORIAS_COMPLEMENTARIAS en types.ts ya excluye bermuda/short de
    // la lista de saco en la pantalla manual "Combinar" -- pero el motor
    // automático nunca consultaba esa lista, solo CATEGORIAS_TORSO (que sí
    // incluye "saco"). En la práctica el único saco del catálogo hoy tiene
    // ocasion="laburo" (así que esDeOficina ya lo frena), pero eso
    // depende de un dato que podría faltar o cargarse mal -- un saco NUNCA
    // combina con las piernas al aire, sea cual sea su ocasion real, así
    // que se excluye por categoría directamente, sin depender de otro
    // campo. No se agrega a CATEGORIAS_ABRIGO (rompería la separación
    // con/sin abrigo real de "Vestite hoy", que es sobre temperatura).
    // Extendido a clima="verano": hallazgo del revisor de color/textiles,
    // verificado por ejecución -- un saco es paño de lana (aislación
    // térmica real, el mismo criterio que ya excluye buzo/sweater/campera
    // con calor), y antes de esto solo se excluía por ancla veraniega
    // (bermuda/short), nunca por clima -- un pantalón largo + saco de lana
    // pasaba igual con clima="verano".
    const excluirSaco = esAnclaVeraniega || clima === "verano";

    const candidatosTorso = placard.filter((p) => {
      if (!CATEGORIAS_TORSO.includes(p.categoria)) return false;
      // remera exceptuada de la lista blanca deportiva: hallazgo del
      // revisor de sastrería (2da opinión), verificado por ejecución --
      // exigir "deportivo" tageado a CUALQUIER torso (incluida una remera
      // de algodón lisa sin ningún estilo cargado) dejaba a "Vestite hoy"
      // sin armar NINGÚN outfit para un placard con exactamente short
      // deportivo + remera blanca + zapatillas running, el combo más común
      // que existe. Una remera de vestir real sigue bloqueada igual que
      // antes -- no por acá, sino más abajo en candidatasPropias/
      // recomendar(), vía chocaRegistroDeportivo (que sí blinda contra una
      // remera tageada formal/clasico). buzo/sweater/campera/saco siguen
      // exigiendo el tag explícito: son capas más gruesas, no la prenda
      // base del athleisure real.
      if (esAnclaDeportiva && p.categoria !== "remera" && !estilosDe(p).includes("deportivo")) return false;
      if (excluirAbrigo && CATEGORIAS_ABRIGO.includes(p.categoria)) return false;
      if (excluirOficina && esDeOficina(p)) return false;
      if (excluirSaco && p.categoria === "saco") return false;
      return true;
    });
    const torsos = ordenarPorEstacion(candidatasPropias(ancla, candidatosTorso, placard), clima);
    const calzado = mejorPropia(
      ancla,
      placard.filter((p) => p.categoria === "calzado" && !(excluirOficina && esDeOficina(p))),
      placard,
    );
    const accesorio = esAnclaDeportiva
      ? undefined
      : mejorPropia(
          ancla,
          // esAbrigoDeCuello: hallazgo del revisor de color/textiles,
          // verificado por ejecución -- una bufanda de lana es tan abrigo
          // como un sweater, pero vive en categoria="accesorio", que
          // excluirAbrigo (arriba, pensado para CATEGORIAS_ABRIGO) nunca
          // miraba. Sin esto, "Vestite hoy" podía sugerir una bufanda de
          // lana con clima="verano" o con una ancla veraniega.
          placard.filter(
            (p) => p.categoria === "accesorio" && !(excluirOficina && esDeOficina(p)) && !(excluirAbrigo && esAbrigoDeCuello(p)),
          ),
          placard,
        );

    for (const torso of torsos) {
      // calzado/accesorio se eligieron solo contra el pantalón -- acá se
      // valida que además no choquen entre sí ni con ESTE torso puntual
      // (cada variante de torso puede convivir distinto con el mismo
      // calzado/accesorio). Auditoría de Consejo (QA, verificado por
      // ejecución): esto SOLO validaba accesorio vs. calzado y accesorio
      // vs. torso -- calzado vs. torso nunca se cruzaban entre sí (ej. un
      // pantalón neutro admite tanto un calzado naranja saturado como una
      // remera azul saturada, cada uno "excelente" por separado, pero esos
      // dos colores se funden entre sí -- se armaba el outfit igual). El
      // accesorio sigue siendo el que se cae primero si choca (es el único
      // slot puramente opcional); ahora el calzado también se puede caer
      // si choca con ESTE torso puntual, dejando un outfit sin calzado en
      // vez de uno con una combinación real mala -- calzado/accesorio ya
      // son opcionales, esto no cambia esa regla, solo la aplica bien.
      const calzadoOk = calzado && !chocan(calzado.prenda, torso.prenda, placard);
      const accesorioOk =
        accesorio &&
        !(calzadoOk && calzado && chocan(accesorio.prenda, calzado.prenda, placard)) &&
        !chocan(accesorio.prenda, torso.prenda, placard);

      const prendas = [
        ancla,
        torso.prenda,
        calzadoOk ? calzado?.prenda : undefined,
        accesorioOk ? accesorio?.prenda : undefined,
      ].filter((p): p is Prenda => p !== undefined);

      const clave = [...prendas]
        .map((p) => p.id)
        .sort()
        .join("-");
      if (vistos.has(clave)) continue;
      vistos.add(clave);

      const { puntaje, explicacion } = puntuarOutfit(prendas);
      resultados.push({ id: clave, prendas, puntaje, explicacionPuntaje: explicacion });
    }
  }

  // Pedido explícito del usuario: "que en lo posible las opciones... sean
  // de las valoraciones más altas". El pool venía ordenado por ancla (orden
  // de inserción del placard) y, dentro de cada ancla, por color/estación
  // -- un orden razonable pero no el mismo que "mejor puntaje primero"
  // cuando hay varias anclas en juego. Se reordena acá, una sola vez, en
  // vez de en cada lugar que consume el pool (Outfits.tsx ya arma "otras
  // opciones" rotando con `tanda()` sobre este mismo array -- con el pool
  // ordenado por puntaje, la PRIMERA opción que ve el usuario en cada
  // grupo con/sin abrigo es siempre la de mejor nota, y "otras opciones"
  // va de mejor a peor, no al azar). Sort estable (spec desde ES2019): a
  // igual puntaje, se conserva el orden anterior (ancla, después color).
  resultados.sort((a, b) => b.puntaje - a.puntaje);

  return resultados;
}

/** Distancia de color entre dos prendas del MISMO rol (dos pantalones, dos
 *  pares de calzado...) -- pedido explícito del usuario, corrigiendo la
 *  primera versión de este mecanismo: "no me refería a un outfit todo con
 *  prendas oscuras y otro todo con prendas claras... la teoría del color
 *  habla de matiz, luminosidad y saturación, quiero que esa variedad se
 *  refleje". Sección los tres ejes (mismos que ya usa scoreColor: hueDist,
 *  valueDist, y saturación cruda) sin ponderar ninguno por encima de los
 *  otros -- no hay evidencia para inventar una jerarquía entre ellos.
 *  Revisado como colorista: el matiz NO cuenta cuando alguna de las dos
 *  prendas es neutra (esNeutro) -- un gris o un negro no tienen un matiz
 *  real del que "alejarse", comparar hueDist contra un h arbitrario
 *  guardado para una prenda acromática mediría una diferencia que no
 *  existe a simple vista (mismo criterio que ya usa scoreColor para
 *  neutros en todo el resto del motor). Luminosidad y saturación sí
 *  siempre cuentan: son ejes reales de cualquier color, neutro o no. */
function distanciaDeColor(a: Prenda, b: Prenda): number {
  const distMatiz = esNeutro(a.color_s, a.color_l) || esNeutro(b.color_s, b.color_l) ? 0 : hueDist(a.color_h, b.color_h);
  const distLuminosidad = valueDist(a.color_l, b.color_l);
  const distSaturacion = Math.abs(a.color_s - b.color_s) / 100;
  return distMatiz + distLuminosidad + distSaturacion;
}

/** Distancia de color entre dos outfits COMPLETOS -- suma distanciaDeColor
 *  categoría por categoría (el pantalón de uno contra el pantalón del
 *  otro, el calzado contra el calzado, etc.), nunca entre categorías
 *  distintas (comparar un pantalón contra un calzado no dice nada de
 *  contraste real). Una categoría que solo tiene UNO de los dos outfits
 *  (ej. uno con accesorio, el otro sin) no suma nada -- no hay con qué
 *  comparar esa categoría puntual, no es lo mismo que "mismo color". */
function distanciaEntreOutfits(x: OutfitSugerido, y: OutfitSugerido): number {
  const rol = (o: OutfitSugerido, pred: (p: Prenda) => boolean) => o.prendas.find(pred);
  const roles: Array<(p: Prenda) => boolean> = [
    (p) => CATEGORIAS_PIERNAS.includes(p.categoria),
    (p) => CATEGORIAS_TORSO.includes(p.categoria),
    (p) => p.categoria === "calzado",
    (p) => p.categoria === "accesorio",
  ];
  let total = 0;
  for (const pred of roles) {
    const pa = rol(x, pred);
    const pb = rol(y, pred);
    if (pa && pb) total += distanciaDeColor(pa, pb);
  }
  return total;
}

/** Elige, para acompañar a `principal` (la mejor opción de "Vestite hoy",
 *  ya elegida por puntaje), la SEGUNDA opción del pool que más contrasta
 *  en color contra ella -- pedido explícito del usuario: "no me refería a
 *  un outfit todo oscuro y otro todo claro... sino que entre las dos
 *  opciones se usen colores distintos -- si en una usaste pantalón
 *  oscuro, en la otra pantalón claro. La teoría del color habla de
 *  matiz, luminosidad y saturación, quiero que esa variedad se refleje,
 *  más allá del botón de buscar más opciones" (es decir: el contraste
 *  tiene que estar en las dos tarjetas que se ven de entrada, no solo
 *  disponible clickeando "otras opciones"). Reemplaza separarPorContraste
 *  (que agrupaba por luminosidad PROMEDIO del outfit entero -- el enfoque
 *  que el usuario aclaró que no era lo que pedía). Recorre TODO el pool
 *  (no solo los mejores puntuados): cada outfit del pool ya pasó el
 *  filtro de calidad de armarOutfitsSugeridos (nunca un par con_cuidado,
 *  ver puntuarOutfit -- el piso real es "muy_bueno" en todos los pares),
 *  así que maximizar contraste no tiene el riesgo de elegir una
 *  combinación mala -- a igual distancia de color, gana el de mayor
 *  puntaje. */
export function elegirContraste(principal: OutfitSugerido, pool: OutfitSugerido[]): OutfitSugerido | undefined {
  let mejor: OutfitSugerido | undefined;
  let mejorDistancia = -1;
  for (const candidato of pool) {
    if (candidato.id === principal.id) continue;
    const distancia = distanciaEntreOutfits(principal, candidato);
    if (distancia > mejorDistancia || (distancia === mejorDistancia && mejor && candidato.puntaje > mejor.puntaje)) {
      mejor = candidato;
      mejorDistancia = distancia;
    }
  }
  return mejor;
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
  /** ver puntuarOutfit -- del outfit COMPLETO (prendasPropias + sugerida),
   *  para que "Ideas para comprar" pueda decir a qué nota sube el look, no
   *  solo que "combina". */
  puntaje: number;
  explicacionPuntaje: string;
}

/** Categorías del placard que hoy están en cero -- sin ninguna prenda ahí,
 *  el usuario literalmente no puede armar nada que las use. */
export function categoriasAusentes(placard: Prenda[]): Categoria[] {
  const presentes = new Set(placard.map((p) => p.categoria));
  return TODAS_LAS_CATEGORIAS.filter((c) => !presentes.has(c));
}

/** Para cada prenda de piernas (pantalón, bermuda o short deportivo) y cada
 *  categoría ausente del placard, busca en el catálogo TODAS las prendas de
 *  esa categoría que combinan al menos "muy_bueno" con esa ancla (mismo
 *  motor de color que el resto de la app, no una sugerencia inventada) --
 *  una variante por cada una, mejor primero -- y arma el outfit resultante
 *  combinando cada prenda sugerida con lo mejor que el usuario YA tiene
 *  para los demás lugares. No se ofrece comprar algo que no va a combinar
 *  bien. Devuelve el pool completo; la UI decide cuántas mostrar de una
 *  vez. */
export function armarOutfitsParaComprar(
  placard: Prenda[],
  catalogo: (PresetPrenda & { hsl: HSL })[] = CATALOGO_CON_HSL,
): OutfitParaComprar[] {
  const pantalones = placard.filter((p) => CATEGORIAS_PIERNAS.includes(p.categoria));
  const ausentes = categoriasAusentes(placard);
  const resultados: OutfitParaComprar[] = [];

  for (const ancla of pantalones) {
    // Mismo criterio que armarOutfitsSugeridos (ver su comentario extenso):
    // un ancla deportiva solo combina de verdad con torso genuinamente
    // deportivo y nunca con un accesorio -- sin esto, "Ideas para comprar"
    // repetía el mismo error real reportado por el usuario (sugería una
    // campera o un accesorio comunes para completar un look deportivo, en
    // vez de restringirse a lo que un look deportivo real usa).
    const esAnclaDeportiva = estilosDe(ancla).includes("deportivo");
    // mismo criterio que armarOutfitsSugeridos (ver su comentario extenso,
    // reporte real del usuario: "bermuda con sweater, ambos beige"): un
    // bermuda/short "de calle" (no deportivo) no combina con un torso de
    // abrigo, sea cual sea el color. Acá no hay pregunta de clima -- esta
    // pantalla no depende del clima de hoy, así que la regla queda siempre
    // activa (a diferencia de la regla extra de clima="verano" en
    // armarOutfitsSugeridos, que sí depende de una respuesta explícita).
    const esAnclaVeraniega = CATEGORIAS_PIERNAS_VERANIEGAS.includes(ancla.categoria);
    const excluirAbrigo = esAnclaVeraniega && !esAnclaDeportiva;
    // ver esDeOficina más arriba: un bermuda/short (deportivo o no) nunca
    // combina con una prenda "de oficina" real (ocasion laburo/formal).
    const excluirOficina = esAnclaVeraniega;
    // ver el comentario largo de armarOutfitsSugeridos: saco nunca combina
    // con las piernas al aire, por categoría, sin depender de que su
    // ocasion esté bien cargada.
    const excluirSaco = esAnclaVeraniega;

    // no depende de categoriaSugerida -- se calcula una sola vez por ancla.
    const torsoPropio = mejorPropia(
      ancla,
      placard.filter((p) => {
        if (!CATEGORIAS_TORSO.includes(p.categoria)) return false;
        // remera exceptuada -- mismo motivo y mismo criterio que
        // armarOutfitsSugeridos (ver su comentario extenso).
        if (esAnclaDeportiva && p.categoria !== "remera" && !estilosDe(p).includes("deportivo")) return false;
        if (excluirAbrigo && CATEGORIAS_ABRIGO.includes(p.categoria)) return false;
        if (excluirOficina && esDeOficina(p)) return false;
        if (excluirSaco && p.categoria === "saco") return false;
        return true;
      }),
      placard,
    );

    for (const categoriaSugerida of ausentes) {
      // el ancla ya es una prenda de piernas -- nunca tiene sentido
      // sugerir comprar OTRA (un pantalón y un bermuda compiten por el
      // mismo lugar del outfit, no se usan los dos a la vez). Antes solo
      // se saltaba "pantalon" -- con bermuda/short_deportivo agregados a
      // TODAS_LAS_CATEGORIAS, sin este chequeo generalizado el motor
      // llegaba a sugerir "comprá un short deportivo" para completar un
      // outfit ya anclado en un pantalón de vestir, una sugerencia sin
      // sentido real.
      if (CATEGORIAS_PIERNAS.includes(categoriaSugerida)) continue;

      // un cinturón no tiene función real con un jogger o un short
      // deportivo -- nunca se sugiere comprar un accesorio para un ancla
      // deportiva, sea cual sea el color.
      if (categoriaSugerida === "accesorio" && esAnclaDeportiva) continue;

      // mismo criterio que torsoPropio más arriba: no sugerir COMPRAR un
      // abrigo (buzo/sweater/campera) para completar un bermuda/short "de
      // calle" -- sería la misma combinación sin sentido real, solo que
      // todavía no comprada.
      if (excluirAbrigo && CATEGORIAS_ABRIGO.includes(categoriaSugerida)) continue;
      // ídem saco: nunca combina con las piernas al aire, por categoría.
      if (excluirSaco && categoriaSugerida === "saco") continue;

      const candidatosCatalogo = catalogo.filter(
        (p) =>
          p.categoria === categoriaSugerida &&
          // remera exceptuada -- mismo motivo y mismo criterio que
          // armarOutfitsSugeridos/torsoPropio de arriba: no tiene sentido
          // exigir "deportivo" tageado para sugerir COMPRAR una remera
          // lisa (la prenda base del athleisure real) con un ancla
          // deportiva.
          (!esAnclaDeportiva ||
            !CATEGORIAS_TORSO.includes(categoriaSugerida) ||
            categoriaSugerida === "remera" ||
            estilosDe(presetAPrendaSintetica(p)).includes("deportivo")) &&
          // no sugerir COMPRAR una prenda "de oficina" (ocasion laburo/
          // formal) para un bermuda/short -- ver esDeOficina.
          !(excluirOficina && (p.ocasion === "laburo" || p.ocasion === "formal")),
      );
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
              placard.filter((p) => p.categoria === "calzado" && !(excluirOficina && esDeOficina(p))),
              placard,
            );
      const accesorioPropio =
        categoriaSugerida === "accesorio" || esAnclaDeportiva
          ? undefined
          : mejorPropia(
              ancla,
              // esAbrigoDeCuello: mismo criterio que armarOutfitsSugeridos
              // -- una bufanda de lana es abrigo tanto como un sweater,
              // pero vivía fuera del alcance de excluirAbrigo (pensado para
              // CATEGORIAS_ABRIGO). Sin esto, "Ideas para comprar" podía
              // mostrar como "esto ya lo tenés" una bufanda de lana propia
              // junto a un bermuda/short.
              placard.filter(
                (p) =>
                  p.categoria === "accesorio" && !(excluirOficina && esDeOficina(p)) && !(excluirAbrigo && esAbrigoDeCuello(p)),
              ),
              placard,
            );

      // Auditoría de Consejo (QA, verificado por ejecución): torsoPropio/
      // calzadoPropio/accesorioPropio se elegían cada uno SOLO contra el
      // pantalón (mejorPropia), sin cruzarse entre sí -- el mismo bug
      // insignia de esta sesión ("cinturón negro + zapato marrón", los dos
      // "excelente" contra un pantalón neutro pero chocan entre sí) podía
      // reaparecer acá adentro, mostrado como "esto ya lo tenés" en una
      // idea de compra. Mismo criterio que armarOutfitsSugeridos: el
      // accesorio es el primero en caerse (único slot puramente opcional),
      // después el calzado si choca con el torso propio.
      const calzadoPropioOk = calzadoPropio && !(torsoPropio && chocan(calzadoPropio.prenda, torsoPropio.prenda, placard));
      const accesorioPropioOk =
        accesorioPropio &&
        !(torsoPropio && chocan(accesorioPropio.prenda, torsoPropio.prenda, placard)) &&
        !(calzadoPropioOk && calzadoPropio && chocan(accesorioPropio.prenda, calzadoPropio.prenda, placard));

      const prendasPropias = [
        ancla,
        torsoPropio?.prenda,
        calzadoPropioOk ? calzadoPropio?.prenda : undefined,
        accesorioPropioOk ? accesorioPropio?.prenda : undefined,
      ].filter((p): p is Prenda => p !== undefined);
      // el resto de prendasPropias, sin el ancla -- ya validadas entre sí
      // arriba. La sugerida es la protagonista de esta idea puntual: si
      // choca con algo que el usuario YA tiene puesto acá, no tiene
      // sentido ofrecerle comprarla -- se descarta esa variante en vez de
      // armar el outfit igual.
      const propiasSinAncla = prendasPropias.filter((p) => p.id !== ancla.id);

      for (const candidato of sugeridosCandidatos) {
        if (propiasSinAncla.some((p) => chocan(candidato.prendaSintetica, p, placard))) continue;

        const { puntaje, explicacion } = puntuarOutfit([...prendasPropias, candidato.prendaSintetica]);
        resultados.push({
          id: `comprar-${ancla.id}-${candidato.preset.id}`,
          prendasPropias,
          sugerida: candidato.preset,
          categoriaSugerida,
          puntaje,
          explicacionPuntaje: explicacion,
        });
      }
    }
  }

  // mismo criterio que armarOutfitsSugeridos: mejor puntaje primero.
  resultados.sort((a, b) => b.puntaje - a.puntaje);

  return resultados;
}

/** Reemplazos: a diferencia de armarOutfitsParaComprar (que solo mira
 *  categorías AUSENTES del placard), recorre las categorías que un outfit
 *  YA armado usa y busca si el catálogo tiene algo mejor para ESE lugar --
 *  el caso real del pedido original del usuario: "la mejor valoración de
 *  tu outfit urbano es un seis de diez [por el calzado], te recomiendo
 *  comprar esto para subir a nueve". Ese calzado YA está puesto (no
 *  ausente), así que armarOutfitsParaComprar nunca podía sugerirlo --
 *  hallazgo de la auditoría de Consejo sobre el sistema de puntaje,
 *  verificado por ejecución con un placard real (pantalón de vestir +
 *  camisa + SOLO zapatillas urbanas de calzado: el mejor outfit posible
 *  quedaba en muy_bueno para siempre, sin ninguna sugerencia de compra,
 *  porque "calzado" nunca contaba como ausente). No toca el ancla
 *  (pantalón/bermuda/short): cambiarla redefine candidatos de torso/
 *  calzado/accesorio enteros, un caso distinto que ya cubre "Vestite hoy"
 *  probando cada ancla del placard por separado. */
export function mejorasDeReemplazo(
  outfit: OutfitSugerido,
  placard: Prenda[],
  catalogo: (PresetPrenda & { hsl: HSL })[] = CATALOGO_CON_HSL,
): OutfitParaComprar[] {
  const ancla = outfit.prendas.find((p) => CATEGORIAS_PIERNAS.includes(p.categoria));
  if (!ancla) return [];
  const resultados: OutfitParaComprar[] = [];

  for (const actual of outfit.prendas) {
    if (actual.id === ancla.id) continue;
    const restantes = outfit.prendas.filter((p) => p.id !== actual.id);
    const otrasPrendas = restantes.filter((p) => p.id !== ancla.id);
    const candidatos = catalogo.filter((p) => p.categoria === actual.categoria);

    for (const preset of candidatos) {
      const prendaSintetica = presetAPrendaSintetica(preset);
      const [r] = recomendar(ancla, [prendaSintetica], placard);
      if (!r || r.score.nivel === "con_cuidado") continue;
      if (otrasPrendas.some((p) => chocan(prendaSintetica, p, placard))) continue;

      const prendasResultado = [...restantes, prendaSintetica];
      const { puntaje, explicacion } = puntuarOutfit(prendasResultado);
      if (puntaje <= outfit.puntaje) continue;

      resultados.push({
        id: `reemplazo-${actual.id}-${preset.id}`,
        prendasPropias: restantes,
        sugerida: preset,
        categoriaSugerida: actual.categoria,
        puntaje,
        explicacionPuntaje: explicacion,
      });
    }
  }

  resultados.sort((a, b) => b.puntaje - a.puntaje);
  return resultados;
}

/** Pedido explícito del usuario: "cuando la mejor valoración disponible
 *  sea baja, recomendame comprar para subirla" -- independiente de POR QUÉ
 *  es baja. Junta las dos fuentes reales de "comprar esto sube la nota"
 *  (mejorasDeReemplazo, para lo que ya está puesto pero no es lo mejor
 *  posible; armarOutfitsParaComprar, para lo que falta directamente) y
 *  devuelve la mejor compra real -- la de más puntaje entre las que de
 *  verdad superan la nota actual. Antes esta señal vivía pegada a
 *  sugerenciaDeVariedad (un hueco de TIPO o de COLOR), que no dispara
 *  nunca para el caso más común en la práctica: variedad de torso y color
 *  ya están bien, pero el calzado o el accesorio puestos hoy son los que
 *  frenan la nota (verificado por ejecución, ver el comentario de
 *  mejorasDeReemplazo). */
export function mejorCompraParaSubirNota(
  estilo: Estilo,
  base: OutfitSugerido,
  placard: Prenda[],
  catalogo: (PresetPrenda & { hsl: HSL })[] = CATALOGO_CON_HSL,
): OutfitParaComprar | undefined {
  const reemplazos = mejorasDeReemplazo(base, placard, catalogo);
  const ausentes = armarOutfitsParaComprar(placard, catalogo).filter(
    (c) => c.puntaje > base.puntaje && outfitSirveParaEstilo(c.prendasPropias, estilo),
  );
  return [...reemplazos, ...ausentes].sort((a, b) => b.puntaje - a.puntaje)[0];
}

export interface SugerenciaVariedad {
  mensaje: string;
  /** con hsl incluido, mismo motivo que OutfitParaComprar.sugerida -- se
   *  pasa directo a presetAPrendaSintetica/cargarSugerencia sin recalcular. */
  sugerida: PresetPrenda & { hsl: HSL };
}

// Colores neutros, en orden de prioridad para tapar un hueco de variedad --
// van primero porque son los que más combinaciones habilitan (un básico
// blanco/negro/gris combina con más cosas que un color puntual), mismo
// criterio de versatilidad que ya prioriza el catálogo real.
const NEUTROS_PRIORIDAD_COMPRA = ["Blanco", "Negro", "Gris", "Azul marino", "Beige"];

/** Mejor prenda del catálogo para tapar un hueco puntual: de esa categoría,
 *  de ese estilo (por estilosDe -- cuenta un estilo secundario), que
 *  combine con el ancla real del usuario (mismo motor de recomendar() que
 *  armarOutfitsParaComprar, nunca una sugerencia que choque), priorizando
 *  primero un color que el usuario TODAVÍA NO tiene en ese registro y
 *  dentro de eso los neutros más versátiles primero. */
function mejorCandidatoDelCatalogo(
  ancla: Prenda,
  categoria: Categoria,
  estilo: Estilo,
  coloresActuales: Set<string>,
  placard: Prenda[],
  catalogo: (PresetPrenda & { hsl: HSL })[],
): (PresetPrenda & { hsl: HSL }) | undefined {
  const candidatos = catalogo
    .filter((preset) => preset.categoria === categoria && estilosDe(presetAPrendaSintetica(preset)).includes(estilo))
    .map((preset) => {
      const sintetica = presetAPrendaSintetica(preset);
      const [r] = recomendar(ancla, [sintetica], placard);
      const nombreColorPreset = nombreColor(sintetica.color_h, sintetica.color_s, sintetica.color_l);
      return { preset, score: r.score, colorNuevo: !coloresActuales.has(nombreColorPreset), nombreColorPreset };
    })
    .filter((c) => c.score.nivel !== "con_cuidado")
    .sort((a, b) => {
      if (a.colorNuevo !== b.colorNuevo) return a.colorNuevo ? -1 : 1;
      const rango = (nombre: string) => {
        const i = NEUTROS_PRIORIDAD_COMPRA.indexOf(nombre);
        return i === -1 ? NEUTROS_PRIORIDAD_COMPRA.length : i;
      };
      const diferenciaRango = rango(a.nombreColorPreset) - rango(b.nombreColorPreset);
      if (diferenciaRango !== 0) return diferenciaRango;
      return nivelOrden(b.score.nivel) - nivelOrden(a.score.nivel);
    });
  return candidatos[0]?.preset;
}

/** Para el estilo elegido en "Vestite hoy", detecta si el placard tiene
 *  poca variedad -- de TIPO de prenda (torso: remera/camisa/buzo/sweater/
 *  campera) o de COLOR -- y devuelve UNA sugerencia concreta del catálogo
 *  para taparlo. Pedido explícito del usuario, con su propio ejemplo: "en
 *  deportivo tenés poca variedad de remeras, te recomiendo incorporar una
 *  remera blanca". Prioriza el hueco de tipo de prenda sobre el de color
 *  (más concreto y accionable, mismo orden del ejemplo del usuario) y
 *  devuelve como mucho UNA sugerencia por estilo -- un tip claro, no una
 *  pared de advertencias. `null` si no hay ningún hueco real, o no hay
 *  pantalón de este estilo para validar contra qué combina (sin ancla no
 *  hay con qué comparar, y no se inventa una sugerencia sin validar). */
export function sugerenciaDeVariedad(
  estilo: Estilo,
  placard: Prenda[],
  catalogo: (PresetPrenda & { hsl: HSL })[] = CATALOGO_CON_HSL,
): SugerenciaVariedad | null {
  const prendasEstilo = placard.filter((p) => estilosDe(p).includes(estilo));
  const ancla = prendasEstilo.find((p) => CATEGORIAS_PIERNAS.includes(p.categoria));
  if (!ancla) return null;

  const coloresActuales = new Set(prendasEstilo.map((p) => nombreColor(p.color_h, p.color_s, p.color_l)));
  const torsos = prendasEstilo.filter((p) => CATEGORIAS_TORSO.includes(p.categoria));

  // Hueco de tipo de prenda: 0 o 1 sola prenda de torso para este registro
  // -- sin variedad real para rotar. Con una sola, se apunta a esa MISMA
  // categoría (sumar una segunda remera, no cambiar de categoría): es el
  // hueco más literal y accionable, igual que el ejemplo del usuario.
  if (torsos.length <= 1) {
    const categorias = torsos.length === 1 ? [torsos[0].categoria] : CATEGORIAS_TORSO;
    for (const categoria of categorias) {
      const sugerida = mejorCandidatoDelCatalogo(ancla, categoria, estilo, coloresActuales, placard, catalogo);
      if (!sugerida) continue;
      const nombreCat = CATEGORIA_LABEL[categoria].toLowerCase();
      const mensaje =
        torsos.length === 0
          ? `Para ${ESTILO_LABEL[estilo]} todavía no tenés ninguna prenda de tipo ${nombreCat} -- te serviría sumar una, como esta: "${sugerida.nombre}".`
          : `Para ${ESTILO_LABEL[estilo]} tenés una sola prenda de tipo ${nombreCat} -- te serviría sumar otra, como esta: "${sugerida.nombre}".`;
      return { mensaje, sugerida };
    }
  }

  // Hueco de color: 3+ prendas de este registro pero casi siempre el mismo
  // color (mismo umbral que analizarFoda en estadisticas.ts:
  // MAX_COLORES_VARIEDAD_BAJA=2).
  if (prendasEstilo.length >= 3 && coloresActuales.size <= 2) {
    for (const categoria of CATEGORIAS_TORSO) {
      const sugerida = mejorCandidatoDelCatalogo(ancla, categoria, estilo, coloresActuales, placard, catalogo);
      if (!sugerida) continue;
      return {
        mensaje: `Tus prendas ${ESTILO_LABEL[estilo]} repiten casi siempre el mismo color -- te serviría sumar una "${sugerida.nombre}".`,
        sugerida,
      };
    }
  }

  return null;
}

export interface SugerenciaAncla {
  mensaje: string;
  sugerida: PresetPrenda & { hsl: HSL };
}

/** Mejor prenda de piernas (pantalón/bermuda/short) del catálogo, de ese
 *  estilo, para servir de ancla -- validada contra el torso propio del
 *  usuario si ya tiene alguno de ese registro (mismo motor de recomendar()
 *  que el resto del catálogo de sugerencias); si no tiene ningún torso de
 *  ese estilo tampoco, no hay con qué validar color, así que se elige el
 *  candidato más neutro/versátil (mismo criterio que mejorCandidatoDelCatalogo). */
function mejorAnclaDelCatalogo(
  estilo: Estilo,
  torsosPropios: Prenda[],
  placard: Prenda[],
  catalogo: (PresetPrenda & { hsl: HSL })[],
): (PresetPrenda & { hsl: HSL }) | undefined {
  const candidatos = catalogo.filter(
    (preset) => CATEGORIAS_PIERNAS.includes(preset.categoria) && estilosDe(presetAPrendaSintetica(preset)).includes(estilo),
  );
  if (candidatos.length === 0) return undefined;

  if (torsosPropios.length === 0) {
    return [...candidatos].sort((a, b) => {
      const rango = (p: PresetPrenda & { hsl: HSL }) => {
        const i = NEUTROS_PRIORIDAD_COMPRA.indexOf(nombreColor(p.hsl.h, p.hsl.s, p.hsl.l));
        return i === -1 ? NEUTROS_PRIORIDAD_COMPRA.length : i;
      };
      return rango(a) - rango(b);
    })[0];
  }

  const evaluados = candidatos
    .map((preset) => {
      const sintetica = presetAPrendaSintetica(preset);
      const [mejor] = recomendar(sintetica, torsosPropios, placard).sort(
        (a, b) => nivelOrden(b.score.nivel) - nivelOrden(a.score.nivel),
      );
      return { preset, score: mejor?.score };
    })
    .filter((c): c is { preset: PresetPrenda & { hsl: HSL }; score: ScoreColor } => c.score !== undefined && c.score.nivel !== "con_cuidado")
    .sort((a, b) => nivelOrden(b.score.nivel) - nivelOrden(a.score.nivel));
  return evaluados[0]?.preset;
}

/** Cuando "Vestite hoy" no arma NINGÚN outfit para el estilo elegido, la
 *  razón casi siempre es que falta la prenda ANCLA: sin un pantalón,
 *  bermuda o short de ese registro, armarOutfitsSugeridos no tiene de
 *  dónde partir, aunque el usuario tenga de sobra sweaters, camisas o
 *  calzado de ese mismo estilo (caso real reportado: 5 sweaters y 2
 *  camisas "clásico", pero ningún pantalón clásico -- 0 outfits clásicos
 *  posibles). Pedido explícito del usuario: en ese caso, sugerir
 *  concretamente qué comprar para poder armar un look, no solo avisar que
 *  no hay nada. `null` si SÍ hay ancla de ese estilo (el problema es otro,
 *  no este) o si el catálogo no tiene ningún pantalón/bermuda/short de ese
 *  estilo que combine. */
export function sugerenciaDeAncla(
  estilo: Estilo,
  placard: Prenda[],
  catalogo: (PresetPrenda & { hsl: HSL })[] = CATALOGO_CON_HSL,
): SugerenciaAncla | null {
  const yaHayAncla = placard.some((p) => CATEGORIAS_PIERNAS.includes(p.categoria) && estilosDe(p).includes(estilo));
  if (yaHayAncla) return null;

  const torsosPropios = placard.filter((p) => CATEGORIAS_TORSO.includes(p.categoria) && estilosDe(p).includes(estilo));
  const sugerida = mejorAnclaDelCatalogo(estilo, torsosPropios, placard, catalogo);
  if (!sugerida) return null;

  const mensaje =
    torsosPropios.length > 0
      ? `Para armar un look ${ESTILO_LABEL[estilo]} te falta la prenda ancla: no tenés ningún pantalón, bermuda o short de ese registro (si tenés prendas de arriba de ese estilo, pero sin esto no arma ningún outfit). Te serviría sumar "${sugerida.nombre}" -- combina con lo que ya tenés.`
      : `Todavía no tenés ninguna prenda de estilo ${ESTILO_LABEL[estilo]} para armar un look completo. Arrancá sumando "${sugerida.nombre}".`;

  return { mensaje, sugerida };
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

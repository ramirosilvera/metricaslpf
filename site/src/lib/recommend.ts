import { CATEGORIA_LABEL, type Categoria, type Estilo, type HSL, type NivelCompatibilidad, type Prenda } from "./types";
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

function prendaDeCuero(p: Prenda): boolean {
  return p.textura === "cuero_liso" && CATEGORIAS_CUERO.includes(p.categoria);
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
// vive más abajo en el archivo; acá hace falta antes).
const CATEGORIAS_CON_TORSO: Categoria[] = ["remera", "camisa", "buzo", "sweater", "campera"];

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
 *  que el usuario elija nada -- un outfit por cada prenda de piernas
 *  (pantalón, bermuda o short deportivo -- CATEGORIAS_PIERNAS, la categoría
 *  que conecta con todas las demás en CATEGORIAS_COMPLEMENTARIAS, el ancla
 *  natural) y por cada torso propio que combine al menos "muy_bueno" con
 *  esa ancla -- nunca fuerza un "con cuidado". Varía el torso (no calzado/
 *  accesorio) porque es la prenda que más define la identidad visual de un
 *  outfit en el maniquí; esto es lo que le da al usuario "otras opciones"
 *  para ir rotando en vez de una sola combinación fija por ancla. Devuelve
 *  el pool completo, mejor primero por ancla -- la UI decide cuántas
 *  mostrar de una vez. */
export function armarOutfitsSugeridos(placard: Prenda[]): OutfitSugerido[] {
  const pantalones = placard.filter((p) => CATEGORIAS_PIERNAS.includes(p.categoria));
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

    const candidatosTorso = placard.filter(
      (p) => CATEGORIAS_TORSO.includes(p.categoria) && (!esAnclaDeportiva || estilosDe(p).includes("deportivo")),
    );
    const torsos = candidatasPropias(ancla, candidatosTorso, placard);
    const calzado = mejorPropia(
      ancla,
      placard.filter((p) => p.categoria === "calzado"),
      placard,
    );
    const accesorio = esAnclaDeportiva
      ? undefined
      : mejorPropia(
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

// Prendas de torso que hacen de "abrigo" (capa extra sobre una remera o
// camisa) -- subconjunto de CATEGORIAS_TORSO. remera/camisa quedan afuera a
// propósito: son la capa base, no un abrigo.
const CATEGORIAS_ABRIGO: Categoria[] = ["buzo", "sweater", "campera"];

/** Separa el pool de "Vestite hoy" en dos grupos según si el torso del
 *  outfit es una prenda de abrigo (buzo/sweater/campera) o no (remera/
 *  camisa) -- pedido explícito del usuario: en vez de rotar entre variantes
 *  que a veces coinciden en la misma capa, quiere ver siempre las dos
 *  alternativas reales del día (una para cuando hace frío, otra para
 *  cuando no). Cada outfit de armarOutfitsSugeridos tiene exactamente un
 *  torso (así arma el pool, un candidato de CATEGORIAS_TORSO por
 *  variante), así que la clasificación es binaria y exhaustiva -- no hay
 *  un tercer caso ni una prenda que cuente para los dos grupos. */
export function separarPorAbrigo(pool: OutfitSugerido[]): { conAbrigo: OutfitSugerido[]; sinAbrigo: OutfitSugerido[] } {
  const conAbrigo: OutfitSugerido[] = [];
  const sinAbrigo: OutfitSugerido[] = [];
  for (const s of pool) {
    const tieneAbrigo = s.prendas.some((p) => CATEGORIAS_ABRIGO.includes(p.categoria));
    (tieneAbrigo ? conAbrigo : sinAbrigo).push(s);
  }
  return { conAbrigo, sinAbrigo };
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

    // no depende de categoriaSugerida -- se calcula una sola vez por ancla.
    const torsoPropio = mejorPropia(
      ancla,
      placard.filter((p) => CATEGORIAS_TORSO.includes(p.categoria) && (!esAnclaDeportiva || estilosDe(p).includes("deportivo"))),
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

      const candidatosCatalogo = catalogo.filter(
        (p) =>
          p.categoria === categoriaSugerida &&
          (!esAnclaDeportiva || !CATEGORIAS_TORSO.includes(categoriaSugerida) || estilosDe(presetAPrendaSintetica(p)).includes("deportivo")),
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
              placard.filter((p) => p.categoria === "calzado"),
              placard,
            );
      const accesorioPropio =
        categoriaSugerida === "accesorio" || esAnclaDeportiva
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
  // color (mismo umbral que analizarPlacard en estadisticas.ts:
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

import { useId } from "react";
import { detalleHsl, hexToHsl, tonoTexturaHsl } from "../lib/color";
import type { Calce, Categoria, CorteCalzado, Estacion, Patron, Textura } from "../lib/types";

/** "Campera sweater" -- cardigan de punto CON cierre (categoria="campera",
 *  textura="lana", ver "campera-sweater-azul-marino" en catalogo.ts), no
 *  una campera de tela ni un tapado/sobretodo de paño. Pedido explícito
 *  del usuario, revisado como sastre y diseñador: la silueta genérica de
 *  campera (solapa armada, cierre recto) lee como una prenda de tela
 *  rígida, no como un cardigan de punto real. "lana" solo NO alcanza para
 *  distinguirlo -- "tapado-pano-gris" también usa textura="lana" (misma
 *  fibra, construcción bien distinta: paño tejido apretado y estructurado,
 *  no punto blando). `estacion` sí distingue los dos casos reales de hoy:
 *  un cardigan de punto fino es entretiempo (no abriga como un tapado de
 *  paño real -- ver el comentario de campera-sweater-azul-marino en
 *  catalogo.ts); el tapado es específicamente invierno (por eso existe,
 *  ver su propio comentario). Exportada (no un condicional inline) para
 *  que el ícono chico de acá y el maniquí grande (Maniqui.tsx) usen
 *  EXACTAMENTE el mismo criterio y nunca se desincronicen -- mismo motivo
 *  que ya documenta TEXTURA_PATRON/TEXTURA_BRILLO más abajo. */
export function esCamperaDePunto(categoria: Categoria, textura: Textura | null | undefined, estacion: Estacion | null | undefined): boolean {
  return categoria === "campera" && textura === "lana" && estacion !== "invierno";
}

/** Campera técnica -- rompeviento deportivo (categoria="campera",
 *  textura="poliester", ver "campera-rompeviento-*" en catalogo.ts) O
 *  campera impermeable (textura="impermeable", ver "campera-piloto-negra"
 *  -- pedido explícito del usuario: "la campera piloto en realidad es una
 *  campera impermeable"). Pedido explícito del usuario, revisado como
 *  sastre/modista/ingeniero textil: la silueta genérica de campera (cuello
 *  camisero abierto en dos solapas hacia el pecho, mismo trazo que una
 *  campera de tela/jean) es exactamente lo opuesto de cómo se usan estas
 *  dos prendas reales: las dos cierran hasta el cuello con un cuello alto
 *  (funnel/stand collar), no se llevan abiertas sobre el pecho -- es
 *  viento/lluvia lo que cortan, un cuello abierto no cumple esa función.
 *  Deportivo vs. impermeable comparten esta misma silueta de base a
 *  propósito (las dos son "campera técnica que cierra", la distinción real
 *  entre entrenar y lluvia no cambia el cuello) -- lo que sí las separa es
 *  la tapeta que cubre el cierre (solo en impermeable, ver el comentario
 *  de esa rama en el switch de campera más abajo: un impermeable real
 *  tapa el cierre para que no entre agua, un rompeviento deportivo no).
 *  "poliester"/"impermeable" alcanzan solos (a diferencia de
 *  esCamperaDePunto): son las ÚNICAS texturas entre las camperas del
 *  catálogo hoy, verificado contra catalogo.ts completo -- ninguna otra
 *  campera (de tela, de punto, acolchada) las usa. Exportada, mismo motivo
 *  que esCamperaDePunto: ícono chico y maniquí grande comparten
 *  EXACTAMENTE el mismo criterio. */
export function esCamperaTecnica(categoria: Categoria, textura: Textura | null | undefined): boolean {
  return categoria === "campera" && (textura === "poliester" || textura === "impermeable");
}

/** Campera deportiva de entretiempo (track jacket/"campera de buzo",
 *  categoria="campera", textura="tricot", ver "campera-deportiva-*" en
 *  catalogo.ts). Pedido explícito del usuario: "las camperas deportivas no
 *  son solo rompeviento, también hay algunas de entretiempo. Revisa en las
 *  marcas deportivas tipo Adidas, Puma, Nike" -- verificado por búsqueda
 *  web (Firebird Track Jacket de adidas y equivalentes reales): es tela
 *  TRICOT (punto liviano con brillo característico), NO el tejido plano
 *  técnico del rompeviento (esCamperaTecnica) -- misma fibra base
 *  (poliéster) pero construcción bien distinta, mismo criterio que ya
 *  separó impermeable de poliéster. El cuello real es una banda alta pero
 *  más BAJA/relajada que el funnel del rompeviento (no corta viento, es
 *  para entrenar, no para la lluvia) y el cierre queda expuesto -- sin la
 *  tapeta que sí lleva un impermeable real (no hace falta taparlo de
 *  agua). "tricot" alcanza solo: es la ÚNICA campera del catálogo con esa
 *  textura hoy. Exportada, mismo motivo que esCamperaDePunto/
 *  esCamperaTecnica: ícono chico y maniquí grande comparten EXACTAMENTE el
 *  mismo criterio. */
export function esCamperaTrack(categoria: Categoria, textura: Textura | null | undefined): boolean {
  return categoria === "campera" && textura === "tricot";
}

/** Jean real (categoria="pantalon"/"bermuda", textura="denim") -- pedido
 *  explícito del usuario, revisado como sastre: "que se diferencie un jean
 *  de un pantalón de vestir". Antes de esta revisión TODOS los pantalones
 *  (jean, de vestir, chino, jogger, deportivo) compartían una silueta
 *  genérica sin ningún detalle de corte -- la textura ya pintaba una trama
 *  diagonal encima (ver TEXTURA_PATRON) pero nunca cambiaba la FORMA. El
 *  pespunte doble bien visible en las costuras exteriores es el detalle de
 *  sastrería más citado de un jean real, en cualquier lavado o color --
 *  eso es lo que separa esta silueta, no la trama de la tela (que ya
 *  estaba). Se extiende a "bermuda": un bermuda de jean real existe (denim
 *  cortado a la rodilla) y merece el mismo pespunte, mismo criterio que ya
 *  usa esCamperaDePunto/Tecnica/Track para "campera". */
export function esJean(categoria: Categoria, textura: Textura | null | undefined): boolean {
  return (categoria === "pantalon" || categoria === "bermuda") && textura === "denim";
}

/** Pantalón de vestir real (categoria="pantalon", textura="lana") --
 *  contraparte de sastrería del jean de arriba. La raya/pinza al frente
 *  planchada (crease) es el detalle real que define un pantalón de vestir
 *  -- nunca lleva pespunte visible como el jean (la tela de vestir se cose
 *  con costura oculta, no expuesta). "lana" alcanza solo: es la única
 *  textura real de pantalón de vestir en el catálogo hoy (ver
 *  pantalon-vestir-* en catalogo.ts) -- un chino de algodón (registro
 *  clásico/oficina pero tela informal) no lleva esta raya planchada real,
 *  se queda con la silueta genérica/default. */
export function esPantalonDeVestir(categoria: Categoria, textura: Textura | null | undefined): boolean {
  return categoria === "pantalon" && textura === "lana";
}

/** Jogger/pantalón deportivo real (categoria="pantalon", calce="holgado",
 *  textura algodón o poliéster). El puño elástico angostado en el tobillo
 *  -- en vez de terminar a lo ancho de la pierna como cualquier otro
 *  pantalón -- es el detalle real que define un jogger, reconocible aunque
 *  no se dibuje el elástico en detalle (ver catalogo.ts: jogger-* y
 *  pantalon-deportivo-* son las únicas prendas category="pantalon" con
 *  calce="holgado" hoy). Denim/lana quedan afuera aunque calcen holgado --
 *  esJean/esPantalonDeVestir van primero con prioridad en el switch de más
 *  abajo (un pantalón de vestir de corte ancho sigue siendo de vestir por
 *  la tela, no un jogger; ídem un jean ancho/baggy sigue siendo jean). */
export function esJogger(categoria: Categoria, textura: Textura | null | undefined, calce: Calce | null | undefined): boolean {
  return categoria === "pantalon" && calce === "holgado" && (textura === "algodon" || textura === "poliester");
}

/** Remera deportiva real (categoria="remera", textura="poliester") --
 *  contraparte de esCamperaTecnica/Track para remeras: pedido explícito
 *  del usuario ("que se diferencie... una remera deportiva de una remera
 *  casual"). La manga raglán (costura diagonal desde la axila hasta el
 *  cuello, en vez de la costura horizontal de hombro de una remera de
 *  algodón común) es el corte real más asociado a una remera técnica/
 *  jersey deportivo -- ver remera-deportiva-* en catalogo.ts, la única
 *  textura real que usan hoy es poliéster (ya en TEXTURA_BRILLO, el brillo
 *  sintético sigue dibujándose igual, esto es aparte: cambia el CORTE). */
export function esRemeraDeportiva(categoria: Categoria, textura: Textura | null | undefined): boolean {
  return categoria === "remera" && textura === "poliester";
}

// texturas que se dibujan como un patrón repetido (trama de tela) vs. las
// que se dibujan como un brillo diagonal (materiales lisos y reflectantes).
// null/una textura sin mapear acá (p.ej. sin cargar) no dibuja nada extra.
// Compartido entre PrendaIcon (símbolo chico) y Maniqui.tsx (silueta
// grande) -- vivía duplicado en los dos archivos hasta esta revisión
// ("modista e ingeniero textil", pedido explícito del usuario: que el
// ícono chico también refleje la fibra real, no solo la silueta). Con dos
// copias, agregar una textura nueva (como "viscosa") corría el riesgo real
// de actualizar una sola y desincronizar cómo se ve la MISMA prenda en el
// catálogo/placard contra cómo se ve en "Vestite hoy".
export const TEXTURA_PATRON: Textura[] = ["denim", "pana", "corderoy", "tejido_grueso", "frisado", "lana", "algodon", "lino", "acolchado"];
// poliéster (ropa deportiva técnica) suma el mismo brillo diagonal que
// seda/cuero_liso -- es tela lisa, sin trama visible, con un leve brillo
// sintético real (más notorio que en algodón/lino), no un patrón tejido.
// viscosa -- mismo criterio: fibra de caída lisa y suave, con el brillo
// sutil característico de la viscosa/rayón real (parecido al de la seda),
// no una trama tejida como la lana. impermeable -- mismo criterio que
// poliéster pero más marcado: un nylon/microfibra con tratamiento
// impermeable es LISO Y BRILLOSO de verdad (el agua resbala, no se
// absorbe como en una tela porosa), el más cercano a este grupo de los
// tres -- pedido explícito del usuario ("la campera piloto en realidad es
// una campera impermeable"), revisado como ingeniero textil. tricot --
// mismo grupo: es justamente el "brillo característico" (signature sheen)
// que describen las fichas técnicas reales de una campera de buzo/track
// jacket, no una trama tejida visible como tejido_grueso/frisado.
export const TEXTURA_BRILLO: Textura[] = ["seda", "cuero_liso", "poliester", "viscosa", "impermeable", "tricot"];

/** El <pattern> real por textura -- son ilustraciones esquemáticas a
 *  propósito (líneas/formas simples que se repiten), no una textura
 *  fotorrealista: tienen que seguir leyéndose limpias encima de una prenda
 *  chica (~48-64px de ícono) o de ~80x100px en el maniquí grande. */
export function PatronTextura({ id, textura, tono }: { id: string; textura: Textura; tono: string }) {
  switch (textura) {
    case "denim":
      // trama diagonal (sarga) -- la seña visual más asociada al jean.
      return (
        <pattern id={id} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="3" stroke={tono} strokeWidth="0.6" />
        </pattern>
      );
    case "pana":
    case "corderoy":
      // corderoy es sinónimo de pana en el enum del schema -- mismo patrón.
      return (
        <pattern id={id} width="2.6" height="4" patternUnits="userSpaceOnUse">
          <line x1="0.6" y1="0" x2="0.6" y2="4" stroke={tono} strokeWidth="0.9" />
        </pattern>
      );
    case "tejido_grueso":
      // punto grueso/trenzado -- rombos más grandes que el de lana.
      return (
        <pattern id={id} width="9" height="9" patternUnits="userSpaceOnUse">
          <path d="M0 4.5 L4.5 0 L9 4.5 L4.5 9 Z" fill="none" stroke={tono} strokeWidth="0.9" />
        </pattern>
      );
    case "lana":
      // punto fino -- una "v" de tejido repetida, más chica que el grueso.
      return (
        <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M0 4 L2 0 L4 4" fill="none" stroke={tono} strokeWidth="0.5" />
        </pattern>
      );
    case "frisado":
      // afelpado/cepillado (interior de fleece de un buzo pesado) -- pelusa
      // suelta, no una trama geométrica cerrada como el rombo de
      // tejido_grueso: rayitas cortas sueltas con punta redondeada, para
      // leerse más "peludo"/blando que un punto tejido.
      return (
        <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M1 1 L1 3 M3 0.3 L3 2.6 M5 1.6 L5 4" stroke={tono} strokeWidth="0.6" strokeLinecap="round" />
        </pattern>
      );
    case "algodon":
    case "lino":
      // trama plana simple -- lino con la cuadrícula más grande (fibra más
      // gruesa/irregular que el algodón).
      return (
        <pattern id={id} width={textura === "lino" ? 4.5 : 3} height={textura === "lino" ? 4.5 : 3} patternUnits="userSpaceOnUse">
          <path
            d={`M0 0 H${textura === "lino" ? 4.5 : 3} M0 0 V${textura === "lino" ? 4.5 : 3}`}
            stroke={tono}
            strokeWidth="0.3"
          />
        </pattern>
      );
    case "acolchado":
      // costuras de campera de pluma (puffer) -- una cuadrícula grande de
      // canales de relleno, no una trama de tela: por eso el trazo es más
      // grueso y el espaciado mucho más ancho que cualquier textura tejida
      // de acá arriba (denim/lana/algodón).
      return (
        <pattern id={id} width="16" height="11" patternUnits="userSpaceOnUse">
          <path d="M0 0 H16 M0 0 V11" stroke={tono} strokeWidth="1" />
        </pattern>
      );
    default:
      return null;
  }
}

/** El <pattern> real de un ESTAMPADO (rayas/cuadros) -- distinto de
 *  PatronTextura de arriba en un punto clave: acá el patrón lleva DOS
 *  colores reales (color de fondo + color del estampado), a opacidad
 *  completa, y se usa como el relleno PRINCIPAL de la forma (no una capa
 *  semitransparente encima de un color plano) -- una camisa a rayas
 *  celeste sobre blanco es blanco Y celeste, no "blanco con un tinte
 *  celeste". Pedido explícito del usuario: "camisas ralladas... inspírate
 *  en usos y costumbres, moda". Rayas verticales (paralelas a los
 *  botones) -- así se raya una camisa de vestir real; horizontal es un
 *  patrón "Breton"/marinero, otra prenda que esta app no tiene. Cuadros:
 *  grilla simple horizontal+vertical, un tattersall/cuadro básico. */
export function PatronEstampado({
  id,
  patron,
  colorBase,
  color2,
}: {
  id: string;
  patron: Extract<Patron, "rayas" | "cuadros">;
  colorBase: string;
  color2: string;
}) {
  if (patron === "rayas") {
    return (
      <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse">
        <rect width="5" height="5" fill={colorBase} />
        <rect x="0" width="1.6" height="5" fill={color2} />
      </pattern>
    );
  }
  return (
    <pattern id={id} width="9" height="9" patternUnits="userSpaceOnUse">
      <rect width="9" height="9" fill={colorBase} />
      <rect x="0" width="1.4" height="9" fill={color2} />
      <rect y="0" width="9" height="1.4" fill={color2} />
    </pattern>
  );
}

/** Una forma "de tela": el color plano de siempre + (si corresponde) una
 *  segunda copia del mismo trazo con el patrón/brillo de textura encima, a
 *  opacidad reducida para no perder el color de fondo -- mismo mecanismo
 *  que `Forma` en Maniqui.tsx, pero sobre el color plano de un ícono chico
 *  en vez del degradé con volumen de la silueta grande (a este tamaño un
 *  degradé no se alcanza a apreciar, la textura sí). */
function FormaConTextura({
  d,
  fill,
  stroke,
  patron,
}: {
  d: string;
  fill: string;
  stroke: string;
  patron?: string;
}) {
  return (
    <>
      <path d={d} fill={fill} stroke={stroke} />
      {patron && <path d={d} fill={patron} opacity={0.55} />}
    </>
  );
}

/** Mismo criterio que FormaConTextura, para las piezas que se dibujan como
 *  <rect> (el cuerpo del cinturón) en vez de <path>. */
function RectConTextura({
  x,
  y,
  width,
  height,
  rx,
  fill,
  stroke,
  patron,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
  fill: string;
  stroke: string;
  patron?: string;
}) {
  return (
    <>
      <rect x={x} y={y} width={width} height={height} rx={rx} fill={fill} stroke={stroke} />
      {patron && <rect x={x} y={y} width={width} height={height} rx={rx} fill={patron} opacity={0.55} />}
    </>
  );
}

/**
 * Contenido interno (sin <svg> envolvente) de la silueta de cada categoría,
 * en un cuadrado de referencia 0..64 -- se exporta separado de PrendaIcon
 * para que Maniqui.tsx pueda reusar exactamente las mismas formas,
 * reposicionadas con <g transform> sobre el cuerpo del maniquí, en vez de
 * duplicar el path data en dos lugares (y arriesgar que se desincronicen).
 * Formas simplificadas a propósito (no son ilustraciones de moda, son
 * siluetas reconocibles a primera vista).
 */
export function PrendaShape({
  categoria,
  color,
  textura,
  estacion,
  suelaContraste = false,
  posicionAccesorio = "cintura",
  requiereCuello = false,
  conCapucha = true,
  patron: estampado = "liso",
  color2,
  corteCalzado = "zapatilla_urbana",
  calce,
}: {
  categoria: Categoria;
  color: string;
  /** Ver Prenda.estacion en types.ts. Solo afecta a "campera" -- ver
   *  esCamperaDePunto más arriba (distingue un cardigan de punto de un
   *  tapado de paño, ambos textura="lana"). Sin esto, ninguna prenda
   *  distinguía cardigan de tapado en el ícono -- el maniquí grande sí
   *  puede (recibe la Prenda completa), pero este ícono chico solo recibe
   *  campos sueltos, así que necesita el dato explícito. */
  estacion?: Estacion | null;
  /** Ver Prenda.textura en types.ts. Revisado como ingeniero textil,
   *  pedido explícito del usuario: dos prendas de la MISMA categoría y
   *  color pero de fibra distinta (ej. sweater de lana vs. sweater
   *  liviano de viscosa) antes se veían pixel-idénticas en el ícono chico
   *  -- solo el maniquí grande de "Vestite hoy" mostraba la textura real.
   *  Mismo patrón/brillo que Maniqui.tsx (PatronTextura, TEXTURA_PATRON/
   *  TEXTURA_BRILLO, ahora exportados desde acá para que las dos vistas
   *  nunca se desincronicen). Sin textura cargada, no dibuja nada extra
   *  -- no se inventa una fibra que la prenda no tiene. */
  textura?: Textura;
  /** Ver Prenda.suela_contraste en types.ts. Solo afecta a "calzado" --
   *  Maniqui.tsx ya dibuja la suela blanca en el maniquí grande, pero este
   *  ícono chico (catálogo, placard) usaba SIEMPRE el mismo path sin
   *  distinción, así que dos zapatillas negras -- con y sin suela de
   *  contraste -- se veían exactamente iguales en el selector. */
  suelaContraste?: boolean;
  /** Ver Prenda.posicion_accesorio en types.ts. Solo afecta a "accesorio":
   *  antes de esto, un cinturón, una corbata y una bufanda dibujaban
   *  exactamente el mismo ícono (una tira con hebilla) porque el switch de
   *  abajo solo distinguía por categoria, no por qué accesorio era en
   *  realidad -- así lo reportó un usuario viendo el selector real. */
  posicionAccesorio?: "cuello" | "cintura";
  /** Ver Prenda.requiere_cuello en types.ts. Junto con posicionAccesorio
   *  distingue una corbata (cuello + requiere_cuello) de una bufanda
   *  (cuello, sin requiere_cuello) -- ambas van al cuello pero se ven, y se
   *  usan, distinto. */
  requiereCuello?: boolean;
  /** Ver Prenda.con_capucha en types.ts. Solo afecta a "buzo": antes se
   *  dibujaba la misma silueta con pico de capucha para CUALQUIER buzo --
   *  pedido explícito del usuario, revisado como modista/ingeniero textil:
   *  un buzo crewneck real (sin capucha) tiene el hombro más bajo/plano y
   *  un escote redondo, no el pico alto de la capucha apoyada atrás del
   *  cuello. Default true: preserva el ícono de todos los buzos ya
   *  cargados (100% hoodie hasta esta revisión). */
  conCapucha?: boolean;
  /** Ver Prenda.patron en types.ts. Solo "rayas"/"cuadros" dibujan algo --
   *  "liso" (default) es el 99% del catálogo, sin cambios de siempre. */
  patron?: Patron;
  /** Ver Prenda.color2_hex en types.ts -- el segundo color del estampado
   *  (la raya/el cuadro sobre `color`, que sigue siendo el fondo). Sin
   *  esto, un `patron` distinto de "liso" no dibuja nada: no hay con qué. */
  color2?: string | null;
  /** Ver CorteCalzado en types.ts. Solo afecta a "calzado" -- default
   *  "zapatilla_urbana" preserva el ícono de todo el catálogo anterior a
   *  esta columna (100% zapatillas urbanas hasta esta revisión). */
  corteCalzado?: CorteCalzado;
  /** Ver Prenda.calce en types.ts. Solo afecta a "pantalon" -- ver esJogger
   *  más arriba: es la señal (junto con textura) que distingue un jogger/
   *  deportivo (puño angostado en el tobillo) de un chino de corte recto,
   *  las dos con textura algodón. Sin calce cargado no dibuja el puño --
   *  no se inventa un corte que la prenda no tiene marcado. */
  calce?: Calce | null;
}) {
  const stroke = "rgba(0,0,0,0.15)";
  const soleClipId = useId();
  const patId = useId();
  const brilloId = useId();
  const estampadoId = useId();

  const conPatron = textura && TEXTURA_PATRON.includes(textura);
  const conBrillo = textura && TEXTURA_BRILLO.includes(textura);
  const patron = conPatron ? `url(#${patId})` : conBrillo ? `url(#${brilloId})` : undefined;
  // tono del patrón derivado del color REAL de la prenda (no del stroke fijo
  // de arriba) -- ver tonoTexturaHsl en color.ts: sobre una prenda oscura
  // (ej. sweater negro) un tono fijo semitransparente se funde con el
  // relleno y el patrón queda invisible, confirmado renderizando el ícono
  // real.
  const { h: tonoH, s: tonoS, l: tonoL } = hexToHsl(color);
  // tono de detalle (costuras/pespunte/decoración) derivado del color real
  // de la prenda -- mismo criterio que ya usaba "calzado" más abajo, ahora
  // hoisteado para que jean/vestir/jogger/remera deportiva (ver esJean/
  // esPantalonDeVestir/esJogger/esRemeraDeportiva más arriba) también lo
  // usen sin duplicar el cálculo.
  const tonoDetalle = detalleHsl(tonoH, tonoS, tonoL);
  // estampado (rayas/cuadros) -- reemplaza el relleno plano por completo
  // cuando está cargado, no se combina con conPatron/conBrillo de textura:
  // una camisa a rayas se lee por sus rayas, no por una trama de tela
  // semitransparente encima de ellas (ver PatronEstampado más arriba para
  // el porqué de por qué es un mecanismo distinto al de textura).
  const conEstampado = (estampado === "rayas" || estampado === "cuadros") && !!color2;
  const estampadoUrl = conEstampado ? `url(#${estampadoId})` : undefined;
  const tonoPatron = tonoTexturaHsl(tonoH, tonoS, tonoL);

  const defs = (conPatron || conBrillo || conEstampado) && (
    <defs>
      {conPatron && textura && <PatronTextura id={patId} textura={textura} tono={tonoPatron} />}
      {conBrillo && (
        <linearGradient id={brilloId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="35%" stopColor="white" stopOpacity="0.55" />
          <stop offset="50%" stopColor="white" stopOpacity="0" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      )}
      {conEstampado && color2 && (estampado === "rayas" || estampado === "cuadros") && (
        <PatronEstampado id={estampadoId} patron={estampado} colorBase={color} color2={color2} />
      )}
    </defs>
  );

  let forma: React.ReactNode;

  switch (categoria) {
    case "remera":
      // manga raglán (costura diagonal desde el cuello hasta la axila) --
      // ver esRemeraDeportiva más arriba: el corte real que distingue una
      // remera técnica/jersey de una remera de algodón común, que no lleva
      // ninguna costura de manga marcada en la silueta.
      forma = (
        <>
          <FormaConTextura d="M22 8 L32 14 L42 8 L54 16 L47 26 L42 22 L42 56 L22 56 L22 22 L17 26 L10 16 Z" fill={color} stroke={stroke} patron={patron} />
          {esRemeraDeportiva(categoria, textura) && (
            <>
              <line x1="36" y1="10" x2="42" y2="22" stroke={tonoDetalle} strokeWidth={1} />
              <line x1="28" y1="10" x2="22" y2="22" stroke={tonoDetalle} strokeWidth={1} />
            </>
          )}
        </>
      );
      break;
    case "camisa":
      // con estampado: el fill ES el patrón de rayas/cuadros (dos colores
      // reales), sin la capa de textura semitransparente encima (ver el
      // comentario largo de conEstampado más arriba).
      forma = (
        <>
          <FormaConTextura
            d="M24 6 L32 12 L40 6 L52 14 L46 24 L41 20 L41 56 L23 56 L23 20 L18 24 L12 14 Z"
            fill={conEstampado ? estampadoUrl! : color}
            stroke={stroke}
            patron={conEstampado ? undefined : patron}
          />
          <line x1="32" y1="14" x2="32" y2="56" stroke={stroke} />
        </>
      );
      break;
    case "buzo":
      forma = conCapucha ? (
        <>
          <FormaConTextura d="M20 10 Q32 2 44 10 L56 18 L49 28 L44 24 L44 58 L20 58 L20 24 L15 28 L8 18 Z" fill={color} stroke={stroke} patron={patron} />
          <path d="M26 10 Q32 16 38 10" fill="none" stroke={stroke} />
        </>
      ) : (
        // crewneck -- mismo cuerpo/mangas que el hoodie de arriba, pero sin
        // el pico alto de la capucha (Q32 2 -> Q32 8, mucho más bajo) y con
        // un escote redondo en vez del arco que sugiere la abertura de la
        // capucha (más curvo que la V recta del sweater: un crewneck cierra
        // en punto, no en V).
        <>
          <FormaConTextura d="M20 12 Q32 7 44 12 L56 18 L49 28 L44 24 L44 58 L20 58 L20 24 L15 28 L8 18 Z" fill={color} stroke={stroke} patron={patron} />
          <path d="M25 10 Q32 15 39 10" fill="none" stroke={stroke} />
        </>
      );
      break;
    case "sweater":
      forma = (
        <>
          <FormaConTextura d="M22 8 L32 13 L42 8 L53 17 L46 27 L42 23 L42 58 L22 58 L22 23 L18 27 L11 17 Z" fill={color} stroke={stroke} patron={patron} />
          <path d="M25 8 L32 12 L39 8" fill="none" stroke={stroke} />
        </>
      );
      break;
    case "pantalon":
      // jean/vestir/jogger -- ver esJean/esPantalonDeVestir/esJogger más
      // arriba. Antes esta silueta era una sola para cualquier pantalón,
      // sin ningún detalle real de corte -- pedido explícito del usuario,
      // revisado como sastre: "que se diferencie un jean de un pantalón de
      // vestir". Las tres son mutuamente excluyentes por construcción (ver
      // esJogger: excluye denim/lana con prioridad), así que como mucho una
      // se dibuja.
      forma = (
        <>
          <FormaConTextura d="M18 6 H46 L44 58 H34 L32 24 L30 58 H20 Z" fill={color} stroke={stroke} patron={patron} />
          {esJean(categoria, textura) && (
            // pespunte doble en las costuras exteriores -- el detalle de
            // sastrería real más citado de un jean, en cualquier lavado.
            <>
              <line x1="43" y1="8" x2="41" y2="56" stroke={tonoDetalle} strokeWidth={0.8} />
              <line x1="21" y1="8" x2="23" y2="56" stroke={tonoDetalle} strokeWidth={0.8} />
            </>
          )}
          {esPantalonDeVestir(categoria, textura) && (
            // raya/pinza planchada al frente de cada pierna -- el detalle
            // real que define un pantalón de vestir, costura oculta (sin
            // pespunte visible como el jean).
            <>
              <line x1="38" y1="10" x2="39" y2="56" stroke={tonoDetalle} strokeWidth={0.8} />
              <line x1="26" y1="10" x2="25" y2="56" stroke={tonoDetalle} strokeWidth={0.8} />
            </>
          )}
          {esJogger(categoria, textura, calce) && (
            // puño elástico angostado en el tobillo -- línea de corte del
            // puño + un par de costillas cortas sugiriendo el elástico.
            <>
              <line x1="35" y1="50" x2="43" y2="50" stroke={tonoDetalle} strokeWidth={0.8} />
              <line x1="21" y1="50" x2="29" y2="50" stroke={tonoDetalle} strokeWidth={0.8} />
              <line x1="37" y1="51" x2="37" y2="57" stroke={tonoDetalle} strokeWidth={0.6} />
              <line x1="40" y1="51" x2="40" y2="57" stroke={tonoDetalle} strokeWidth={0.6} />
              <line x1="23" y1="51" x2="23" y2="57" stroke={tonoDetalle} strokeWidth={0.6} />
              <line x1="26" y1="51" x2="26" y2="57" stroke={tonoDetalle} strokeWidth={0.6} />
            </>
          )}
        </>
      );
      break;
    case "bermuda":
      // mismo path que "pantalon" hasta la cadera (18-46 arriba, entrepierna
      // en 32,24) pero cortado a la altura de la rodilla (y=44 en vez de
      // y=58) en vez de llegar al tobillo -- ver Maniqui.tsx para el mismo
      // criterio aplicado a la silueta grande del maniquí. Solo el pespunte
      // de jean aplica acá (ver esJean, que incluye "bermuda" a propósito)
      // -- un bermuda de vestir/jogger no existe como arquetipo real en
      // este catálogo, así que no hace falta esa decoración.
      forma = (
        <>
          <FormaConTextura d="M18 6 H46 L44 44 H34 L32 24 L30 44 H20 Z" fill={color} stroke={stroke} patron={patron} />
          {esJean(categoria, textura) && (
            <>
              <line x1="43" y1="8" x2="41.5" y2="42" stroke={tonoDetalle} strokeWidth={0.8} />
              <line x1="21" y1="8" x2="22.5" y2="42" stroke={tonoDetalle} strokeWidth={0.8} />
            </>
          )}
        </>
      );
      break;
    case "short_deportivo":
      // mismo criterio que "bermuda" pero más corto (y=34, medio muslo en
      // vez de rodilla) -- el short deportivo real termina bastante más
      // arriba que un bermuda de vestir/casual.
      forma = <FormaConTextura d="M18 6 H46 L44 34 H34 L32 24 L30 34 H20 Z" fill={color} stroke={stroke} patron={patron} />;
      break;
    case "calzado": {
      const d = "M8 44 Q8 36 18 34 L34 30 Q40 24 48 26 L52 34 Q58 36 58 44 Q58 50 52 50 L12 50 Q8 50 8 44 Z";
      const base = <FormaConTextura d={d} fill={color} stroke={stroke} patron={patron} />;
      // Suela de contraste: se recorta el mismo silueta con un clip
      // rectangular en la franja inferior -- así el borde de la suela sigue
      // exactamente el contorno real del zapato (que no es recto), sin
      // tener que dibujar a mano una segunda curva aproximada. La suela
      // (goma/EVA) no lleva el patrón de textura de la capellada -- es otro
      // material, no la misma tela. Ortogonal al corte: cualquier corte
      // puede llevar o no suela de contraste (un dato real de la prenda,
      // ver types.ts), no solo la zapatilla urbana.
      const suela = suelaContraste && (
        <>
          <clipPath id={soleClipId}>
            <rect x="0" y="45" width="64" height="6" />
          </clipPath>
          <path d={d} fill="#F2F0EA" clipPath={`url(#${soleClipId})`} />
        </>
      );
      // Decoración real por corte -- ver CorteCalzado en types.ts para el
      // porqué de cada una (revisado como modista/ingeniero textil, pedido
      // explícito del usuario: "las costuras, cortes y decoración más
      // usadas según usos y costumbres"). tonoDetalle (lightness-aware,
      // igual criterio que el resto de la app -- ver color.ts, calculado
      // más arriba junto con tonoH/tonoS/tonoL) en vez de un tono fijo
      // semitransparente: un detalle sobre una zapatilla negra necesita
      // más luz, no menos, para leerse -- mismo hallazgo ya confirmado con
      // el cuello de la camisa y las solapas del saco.
      let decoracion: React.ReactNode = null;
      switch (corteCalzado) {
        case "zapatilla_running":
          // silueta técnica: panel diagonal ancho (relleno, no una línea
          // fina) representando el panel de malla/refuerzo lateral -- SIN
          // las 3 rayas de la urbana (esas son un diseño de calle, no de
          // zapatilla técnica de entrenamiento).
          decoracion = <path d="M13 43 L21 47 L41 31 L33 28 Z" fill={tonoDetalle} stroke={stroke} />;
          break;
        case "zapato_vestir":
          // puntera con costura curva (cap-toe) + broguing: una fila de
          // perforaciones chicas siguiendo la costura -- el detalle
          // clásico de un oxford/derby real.
          decoracion = (
            <>
              <path d="M33 31 Q41 25 49 29" fill="none" stroke={tonoDetalle} strokeWidth={1.1} />
              {[36, 40, 44, 48].map((x, i) => (
                <circle key={x} cx={x} cy={29.5 - i * 0.5} r={0.8} fill={tonoDetalle} />
              ))}
            </>
          );
          break;
        case "mocasin":
          // tira/correa cruzando el empeine (penny loafer) -- SIN cordones
          // (la ausencia es el dato real más definitorio de un mocasín, ver
          // types.ts: este corte no dibuja cordones en ningún lado).
          decoracion = <rect x="19" y="32" width="18" height="5" rx="2" fill={tonoDetalle} stroke={stroke} />;
          break;
        case "zapatilla_lona":
          // puntera de goma (blanco/crema, sin importar el color de la
          // lona -- es otro material, igual criterio que la suela de
          // contraste) + costura lateral marcada, el detalle real de una
          // zapatilla de lona tipo Converse/Vans.
          decoracion = (
            <>
              <path d="M39 25 Q47 24 52 34 Q54 38 50 39 Q43 33 37 30 Z" fill="#F2F0EA" stroke={stroke} />
              <line x1="9" y1="41" x2="57" y2="41" stroke={stroke} strokeWidth={0.6} />
            </>
          );
          break;
        case "zapatilla_urbana":
        default:
          // 3 rayas laterales -- la referencia real más citada de
          // "zapatilla urbana" de calle (pedido explícito del usuario).
          decoracion = (
            <>
              <line x1="22" y1="42" x2="28" y2="33" stroke={tonoDetalle} strokeWidth={2.4} strokeLinecap="round" />
              <line x1="27" y1="40" x2="33" y2="31" stroke={tonoDetalle} strokeWidth={2.4} strokeLinecap="round" />
              <line x1="32" y1="38" x2="38" y2="29" stroke={tonoDetalle} strokeWidth={2.4} strokeLinecap="round" />
            </>
          );
          break;
      }
      forma = (
        <>
          {base}
          {suela}
          {decoracion}
        </>
      );
      break;
    }
    case "campera":
      // "campera sweater" (esCamperaDePunto, ver su comentario largo más
      // arriba) es una prenda real distinta -- pedido explícito del
      // usuario, revisado como sastre y diseñador: es un cardigan de punto
      // CON cierre, no una campera técnica de tela ni un tapado de paño.
      // La silueta genérica de acá abajo (dos solapas en punta armando un
      // cuello, línea de cierre recta) lee como una campera de tela rígida
      // -- un cardigan de punto real tiene el hombro/cuerpo más blando y
      // un escote en V simple sin solapa armada. Se reusa la MISMA
      // silueta y el mismo trazo de V que ya usa categoria="sweater" más
      // abajo (nunca se desincronizan, es literal el mismo path) y se le
      // suma la línea de cierre -- es un sweater con cierre, no un
      // sweater sin más.
      forma = esCamperaDePunto(categoria, textura, estacion) ? (
        <>
          <FormaConTextura d="M22 8 L32 13 L42 8 L53 17 L46 27 L42 23 L42 58 L22 58 L22 23 L18 27 L11 17 Z" fill={color} stroke={stroke} patron={patron} />
          <path d="M25 8 L32 12 L39 8" fill="none" stroke={stroke} />
          <line x1="32" y1="13" x2="32" y2="58" stroke={stroke} strokeDasharray="2 2" />
        </>
      ) : esCamperaTecnica(categoria, textura) ? (
        // rompeviento (esCamperaTecnica, ver su comentario largo más
        // arriba) -- pedido explícito del usuario, revisado como sastre y
        // modista: mismo cuerpo/mangas que la campera genérica de abajo,
        // pero con la abertura del cuello mucho más angosta y alta (28-36
        // en vez de 24-40, apenas 2u de caída en vez de 6) -- un cuello
        // funnel cerrado hasta el mentón, no la solapa abierta de una
        // campera de tela. El cierre sube con el cuello, hasta y=8 en vez
        // de y=12.
        <>
          <FormaConTextura d="M28 6 L32 8 L36 6 L54 16 L47 27 L42 22 L42 58 L22 58 L22 22 L17 27 L10 16 Z" fill={color} stroke={stroke} patron={patron} />
          <line x1="32" y1="8" x2="32" y2="58" stroke={stroke} strokeDasharray="2 2" />
          {textura === "impermeable" && (
            // tapeta que cubre el cierre -- pedido explícito del usuario
            // ("la campera piloto en realidad es una campera
            // impermeable"), revisado como ingeniero textil: un
            // impermeable real tapa el cierre con una solapa angosta para
            // que no entre agua por ahí -- un rompeviento deportivo
            // (poliéster, mismo cuello funnel de acá arriba) no la lleva,
            // así que es lo único que distingue a las dos prendas técnicas
            // entre sí a esta escala (comparten cuello y silueta a
            // propósito, ver esCamperaTecnica). Offset a un lado del
            // cierre (no centrada), como se ve una tapeta real.
            <rect x="33" y="14" width="5" height="40" rx="1" fill={detalleHsl(tonoH, tonoS, tonoL)} stroke={stroke} strokeWidth={0.5} />
          )}
        </>
      ) : esCamperaTrack(categoria, textura) ? (
        // campera deportiva de entretiempo/track jacket (esCamperaTrack,
        // ver su comentario largo más arriba) -- pedido explícito del
        // usuario: "las camperas deportivas no son solo rompeviento,
        // también hay algunas de entretiempo". Cuello banda intermedio
        // (26-38, cae a y=10) -- más angosto/alto que el cuello abierto de
        // la campera genérica de acá abajo (24-40, cae a y=12), pero más
        // bajo/relajado que el funnel del rompeviento (28-36, cae a y=8):
        // un track jacket real cierra bastante pero no hasta el mentón
        // como una prenda técnica de lluvia/viento. Sin tapeta -- el
        // cierre queda expuesto, a diferencia de un impermeable real.
        <>
          <FormaConTextura d="M26 6 L32 10 L38 6 L54 16 L47 27 L42 22 L42 58 L22 58 L22 22 L17 27 L10 16 Z" fill={color} stroke={stroke} patron={patron} />
          <line x1="32" y1="10" x2="32" y2="58" stroke={stroke} strokeDasharray="2 2" />
        </>
      ) : (
        <>
          <FormaConTextura d="M24 6 L32 12 L40 6 L54 16 L47 27 L42 22 L42 58 L22 58 L22 22 L17 27 L10 16 Z" fill={color} stroke={stroke} patron={patron} />
          <line x1="32" y1="12" x2="32" y2="58" stroke={stroke} strokeDasharray="2 2" />
        </>
      );
      break;
    case "saco": {
      // mismo cuerpo de "chaqueta con cuello" que campera (misma silueta
      // base de saco/campera), pero sin la línea de cremallera recta --
      // en su lugar, DOS SOLAPAS RELLENAS (no solo un trazo) que se abren
      // en V desde el cuello hacia el pecho, mismo criterio que el saco
      // grande en Maniqui.tsx/TorsoCuerpo (dos piezas rellenas, no una
      // línea). Reporte real del usuario con captura: la primera versión
      // (dos líneas finas) se leía como una remera lisa -- a esta escala
      // chica (~48-64px) un trazo delgado no alcanza para comunicar "acá
      // hay una solapa", hace falta una FORMA con su propio color, igual
      // que hace el resto del ícono con collar (ver el cuello relleno de
      // camisa/campera más abajo en Maniqui.tsx). Relleno en detalleHsl
      // (tono más claro, mismo criterio que las solapas del maniquí
      // grande) sobre el color/tono ya calculado para el patrón de acá
      // arriba (tonoH/tonoS/tonoL) -- no un nuevo cálculo.
      const solapa = detalleHsl(tonoH, tonoS, tonoL);
      forma = (
        <>
          <FormaConTextura d="M24 6 L32 12 L40 6 L54 16 L47 27 L42 22 L42 58 L22 58 L22 22 L17 27 L10 16 Z" fill={color} stroke={stroke} patron={patron} />
          <path d="M32 12 L22 28 L32 44 L34 16 Z" fill={solapa} stroke={stroke} />
          <path d="M32 12 L42 28 L32 44 L30 16 Z" fill={solapa} stroke={stroke} />
        </>
      );
      break;
    }
    case "accesorio":
    default: {
      if (posicionAccesorio !== "cuello") {
        // Cinturón: tira horizontal a la altura de la cintura, con hebilla.
        // Forma original, sin cambios -- sigue siendo la única lectura
        // correcta para un accesorio que se usa en la cintura. La hebilla
        // (metal) no lleva el patrón de textura del cuero/tela del cuerpo
        // del cinturón -- es otro material.
        forma = (
          <>
            <RectConTextura x={8} y={27} width={48} height={10} rx={2} fill={color} stroke={stroke} patron={patron} />
            <rect x="26" y="24" width="12" height="16" rx="2" fill="none" stroke={stroke} strokeWidth="2" />
          </>
        );
      } else if (requiereCuello) {
        // Corbata: nudo angosto arriba (a la altura del cuello) y una
        // franja que se ensancha y termina en punta -- la silueta clásica
        // de corbata, para no confundirla con la tira recta del cinturón.
        forma = (
          <>
            <FormaConTextura d="M27 6 L37 6 L34 16 L30 16 Z" fill={color} stroke={stroke} patron={patron} />
            <FormaConTextura d="M30 16 L34 16 L44 46 L32 58 L20 46 Z" fill={color} stroke={stroke} patron={patron} />
          </>
        );
      } else {
        // Bufanda: banda curva alrededor del cuello con dos puntas colgando
        // de distinto largo (como se drapea una bufanda real) -- distinta de
        // la punta única y angosta de la corbata.
        forma = (
          <>
            <FormaConTextura d="M20 10 Q32 2 44 10 Q40 16 32 16 Q24 16 20 10 Z" fill={color} stroke={stroke} patron={patron} />
            <RectConTextura x={22} y={14} width={8} height={40} rx={3} fill={color} stroke={stroke} patron={patron} />
            <RectConTextura x={34} y={14} width={8} height={30} rx={3} fill={color} stroke={stroke} patron={patron} />
          </>
        );
      }
    }
  }

  return (
    <>
      {defs}
      {forma}
    </>
  );
}

export default function PrendaIcon({
  categoria,
  color,
  textura,
  estacion,
  suelaContraste,
  posicionAccesorio,
  requiereCuello,
  conCapucha,
  patron,
  color2,
  corteCalzado,
  calce,
}: {
  categoria: Categoria;
  color: string;
  textura?: Textura;
  estacion?: Estacion | null;
  suelaContraste?: boolean;
  posicionAccesorio?: "cuello" | "cintura";
  requiereCuello?: boolean;
  conCapucha?: boolean;
  patron?: Patron;
  color2?: string | null;
  corteCalzado?: CorteCalzado;
  calce?: Calce | null;
}) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <PrendaShape
        categoria={categoria}
        color={color}
        textura={textura}
        estacion={estacion}
        suelaContraste={suelaContraste}
        posicionAccesorio={posicionAccesorio}
        requiereCuello={requiereCuello}
        conCapucha={conCapucha}
        patron={patron}
        color2={color2}
        corteCalzado={corteCalzado}
        calce={calce}
      />
    </svg>
  );
}

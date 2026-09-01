import { contornoHsl, luzHsl, sombraHsl } from "../lib/color";
import PrendaIcon from "./PrendaIcon";
import type { Categoria, Prenda, Textura } from "../lib/types";

type Capa = "torso" | "piernas" | "pies" | "accesorio";

const CAPA: Record<Categoria, Capa> = {
  remera: "torso",
  camisa: "torso",
  buzo: "torso",
  sweater: "torso",
  campera: "torso",
  pantalon: "piernas",
  calzado: "pies",
  accesorio: "accesorio",
};

// de afuera hacia adentro: si el outfit tiene más de una prenda de torso
// (p.ej. remera + campera), se muestra la de más afuera en el maniquí y el
// resto como chips debajo -- una campera puesta ya tapa casi toda la remera
// que tiene debajo, así que mostrar ambas superpuestas al mismo tamaño no
// se leería como "las dos puestas", se leería como "se rompió el dibujo".
const PRIORIDAD_TORSO: Categoria[] = ["campera", "buzo", "sweater", "camisa", "remera"];

// manga corta (remera) vs. manga larga (el resto de las prendas de torso).
const MANGA_CORTA: Categoria[] = ["remera"];

// si una de estas queda de "más afuera" en el torso y hay una camisa debajo
// en el mismo outfit, se dibuja el cuello de la camisa asomando por encima
// -- así se ve puesta una camisa con sweater/campera/buzo arriba, no
// escondida sin más como un chip suelto. La remera no entra: su escote es
// una curva simple, no hay "cuello de camisa" real que tenga sentido tapar
// y hacer asomar de la misma forma.
const OUTER_CON_CUELLO_VISIBLE: Categoria[] = ["sweater", "buzo", "campera"];

function agruparPorCapa(prendas: Prenda[]): {
  principal: Partial<Record<Capa, Prenda>>;
  cuelloSecundario?: Prenda;
  extras: Prenda[];
} {
  const porCapa: Record<Capa, Prenda[]> = { torso: [], piernas: [], pies: [], accesorio: [] };
  for (const p of prendas) porCapa[CAPA[p.categoria]].push(p);

  porCapa.torso.sort((a, b) => PRIORIDAD_TORSO.indexOf(a.categoria) - PRIORIDAD_TORSO.indexOf(b.categoria));

  const principal: Partial<Record<Capa, Prenda>> = {};
  const extras: Prenda[] = [];
  let cuelloSecundario: Prenda | undefined;

  (Object.keys(porCapa) as Capa[]).forEach((capa) => {
    let [primera, ...resto] = porCapa[capa];
    if (primera) principal[capa] = primera;

    if (capa === "torso" && primera && OUTER_CON_CUELLO_VISIBLE.includes(primera.categoria)) {
      const idxCamisa = resto.findIndex((p) => p.categoria === "camisa");
      if (idxCamisa !== -1) {
        cuelloSecundario = resto[idxCamisa];
        // se saca de "resto" (no de "extras" directamente): ya se muestra
        // como cuello asomando, mostrarla TAMBIÉN como chip suelto abajo
        // sería redundante.
        resto = resto.filter((_, i) => i !== idxCamisa);
      }
    }

    extras.push(...resto);
  });
  return { principal, cuelloSecundario, extras };
}

// texturas que se dibujan como un patrón repetido (trama de tela) vs. las
// que se dibujan como un brillo diagonal (materiales lisos y reflectantes).
// null/una textura sin mapear acá (p.ej. sin cargar) no dibuja nada extra.
const TEXTURA_PATRON: Textura[] = ["denim", "pana", "corderoy", "tejido_grueso", "lana", "algodon", "lino", "acolchado"];
const TEXTURA_BRILLO: Textura[] = ["seda", "cuero_liso"];

/** El <pattern> real por textura -- son ilustraciones esquemáticas a
 *  propósito (líneas/formas simples que se repiten), no una textura
 *  fotorrealista: tienen que seguir leyéndose limpias encima de una prenda
 *  de ~80x100px. */
function PatronTextura({ id, textura, tono }: { id: string; textura: Textura; tono: string }) {
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

/** Relleno con volumen simple: un degradé de dos paradas (mismo matiz, más
 *  claro arriba-izquierda / más oscuro abajo-derecha) en vez de un color
 *  plano -- el mayor salto de realismo por esfuerzo que hay: no agrega
 *  geometría nueva, solo usa el h/s/l que cada prenda ya tiene guardado.
 *  Además, si la prenda tiene `textura` cargada, se suma un patrón de tela
 *  (denim/pana/lana/tejido_grueso/algodón/lino) o un brillo diagonal (seda/
 *  cuero_liso) por encima del degradé -- el pedido explícito del usuario de
 *  "textura y detalles adecuados a cada prenda". Los ids de <linearGradient>
 *  y <pattern> incluyen el id de la prenda porque puede haber varios
 *  Maniqui (uno por outfit) en la misma página -- un id repetido pisaría el
 *  relleno de otra prenda. */
function Volumen({
  prenda,
  hijos,
}: {
  prenda: Prenda;
  hijos: (fill: string, stroke: string, patron: string | undefined) => React.ReactNode;
}) {
  const gradId = `grad-${prenda.id}`;
  const patId = `pat-${prenda.id}`;
  const brilloId = `brillo-${prenda.id}`;
  const { color_h: h, color_s: s, color_l: l, textura } = prenda;
  const conPatron = textura && TEXTURA_PATRON.includes(textura);
  const conBrillo = textura && TEXTURA_BRILLO.includes(textura);
  const patron = conPatron ? `url(#${patId})` : conBrillo ? `url(#${brilloId})` : undefined;

  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={luzHsl(h, s, l)} />
          <stop offset="100%" stopColor={sombraHsl(h, s, l)} />
        </linearGradient>
        {conPatron && textura && <PatronTextura id={patId} textura={textura} tono={contornoHsl(h, s, l)} />}
        {conBrillo && (
          <linearGradient id={brilloId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="35%" stopColor="white" stopOpacity="0.4" />
            <stop offset="50%" stopColor="white" stopOpacity="0" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        )}
      </defs>
      {hijos(`url(#${gradId})`, contornoHsl(h, s, l), patron)}
    </>
  );
}

const strokeProps = { strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };

/** Prendas sugeridas para comprar (armarOutfitsParaComprar en recommend.ts)
 *  no son una fila real de Supabase -- se arman con presetAPrendaSintetica
 *  en catalogo.ts, que les pone el id con este prefijo a propósito, para
 *  poder detectarlas acá y dibujarlas distinto (contorno punteado) sin
 *  tener que pasar un prop extra por cada componente Cuerpo. */
function esSugerida(prenda: Prenda): boolean {
  return prenda.id.startsWith("sugerida-");
}

/** Una forma "de tela": el relleno con volumen de siempre + (si corresponde)
 *  una segunda copia del mismo trazo con el patrón/brillo de textura
 *  encima, a opacidad reducida para no perder el color de fondo. Si la
 *  prenda es una sugerencia de compra (no la tiene todavía), el contorno
 *  queda punteado -- la misma seña visual que un plano de sastrería usa
 *  para "esto todavía no está", sin necesitar un badge de texto aparte. */
function Forma({
  d,
  fill,
  stroke,
  patron,
  sugerida,
}: {
  d: string;
  fill: string;
  stroke: string;
  patron?: string;
  sugerida?: boolean;
}) {
  return (
    <>
      <path
        d={d}
        fill={fill}
        stroke={stroke}
        {...strokeProps}
        strokeDasharray={sugerida ? "2.5 2" : undefined}
        strokeWidth={sugerida ? 1.5 : strokeProps.strokeWidth}
      />
      {patron && <path d={d} fill={patron} opacity={0.55} />}
    </>
  );
}

function TorsoCuerpo({ prenda }: { prenda: Prenda }) {
  const mangaCorta = MANGA_CORTA.includes(prenda.categoria);
  const sugerida = esSugerida(prenda);
  const cuelloD =
    prenda.categoria === "buzo"
      ? // capucha: una forma extra detrás del cuello
        "M50 30 Q60 14 70 30 Q70 24 60 20 Q50 24 50 30 Z"
      : null;

  return (
    <Volumen
      prenda={prenda}
      hijos={(fill, stroke, patron) => (
        <>
          {/* capucha del buzo, dibujada primero para que el cuerpo la tape parcialmente */}
          {cuelloD && <Forma d={cuelloD} fill={fill} stroke={stroke} patron={patron} sugerida={sugerida} />}

          {/* mangas -- paths propios que arrancan en el hombro y siguen el
              brazo, para que no "floten" en el aire como cuando eran parte
              de un ícono cuadrado genérico. */}
          {mangaCorta ? (
            <>
              {/* continuidad hombro-brazo -- pedido explícito del usuario
                  ("que no esté esa división, más continuo como un cuerpo
                  humano"). La curva del torso sale del hombro casi vertical
                  (control a solo 2-3u al costado); la manga arrancaba con
                  un tirón casi horizontal (control a 7u al costado) desde
                  el mismo punto -- ese cambio brusco de dirección en un
                  punto compartido es lo que se lee como un corte/costura,
                  no una curva de hombro real. Se achica el tirón inicial
                  (7u -> 2u) para que la dirección de salida se parezca más
                  a la del torso -- el hombro dobla gradualmente hacia el
                  brazo en vez de quebrar en ángulo. */}
              <Forma d="M34 48 Q32 51 30 64 Q27 74 34 77 Q38 74 39 68 Q37 56 34 48 Z" fill={fill} stroke={stroke} patron={patron} sugerida={sugerida} />
              <Forma d="M86 48 Q88 51 90 64 Q93 74 86 77 Q82 74 81 68 Q83 56 86 48 Z" fill={fill} stroke={stroke} patron={patron} sugerida={sugerida} />
            </>
          ) : (
            <>
              {/* brazos más sueltos -- pedido explícito del usuario. El
                  hombro (48-60) queda fijo como pivote natural; de ahí para
                  abajo el brazo se angula hacia afuera del cuerpo en vez de
                  caer en paralelo estricto al torso, como brazos relajados
                  de verdad. */}
              {/* misma continuidad hombro-brazo que en la manga corta (ver
                  ese comentario) -- tirón inicial reducido para que la
                  curva no quiebre en ángulo justo donde se junta con el
                  torso. */}
              <Forma
                d="M34 48 Q32 51 31 60 L25 114 Q25 120 29 121 L34 121 Q37 120 36 114 L39 60 Q38 52 34 48 Z"
                fill={fill}
                stroke={stroke}
                patron={patron}
                sugerida={sugerida}
              />
              <Forma
                d="M86 48 Q88 51 89 60 L95 114 Q95 120 91 121 L86 121 Q83 120 84 114 L81 60 Q82 52 86 48 Z"
                fill={fill}
                stroke={stroke}
                patron={patron}
                sugerida={sugerida}
              />
            </>
          )}

          {/* cuerpo del torso -- un poco más ancho que el maniquí de base
              para que la tela "caiga por fuera" en vez de coincidir exacto
              con el borde del cuerpo. ANCHO afinado en la 6ta pasada -- el
              usuario insistió otra vez ("hombros/espalda/piernas muy
              anchos... quiero algo real pero estilizado") y pidió cómo
              hacen otras apps de guardarropa/outfit para que sus maniquís
              "queden bien". Investigado por búsqueda: la técnica real que
              usa la industria de moda para esto se llama "croquis de
              moda" -- una figura deliberadamente más esbelta que la
              anatomía promedio (torso y miembros más angostos, manos/pies
              simplificados) para que la prenda sea el foco visual, no el
              cuerpo. La pasada anterior (5ta) ya había llevado el hombro al
              22-25% real, pero con un margen extra ("27%, por legibilidad")
              que en la práctica no hacía falta -- el usuario lo siguió
              viendo ancho. Se saca ese margen y se aplica el afinado hacia
              un torso más esbelto: otro 15% de reducción de ancho (0.85)
              sobre TODAS las coordenadas X del cuerpo (torso/brazos/
              piernas/pies/accesorios), manteniendo el largo y las
              proporciones relativas (hombro/cintura 71%, ya validada como
              seña de género) sin cambios -- solo la magnitud absoluta baja
              un poco más. Hombro nuevo ≈23% de la altura total, adentro
              del rango real (22-25%) en vez de por encima. */}
          {/* postura -- pedido explícito del usuario ("hombros relajados"):
              antes el hombro terminaba en una esquina a la misma altura
              (y=46) que el punto más alto del cuello, sin ninguna caída --
              se lee como hombros en tensión, levantados. Se baja la esquina
              del hombro 2u (46->48), la misma altura donde ya arrancaba el
              brazo -- ahora torso y brazo se encuentran en el mismo punto
              en vez de dejar un pequeño escalón, y la caída desde el cuello
              hacia el hombro es un poco más marcada. */}
          {/* trapecio/cuello -- reporte real del usuario: "o tienen mucho
              hombro o les falta trapecio... no es como si fuese una M el
              torso". Tenía toda la razón: el contorno subía del hombro
              hasta un pico (y=40) MÁS ARRIBA que la base del cuello
              (y=46), volvía a bajar hasta y=44 en el centro, y subía a
              otro pico (y=40) del otro lado antes de bajar al otro hombro
              -- literalmente picohundido-pico, una M. Ese hundimiento
              quedaba justo donde el trapecio real llena el hueco entre
              hombro y cuello, así que se leía como "falta músculo ahí".
              Reemplazado por una curva continua de un solo tramo por
              lado: sube derecho desde el hombro hasta encontrarse con la
              base del cuello (sin pasarse de largo) y un hundimiento
              único y chico en el frente (el escote), no dos picos con un
              valle en el medio. */}
          <Forma
            d="M34 48 Q34 59 37 70 Q39 89 41 104 L41 126 L79 126 L79 104 Q81 89 83 70 Q86 59 86 48 Q78 42 64 46 Q60 48 56 46 Q42 42 34 48 Z"
            fill={fill}
            stroke={stroke}
            patron={patron}
            sugerida={sugerida}
          />

          {/* detalle de cuello por categoría -- simple a propósito, esto es
              una ilustración esquemática, no moda realista. Reposicionado
              en y=30-42 (antes 34-50) para asentarse justo sobre el nuevo
              cuello, más angosto, en vez de flotar sobre el hueco viejo. */}
          {prenda.categoria === "camisa" && (
            <>
              {/* cuello agrandado -- reporte real del usuario, comparando
                  contra una foto real: en la referencia las puntas del
                  cuello se apoyan SOBRE la tela de lo que tiene puesto
                  encima (o sobre el propio pecho acá, sin capa arriba),
                  tapando parte del pecho -- no quedan flotando en el hueco
                  del escote con piel/cuerpo visible alrededor. La versión
                  anterior (7u de ancho, terminaba en y=46) era chica y
                  quedaba adentro del hueco. Ahora las puntas bajan mucho
                  más (hasta y=58, sobre el pecho) y se abren más hacia los
                  hombros (46/74 en vez de 49/71) para que no quede ningún
                  espacio vacío entre el cuello y el cuerpo. */}
              <path d="M46 38 Q60 26 74 38" fill="none" stroke={stroke} {...strokeProps} />
              <path d="M46 38 L60 58 L54 30 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} stroke={stroke} {...strokeProps} />
              <path d="M74 38 L60 58 L66 30 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} stroke={stroke} {...strokeProps} />
              <line x1="60" y1="58" x2="60" y2="124" stroke={stroke} {...strokeProps} />
            </>
          )}
          {prenda.categoria === "sweater" && (
            <path d="M48 40 Q60 46 72 40" fill="none" stroke={stroke} {...strokeProps} strokeWidth={3} />
          )}
          {(prenda.categoria === "sweater" || prenda.categoria === "buzo") && (
            // dobladillo acanalado -- pedido explícito del usuario ("fijate
            // el dobladillo"), comparando contra una foto real donde se ve
            // claramente la banda tejida más densa en el borde inferior del
            // sweater. Antes el torso terminaba en un corte recto sin
            // ningún detalle ahí. Franja con tono de sombra + líneas
            // verticales cortas simulando el canalé -- mismo criterio
            // esquemático que el resto de la ilustración, no una textura
            // fotorrealista. También en buzo -- un hoodie real también
            // tiene puño acanalado en la cintura, no solo el sweater.
            <>
              <rect x="41" y="119" width="38" height="7" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} stroke={stroke} {...strokeProps} />
              {[45, 51, 57, 63, 69, 75].map((x) => (
                <line key={x} x1={x} y1="120" x2={x} y2="125" stroke={stroke} strokeWidth={0.6} />
              ))}
            </>
          )}
          {prenda.categoria === "campera" && (
            <>
              <line x1="60" y1="60" x2="60" y2="124" stroke={stroke} {...strokeProps} strokeDasharray="3 3" />
              <path d="M46 40 Q60 28 74 40" fill="none" stroke={stroke} {...strokeProps} />
              <path d="M46 40 L60 60 L54 32 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} stroke={stroke} {...strokeProps} />
              <path d="M74 40 L60 60 L66 32 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} stroke={stroke} {...strokeProps} />
            </>
          )}
        </>
      )}
    />
  );
}

function PiernasCuerpo({ prenda }: { prenda: Prenda }) {
  return (
    <Volumen
      prenda={prenda}
      hijos={(fill, stroke, patron) => (
        <>
          {/* dos piernas propias (más anchas que las del maniquí de base
              en 3-4u por lado) en vez de un solo bloque -- así no se ven
              tiritas del maniquí asomando a los costados ni en la
              entrepierna. Ancho afinado en la 6ta pasada (ver el comentario
              largo en TorsoCuerpo). Postura -- pedido explícito del usuario
              ("piernas un poco más abiertas"): la cadera (y=120, donde se
              apoya el pantalón) queda fija, y de ahí para abajo cada pierna
              entera (borde externo Y borde interno, mismo delta en los
              dos -- el grosor de la pierna no cambia) se corre hacia
              afuera progresivamente: -2u a la altura de la rodilla, -4u en
              el tobillo. Antes las piernas bajaban casi en columna recta
              (apenas 0.5u de diferencia entre cadera y tobillo), una
              postura de firmes, no relajada. */}
          <Forma d="M41 120 L41 185 Q40 203 42 224 L52 224 Q54 203 57 185 L60 120 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <Forma d="M79 120 L79 185 Q80 203 78 224 L68 224 Q66 203 63 185 L60 120 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          {/* cinturilla */}
          <path
            d="M40 116 H80 V126 H40 Z"
            fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)}
            stroke={stroke}
            {...strokeProps}
          />
        </>
      )}
    />
  );
}

function PiesCuerpo({ prenda }: { prenda: Prenda }) {
  // suela_contraste es un dato real de la prenda (ver types.ts), no una
  // regla automática por categoría -- una zapatilla negra puede ser
  // totalmente monocromática (suela a tono, mismo criterio de siempre) o
  // tener la suela de goma blanca/crema, según lo que el usuario cargó.
  const suela = prenda.suela_contraste
    ? sombraHsl(0, 0, 94)
    : sombraHsl(prenda.color_h, prenda.color_s, Math.max(2, prenda.color_l - 20));
  return (
    <Volumen
      prenda={prenda}
      hijos={(fill, stroke, patron) => (
        <>
          {/* dos zapatos, no un bloque único -- cada uno con su propia
              suela (la franja oscura) porque eso, más que la forma, es lo
              que lee como "zapatilla" y no "piedra". Reducidos en la 5ta
              pasada -- reporte real del usuario ("parecen dos macetas, no
              dos pies"): al reescalar el ANCHO del cuerpo (4ta pasada) el
              zapato se escaló desde el centro de TODO el cuerpo (x=60), no
              desde su propio centro, así que se achicó mucho menos que la
              pierna (sus puntos ya estaban cerca del centro) y terminó
              mucho más ancho que el tobillo (28u de zapato contra ~10u de
              tobillo) y superponiéndose con el del otro pie. Ahora se
              escala cada zapato desde su propio centro (x=49 el izquierdo,
              x=71 el derecho, los mismos centros que ya tiene la pierna) en
              vez del centro del cuerpo, y también se achata la altura --
              un zapato real visto de frente es bastante más chato que alto,
              no un bloque cuadrado. Recentrado en esta pasada (±4u, simple
              traslación) para seguir el tobillo con la postura más abierta.
              Forma redibujada de nuevo -- reporte real del usuario ("parece
              un ladrillo"): la puntera terminaba en una línea recta (el
              borde inferior del zapato era un simple L horizontal), y esa
              línea recta es justo lo que se lee como "bloque". Ahora la
              puntera es una curva continua (dos Q en vez de esquinas rectas
              + línea recta), más parecida a la silueta redondeada de una
              zapatilla real. Se agregan cordones (zigzag simple, sin
              detalle de ojales -- esto sigue siendo una ilustración
              esquemática, no un dibujo técnico de calzado) para que se lea
              "zapatilla" de un vistazo, tal como pidió el usuario. */}
          <Forma d="M40 223 Q36 224 36 231 Q36 238 46 239 Q56 238 56 231 Q56 224 52 223 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          {/* cordones -- 2 líneas cortas cruzando el empeine. Un zigzag de
              un solo trazo (probado antes) se leía como una flecha o un
              tilde, no como cordones -- líneas paralelas simples son menos
              ambiguas a este tamaño. */}
          <line x1="41" y1="226" x2="51" y2="226" stroke={stroke} strokeWidth={0.6} />
          <line x1="41" y1="229" x2="51" y2="229" stroke={stroke} strokeWidth={0.6} />
          <path d="M36 234 H56 V240 Q56 242 53 242 L39 242 Q36 242 36 240 Z" fill={suela} stroke={stroke} {...strokeProps} />
          <Forma d="M80 223 Q84 224 84 231 Q84 238 74 239 Q64 238 64 231 Q64 224 68 223 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <line x1="79" y1="226" x2="69" y2="226" stroke={stroke} strokeWidth={0.6} />
          <line x1="79" y1="229" x2="69" y2="229" stroke={stroke} strokeWidth={0.6} />
          <path d="M84 234 H64 V240 Q64 242 67 242 L81 242 Q84 242 84 240 Z" fill={suela} stroke={stroke} {...strokeProps} />
        </>
      )}
    />
  );
}

function AccesorioCuerpo({ prenda }: { prenda: Prenda }) {
  // posicion_accesorio es un dato real de la prenda (ver types.ts), no una
  // regla automática por categoria -- antes de esa columna, un cinturón,
  // una corbata y una bufanda dibujaban el mismo bloque a la altura de la
  // cintura, así lo reportó un usuario viendo el maniquí real.
  if (prenda.posicion_accesorio !== "cuello") {
    return (
      <Volumen
        prenda={prenda}
        hijos={(fill, stroke, patron) => (
          <>
            <Forma d="M41 123 H79 V131 H41 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
            <rect x="56" y="120" width="8" height="14" rx="2" fill="none" stroke={stroke} strokeWidth="2" />
          </>
        )}
      />
    );
  }
  if (prenda.requiere_cuello) {
    // Corbata: nudo angosto a la altura del cuello y una franja que se
    // ensancha bajando por el pecho hasta terminar en punta -- no una tira
    // horizontal en la cintura, que es donde va un cinturón.
    return (
      <Volumen
        prenda={prenda}
        hijos={(fill, stroke, patron) => (
          <>
            <Forma d="M57 38 L63 38 L61 46 L59 46 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
            <Forma d="M59 46 L61 46 L65 85 L60 100 L55 85 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          </>
        )}
      />
    );
  }
  // Bufanda: banda alrededor del cuello con dos puntas de distinto largo
  // colgando sobre el pecho -- va al cuello igual que la corbata, pero no
  // requiere_cuello (se usa sobre cualquier prenda de torso) y su forma es
  // distinta (drapeada, no un nudo con una única punta angosta).
  return (
    <Volumen
      prenda={prenda}
      hijos={(fill, stroke, patron) => (
        <>
          <Forma d="M49 40 Q60 28 71 40 Q67 50 60 50 Q53 50 49 40 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <Forma d="M52 46 H59 V93 Q56 96 52 93 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <Forma d="M63 46 H68 V82 Q65 85 63 82 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
        </>
      )}
    />
  );
}

/** Maniqui: representa un outfit como si estuviera puesto, no como una
 *  lista de íconos sueltos -- una silueta de maniquí de sastrería (sin
 *  cara, headless, con brazos y cintura marcada) con cada prenda dibujada
 *  directamente en las coordenadas del cuerpo (torso con mangas propias,
 *  dos piernas, dos zapatos con suela, patrón de tela o brillo según la
 *  textura real de cada prenda) en vez de un ícono cuadrado reescalado.
 *  Los íconos de PrendaIcon.tsx siguen siendo la geometría correcta para
 *  los usos "símbolo chico" (Placard, Combinaciones, Probar, catálogo) --
 *  a esos tamaños (~48-64px) el trabajo del dibujo es que se reconozca la
 *  categoría al instante, no parecer ropa real, así que no comparten path
 *  data con las formas de acá. */
export default function Maniqui({ prendas }: { prendas: Prenda[] }) {
  const { principal, cuelloSecundario, extras } = agruparPorCapa(prendas);
  const neutro = "var(--border)";
  const neutroStroke = "rgba(33,26,21,0.18)";

  return (
    // aria-hidden en todo el bloque visual: es una representación decorativa
    // del outfit, no información nueva -- el detalle real (categoría +
    // nombre de color de cada prenda) ya se anuncia con la leyenda de texto
    // que Outfits.tsx renderiza debajo de este componente.
    <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
      <svg viewBox="0 0 120 260" width="100%" style={{ maxWidth: 180 }}>
        {/* sombra de piso -- de lo más barato que hay para que la figura no
            "flote". */}
        <ellipse cx="60" cy="248" rx="32" ry="5" fill="rgba(33,26,21,0.1)" />

        {/* maniquí de base -- queda visible donde no hay prenda cargada
            para esa zona (p.ej. un outfit sin calzado todavía muestra los
            "pies" del maniquí, no un hueco vacío). Historial de
            proporciones (ver commits anteriores para el detalle completo
            de cada pasada): 1ra/2da pasada ajustó hombro/cintura para que
            se lea como cuerpo de hombre; 3ra corrigió el LARGO (entrepierna
            al 50% de la altura, canon clásico + antropometría real,
            verificado por búsqueda); 4ta corrigió el ANCHO absoluto
            (hombro 42%→27% de la altura, biacromial real + medidas de
            maniquí de sastrería, verificado por búsqueda); 5ta corrigió el
            tamaño/posición del calzado. 6ta pasada (esta): el usuario
            insistió otra vez ("hombros/espalda/piernas muy anchos... real
            pero estilizado") y pidió cómo hacen otras apps de guardarropa
            para que sus maniquís "queden bien". Investigado por búsqueda:
            la técnica real de la industria de moda para esto es el
            "croquis de moda" -- una figura deliberadamente más esbelta que
            la anatomía promedio (torso/miembros más angostos) para que la
            prenda sea el foco visual, no el cuerpo -- sin llegar a los 9-12
            "cabezas" de elongación editorial (eso sí sería "un cuerpo
            perfecto", que el usuario pidió explícitamente NO hacer). La
            pasada anterior ya había llevado el hombro al rango real
            (22-25%) pero con un margen extra ("27%, por legibilidad") que
            en la práctica no hacía falta. Se saca ese margen: otro 15% de
            reducción de ancho (0.85) sobre TODAS las coordenadas X del
            cuerpo, manteniendo el largo y las proporciones relativas
            (hombro/cintura 71%) sin cambios -- hombro nuevo ≈23% de la
            altura, adentro del rango real en vez de por encima. Las
            referencias verticales (hombro=46, cadera=120, rodilla≈179,
            tobillo=224, muñeca=120) no cambiaron -- ya estaban correctas. */}
        <ellipse cx="60" cy="20" rx="13" ry="15" fill={neutro} stroke={neutroStroke} />
        <path d="M55 33 L66 33 L64 46 L56 46 Z" fill={neutro} stroke={neutroStroke} />
        {/* trapecio/cuello -- mismo rediseño y mismo motivo que en
            TorsoCuerpo (ver ese comentario): el contorno viejo trazaba una
            M (pico-valle-pico) en vez de una curva continua de hombro a
            cuello, dejando un hundimiento justo donde debería estar el
            trapecio. */}
        <path
          d="M35 48 Q37 59 39 70 Q41 89 43 100 L43 120 L77 120 L77 100 Q79 89 81 70 Q83 59 85 48 Q77 42 64 46 Q60 48 56 46 Q43 42 35 48 Z"
          fill={neutro}
          stroke={neutroStroke}
        />
        {/* continuidad hombro-brazo -- pedido explícito del usuario ("que
            no esté esa división, más continuo como un cuerpo humano"). Ver
            el comentario largo en TorsoCuerpo (manga corta): el tirón
            inicial de la curva se achica (era casi horizontal, ahora sale
            en una dirección más parecida a la del torso) para que el
            hombro doble gradualmente hacia el brazo en vez de quebrar en
            ángulo justo donde se juntan. */}
        <path d="M35 48 Q33 51 32 58 L26 113 Q26 120 30 120 L33 120 Q35 120 34 113 L37 59 Q37 51 35 48 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M85 48 Q87 51 88 58 L94 113 Q94 120 90 120 L87 120 Q85 120 86 113 L83 59 Q83 51 85 48 Z" fill={neutro} stroke={neutroStroke} />
        {/* manos -- pedido explícito del usuario ("agregale las manos, eso
            le va a dar más armonía"), comparando contra una foto real de
            maniquí de exhibición donde la mano extiende el brazo hasta
            cerca del muslo. Antes el brazo terminaba en un corte limpio
            sin remate en la muñeca (y=120, al nivel del cinturón -- ya
            correcto según la regla clásica verificada en una pasada
            anterior), y ese corte abrupto es lo que hacía leer el brazo
            como "corto" aunque la posición vertical de la muñeca ya fuera
            anatómicamente correcta: un brazo delgado y estilizado sin nada
            que lo remate en la punta pierde peso visual. Forma simple y
            redondeada, sin dedos -- mismo criterio de "manos simplificadas"
            que ya documenta el croquis de moda (ver comentario más abajo).
            Largo ≈11% de la altura total (dato antropométrico real de largo
            de mano), llevando la punta cerca del tercio superior del muslo,
            sin llegar a la mitad exacta -- functiona como remate visual,
            no como un objeto nuevo que compita con el brazo. Dibujadas acá
            (maniquí de base, color neutro) y no en TorsoCuerpo a propósito:
            por el orden de dibujo quedan debajo de cualquier manga (corta o
            larga) y asoman solas donde la manga termina, sin tener que
            duplicar la lógica de manga corta/larga. */}
        <path d="M28 120 Q27 135 30 143 Q32 146 33 143 Q36 135 35 120 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M92 120 Q93 135 90 143 Q88 146 87 143 Q84 135 85 120 Z" fill={neutro} stroke={neutroStroke} />
        {/* piernas un poco más abiertas -- pedido explícito del usuario.
            Mismo criterio que en PiernasCuerpo: la cadera (y=120) fija, el
            resto de la pierna (grosor sin cambios) corrido hacia afuera
            progresivamente hasta -4u en el tobillo. */}
        <path d="M43 120 L42 179 Q42 197 42 224 L51 224 Q53 197 55 179 L59 120 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M77 120 L78 179 Q78 197 78 224 L69 224 Q67 197 65 179 L61 120 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M42 224 Q41 232 46 234 L51 234 Q52 232 51 224 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M78 224 Q79 232 74 234 L69 234 Q68 232 69 224 Z" fill={neutro} stroke={neutroStroke} />

        {principal.piernas && <PiernasCuerpo prenda={principal.piernas} />}
        {principal.torso && <TorsoCuerpo prenda={principal.torso} />}
        {cuelloSecundario && (
          // el cuello de la camisa de abajo, asomando por encima del
          // sweater/campera/buzo -- dibujado después de TorsoCuerpo a
          // propósito, para quedar por encima en el z-order. Mismas
          // coordenadas y forma que el cuello de camisa "principal" de
          // TorsoCuerpo (ver ese comentario para el porqué del rediseño).
          // Antes usaba color_hex (el color plano de la camisa) en vez de
          // un tono con sombra -- con una camisa clara (blanco roto, por
          // ejemplo) el cuello casi no se distinguía del fondo neutro del
          // cuerpo. Ahora usa sombraHsl, igual que el cuello "principal",
          // para tener contraste garantizado sin importar el color real. */}
          <>
            <path d="M46 38 Q60 26 74 38" fill="none" stroke={contornoHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)} {...strokeProps} />
            <path
              d="M46 38 L60 58 L54 30 Z"
              fill={sombraHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)}
              stroke={contornoHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)}
              {...strokeProps}
            />
            <path
              d="M74 38 L60 58 L66 30 Z"
              fill={sombraHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)}
              stroke={contornoHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)}
              {...strokeProps}
            />
          </>
        )}
        {principal.accesorio && <AccesorioCuerpo prenda={principal.accesorio} />}
        {principal.pies && <PiesCuerpo prenda={principal.pies} />}
      </svg>

      {extras.length > 0 && (
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", justifyContent: "center" }}>
          {extras.map((p) => (
            <span key={p.id} style={{ width: 28, height: 28 }} title={p.categoria}>
              <PrendaIcon
                categoria={p.categoria}
                color={p.color_hex}
                suelaContraste={p.suela_contraste}
                posicionAccesorio={p.posicion_accesorio}
                requiereCuello={p.requiere_cuello}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

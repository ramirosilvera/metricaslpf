import { contornoHsl, detalleHsl, luzHsl, sombraHsl, tonoTexturaHsl } from "../lib/color";
import PrendaIcon, { esCamperaDePunto, esCamperaTecnica, PatronEstampado, PatronTextura, TEXTURA_BRILLO, TEXTURA_PATRON } from "./PrendaIcon";
import { descripcionPrenda, type Calce, type Categoria, type CorteCalzado, type Prenda } from "../lib/types";

/** Escala horizontal de la silueta según Calce (ver types.ts) -- auditoría
 *  de sastrería (Consejo, ronda de revisión visual del maniquí), pedido
 *  explícito del usuario: "revisa en el maniquí cómo quedan las prendas
 *  ajustada, regular u holgada". Hallazgo real: el dato `calce` se agregó
 *  al motor de recomendación en la ronda anterior, pero el maniquí nunca lo
 *  leía -- una prenda ajustada, regular y holgada se dibujaban IDÉNTICAS,
 *  así que el dato no tenía ningún efecto visual, aunque sí lo tuviera en
 *  las recomendaciones.
 *
 *  Técnica: mismo mecanismo que ya usa este archivo para el afinado general
 *  del cuerpo (ver el comentario largo de la "6ta pasada" en TorsoCuerpo,
 *  más abajo) -- un `scale` horizontal aplicado con `transform`, centrado
 *  en x=60 (el eje vertical del cuerpo en las 120 unidades del viewBox), en
 *  vez de redibujar a mano cada curva Bézier ya calibrada para tres anchos
 *  distintos. Escalar SOLO en X (no en Y) ensancha o angosta la silueta sin
 *  estirar el largo -- ropa más ancha, no más alta.
 *
 *  Dos tablas, no una: el rango de "se lee como holgado/ajustado" es
 *  distinto en torso y en piernas -- un pantalón wide-leg necesita mucho
 *  más ensanche relativo que un torso oversize para leerse como tal (la
 *  pierna es una columna angosta contra el largo del cuerpo; el torso ya es
 *  la parte más ancha). Magnitudes verificadas por ejecución (Playwright,
 *  screenshot real) contra el maniquí base para que la prenda "ajustada"
 *  nunca quede más angosta que el brazo/pierna neutro que tiene debajo (se
 *  vería el maniquí asomando por los bordes en vez de una prenda ceñida). */
const ESCALA_TORSO: Record<Calce, number> = { ajustado: 0.88, regular: 1, holgado: 1.22 };
const ESCALA_PIERNAS: Record<Calce, number> = { ajustado: 0.8, regular: 1, holgado: 1.3 };

/** `transform` que escala en X centrado en x=60, o `undefined` para
 *  calce="regular" -- evitar el <g transform="..."> de más cuando no hace
 *  ninguna falta (no cambia el render, pero mantiene el DOM/SVG resultante
 *  limpio para el caso, hoy mayoritario, de prendas sin este dato cargado). */
function escalaSilueta(escalas: Record<Calce, number>, calce: Calce): string | undefined {
  const sx = escalas[calce];
  if (sx === 1) return undefined;
  return `translate(60,0) scale(${sx},1) translate(-60,0)`;
}

type Capa = "torso" | "piernas" | "pies" | "accesorio";

const CAPA: Record<Categoria, Capa> = {
  remera: "torso",
  camisa: "torso",
  buzo: "torso",
  sweater: "torso",
  campera: "torso",
  saco: "torso",
  pantalon: "piernas",
  bermuda: "piernas",
  short_deportivo: "piernas",
  calzado: "pies",
  accesorio: "accesorio",
};

// de afuera hacia adentro: si el outfit tiene más de una prenda de torso
// (p.ej. remera + campera), se muestra la de más afuera en el maniquí y el
// resto como chips debajo -- una campera puesta ya tapa casi toda la remera
// que tiene debajo, así que mostrar ambas superpuestas al mismo tamaño no
// se leería como "las dos puestas", se leería como "se rompió el dibujo".
// saco (agregado a pedido del usuario, "un traje azul marino") va primero:
// en la práctica nunca convive con campera/buzo/sweater en el mismo outfit
// (CATEGORIAS_COMPLEMENTARIAS en types.ts ya los excluye entre sí), pero
// si alguna vez coincidieran, el saco -- la capa más formal -- es la que
// tiene sentido mostrar puesta.
const PRIORIDAD_TORSO: Categoria[] = ["saco", "campera", "buzo", "sweater", "camisa", "remera"];

// manga corta (remera) vs. manga larga (el resto de las prendas de torso).
const MANGA_CORTA: Categoria[] = ["remera"];

// si una de estas queda de "más afuera" en el torso y hay una camisa debajo
// en el mismo outfit, se dibuja el cuello de la camisa asomando por encima
// -- así se ve puesta una camisa con sweater/campera/buzo arriba, no
// escondida sin más como un chip suelto. La remera no entra: su escote es
// una curva simple, no hay "cuello de camisa" real que tenga sentido tapar
// y hacer asomar de la misma forma. saco entra por el mismo motivo que
// campera -- un traje siempre se usa sobre una camisa, y las solapas
// abiertas dejan ver la camisa (y la corbata, si hay) debajo.
const OUTER_CON_CUELLO_VISIBLE: Categoria[] = ["sweater", "buzo", "campera", "saco"];

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
        {/* tonoTexturaHsl, no contornoHsl -- ver el comentario largo en
            color.ts: sobre una prenda ya oscura (ej. sweater negro),
            contornoHsl siempre resta luz y choca contra el piso (4%), así
            que el patrón se funde con el propio degradé de sombra en vez
            de leerse como trama. Hallazgo real de esta revisión ("modista
            e ingeniero textil", pedido explícito del usuario) al agregar
            el mismo patrón al ícono chico (PrendaIcon.tsx, sin degradé):
            ahí era 100% invisible; acá el degradé disimulaba PARTE del
            problema (se veía en el lado luzHsl, no en el lado sombraHsl),
            pero seguía siendo el mismo defecto real. */}
        {conPatron && textura && <PatronTextura id={patId} textura={textura} tono={tonoTexturaHsl(h, s, l)} />}
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
  // estampado (rayas/cuadros) -- mismo mecanismo que en PrendaIcon.tsx (ver
  // el comentario largo de PatronEstampado ahí): reemplaza el relleno del
  // cuerpo principal por completo, no se combina con conPatron/conBrillo de
  // Volumen (una camisa a rayas se lee por sus rayas, no por una trama
  // semitransparente de textura encima). Solo aplica al torso principal de
  // una camisa -- las otras categorías no tienen patron/color2 cargados hoy.
  const estampadoId = `estampado-${prenda.id}`;
  const conEstampado =
    prenda.categoria === "camisa" &&
    (prenda.patron === "rayas" || prenda.patron === "cuadros") &&
    !!prenda.color2_hex;
  const cuelloD =
    // + con_capucha -- pedido explícito del usuario, revisado como modista/
    // ingeniero textil: no todos los buzos son hoodie. Antes se dibujaba
    // esta pieza para CUALQUIER buzo sin excepción; un buzo crewneck real
    // (con_capucha=false, verificado contra el placard del usuario) no la
    // lleva.
    prenda.categoria === "buzo" && prenda.con_capucha
      ? // capucha -- revisada como modista con apoyo de referencias reales
        // (búsqueda: fashion flat sketches de hoodie): el ancho de una
        // capucha real ronda 1.5x el ancho de la cabeza, apoyada/abultada
        // detrás y a los costados del cuello, no encima de la cara. La
        // versión anterior (x50-70, 20u de ancho) era más angosta que la
        // propia cabeza (rx=13, 26u) y su punto más alto (y=14) quedaba
        // adentro de la elipse de la cabeza (cy=20, ry=15, hasta y=35) --
        // en el render real se veía literalmente superpuesta con la
        // pera/mandíbula, un problema del mismo tipo que el cuello de
        // camisa ya corregido. Ahora 40u de ancho (x40-80, ≈1.5x cabeza) y
        // el punto más alto en y=36, 1u por debajo del borde de la cabeza,
        // para que se lea como tela abultada a los costados del cuello sin
        // tocar la cara.
        "M40 44 Q60 36 80 44 Q70 46 60 47 Q50 46 40 44 Z"
      : null;

  return (
    <Volumen
      prenda={prenda}
      hijos={(fill, stroke, patron) => (
        <>
          {conEstampado && prenda.color2_hex && (prenda.patron === "rayas" || prenda.patron === "cuadros") && (
            <defs>
              <PatronEstampado id={estampadoId} patron={prenda.patron} colorBase={prenda.color_hex} color2={prenda.color2_hex} />
            </defs>
          )}

          {/* calce (ajustado/regular/holgado) -- ver escalaSilueta arriba
              del archivo. Envuelve TODO el resto del torso (capucha, mangas,
              cuerpo, cierre de escote, detalle de cuello por categoría) para
              que la prenda entera se lea más ceñida o más suelta como una
              sola pieza de tela, no partes desincronizadas. */}
          <g transform={escalaSilueta(ESCALA_TORSO, prenda.calce)}>
          {/* capucha del buzo, dibujada primero para que el cuerpo la tape
              parcialmente. Usa luzHsl (tono plano) en vez de `fill` (el
              degradé compartido) a propósito -- ver el comentario largo
              en "cierre de escote" más abajo sobre por qué el degradé de
              Volumen no se puede reusar tal cual en una pieza chica y
              separada del cuerpo principal. */}
          {cuelloD && (
            <Forma
              d={cuelloD}
              fill={luzHsl(prenda.color_h, prenda.color_s, prenda.color_l)}
              stroke={stroke}
              patron={patron}
              sugerida={sugerida}
            />
          )}

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
            fill={conEstampado ? `url(#${estampadoId})` : fill}
            stroke={stroke}
            patron={conEstampado ? undefined : patron}
            sugerida={sugerida}
          />

          {/* cierre de escote -- revisión como modista a pedido del usuario
              ("revisa el cuello de todas las prendas"), comparando de
              cerca contra el render real: el escote del cuerpo de arriba
              (Q78 42 64 46 Q60 48...) queda bastante bajo/ancho -- pensado
              para dejar lugar a las puntas del cuello camisero -- pero una
              remera, un sweater o un buzo NO tienen esas puntas que tapen
              ese hueco, así que se veía un tramo largo de "piel" del
              maniquí entre la base del cuello y la tela, como un escote
              pronunciado en vez de una remera a la base del cuello. Esta
              pieza sube el borde efectivo del escote hasta cerca de y=38
              en el centro -- 3-4u por debajo de la cabeza (que termina en
              y=35), sin tocarla -- y se dibuja ANTES que el cuello de
              camisa/campera de abajo para que esas dos categorías (que sí
              tienen su propia pieza de cuello, opaca y más grande) la
              tapen por completo sin cambiar nada de su rediseño ya
              validado.
              Usa luzHsl (tono plano) en vez de `fill` (el degradé
              compartido de Volumen) a propósito -- hallazgo real de esta
              misma revisión: el <linearGradient> de Volumen no fija
              gradientUnits, así que por defecto usa objectBoundingBox --
              cada <path> que lo referencia normaliza el degradé a SU
              PROPIA caja (0%=su propia esquina superior, 100%=su propia
              esquina inferior), no a una caja compartida con el cuerpo
              principal. En una pieza chica como esta (mucho más angosta
              que el torso completo) eso significa arrancar en luzHsl
              puro y terminar en sombraHsl puro en un tramo de apenas 10u
              -- un parche claramente más CLARO que el cuerpo de abajo en
              el mismo punto, no "más tela del mismo paño" como se buscaba.
              Confirmado en un render real: se veía un remiendo gris claro
              flotando sobre una remera oscura. luzHsl liso es la
              aproximación correcta acá -- esta pieza cae cerca del borde
              SUPERIOR de la caja del cuerpo principal, que es justo donde
              el degradé del cuerpo ya está más cerca de luzHsl. */}
          <path
            d="M46 44 Q60 37 74 44 Q68 46 60 47 Q52 46 46 44 Z"
            fill={luzHsl(prenda.color_h, prenda.color_s, prenda.color_l)}
            stroke={stroke}
            {...strokeProps}
          />

          {/* detalle de cuello por categoría -- simple a propósito, esto es
              una ilustración esquemática, no moda realista. Reposicionado
              en y=30-42 (antes 34-50) para asentarse justo sobre el nuevo
              cuello, más angosto, en vez de flotar sobre el hueco viejo. */}
          {prenda.categoria === "camisa" && (
            <>
              {/* cuello rediseñado -- reporte real del usuario ("todavía no
                  está bien logrado"), revisado como modista contra el
                  render real: la versión anterior (puntas del cuello hasta
                  y=30) se metía DENTRO de la cabeza -- la cara/cabeza
                  termina en y=35 (elipse cy=20, ry=15), y una punta a y=30
                  queda 5u más arriba, en plena zona de mentón/mandíbula, no
                  sobre el pecho. Además las dos puntas, separadas y sin
                  nada que las una por arriba, dejaban un triángulo de
                  "piel" visible entre ellas -- un cuello de camisa
                  abrochado no deja ver el cuello por el medio.
                  Rediseño en dos piezas por lado, replicando la anatomía
                  real de un cuello camisero:
                  1) la TIRA (collar band) que rodea la base del cuello --
                     una banda cerrada y rellena (antes era solo un trazo
                     sin relleno) que sube apenas por encima de la línea de
                     hombros (pico en y≈38-39, todavía 4u+ por debajo de la
                     cabeza) y se cierra sobre sí misma, sin dejar hueco de
                     piel visible.
                  2) las PUNTAS (collar leaves), que ahora arrancan A LA
                     MISMA altura que el borde inferior de la tira (y=42,
                     no y=30) y caen sobre el pecho hasta el mismo punto de
                     antes (y=58) -- un triángulo apoyado sobre la tela,
                     ya no una flecha que sube hacia la pera. */}
              <path
                d="M46 42 Q60 36 74 42 Q68 44 60 45 Q52 44 46 42 Z"
                fill={detalleHsl(prenda.color_h, prenda.color_s, prenda.color_l)}
                stroke={stroke}
                {...strokeProps}
              />
              <path d="M46 42 L60 58 L54 42 Z" fill={detalleHsl(prenda.color_h, prenda.color_s, prenda.color_l)} stroke={stroke} {...strokeProps} />
              <path d="M74 42 L60 58 L66 42 Z" fill={detalleHsl(prenda.color_h, prenda.color_s, prenda.color_l)} stroke={stroke} {...strokeProps} />
              <line x1="60" y1="58" x2="60" y2="124" stroke={stroke} {...strokeProps} />
            </>
          )}
          {prenda.categoria === "sweater" && (
            <path d="M48 40 Q60 46 72 40" fill="none" stroke={stroke} {...strokeProps} strokeWidth={3} />
          )}
          {(prenda.categoria === "sweater" ||
            prenda.categoria === "buzo" ||
            // campera de punto (cardigan con cierre, ver esCamperaDePunto
            // en PrendaIcon.tsx y el comentario largo más abajo en
            // categoria="campera") -- mismo dobladillo acanalado que un
            // sweater/buzo real: es la misma prenda de punto, solo con
            // cierre en vez de cuello redondo/pullover.
            esCamperaDePunto(prenda.categoria, prenda.textura, prenda.estacion) ||
            // rompeviento (esCamperaTecnica, ver PrendaIcon.tsx) -- pedido
            // explícito del usuario, revisado como sastre y modista: un
            // rompeviento real cierra con puño elástico o cordón en el
            // ruedo, no queda suelto/recto como una campera de tela. No es
            // literalmente el mismo canalé de punto que un sweater (es
            // elástico sintético, no lana tejida), pero a esta escala
            // esquemática es la misma seña visual -- una banda distinta en
            // el ruedo -- así que se reusa el mismo dibujo en vez de
            // inventar un tercer detalle para una diferencia que no se
            // notaría a este tamaño.
            esCamperaTecnica(prenda.categoria, prenda.textura)) && (
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
              <rect x="41" y="119" width="38" height="7" fill={detalleHsl(prenda.color_h, prenda.color_s, prenda.color_l)} stroke={stroke} {...strokeProps} />
              {[45, 51, 57, 63, 69, 75].map((x) => (
                <line key={x} x1={x} y1="120" x2={x} y2="125" stroke={stroke} strokeWidth={0.6} />
              ))}
            </>
          )}
          {prenda.categoria === "campera" && (
            <>
              {/* el cierre sube más adentro del cuello en un rompeviento
                  (ver la rama esCamperaTecnica más abajo) -- un cuello
                  funnel cerrado hasta el mentón necesita que el cierre
                  llegue hasta ahí arriba, no solo hasta la línea de
                  hombros como en una campera abierta. */}
              <line
                x1="60"
                y1={esCamperaTecnica(prenda.categoria, prenda.textura) ? 36 : 60}
                x2="60"
                y2="124"
                stroke={stroke}
                {...strokeProps}
                strokeDasharray="3 3"
              />
              {esCamperaDePunto(prenda.categoria, prenda.textura, prenda.estacion) ? (
                // campera de punto con cierre (cardigan) -- pedido
                // explícito del usuario, revisado como sastre y diseñador:
                // "campera-sweater-azul-marino" es una prenda de punto CON
                // cierre, no una campera técnica de tela ni un tapado de
                // paño (ver esCamperaDePunto en PrendaIcon.tsx para el
                // porqué "lana" solo no alcanza) -- la solapa armada de
                // acá abajo (dos piezas en punta formando un cuello duro)
                // lee como una campera de tela rígida, no como un cardigan
                // real, que tiene un escote en V blando, sin cuello
                // armado. Mismo trazo que ya usa categoria="sweater"
                // arriba (nunca se desincroniza, es literal el mismo path)
                // -- el cierre (línea de arriba) se mantiene: a diferencia
                // de un sweater sin más, esta prenda SÍ cierra con
                // cremallera.
                <path d="M48 40 Q60 46 72 40" fill="none" stroke={stroke} {...strokeProps} strokeWidth={3} />
              ) : esCamperaTecnica(prenda.categoria, prenda.textura) ? (
                // rompeviento (esCamperaTecnica, ver su comentario largo en
                // PrendaIcon.tsx) -- pedido explícito del usuario, revisado
                // como sastre y modista: un rompeviento técnico cierra
                // hasta el cuello (funnel/stand collar cerrado), no se usa
                // abierto sobre el pecho como una campera de tela -- es
                // viento/lluvia lo que corta, un cuello abierto no cumple
                // esa función. A diferencia de la campera genérica de acá
                // abajo (banda ancha con dos solapas que se abren en V
                // hacia el pecho), esta banda es angosta (52-68 en vez de
                // 46-74) y más alta (sube hasta y=34 en vez de y=38, más
                // cerca del cuello del maniquí) -- y SIN las dos solapas
                // triangulares: un cuello funnel no se abre, se mantiene
                // cerrado sobre sí mismo.
                <>
                  <path
                    d="M52 44 Q60 34 68 44 Q64 47 60 48 Q56 47 52 44 Z"
                    fill={detalleHsl(prenda.color_h, prenda.color_s, prenda.color_l)}
                    stroke={stroke}
                    {...strokeProps}
                  />
                  {prenda.textura === "impermeable" && (
                    // tapeta que cubre el cierre -- pedido explícito del
                    // usuario ("la campera piloto en realidad es una
                    // campera impermeable"), revisado como ingeniero
                    // textil: un impermeable real tapa el cierre con una
                    // solapa angosta para que no entre agua -- un
                    // rompeviento deportivo (poliéster, mismo cuello funnel
                    // de arriba) no la lleva, así que es lo único que
                    // distingue a las dos prendas técnicas entre sí (mismo
                    // criterio que PrendaIcon.tsx, ver ese comentario).
                    // Offset a un lado del cierre, no centrada, como se ve
                    // una tapeta real.
                    <rect
                      x="62"
                      y="50"
                      width="7"
                      height="66"
                      rx="1.5"
                      fill={detalleHsl(prenda.color_h, prenda.color_s, prenda.color_l)}
                      stroke={stroke}
                      {...strokeProps}
                    />
                  )}
                </>
              ) : (
                <>
                  {/* mismo rediseño de cuello camisero que en TorsoCuerpo/
                      camisa (ver ese comentario largo para el porqué), 2u más
                      abajo -- offset que ya traía este bloque de antes. */}
                  <path
                    d="M46 44 Q60 38 74 44 Q68 46 60 47 Q52 46 46 44 Z"
                    fill={detalleHsl(prenda.color_h, prenda.color_s, prenda.color_l)}
                    stroke={stroke}
                    {...strokeProps}
                  />
                  <path d="M46 44 L60 60 L54 44 Z" fill={detalleHsl(prenda.color_h, prenda.color_s, prenda.color_l)} stroke={stroke} {...strokeProps} />
                  <path d="M74 44 L60 60 L66 44 Z" fill={detalleHsl(prenda.color_h, prenda.color_s, prenda.color_l)} stroke={stroke} {...strokeProps} />
                </>
              )}
            </>
          )}
          {prenda.categoria === "saco" && (
            // saco -- 2da revisión, pedido explícito del usuario con foto
            // de referencia real (traje gris de dos botones, solapa con
            // muesca, largo hasta la cadera). Corrección de proporción
            // sobre la 1ra pasada: un saco de vestir real llega hasta
            // donde caería la mano con el brazo relajado -- en este
            // maniquí, el puño de la manga larga termina en y≈114-121 (ver
            // el path del brazo más arriba), así que el ruedo real del
            // saco tiene que acercarse a esa altura, no quedar a mitad de
            // torso como en la 1ra pasada (que dejaba 25-30u de tela sin
            // diferenciar antes del cinturón, todavía leyéndose como
            // mameluco). Ahora el ruedo llega a y≈116, pegado al cinturón
            // (y=123) -- la misma referencia anatómica que ya usan los
            // brazos, no un número inventado.
            <>
              <path
                d="M46 42 Q60 36 74 42 Q68 44 60 45 Q52 44 46 42 Z"
                fill={detalleHsl(prenda.color_h, prenda.color_s, prenda.color_l)}
                stroke={stroke}
                {...strokeProps}
              />
              {/* solapa izquierda -- 3ra revisión: la versión anterior (4
                  puntos con un quiebre de muesca en 24,66) resultaba, al
                  conectar ese punto directo con el cierre de botón (54,98),
                  en una solapa mucho más ANCHA de lo previsto -- verificado
                  renderizando el maniquí real: las dos solapas juntas
                  formaban un rombo que tapaba casi todo el pecho, sin dejar
                  hueco real para que asome la camisa. Geometría más
                  conservadora ahora: del cuello (46,42) sale hacia el
                  hombro (36,60) -- el borde exterior, sin pasarse del punto
                  de hombro real (el brazo arranca en x≈34-38 en este mismo
                  maniquí) -- y de ahí baja derecho hasta el cierre de botón
                  (52,96), cerrando contra el centro (60,46). El borde
                  interior (60,46)->(52,96) queda pegado al centro casi todo
                  el trayecto, dejando un hueco real y angosto para la
                  camisa (ver el path del pecho de camisa, más abajo en este
                  archivo, que replica exactamente este mismo borde). */}
              <path d="M46 42 L36 60 L52 96 L60 46 Z" fill={detalleHsl(prenda.color_h, prenda.color_s, prenda.color_l)} stroke={stroke} {...strokeProps} />
              <path d="M74 42 L84 60 L68 96 L60 46 Z" fill={detalleHsl(prenda.color_h, prenda.color_s, prenda.color_l)} stroke={stroke} {...strokeProps} />
              {/* dos botones sobre la línea de cierre, más abajo que la 1ra
                  pasada (acompañando el largo nuevo) -- la seña visual que
                  distingue un saco abrochado de una campera con
                  cremallera. */}
              <circle cx="60" cy="98" r="1.6" fill={contornoHsl(prenda.color_h, prenda.color_s, prenda.color_l)} />
              <circle cx="60" cy="107" r="1.6" fill={contornoHsl(prenda.color_h, prenda.color_s, prenda.color_l)} />
              {/* bolsillos de solapa (flap pockets) a la altura de la
                  cadera -- pedido explícito de la foto de referencia, el
                  detalle que más lee "esto es tailoring" además de la
                  solapa. Solo el contorno (sin relleno propio): un bolsillo
                  de solapa real es la misma tela del saco, se nota por la
                  costura/pestaña, no por un cambio de color. */}
              <rect x="38" y="102" width="11" height="5" rx="1" fill="none" stroke={contornoHsl(prenda.color_h, prenda.color_s, prenda.color_l)} strokeWidth={1} />
              <rect x="71" y="102" width="11" height="5" rx="1" fill="none" stroke={contornoHsl(prenda.color_h, prenda.color_s, prenda.color_l)} strokeWidth={1} />
              {/* ruedo del saco -- reporte real del usuario: sin este
                  límite dibujado, y siendo saco y pantalón del mismo
                  color/género (como cualquier traje real), la tela se leía
                  continua de los hombros a los tobillos, un mameluco en
                  vez de un traje de dos piezas. En contornoHsl (tono
                  sólido, no el trazo fijo semitransparente) para que se
                  note incluso sobre un color oscuro como el azul marino --
                  mismo motivo que ya documenta el ícono chico
                  (PrendaIcon.tsx) para tonoPatron. Ahora a y≈116 (ver el
                  comentario de arriba sobre la referencia anatómica del
                  puño), no a mitad de torso. */}
              <path
                d="M32 106 Q60 120 88 106"
                fill="none"
                stroke={contornoHsl(prenda.color_h, prenda.color_s, prenda.color_l)}
                strokeWidth={1.4}
              />
            </>
          )}
          </g>
        </>
      )}
    />
  );
}

// Largo de pierna por categoría -- pedido explícito del usuario ("agregá
// bermudas y shorts deportivos... revisá la anatomía"). El maniquí de base
// (más abajo en este archivo) documenta la rodilla en y≈179 (verificado por
// búsqueda: 75% de la altura total, canon clásico); un bermuda real termina
// a la rodilla o apenas arriba (no más abajo, si no ya es un pantalón
// pescador/capri), así que el hem queda en y=175, un poco arriba de esa
// referencia. Un short deportivo termina bastante más arriba, a mitad de
// muslo -- entre la cadera (120) y la rodilla (179) hay 59u de muslo; medio
// muslo cae en y≈150, así que se usa ese valor. pantalon (y null/undefined,
// para cualquier categoría de piernas futura sin mapear) sigue llegando
// hasta el tobillo (y=224) como siempre.
const HEM_PIERNAS: Partial<Record<Categoria, number>> = {
  bermuda: 175,
  short_deportivo: 150,
};

function PiernasCuerpo({ prenda }: { prenda: Prenda }) {
  const hem = HEM_PIERNAS[prenda.categoria];
  // pantalon (hem === undefined): la silueta completa de siempre, con la
  // rodilla/pantorrilla curvándose hacia afuera cerca del tobillo. bermuda/
  // short_deportivo: una columna recta desde la cadera hasta el hem (en ese
  // tramo alto de la pierna el pantalón tampoco tapera -- el afinado hacia
  // el tobillo solo empieza en y=185, más abajo que cualquier hem de short),
  // con las esquinas del ruedo redondeadas en vez de un corte en ángulo
  // recto, mismo criterio que la punta curva de la manga corta (ver
  // TorsoCuerpo) en vez de un final abrupto. La pierna desnuda del maniquí
  // de base, dibujada ANTES que esta capa, sigue de largo por debajo del
  // hem -- mismo mecanismo que ya expone el antebrazo con manga corta.
  const izquierda = hem
    ? `M41 120 L41 ${hem - 3} Q41 ${hem} 44 ${hem} L57 ${hem} Q60 ${hem} 60 ${hem - 3} L60 120 Z`
    : "M41 120 L41 185 Q40 203 42 224 L52 224 Q54 203 57 185 L60 120 Z";
  const derecha = hem
    ? `M79 120 L79 ${hem - 3} Q79 ${hem} 76 ${hem} L63 ${hem} Q60 ${hem} 60 ${hem - 3} L60 120 Z`
    : "M79 120 L79 185 Q80 203 78 224 L68 224 Q66 203 63 185 L60 120 Z";
  return (
    <Volumen
      prenda={prenda}
      hijos={(fill, stroke, patron) => (
        <>
          {/* calce (ajustado/regular/holgado) -- ver escalaSilueta arriba
              del archivo y el mismo mecanismo en TorsoCuerpo. Envuelve las
              dos piernas Y la cinturilla como una sola pieza de tela. */}
          <g transform={escalaSilueta(ESCALA_PIERNAS, prenda.calce)}>
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
          <Forma d={izquierda} fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <Forma d={derecha} fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          {/* cinturilla */}
          <path
            d="M40 116 H80 V126 H40 Z"
            fill={detalleHsl(prenda.color_h, prenda.color_s, prenda.color_l)}
            stroke={stroke}
            {...strokeProps}
          />
          </g>
        </>
      )}
    />
  );
}

/** Decoración real por corte de calzado -- ver CorteCalzado en types.ts
 *  para el porqué de cada una (revisado como modista/ingeniero textil,
 *  pedido explícito del usuario: "las costuras, cortes y decoración más
 *  usadas según usos y costumbres"). Definida una sola vez para el pie
 *  izquierdo (mirror=false) y espejada con `mx` para el derecho en vez de
 *  duplicar coordenadas a mano -- los dos zapatos ya son simétricos
 *  alrededor de x=60 (36-56 el izquierdo, 64-84 el derecho, ver el
 *  comentario largo de PiesCuerpo más abajo), así que mx(x) = 120-x los
 *  espeja exactos. */
function DecoracionCalzado({
  corte,
  tono,
  stroke,
  mirror,
}: {
  corte: CorteCalzado;
  tono: string;
  stroke: string;
  mirror: boolean;
}) {
  const mx = (x: number) => (mirror ? 120 - x : x);
  switch (corte) {
    case "zapatilla_running":
      // silueta técnica: panel diagonal ancho (relleno), SIN las 3 rayas
      // de la urbana -- ver el comentario largo en types.ts.
      return (
        <path
          d={`M${mx(39)} 233 L${mx(43)} 236 L${mx(52)} 225 L${mx(47)} 223.5 Z`}
          fill={tono}
          stroke={stroke}
          strokeWidth={0.5}
        />
      );
    case "zapato_vestir":
      // cap-toe: costura curva + perforado (broguing) cerca de la puntera.
      return (
        <>
          <path d={`M${mx(50)} 224 Q${mx(55)} 227 ${mx(55)} 231`} fill="none" stroke={tono} strokeWidth={0.5} />
          {[225.5, 227.5, 229.5].map((y) => (
            <circle key={y} cx={mx(53.3)} cy={y} r={0.4} fill={tono} />
          ))}
        </>
      );
    case "mocasin":
      // tira/correa cruzando el empeine (penny loafer) -- sin cordones,
      // ver más abajo dónde se omiten las 2 líneas de cordón para este
      // corte.
      return <rect x={mirror ? 64 : 48} y="227" width="8" height="3.2" rx="1" fill={tono} stroke={stroke} strokeWidth={0.4} />;
    case "zapatilla_lona":
      // puntera de goma (tono fijo blanco/crema, otro material -- mismo
      // criterio que la suela de contraste) + costura lateral marcada.
      return (
        <>
          <path
            d={`M${mx(51)} 223.5 Q${mx(55.5)} 224 ${mx(56)} 231 Q${mx(56)} 234 ${mx(53)} 234 Q${mx(50)} 230 ${mx(48)} 226 Z`}
            fill="#F2F0EA"
            stroke={stroke}
            strokeWidth={0.4}
          />
          <line x1={mx(37)} y1="233" x2={mx(55)} y2="233" stroke={stroke} strokeWidth={0.4} />
        </>
      );
    case "zapatilla_urbana":
    default:
      // 3 rayas laterales -- la referencia real más citada de "zapatilla
      // urbana" de calle (pedido explícito del usuario).
      return (
        <>
          <line x1={mx(42)} y1="233" x2={mx(45)} y2="224" stroke={tono} strokeWidth={1.1} strokeLinecap="round" />
          <line x1={mx(45.5)} y1="232.5" x2={mx(48.5)} y2="224" stroke={tono} strokeWidth={1.1} strokeLinecap="round" />
          <line x1={mx(49)} y1="231.5" x2={mx(51.5)} y2="224.5" stroke={tono} strokeWidth={1.1} strokeLinecap="round" />
        </>
      );
  }
}

function PiesCuerpo({ prenda }: { prenda: Prenda }) {
  // suela_contraste es un dato real de la prenda (ver types.ts), no una
  // regla automática por categoría -- una zapatilla negra puede ser
  // totalmente monocromática (suela a tono, mismo criterio de siempre) o
  // tener la suela de goma blanca/crema, según lo que el usuario cargó.
  const suela = prenda.suela_contraste
    ? sombraHsl(0, 0, 94)
    : sombraHsl(prenda.color_h, prenda.color_s, Math.max(2, prenda.color_l - 20));
  // tonoDetalle (lightness-aware, igual criterio que el resto de la app --
  // ver color.ts) para la decoración por corte -- un tono fijo
  // semitransparente se funde con una zapatilla oscura, mismo hallazgo ya
  // confirmado varias veces en este archivo (cuello de camisa, solapas).
  const tonoDetalle = detalleHsl(prenda.color_h, prenda.color_s, prenda.color_l);
  // mocasin no lleva cordones -- la ausencia es el dato real más
  // definitorio de un mocasín (ver CorteCalzado en types.ts), a diferencia
  // del resto de los cortes, que sí los llevan (incluido el zapato de
  // vestir, con cordones más discretos en la vida real pero cordones al
  // fin).
  const conCordones = prenda.corte_calzado !== "mocasin";
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
              ambiguas a este tamaño. Omitidos en el mocasín (conCordones,
              ver más arriba). */}
          {conCordones && (
            <>
              <line x1="41" y1="226" x2="51" y2="226" stroke={stroke} strokeWidth={0.6} />
              <line x1="41" y1="229" x2="51" y2="229" stroke={stroke} strokeWidth={0.6} />
            </>
          )}
          <DecoracionCalzado corte={prenda.corte_calzado} tono={tonoDetalle} stroke={stroke} mirror={false} />
          <path d="M36 234 H56 V240 Q56 242 53 242 L39 242 Q36 242 36 240 Z" fill={suela} stroke={stroke} {...strokeProps} />
          <Forma d="M80 223 Q84 224 84 231 Q84 238 74 239 Q64 238 64 231 Q64 224 68 223 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          {conCordones && (
            <>
              <line x1="79" y1="226" x2="69" y2="226" stroke={stroke} strokeWidth={0.6} />
              <line x1="79" y1="229" x2="69" y2="229" stroke={stroke} strokeWidth={0.6} />
            </>
          )}
          <DecoracionCalzado corte={prenda.corte_calzado} tono={tonoDetalle} stroke={stroke} mirror={true} />
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
 *  data con las formas de acá. El patrón/brillo de textura SÍ es
 *  compartido (PatronTextura, TEXTURA_PATRON/TEXTURA_BRILLO, importados de
 *  PrendaIcon.tsx) -- misma fibra, misma seña visual, sea cual sea el
 *  tamaño del dibujo. */
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
        {cuelloSecundario && principal.torso && (
          // el cuello de la camisa de abajo, asomando por encima del
          // sweater/campera/buzo -- dibujado después de TorsoCuerpo a
          // propósito, para quedar por encima en el z-order. Mismas
          // coordenadas y forma que el cuello de camisa "principal" de
          // TorsoCuerpo (ver ese comentario para el porqué del rediseño).
          //
          // Reporte real del usuario, con captura: "se ve la parte de
          // atrás del cuello de la camisa... se debería ver el cuello del
          // maniquí [o el escote de la prenda de arriba]". Tenía razón:
          // esta pieza se dibujaba ENTERA (tira + las dos puntas, hasta
          // y=58) encima de la prenda de arriba SIN IMPORTAR cuánto
          // escote tiene esa prenda -- un sweater de cuello en V solo
          // abre hasta y≈46 en el centro, así que la punta del cuello
          // (y=58) quedaba sobresaliendo 12u por DEBAJO de esa V, como
          // pegada encima de la tela en vez de asomando por un hueco
          // real. Se agrega un clipPath con el escote real de cada
          // prenda de arriba (el mismo dato que ya define su propio
          // dibujo: la V del sweater, un cierre más alto y angosto para
          // el buzo -- cuello redondo, cierra casi del todo -- y uno más
          // ancho y bajo para la campera -- una campera de abrigo
          // normalmente se usa más abierta que un sweater) -- así la
          // pieza de abajo de la camisa nunca dibuja más de lo que ese
          // escote real dejaría ver. */}
          <>
            <defs>
              {/* mismo mecanismo de estampado que en TorsoCuerpo (ver ese
                  comentario) para el pecho de la camisa que asoma bajo el
                  saco -- sin esto, una camisa a rayas puesta bajo un saco se
                  veía plana (luzHsl liso) en la única parte del cuerpo
                  donde el estampado real seguiría siendo visible. */}
              {cuelloSecundario.patron !== "liso" && cuelloSecundario.color2_hex && (
                <PatronEstampado
                  id={`estampado-cuello-${cuelloSecundario.id}`}
                  patron={cuelloSecundario.patron}
                  colorBase={cuelloSecundario.color_hex}
                  color2={cuelloSecundario.color2_hex}
                />
              )}
              <clipPath id={`escote-${cuelloSecundario.id}`}>
                {principal.torso.categoria === "sweater" && (
                  <path d="M46 20 L74 20 L74 40 Q60 46 46 40 Z" />
                )}
                {principal.torso.categoria === "buzo" && (
                  <path d="M46 20 L74 20 L74 39 Q60 43 46 39 Z" />
                )}
                {principal.torso.categoria === "campera" &&
                  (esCamperaDePunto(principal.torso.categoria, principal.torso.textura, principal.torso.estacion) ? (
                    // campera de punto (cardigan con cierre, ver
                    // esCamperaDePunto en PrendaIcon.tsx) -- mismo escote
                    // angosto en V que categoria="sweater" arriba (ver el
                    // comentario largo de TorsoCuerpo): con el cuello
                    // armado reemplazado por un V blando, el hueco real
                    // por donde asoma la camisa de abajo es el mismo que
                    // el de un sweater, no el ancho/bajo de una campera de
                    // tela.
                    <path d="M46 20 L74 20 L74 40 Q60 46 46 40 Z" />
                  ) : esCamperaTecnica(principal.torso.categoria, principal.torso.textura) ? (
                    // rompeviento (esCamperaTecnica, ver PrendaIcon.tsx) --
                    // sin path: un cuello funnel cerrado hasta el mentón
                    // (ver TorsoCuerpo/campera más arriba) no deja ningún
                    // hueco por donde asome la camisa de abajo -- un
                    // clipPath sin ninguna forma adentro recorta TODO (no
                    // deja pasar nada), que es exactamente lo que
                    // corresponde acá: nada de la camisa debería verse.
                    <></>
                  ) : (
                    <path d="M40 20 L80 20 L80 52 Q60 58 40 52 Z" />
                  ))}
                {principal.torso.categoria === "saco" && (
                  // el escote más ancho/bajo de los cuatro -- un saco se usa
                  // abierto, con las solapas mostrando la camisa (y corbata)
                  // hasta el cierre de botón (ver el path de la solapa en
                  // TorsoCuerpo, que ahora converge en y=98 -- 2da revisión
                  // con foto de referencia real, saco más largo que la 1ra
                  // pasada).
                  <path d="M38 20 L82 20 L82 100 Q60 108 38 100 Z" />
                )}
              </clipPath>
            </defs>
            <g clipPath={`url(#escote-${cuelloSecundario.id})`}>
              {/* pecho de la camisa -- reporte real del usuario ("revisa
                  también como se ve la camisa"): antes de esta pieza, acá
                  abajo solo se dibujaba el CUELLO (tira + puntas, hasta
                  y=58) -- el resto de la abertura, hasta donde cierra la
                  solapa, no tenía ningún relleno propio y mostraba la tela
                  del torso de ARRIBA (el saco) de fondo, no la camisa.
                  Primer intento con un rectángulo ancho (48-72) -- verificado
                  renderizando el maniquí real: se salía por fuera de las
                  solapas, tapándolas en vez de asomar entre ellas. Segundo
                  intento, un triángulo angosto -- pero las solapas de
                  TorsoCuerpo también se redibujaron más angostas en esa
                  misma revisión, así que este path tiene que seguir el
                  borde interior REAL de la solapa actual: (60,46) donde se
                  tocan arriba, abriéndose hasta (52,96)/(68,96) en el
                  cierre de botón -- las mismas coordenadas que usan las dos
                  solapas en TorsoCuerpo (ver ese comentario), no una
                  aproximación aparte que pueda desincronizarse. */}
              {principal.torso.categoria === "saco" && (
                <path
                  d="M60 46 L52 96 L68 96 Z"
                  fill={
                    cuelloSecundario.patron !== "liso" && cuelloSecundario.color2_hex
                      ? `url(#estampado-cuello-${cuelloSecundario.id})`
                      : detalleHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)
                  }
                  stroke={contornoHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)}
                  {...strokeProps}
                />
              )}
              <path
                d="M46 42 Q60 36 74 42 Q68 44 60 45 Q52 44 46 42 Z"
                fill={detalleHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)}
                stroke={contornoHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)}
                {...strokeProps}
              />
              <path
                d="M46 42 L60 58 L54 42 Z"
                fill={detalleHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)}
                stroke={contornoHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)}
                {...strokeProps}
              />
              <path
                d="M74 42 L60 58 L66 42 Z"
                fill={detalleHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)}
                stroke={contornoHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)}
                {...strokeProps}
              />
            </g>
          </>
        )}
        {principal.accesorio && <AccesorioCuerpo prenda={principal.accesorio} />}
        {principal.pies && <PiesCuerpo prenda={principal.pies} />}
      </svg>

      {extras.length > 0 && (
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", justifyContent: "center" }}>
          {extras.map((p) => (
            <span key={p.id} style={{ width: 28, height: 28 }} title={descripcionPrenda(p)}>
              <PrendaIcon
                categoria={p.categoria}
                color={p.color_hex}
                textura={p.textura ?? undefined}
                suelaContraste={p.suela_contraste}
                posicionAccesorio={p.posicion_accesorio}
                requiereCuello={p.requiere_cuello}
                conCapucha={p.con_capucha}
                patron={p.patron}
                color2={p.color2_hex}
                corteCalzado={p.corte_calzado}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

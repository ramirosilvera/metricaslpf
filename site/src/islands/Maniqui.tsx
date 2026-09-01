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
              <Forma d="M34 48 Q27 51 27 64 Q27 74 34 77 Q38 74 39 68 Q37 56 34 48 Z" fill={fill} stroke={stroke} patron={patron} sugerida={sugerida} />
              <Forma d="M86 48 Q93 51 93 64 Q93 74 86 77 Q82 74 81 68 Q83 56 86 48 Z" fill={fill} stroke={stroke} patron={patron} sugerida={sugerida} />
            </>
          ) : (
            <>
              <Forma
                d="M34 48 Q29 51 29 60 L28 114 Q28 120 32 121 L37 121 Q40 120 39 114 L39 60 Q38 52 34 48 Z"
                fill={fill}
                stroke={stroke}
                patron={patron}
                sugerida={sugerida}
              />
              <Forma
                d="M86 48 Q91 51 91 60 L92 114 Q92 120 88 121 L83 121 Q80 120 81 114 L81 60 Q82 52 86 48 Z"
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
          <Forma
            d="M34 46 Q34 59 37 70 Q39 89 41 104 L41 126 L79 126 L79 104 Q81 89 83 70 Q86 59 86 46 Q82 38 72 40 Q60 44 48 40 Q38 38 34 46 Z"
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
              <path d="M52 32 L60 42 L56 38 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} />
              <path d="M68 32 L60 42 L64 38 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} />
              <line x1="60" y1="42" x2="60" y2="124" stroke={stroke} {...strokeProps} />
            </>
          )}
          {prenda.categoria === "sweater" && (
            <path d="M48 40 Q60 46 72 40" fill="none" stroke={stroke} {...strokeProps} strokeWidth={3} />
          )}
          {prenda.categoria === "campera" && (
            <>
              <line x1="60" y1="42" x2="60" y2="124" stroke={stroke} {...strokeProps} strokeDasharray="3 3" />
              <path d="M52 34 L60 48 L56 38 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} />
              <path d="M68 34 L60 48 L64 38 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} />
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
              entrepierna. Ancho afinado en la 6ta pasada junto con todo el
              resto del cuerpo (ver el comentario largo en TorsoCuerpo) --
              mismo factor (0.85 adicional desde el centro) que hombros/
              torso, pedido explícito del usuario ("las piernas también" se
              ven anchas). Largo sin cambios. */}
          <Forma d="M41 120 L43 185 Q43 203 46 224 L56 224 Q57 203 59 185 L60 120 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <Forma d="M79 120 L77 185 Q77 203 74 224 L64 224 Q63 203 61 185 L60 120 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
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
              no un bloque cuadrado. Recentrado en la 6ta pasada (±1.5u,
              simple traslación, sin cambiar tamaño) para seguir el tobillo
              de la pierna afinada -- ver el comentario en PiernasCuerpo. */}
          <Forma d="M44 223 Q40 224 40 230 L42 233 Q42 236 46 236 L58 236 Q60 236 60 231 L60 223 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <path d="M40 233 H60 V237 Q60 238 58 238 L42 238 Q40 238 40 236 Z" fill={suela} stroke={stroke} {...strokeProps} />
          <Forma d="M76 223 Q80 224 80 230 L78 233 Q78 236 74 236 L62 236 Q60 236 60 231 L60 223 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <path d="M80 233 H60 V237 Q60 238 62 238 L78 238 Q80 238 80 236 Z" fill={suela} stroke={stroke} {...strokeProps} />
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
        <path
          d="M35 46 Q37 59 39 70 Q41 89 43 100 L43 120 L77 120 L77 100 Q79 89 81 70 Q83 59 85 46 Q80 38 71 42 Q60 46 49 42 Q40 38 35 46 Z"
          fill={neutro}
          stroke={neutroStroke}
        />
        <path d="M35 48 Q31 49 31 57 L29 113 Q29 120 33 120 L36 120 Q38 120 37 113 L37 59 Q37 51 35 48 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M85 48 Q89 49 89 57 L91 113 Q91 120 87 120 L84 120 Q82 120 83 113 L83 59 Q83 51 85 48 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M43 120 L44 179 Q45 197 46 224 L55 224 Q56 197 57 179 L59 120 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M77 120 L76 179 Q75 197 74 224 L65 224 Q64 197 63 179 L61 120 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M46 224 Q45 232 50 234 L55 234 Q56 232 55 224 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M74 224 Q75 232 70 234 L65 234 Q64 232 65 224 Z" fill={neutro} stroke={neutroStroke} />

        {principal.piernas && <PiernasCuerpo prenda={principal.piernas} />}
        {principal.torso && <TorsoCuerpo prenda={principal.torso} />}
        {cuelloSecundario && (
          // el cuello de la camisa de abajo, asomando por encima del
          // sweater/campera/buzo -- dibujado después de TorsoCuerpo a
          // propósito, para quedar por encima en el z-order. Mismas
          // coordenadas que el cuello de camisa "principal" de arriba
          // (y=32-42), reposicionadas junto con el resto del cuello.
          <>
            <path
              d="M52 32 L60 42 L56 38 Z"
              fill={cuelloSecundario.color_hex}
              stroke={contornoHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)}
              {...strokeProps}
            />
            <path
              d="M68 32 L60 42 L64 38 Z"
              fill={cuelloSecundario.color_hex}
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

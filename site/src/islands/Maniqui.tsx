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
        "M42 30 Q60 14 78 30 Q78 24 60 20 Q42 24 42 30 Z"
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
              <Forma d="M12 48 Q0 52 0 72 Q0 86 12 91 Q20 87 22 78 Q18 60 12 48 Z" fill={fill} stroke={stroke} patron={patron} sugerida={sugerida} />
              <Forma d="M108 48 Q120 52 120 72 Q120 86 108 91 Q100 87 98 78 Q102 60 108 48 Z" fill={fill} stroke={stroke} patron={patron} sugerida={sugerida} />
            </>
          ) : (
            <>
              <Forma
                d="M12 48 Q4 52 3 66 L1 146 Q1 156 9 157 L19 157 Q23 156 22 146 L21 66 Q20 54 12 48 Z"
                fill={fill}
                stroke={stroke}
                patron={patron}
                sugerida={sugerida}
              />
              <Forma
                d="M108 48 Q116 52 117 66 L119 146 Q119 156 111 157 L101 157 Q97 156 98 146 L99 66 Q100 54 108 48 Z"
                fill={fill}
                stroke={stroke}
                patron={patron}
                sugerida={sugerida}
              />
            </>
          )}

          {/* cuerpo del torso -- un poco más ancho que el maniquí de base
              (12-108 en los hombros) para que la tela "caiga por fuera" en
              vez de coincidir exacto con el borde del cuerpo. Proporciones
              recalculadas para un IMC ≈27.7 (170cm/80kg, "sobrepeso" según
              la clasificación de la OMS, pedido explícito del usuario) --
              los hombros son mayormente estructura ósea y casi no cambian
              con el peso (solo +2 respecto a la versión anterior), pero la
              cintura sí, y bastante: pasa de angostarse un 62% respecto al
              hombro a solo un 87% -- un torso mucho más recto, sin la V de
              un cuerpo atlético, que es como se ve realmente un IMC en ese
              rango (la grasa se concentra en el tronco antes que en otras
              zonas -- patrón "androide", el más común en hombres). El cuello
              baja hacia el centro (Q...60 44...) y sube cerca de los
              hombros, sin cambios respecto a la versión anterior -- esa
              curva no depende del ancho del torso. */}
          <Forma
            d="M12 46 Q13 62 15 76 Q18 100 20 118 L20 146 L100 146 L100 118 Q102 100 105 76 Q107 62 108 46 Q100 38 81 40 Q60 44 39 40 Q20 38 12 46 Z"
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
              <path d="M46 32 L60 42 L52 38 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} />
              <path d="M74 32 L60 42 L68 38 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} />
              <line x1="60" y1="42" x2="60" y2="144" stroke={stroke} {...strokeProps} />
            </>
          )}
          {prenda.categoria === "sweater" && (
            <path d="M39 40 Q60 46 81 40" fill="none" stroke={stroke} {...strokeProps} strokeWidth={3} />
          )}
          {prenda.categoria === "campera" && (
            <>
              <line x1="60" y1="42" x2="60" y2="144" stroke={stroke} {...strokeProps} strokeDasharray="3 3" />
              <path d="M44 34 L60 48 L52 38 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} />
              <path d="M76 34 L60 48 L68 38 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} />
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
              entrepierna. Ancho recalculado junto con el torso (ver
              TorsoCuerpo) para el IMC ≈27.7 del pedido -- muslos más
              anchos, escalados de forma pareja desde el tobillo hasta la
              cintura (mismo criterio de sastrería que ya usaba esta curva,
              solo que ahora arranca de una cintura más ancha). */}
          <Forma d="M18 140 L22 195 Q24 210 29 228 L52 228 Q54 210 57 195 L60 140 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <Forma d="M102 140 L98 195 Q96 210 91 228 L68 228 Q66 210 63 195 L60 140 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          {/* cinturilla */}
          <path
            d="M16 136 H104 V146 H16 Z"
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
              que lee como "zapatilla" y no "piedra". Ensanchados 3u por
              lado junto con el tobillo (ver PiernasCuerpo/el maniquí de
              base) para el IMC del pedido. */}
          <Forma d="M23 226 Q17 228 17 236 L19 241 Q21 244 29 244 L57 244 Q61 244 61 238 L59 226 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <path d="M17 241 H61 V246 Q61 248 58 248 L20 248 Q17 248 17 245 Z" fill={suela} stroke={stroke} {...strokeProps} />
          <Forma d="M97 226 Q103 228 103 236 L101 241 Q99 244 91 244 L63 244 Q59 244 59 238 L61 226 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <path d="M103 241 H59 V246 Q59 248 62 248 L100 248 Q103 248 103 245 Z" fill={suela} stroke={stroke} {...strokeProps} />
        </>
      )}
    />
  );
}

function AccesorioCuerpo({ prenda }: { prenda: Prenda }) {
  return (
    <Volumen
      prenda={prenda}
      hijos={(fill, stroke, patron) => (
        <>
          <Forma d="M20 143 H100 V151 H20 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <rect x="52" y="140" width="16" height="14" rx="2" fill="none" stroke={stroke} strokeWidth="2" />
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
        <ellipse cx="60" cy="252" rx="32" ry="5" fill="rgba(33,26,21,0.1)" />

        {/* maniquí de base -- queda visible donde no hay prenda cargada
            para esa zona (p.ej. un outfit sin calzado todavía muestra los
            "pies" del maniquí, no un hueco vacío). Proporciones recalculadas
            para IMC ≈27.7 (170cm/80kg, pedido explícito del usuario) --
            mismo criterio que TorsoCuerpo/PiernasCuerpo más abajo: hombros
            casi sin cambios (estructura ósea), cintura bastante más ancha
            (72% del ancho de hombros en vez de 62%, torso mucho más recto).
            Brazos como formas propias (antes no existían: las mangas de las
            prendas terminaban en el aire porque no había brazo debajo). */}
        <ellipse cx="60" cy="20" rx="13" ry="15" fill={neutro} stroke={neutroStroke} />
        <path d="M50 33 L70 33 L68 46 L52 46 Z" fill={neutro} stroke={neutroStroke} />
        <path
          d="M16 46 Q17 62 19 76 Q21 100 22 115 L22 140 L98 140 L98 115 Q99 100 101 76 Q103 62 104 46 Q96 38 80 42 Q60 46 40 42 Q24 38 16 46 Z"
          fill={neutro}
          stroke={neutroStroke}
        />
        <path d="M16 48 Q8 50 7 62 L5 145 Q5 155 11 155 L17 155 Q20 155 19 145 L18 65 Q18 52 16 48 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M104 48 Q112 50 113 62 L115 145 Q115 155 109 155 L103 155 Q100 155 101 145 L102 65 Q102 52 104 48 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M22 140 L25 190 Q26 205 30 228 L48 228 Q51 205 54 190 L57 140 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M98 140 L95 190 Q94 205 90 228 L72 228 Q69 205 66 190 L63 140 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M31 228 Q29 236 37 238 L47 238 Q49 236 47 228 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M89 228 Q91 236 83 238 L73 238 Q71 236 73 228 Z" fill={neutro} stroke={neutroStroke} />

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
              d="M46 32 L60 42 L52 38 Z"
              fill={cuelloSecundario.color_hex}
              stroke={contornoHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)}
              {...strokeProps}
            />
            <path
              d="M74 32 L60 42 L68 38 Z"
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
              <PrendaIcon categoria={p.categoria} color={p.color_hex} suelaContraste={p.suela_contraste} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

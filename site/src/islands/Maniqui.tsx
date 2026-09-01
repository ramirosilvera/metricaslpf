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
              <Forma d="M14 48 Q2 52 2 72 Q2 86 14 91 Q22 87 24 78 Q20 60 14 48 Z" fill={fill} stroke={stroke} patron={patron} sugerida={sugerida} />
              <Forma d="M106 48 Q118 52 118 72 Q118 86 106 91 Q98 87 96 78 Q100 60 106 48 Z" fill={fill} stroke={stroke} patron={patron} sugerida={sugerida} />
            </>
          ) : (
            <>
              <Forma
                d="M14 48 Q4 52 3 66 L1 146 Q1 156 9 157 L19 157 Q23 156 22 146 L21 66 Q20 54 14 48 Z"
                fill={fill}
                stroke={stroke}
                patron={patron}
                sugerida={sugerida}
              />
              <Forma
                d="M106 48 Q116 52 117 66 L119 146 Q119 156 111 157 L101 157 Q97 156 98 146 L99 66 Q100 54 106 48 Z"
                fill={fill}
                stroke={stroke}
                patron={patron}
                sugerida={sugerida}
              />
            </>
          )}

          {/* cuerpo del torso -- un poco más ancho que el maniquí de base
              (18-102 en los hombros) para que la tela "caiga por fuera" en
              vez de coincidir exacto con el borde del cuerpo. Los puntos de
              control de las curvas de los costados (Q17 62.../Q103 62...)
              quedan HACIA ADENTRO del ancho de hombros (14/106) para que el
              torso se angoste de forma pareja hacia la cintura -- antes el
              control point quedaba hacia AFUERA (Q12.../Q108...), lo que
              inflaba el pecho más ancho que los propios hombros (reportado
              por el usuario: "pecho desproporcionado"). El cuello baja hacia
              el centro (Q...60 44...) y sube cerca de los hombros (y=40 a
              los costados). */}
          <Forma
            d="M14 46 Q17 62 22 76 Q27 100 32 118 L32 146 L88 146 L88 118 Q93 100 98 76 Q103 62 106 46 Q98 38 80 40 Q60 44 40 40 Q22 38 14 46 Z"
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
            <path d="M40 40 Q60 46 80 40" fill="none" stroke={stroke} {...strokeProps} strokeWidth={3} />
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
              entrepierna. */}
          <Forma d="M30 140 L33 195 Q34 210 38 228 L54 228 Q56 210 58 195 L60 140 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <Forma d="M90 140 L87 195 Q86 210 82 228 L66 228 Q64 210 62 195 L60 140 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          {/* cinturilla */}
          <path
            d="M28 136 H92 V146 H28 Z"
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
              que lee como "zapatilla" y no "piedra". */}
          <Forma d="M26 226 Q20 228 20 236 L22 241 Q24 244 32 244 L54 244 Q58 244 58 238 L56 226 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <path d="M20 241 H58 V246 Q58 248 55 248 L23 248 Q20 248 20 245 Z" fill={suela} stroke={stroke} {...strokeProps} />
          <Forma d="M94 226 Q100 228 100 236 L98 241 Q96 244 88 244 L66 244 Q62 244 62 238 L64 226 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <path d="M62 241 H100 V246 Q100 248 97 248 L65 248 Q62 248 62 245 Z" fill={suela} stroke={stroke} {...strokeProps} />
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
          <Forma d="M32 143 H88 V151 H32 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
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
            "pies" del maniquí, no un hueco vacío). Hombros más anchos que
            la cintura, con cintura marcada, y brazos como formas propias
            (antes no existían: las mangas de las prendas terminaban en el
            aire porque no había brazo debajo). */}
        <ellipse cx="60" cy="20" rx="13" ry="15" fill={neutro} stroke={neutroStroke} />
        <path d="M50 33 L70 33 L68 46 L52 46 Z" fill={neutro} stroke={neutroStroke} />
        <path
          d="M18 46 Q21 62 26 76 Q30 100 34 115 L34 140 L86 140 L86 115 Q90 100 94 76 Q99 62 102 46 Q94 38 78 42 Q60 46 42 42 Q26 38 18 46 Z"
          fill={neutro}
          stroke={neutroStroke}
        />
        <path d="M18 48 Q10 50 9 62 L7 145 Q7 155 13 155 L19 155 Q22 155 21 145 L20 65 Q20 52 18 48 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M102 48 Q110 50 111 62 L113 145 Q113 155 107 155 L101 155 Q98 155 99 145 L100 65 Q100 52 102 48 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M34 140 L36 190 Q37 205 40 228 L52 228 Q54 205 56 190 L58 140 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M86 140 L84 190 Q83 205 80 228 L68 228 Q66 205 64 190 L62 140 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M38 228 Q36 236 44 238 L54 238 Q56 236 54 228 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M82 228 Q84 236 76 238 L66 238 Q64 236 66 228 Z" fill={neutro} stroke={neutroStroke} />

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
              <PrendaIcon categoria={p.categoria} color={p.color_hex} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

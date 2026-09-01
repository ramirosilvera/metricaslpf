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
              <Forma d="M12 48 Q0 51 0 64 Q0 74 12 77 Q20 74 22 68 Q18 56 12 48 Z" fill={fill} stroke={stroke} patron={patron} sugerida={sugerida} />
              <Forma d="M108 48 Q120 51 120 64 Q120 74 108 77 Q100 74 98 68 Q102 56 108 48 Z" fill={fill} stroke={stroke} patron={patron} sugerida={sugerida} />
            </>
          ) : (
            <>
              <Forma
                d="M12 48 Q4 51 3 60 L1 114 Q1 120 9 121 L19 121 Q23 120 22 114 L21 60 Q20 52 12 48 Z"
                fill={fill}
                stroke={stroke}
                patron={patron}
                sugerida={sugerida}
              />
              <Forma
                d="M108 48 Q116 51 117 60 L119 114 Q119 120 111 121 L101 121 Q97 120 98 114 L99 60 Q100 52 108 48 Z"
                fill={fill}
                stroke={stroke}
                patron={patron}
                sugerida={sugerida}
              />
            </>
          )}

          {/* cuerpo del torso -- un poco más ancho que el maniquí de base
              (12-108 en los hombros) para que la tela "caiga por fuera" en
              vez de coincidir exacto con el borde del cuerpo. Alto
              recalculado con proporciones reales (3ra pasada, pedido
              explícito del usuario de revisar contra anatomía real): las dos
              pasadas anteriores solo ajustaban el ANCHO (hombro/cintura) y
              dejaban el LARGO del torso sin verificar contra ninguna regla
              real -- la entrepierna terminaba al 58% de la altura total en
              vez del 50% exacto que marca tanto el canon clásico de
              sastrería como datos antropométricos reales verificados
              (altura de hombro ≈82% de la estatura, guía de antropometría
              del Departamento de Defensa de EE.UU.), y la muñeca (extremo
              de manga) quedaba muy por debajo de la altura de la
              entrepierna en vez de a la misma altura -- "la muñeca del
              brazo colgando cae al nivel del hueso púbico" es la regla
              clásica de dibujo anatómico, confirmada por búsqueda antes de
              aplicarla (ver comentario del maniquí de base). Resultado:
              torso ~19u más largo y brazos más largos de lo real, la
              combinación típica que hace leer una figura como
              desproporcionada aunque el ancho esté bien. El torso ahora
              termina en y=126 (hombro=46, largo=80, la entrepierna del
              maniquí de base cae en y=120 = exactamente 50% de la altura
              total, ver comentario en el maniquí de base más abajo). El
              ancho (12-108 hombros, 26-94 cadera) NO cambió -- ese ajuste ya
              estaba resuelto en la pasada anterior y no es lo que el
              usuario reportó esta vez. */}
          <Forma
            d="M12 46 Q14 59 18 70 Q22 89 26 104 L26 126 L94 126 L94 104 Q98 89 102 70 Q106 59 108 46 Q100 38 81 40 Q60 44 39 40 Q20 38 12 46 Z"
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
              <line x1="60" y1="42" x2="60" y2="124" stroke={stroke} {...strokeProps} />
            </>
          )}
          {prenda.categoria === "sweater" && (
            <path d="M39 40 Q60 46 81 40" fill="none" stroke={stroke} {...strokeProps} strokeWidth={3} />
          )}
          {prenda.categoria === "campera" && (
            <>
              <line x1="60" y1="42" x2="60" y2="124" stroke={stroke} {...strokeProps} strokeDasharray="3 3" />
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
              entrepierna. Ancho sin cambios (ver TorsoCuerpo). Largo
              recalculado en la 3ra pasada -- ver el comentario largo en
              TorsoCuerpo: la cadera ahora arranca en y=120 (antes 140,
              donde caía al 58% de la altura total en vez del 50% real) y
              las piernas se alargan para compensar, como corresponde a un
              torso más corto y piernas más largas en la proporción real. */}
          <Forma d="M26 120 L29 185 Q30 203 35 224 L53 224 Q55 203 58 185 L60 120 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <Forma d="M94 120 L91 185 Q90 203 85 224 L67 224 Q65 203 62 185 L60 120 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          {/* cinturilla */}
          <path
            d="M24 116 H96 V126 H24 Z"
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
              que lee como "zapatilla" y no "piedra". Reposicionados bajo
              el tobillo de la 3ra pasada (ver PiernasCuerpo/TorsoCuerpo):
              el tobillo del maniquí de base ahora cae en y=224 (antes 228,
              consistente con piernas más largas), el resto de las
              coordenadas se corrió el mismo delta (-4) para no cambiar el
              tamaño/forma del zapato en sí, solo su posición. */}
          <Forma d="M27 222 Q21 224 21 232 L23 237 Q25 240 33 240 L61 240 Q65 240 65 234 L63 222 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <path d="M21 237 H65 V242 Q65 244 62 244 L24 244 Q21 244 21 241 Z" fill={suela} stroke={stroke} {...strokeProps} />
          <Forma d="M93 222 Q99 224 99 232 L97 237 Q95 240 87 240 L59 240 Q55 240 55 234 L57 222 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <path d="M99 237 H55 V242 Q55 244 58 244 L96 244 Q99 244 99 241 Z" fill={suela} stroke={stroke} {...strokeProps} />
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
            <Forma d="M26 123 H94 V131 H26 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
            <rect x="52" y="120" width="16" height="14" rx="2" fill="none" stroke={stroke} strokeWidth="2" />
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
            <Forma d="M55 38 L65 38 L62 46 L58 46 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
            <Forma d="M58 46 L62 46 L70 85 L60 100 L50 85 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
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
          <Forma d="M40 40 Q60 28 80 40 Q72 50 60 50 Q48 50 40 40 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <Forma d="M46 46 H58 V93 Q52 96 46 93 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <Forma d="M64 46 H76 V82 Q70 85 64 82 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
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
            "pies" del maniquí, no un hueco vacío). Proporciones, 3ra
            pasada -- las dos pasadas anteriores (ver historial de commits)
            solo habían corregido el ANCHO hombro/cintura para que el
            maniquí se leyera como cuerpo de hombre; el usuario reportó
            después que las dimensiones "no cerraban" en general, y
            efectivamente el LARGO nunca se había verificado contra ninguna
            regla anatómica real. Auditado contra dos fuentes independientes
            que se validan entre sí, ambas verificadas por búsqueda antes de
            aplicarlas (no de memoria):
              - Canon clásico de proporción de figura (Loomis/Bridgman, el
                mismo que usa la ilustración de sastrería): la entrepierna
                cae exactamente al 50% de la altura de pie a cabeza, la
                rodilla al 75% (a un cuarto de altura del piso), y "la
                muñeca del brazo colgando cae al nivel del hueso púbico" --
                es decir, misma altura que la entrepierna.
              - Datos antropométricos reales de adulto varón (guía de
                antropometría del Departamento de Defensa de EE.UU.):
                altura de hombro (desde el piso) ≈82% de la estatura total
                -- confirma de forma independiente que el hombro está bien
                ubicado, sin depender solo del canon clásico.
            El maniquí anterior tenía la entrepierna al 58% (torso ~19u más
            largo de lo real) y la muñeca muy por debajo del nivel de la
            entrepierna (brazo demasiado largo) -- la combinación de torso
            largo + brazos largos es justamente lo que hace que una figura
            lea como desproporcionada aunque el ancho de hombros esté bien.
            Nuevas referencias (cabeza a piso, y=5 a y=234): hombro=46 (sin
            cambios, 82.5% desde el piso, consistente con el dato real),
            cadera/entrepierna=120 (50.7% de 229 -- antes 140, 57.9%),
            rodilla≈179 (a un cuarto del piso), tobillo=224, muñeca=120 (al
            mismo nivel que la entrepierna, como marca la regla clásica).
            Ancho de hombros/cintura sin cambios -- ese ajuste ya estaba
            resuelto. */}
        <ellipse cx="60" cy="20" rx="13" ry="15" fill={neutro} stroke={neutroStroke} />
        <path d="M50 33 L70 33 L68 46 L52 46 Z" fill={neutro} stroke={neutroStroke} />
        <path
          d="M16 46 Q18 59 22 70 Q26 89 29 100 L29 120 L91 120 L91 100 Q94 89 98 70 Q102 59 104 46 Q96 38 80 42 Q60 46 40 42 Q24 38 16 46 Z"
          fill={neutro}
          stroke={neutroStroke}
        />
        <path d="M16 48 Q8 49 7 57 L5 113 Q5 120 11 120 L17 120 Q20 120 19 113 L18 59 Q18 51 16 48 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M104 48 Q112 49 113 57 L115 113 Q115 120 109 120 L103 120 Q100 120 101 113 L102 59 Q102 51 104 48 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M29 120 L31 179 Q32 197 36 224 L51 224 Q53 197 55 179 L58 120 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M91 120 L89 179 Q88 197 84 224 L69 224 Q67 197 65 179 L62 120 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M35 224 Q33 232 41 234 L51 234 Q53 232 51 224 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M85 224 Q87 232 79 234 L69 234 Q67 232 69 224 Z" fill={neutro} stroke={neutroStroke} />

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

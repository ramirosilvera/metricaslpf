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
        "M48 30 Q60 14 72 30 Q72 24 60 20 Q48 24 48 30 Z"
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
              <Forma d="M29 48 Q21 51 21 64 Q21 74 29 77 Q34 74 35 68 Q33 56 29 48 Z" fill={fill} stroke={stroke} patron={patron} sugerida={sugerida} />
              <Forma d="M91 48 Q99 51 99 64 Q99 74 91 77 Q86 74 85 68 Q87 56 91 48 Z" fill={fill} stroke={stroke} patron={patron} sugerida={sugerida} />
            </>
          ) : (
            <>
              <Forma
                d="M29 48 Q24 51 23 60 L22 114 Q22 120 27 121 L33 121 Q36 120 35 114 L35 60 Q34 52 29 48 Z"
                fill={fill}
                stroke={stroke}
                patron={patron}
                sugerida={sugerida}
              />
              <Forma
                d="M91 48 Q96 51 97 60 L98 114 Q98 120 93 121 L87 121 Q84 120 85 114 L85 60 Q86 52 91 48 Z"
                fill={fill}
                stroke={stroke}
                patron={patron}
                sugerida={sugerida}
              />
            </>
          )}

          {/* cuerpo del torso -- un poco más ancho que el maniquí de base
              para que la tela "caiga por fuera" en vez de coincidir exacto
              con el borde del cuerpo. ANCHO recalculado en la 4ta pasada
              (el usuario insistió: "no parece el cuerpo de un hombre real",
              pidiendo medidas estandarizadas reales) -- las pasadas
              anteriores solo habían tocado la relación hombro/cintura
              (ancho relativo) y el largo (alto de torso, hombro a
              entrepierna), pero nunca el ancho ABSOLUTO: el hombro medía
              96u sobre una altura total de ~229u, un 42% -- casi el doble
              del 22-23% real (ancho de hombro/biacromial en adultos
              varones, verificado por búsqueda) y muy por encima de la
              convención de ilustración de figura ("hombro ≈2-2.5 cabezas",
              también verificada). El síntoma visible: con el largo ya
              corregido en la pasada anterior (torso más corto, ver más
              abajo) pero el ancho intacto, el torso quedó MÁS ANCHO QUE
              ALTO (96 ancho / 80 alto) -- un torso real es ~20-35% más alto
              que ancho, no al revés. Se escalan TODAS las coordenadas X del
              cuerpo (torso/brazos/piernas/pies/accesorios) un 65% respecto
              al centro (x=60) -- 27% de la altura total en el hombro,
              todavía con algo de margen sobre el 22-23% real puro para que
              la prenda se siga leyendo a los ~180px que usa la app, pero
              muy por debajo del 42% anterior. La relación hombro/cintura
              (71%, ya validada en la pasada anterior como la principal seña
              de género en una silueta sin cara) se mantiene igual porque el
              escalado es uniforme -- no se volvió a tocar esa proporción,
              solo la magnitud absoluta. */}
          <Forma
            d="M29 46 Q30 59 33 70 Q35 89 38 104 L38 126 L82 126 L82 104 Q85 89 87 70 Q90 59 91 46 Q86 38 74 40 Q60 44 46 40 Q34 38 29 46 Z"
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
              <path d="M51 32 L60 42 L55 38 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} />
              <path d="M69 32 L60 42 L65 38 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} />
              <line x1="60" y1="42" x2="60" y2="124" stroke={stroke} {...strokeProps} />
            </>
          )}
          {prenda.categoria === "sweater" && (
            <path d="M46 40 Q60 46 74 40" fill="none" stroke={stroke} {...strokeProps} strokeWidth={3} />
          )}
          {prenda.categoria === "campera" && (
            <>
              <line x1="60" y1="42" x2="60" y2="124" stroke={stroke} {...strokeProps} strokeDasharray="3 3" />
              <path d="M50 34 L60 48 L55 38 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} />
              <path d="M70 34 L60 48 L65 38 Z" fill={sombraHsl(prenda.color_h, prenda.color_s, prenda.color_l)} />
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
              entrepierna. Ancho reescalado en la 4ta pasada junto con todo
              el resto del cuerpo (ver el comentario largo en TorsoCuerpo) --
              mismo factor (65% desde el centro) que hombros/torso, para que
              las piernas se sigan viendo conectadas al nuevo torso más
              angosto en vez de sobresalir más anchas que la cadera. Largo
              sin cambios (ver comentario en el maniquí de base). */}
          <Forma d="M38 120 L40 185 Q40 203 44 224 L55 224 Q57 203 59 185 L60 120 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <Forma d="M82 120 L80 185 Q80 203 76 224 L65 224 Q63 203 61 185 L60 120 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          {/* cinturilla */}
          <path
            d="M37 116 H83 V126 H37 Z"
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
              no un bloque cuadrado. Ancho nuevo 20u (antes 28u), alto 15u
              (antes 22u) -- sin superposición entre los dos (2u de
              separación en vez de solaparse). */}
          <Forma d="M42 223 Q39 224 39 230 L40 233 Q41 236 44 236 L57 236 Q59 236 59 231 L58 223 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <path d="M39 233 H59 V237 Q59 238 57 238 L41 238 Q39 238 39 236 Z" fill={suela} stroke={stroke} {...strokeProps} />
          <Forma d="M78 223 Q81 224 81 230 L80 233 Q79 236 76 236 L63 236 Q61 236 61 231 L62 223 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <path d="M81 233 H61 V237 Q61 238 63 238 L79 238 Q81 238 81 236 Z" fill={suela} stroke={stroke} {...strokeProps} />
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
            <Forma d="M38 123 H82 V131 H38 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
            <rect x="55" y="120" width="10" height="14" rx="2" fill="none" stroke={stroke} strokeWidth="2" />
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
            <Forma d="M59 46 L61 46 L66 85 L60 100 L54 85 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
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
          <Forma d="M47 40 Q60 28 73 40 Q68 50 60 50 Q52 50 47 40 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <Forma d="M51 46 H59 V93 Q55 96 51 93 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
          <Forma d="M63 46 H70 V82 Q66 85 63 82 Z" fill={fill} stroke={stroke} patron={patron} sugerida={esSugerida(prenda)} />
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
            después que las dimensiones "no cerraban" en general. La 3ra
            pasada corrigió el LARGO (entrepierna al 50%, ver más abajo)
            pero no tocó el ANCHO -- el usuario volvió a insistir ("no
            parece el cuerpo de un hombre real") y pidió medidas
            estandarizadas reales. Auditado contra tres fuentes
            independientes que se validan entre sí, todas verificadas por
            búsqueda antes de aplicarlas (no de memoria):
              - Canon clásico de proporción de figura (Loomis/Bridgman, el
                mismo que usa la ilustración de sastrería): la entrepierna
                cae exactamente al 50% de la altura de pie a cabeza, la
                rodilla al 75% (a un cuarto de altura del piso), "la muñeca
                del brazo colgando cae al nivel del hueso púbico", y el
                ancho de hombros ronda 2-2.5 cabezas de ancho.
              - Datos antropométricos reales de adulto varón (guía de
                antropometría del Departamento de Defensa de EE.UU.):
                altura de hombro (desde el piso) ≈82% de la estatura total.
              - Medidas reales de maniquí de sastrería/exhibición (buscadas
                a pedido explícito del usuario): un maniquí de talle
                masculino estándar (73", ~185cm) tiene el pecho bastante más
                ancho que la cintura, pero como % de la ALTURA el ancho de
                hombros real (biacromial) es ≈22-25% -- muy por debajo del
                42% que tenía este maniquí (96u sobre ~229u de altura). Con
                el largo del torso ya corregido en la pasada anterior pero
                el ancho intacto, el torso había quedado MÁS ANCHO QUE ALTO
                (96 ancho / 80 alto) -- al revés de un torso real, que es
                20-35% más alto que ancho.
            4ta pasada: se escalan todas las coordenadas X del cuerpo
            (hombros/torso/brazos/piernas/pies/accesorios) un 65% respecto
            al centro (x=60) -- hombro nuevo ≈27% de la altura, todavía con
            algo de margen sobre el 22-25% real puro para que la prenda se
            siga leyendo a los ~180px que usa la app en pantalla chica, pero
            muy por debajo del 42% anterior. La relación hombro/cintura
            (71%, ya validada como la principal seña de género en una
            silueta sin cara) no se tocó -- el escalado es uniforme, así que
            esa proporción relativa queda igual, solo cambia la magnitud
            absoluta. Las referencias verticales (hombro=46, cadera=120 al
            50% de la altura, rodilla≈179, tobillo=224, muñeca=120) tampoco
            cambiaron -- ya estaban correctas. */}
        <ellipse cx="60" cy="20" rx="13" ry="15" fill={neutro} stroke={neutroStroke} />
        <path d="M54 33 L67 33 L65 46 L55 46 Z" fill={neutro} stroke={neutroStroke} />
        <path
          d="M31 46 Q33 59 35 70 Q38 89 40 100 L40 120 L80 120 L80 100 Q82 89 85 70 Q87 59 89 46 Q83 38 73 42 Q60 46 47 42 Q37 38 31 46 Z"
          fill={neutro}
          stroke={neutroStroke}
        />
        <path d="M31 48 Q26 49 26 57 L24 113 Q24 120 28 120 L32 120 Q34 120 33 113 L33 59 Q33 51 31 48 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M89 48 Q94 49 94 57 L96 113 Q96 120 92 120 L88 120 Q86 120 87 113 L87 59 Q87 51 89 48 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M40 120 L41 179 Q42 197 44 224 L54 224 Q55 197 57 179 L59 120 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M80 120 L79 179 Q78 197 76 224 L66 224 Q65 197 63 179 L61 120 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M44 224 Q42 232 48 234 L54 234 Q55 232 54 224 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M76 224 Q78 232 72 234 L66 234 Q65 232 66 224 Z" fill={neutro} stroke={neutroStroke} />

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
              d="M51 32 L60 42 L55 38 Z"
              fill={cuelloSecundario.color_hex}
              stroke={contornoHsl(cuelloSecundario.color_h, cuelloSecundario.color_s, cuelloSecundario.color_l)}
              {...strokeProps}
            />
            <path
              d="M69 32 L60 42 L65 38 Z"
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

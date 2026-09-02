import { useId } from "react";
import { hexToHsl, tonoTexturaHsl } from "../lib/color";
import type { Categoria, Textura } from "../lib/types";

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
export const TEXTURA_PATRON: Textura[] = ["denim", "pana", "corderoy", "tejido_grueso", "lana", "algodon", "lino", "acolchado"];
// poliéster (ropa deportiva técnica) suma el mismo brillo diagonal que
// seda/cuero_liso -- es tela lisa, sin trama visible, con un leve brillo
// sintético real (más notorio que en algodón/lino), no un patrón tejido.
// viscosa -- mismo criterio: fibra de caída lisa y suave, con el brillo
// sutil característico de la viscosa/rayón real (parecido al de la seda),
// no una trama tejida como la lana.
export const TEXTURA_BRILLO: Textura[] = ["seda", "cuero_liso", "poliester", "viscosa"];

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
  suelaContraste = false,
  posicionAccesorio = "cintura",
  requiereCuello = false,
}: {
  categoria: Categoria;
  color: string;
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
}) {
  const stroke = "rgba(0,0,0,0.15)";
  const soleClipId = useId();
  const patId = useId();
  const brilloId = useId();

  const conPatron = textura && TEXTURA_PATRON.includes(textura);
  const conBrillo = textura && TEXTURA_BRILLO.includes(textura);
  const patron = conPatron ? `url(#${patId})` : conBrillo ? `url(#${brilloId})` : undefined;
  // tono del patrón derivado del color REAL de la prenda (no del stroke fijo
  // de arriba) -- ver tonoTexturaHsl en color.ts: sobre una prenda oscura
  // (ej. sweater negro) un tono fijo semitransparente se funde con el
  // relleno y el patrón queda invisible, confirmado renderizando el ícono
  // real.
  const { h: tonoH, s: tonoS, l: tonoL } = hexToHsl(color);
  const tonoPatron = tonoTexturaHsl(tonoH, tonoS, tonoL);

  const defs = (conPatron || conBrillo) && (
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
    </defs>
  );

  let forma: React.ReactNode;

  switch (categoria) {
    case "remera":
      forma = <FormaConTextura d="M22 8 L32 14 L42 8 L54 16 L47 26 L42 22 L42 56 L22 56 L22 22 L17 26 L10 16 Z" fill={color} stroke={stroke} patron={patron} />;
      break;
    case "camisa":
      forma = (
        <>
          <FormaConTextura d="M24 6 L32 12 L40 6 L52 14 L46 24 L41 20 L41 56 L23 56 L23 20 L18 24 L12 14 Z" fill={color} stroke={stroke} patron={patron} />
          <line x1="32" y1="14" x2="32" y2="56" stroke={stroke} />
        </>
      );
      break;
    case "buzo":
      forma = (
        <>
          <FormaConTextura d="M20 10 Q32 2 44 10 L56 18 L49 28 L44 24 L44 58 L20 58 L20 24 L15 28 L8 18 Z" fill={color} stroke={stroke} patron={patron} />
          <path d="M26 10 Q32 16 38 10" fill="none" stroke={stroke} />
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
      forma = <FormaConTextura d="M18 6 H46 L44 58 H34 L32 24 L30 58 H20 Z" fill={color} stroke={stroke} patron={patron} />;
      break;
    case "bermuda":
      // mismo path que "pantalon" hasta la cadera (18-46 arriba, entrepierna
      // en 32,24) pero cortado a la altura de la rodilla (y=44 en vez de
      // y=58) en vez de llegar al tobillo -- ver Maniqui.tsx para el mismo
      // criterio aplicado a la silueta grande del maniquí.
      forma = <FormaConTextura d="M18 6 H46 L44 44 H34 L32 24 L30 44 H20 Z" fill={color} stroke={stroke} patron={patron} />;
      break;
    case "short_deportivo":
      // mismo criterio que "bermuda" pero más corto (y=34, medio muslo en
      // vez de rodilla) -- el short deportivo real termina bastante más
      // arriba que un bermuda de vestir/casual.
      forma = <FormaConTextura d="M18 6 H46 L44 34 H34 L32 24 L30 34 H20 Z" fill={color} stroke={stroke} patron={patron} />;
      break;
    case "calzado": {
      const d = "M8 44 Q8 36 18 34 L34 30 Q40 24 48 26 L52 34 Q58 36 58 44 Q58 50 52 50 L12 50 Q8 50 8 44 Z";
      if (!suelaContraste) {
        forma = <FormaConTextura d={d} fill={color} stroke={stroke} patron={patron} />;
      } else {
        // Suela de contraste: se recorta el mismo silueta con un clip
        // rectangular en la franja inferior -- así el borde de la suela
        // sigue exactamente el contorno real del zapato (que no es recto),
        // sin tener que dibujar a mano una segunda curva aproximada. La
        // suela (goma/EVA) no lleva el patrón de textura de la capellada
        // -- es otro material, no la misma tela.
        forma = (
          <>
            <FormaConTextura d={d} fill={color} stroke={stroke} patron={patron} />
            <clipPath id={soleClipId}>
              <rect x="0" y="45" width="64" height="6" />
            </clipPath>
            <path d={d} fill="#F2F0EA" clipPath={`url(#${soleClipId})`} />
          </>
        );
      }
      break;
    }
    case "campera":
      forma = (
        <>
          <FormaConTextura d="M24 6 L32 12 L40 6 L54 16 L47 27 L42 22 L42 58 L22 58 L22 22 L17 27 L10 16 Z" fill={color} stroke={stroke} patron={patron} />
          <line x1="32" y1="12" x2="32" y2="58" stroke={stroke} strokeDasharray="2 2" />
        </>
      );
      break;
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
  suelaContraste,
  posicionAccesorio,
  requiereCuello,
}: {
  categoria: Categoria;
  color: string;
  textura?: Textura;
  suelaContraste?: boolean;
  posicionAccesorio?: "cuello" | "cintura";
  requiereCuello?: boolean;
}) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <PrendaShape
        categoria={categoria}
        color={color}
        textura={textura}
        suelaContraste={suelaContraste}
        posicionAccesorio={posicionAccesorio}
        requiereCuello={requiereCuello}
      />
    </svg>
  );
}

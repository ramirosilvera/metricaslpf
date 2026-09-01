import { useId } from "react";
import type { Categoria } from "../lib/types";

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
  suelaContraste = false,
  posicionAccesorio = "cintura",
  requiereCuello = false,
}: {
  categoria: Categoria;
  color: string;
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

  switch (categoria) {
    case "remera":
      return (
        <path
          d="M22 8 L32 14 L42 8 L54 16 L47 26 L42 22 L42 56 L22 56 L22 22 L17 26 L10 16 Z"
          fill={color}
          stroke={stroke}
        />
      );
    case "camisa":
      return (
        <>
          <path
            d="M24 6 L32 12 L40 6 L52 14 L46 24 L41 20 L41 56 L23 56 L23 20 L18 24 L12 14 Z"
            fill={color}
            stroke={stroke}
          />
          <line x1="32" y1="14" x2="32" y2="56" stroke={stroke} />
        </>
      );
    case "buzo":
      return (
        <>
          <path
            d="M20 10 Q32 2 44 10 L56 18 L49 28 L44 24 L44 58 L20 58 L20 24 L15 28 L8 18 Z"
            fill={color}
            stroke={stroke}
          />
          <path d="M26 10 Q32 16 38 10" fill="none" stroke={stroke} />
        </>
      );
    case "sweater":
      return (
        <>
          <path
            d="M22 8 L32 13 L42 8 L53 17 L46 27 L42 23 L42 58 L22 58 L22 23 L18 27 L11 17 Z"
            fill={color}
            stroke={stroke}
          />
          <path d="M25 8 L32 12 L39 8" fill="none" stroke={stroke} />
        </>
      );
    case "pantalon":
      return <path d="M18 6 H46 L44 58 H34 L32 24 L30 58 H20 Z" fill={color} stroke={stroke} />;
    case "calzado": {
      const d = "M8 44 Q8 36 18 34 L34 30 Q40 24 48 26 L52 34 Q58 36 58 44 Q58 50 52 50 L12 50 Q8 50 8 44 Z";
      if (!suelaContraste) {
        return <path d={d} fill={color} stroke={stroke} />;
      }
      // Suela de contraste: se recorta el mismo silueta con un clip
      // rectangular en la franja inferior -- así el borde de la suela
      // sigue exactamente el contorno real del zapato (que no es recto),
      // sin tener que dibujar a mano una segunda curva aproximada.
      return (
        <>
          <path d={d} fill={color} stroke={stroke} />
          <clipPath id={soleClipId}>
            <rect x="0" y="45" width="64" height="6" />
          </clipPath>
          <path d={d} fill="#F2F0EA" clipPath={`url(#${soleClipId})`} />
        </>
      );
    }
    case "campera":
      return (
        <>
          <path
            d="M24 6 L32 12 L40 6 L54 16 L47 27 L42 22 L42 58 L22 58 L22 22 L17 27 L10 16 Z"
            fill={color}
            stroke={stroke}
          />
          <line x1="32" y1="12" x2="32" y2="58" stroke={stroke} strokeDasharray="2 2" />
        </>
      );
    case "accesorio":
    default: {
      if (posicionAccesorio !== "cuello") {
        // Cinturón: tira horizontal a la altura de la cintura, con hebilla.
        // Forma original, sin cambios -- sigue siendo la única lectura
        // correcta para un accesorio que se usa en la cintura.
        return (
          <>
            <rect x="8" y="27" width="48" height="10" rx="2" fill={color} stroke={stroke} />
            <rect x="26" y="24" width="12" height="16" rx="2" fill="none" stroke={stroke} strokeWidth="2" />
          </>
        );
      }
      if (requiereCuello) {
        // Corbata: nudo angosto arriba (a la altura del cuello) y una
        // franja que se ensancha y termina en punta -- la silueta clásica
        // de corbata, para no confundirla con la tira recta del cinturón.
        return (
          <>
            <path d="M27 6 L37 6 L34 16 L30 16 Z" fill={color} stroke={stroke} />
            <path d="M30 16 L34 16 L44 46 L32 58 L20 46 Z" fill={color} stroke={stroke} />
          </>
        );
      }
      // Bufanda: banda curva alrededor del cuello con dos puntas colgando
      // de distinto largo (como se drapea una bufanda real) -- distinta de
      // la punta única y angosta de la corbata.
      return (
        <>
          <path d="M20 10 Q32 2 44 10 Q40 16 32 16 Q24 16 20 10 Z" fill={color} stroke={stroke} />
          <rect x="22" y="14" width="8" height="40" rx="3" fill={color} stroke={stroke} />
          <rect x="34" y="14" width="8" height="30" rx="3" fill={color} stroke={stroke} />
        </>
      );
    }
  }
}

export default function PrendaIcon({
  categoria,
  color,
  suelaContraste,
  posicionAccesorio,
  requiereCuello,
}: {
  categoria: Categoria;
  color: string;
  suelaContraste?: boolean;
  posicionAccesorio?: "cuello" | "cintura";
  requiereCuello?: boolean;
}) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <PrendaShape
        categoria={categoria}
        color={color}
        suelaContraste={suelaContraste}
        posicionAccesorio={posicionAccesorio}
        requiereCuello={requiereCuello}
      />
    </svg>
  );
}

import type { Categoria } from "../lib/types";

/**
 * Silueta genérica por categoría, coloreada con el color_hex real de la
 * prenda -- misma técnica pensada para el mockup de outfit (bloques de
 * color con forma de prenda), reusada acá para las cards del catálogo.
 * Formas simplificadas a propósito (no son ilustraciones de moda, son
 * íconos reconocibles a primera vista).
 */
export default function PrendaIcon({ categoria, color }: { categoria: Categoria; color: string }) {
  const stroke = "rgba(0,0,0,0.15)";
  const common = { viewBox: "0 0 64 64", width: "100%", height: "100%" };

  switch (categoria) {
    case "remera":
      return (
        <svg {...common}>
          <path
            d="M22 8 L32 14 L42 8 L54 16 L47 26 L42 22 L42 56 L22 56 L22 22 L17 26 L10 16 Z"
            fill={color}
            stroke={stroke}
          />
        </svg>
      );
    case "camisa":
      return (
        <svg {...common}>
          <path
            d="M24 6 L32 12 L40 6 L52 14 L46 24 L41 20 L41 56 L23 56 L23 20 L18 24 L12 14 Z"
            fill={color}
            stroke={stroke}
          />
          <line x1="32" y1="14" x2="32" y2="56" stroke={stroke} />
        </svg>
      );
    case "buzo":
      return (
        <svg {...common}>
          <path
            d="M20 10 Q32 2 44 10 L56 18 L49 28 L44 24 L44 58 L20 58 L20 24 L15 28 L8 18 Z"
            fill={color}
            stroke={stroke}
          />
          <path d="M26 10 Q32 16 38 10" fill="none" stroke={stroke} />
        </svg>
      );
    case "sweater":
      return (
        <svg {...common}>
          <path
            d="M22 8 L32 13 L42 8 L53 17 L46 27 L42 23 L42 58 L22 58 L22 23 L18 27 L11 17 Z"
            fill={color}
            stroke={stroke}
          />
          <path d="M25 8 L32 12 L39 8" fill="none" stroke={stroke} />
        </svg>
      );
    case "pantalon":
      return (
        <svg {...common}>
          <path d="M18 6 H46 L44 58 H34 L32 24 L30 58 H20 Z" fill={color} stroke={stroke} />
        </svg>
      );
    case "calzado":
      return (
        <svg {...common}>
          <path
            d="M8 44 Q8 36 18 34 L34 30 Q40 24 48 26 L52 34 Q58 36 58 44 Q58 50 52 50 L12 50 Q8 50 8 44 Z"
            fill={color}
            stroke={stroke}
          />
        </svg>
      );
    case "campera":
      return (
        <svg {...common}>
          <path
            d="M24 6 L32 12 L40 6 L54 16 L47 27 L42 22 L42 58 L22 58 L22 22 L17 27 L10 16 Z"
            fill={color}
            stroke={stroke}
          />
          <line x1="32" y1="12" x2="32" y2="58" stroke={stroke} strokeDasharray="2 2" />
        </svg>
      );
    case "accesorio":
    default:
      return (
        <svg {...common}>
          <rect x="8" y="27" width="48" height="10" rx="2" fill={color} stroke={stroke} />
          <rect x="26" y="24" width="12" height="16" rx="2" fill="none" stroke={stroke} strokeWidth="2" />
        </svg>
      );
  }
}

import PrendaIcon, { PrendaShape } from "./PrendaIcon";
import type { Categoria, Prenda } from "../lib/types";

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

// transform (translate + scale-x + scale-y) para reposicionar cada silueta
// de 64x64 -- pensada en su tamaño/proporción propia de ícono cuadrado --
// sobre las cuatro zonas del cuerpo del maniquí (viewBox 120x250). La
// escala no es uniforme a propósito: un ícono de remera es casi cuadrado,
// pero el torso de una persona es angosto y alto, así que hay que estirar
// más en Y que en X para que cubra hombro-a-cintura sin quedar
// gigantesco de ancho. Ajustado a ojo con capturas reales, no calculado
// analíticamente: son ilustraciones, no un sistema de layout.
const TRANSFORM: Record<Capa, string> = {
  torso: "translate(1 8) scale(1.85 2)",
  piernas: "translate(14 109) scale(1.43 1.83)",
  pies: "translate(27 188) scale(1 0.85)",
  accesorio: "translate(27 85) scale(1.04 1.25)",
};

function agruparPorCapa(prendas: Prenda[]): { principal: Partial<Record<Capa, Prenda>>; extras: Prenda[] } {
  const porCapa: Record<Capa, Prenda[]> = { torso: [], piernas: [], pies: [], accesorio: [] };
  for (const p of prendas) porCapa[CAPA[p.categoria]].push(p);

  porCapa.torso.sort((a, b) => PRIORIDAD_TORSO.indexOf(a.categoria) - PRIORIDAD_TORSO.indexOf(b.categoria));

  const principal: Partial<Record<Capa, Prenda>> = {};
  const extras: Prenda[] = [];
  (Object.keys(porCapa) as Capa[]).forEach((capa) => {
    const [primera, ...resto] = porCapa[capa];
    if (primera) principal[capa] = primera;
    extras.push(...resto);
  });
  return { principal, extras };
}

/** Maniqui: representa un outfit como si estuviera puesto, no como una
 *  lista de íconos sueltos -- una silueta de maniquí neutra (sin cara, como
 *  un maniquí de sastrería real) con cada prenda posicionada en su lugar
 *  del cuerpo. */
export default function Maniqui({ prendas }: { prendas: Prenda[] }) {
  const { principal, extras } = agruparPorCapa(prendas);
  const neutro = "var(--border)";
  const neutroStroke = "rgba(33,26,21,0.18)";

  return (
    // aria-hidden en todo el bloque visual: es una representación decorativa
    // del outfit, no información nueva -- el detalle real (categoría +
    // nombre de color de cada prenda) ya se anuncia con la leyenda de texto
    // que Outfits.tsx renderiza debajo de este componente. Sin esto, un
    // lector de pantalla intenta describir <path> sueltos sin ningún label.
    <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
      <svg viewBox="0 0 120 250" width="100%" style={{ maxWidth: 160 }}>
        {/* forma neutra del maniquí -- queda visible donde no hay prenda
            cargada para esa zona (p.ej. un outfit sin calzado todavía
            muestra los "pies" del maniquí, no un hueco vacío). */}
        <ellipse cx="60" cy="16" rx="12" ry="14" fill={neutro} stroke={neutroStroke} />
        <path
          d="M32 26 Q60 34 88 26 L94 70 Q98 100 88 126 L32 126 Q22 100 26 70 Z"
          fill={neutro}
          stroke={neutroStroke}
        />
        <path d="M44 126 L40 208 Q40 214 46 214 L58 214 L60 126 Z" fill={neutro} stroke={neutroStroke} />
        <path d="M76 126 L80 208 Q80 214 74 214 L62 214 L60 126 Z" fill={neutro} stroke={neutroStroke} />

        {principal.torso && (
          <g transform={TRANSFORM.torso}>
            <PrendaShape categoria={principal.torso.categoria} color={principal.torso.color_hex} />
          </g>
        )}
        {principal.piernas && (
          <g transform={TRANSFORM.piernas}>
            <PrendaShape categoria={principal.piernas.categoria} color={principal.piernas.color_hex} />
          </g>
        )}
        {principal.accesorio && (
          <g transform={TRANSFORM.accesorio}>
            <PrendaShape categoria={principal.accesorio.categoria} color={principal.accesorio.color_hex} />
          </g>
        )}
        {principal.pies && (
          <g transform={TRANSFORM.pies}>
            <PrendaShape categoria={principal.pies.categoria} color={principal.pies.color_hex} />
          </g>
        )}
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

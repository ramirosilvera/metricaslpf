import type { HSL, NivelCompatibilidad, Prenda } from "./types";

// Umbrales calibrados en la revisión de Consejo (rondas 1-2). Nombrados y
// ajustables sin tocar la lógica del árbol.
const HUE_ANALOGO = 0.15; // ~27°
const HUE_MONOCROMATICO = 0.05; // ~9°
const HUE_COMPLEMENTARIO = 0.78; // ~140° (no 0.72/130°, que cae en zona triádica)
const VALUE_AUDAZ = 0.3;
const VALUE_MONOCROMATICO = 0.15;
const VALUE_FUNDIDO = 0.12;
const SATURACION_BAJA = 45;
// Banda de neutro ampliada (12/88, no 8/92): con un margen más chico, la
// misma prenda fotografiada dos veces con luz distinta podía cruzar el
// umbral y recibir veredictos opuestos entre una foto y otra.
const NEUTRO_L_MIN = 12;
const NEUTRO_L_MAX = 88;
const NEUTRO_S_MAX = 15;

export function hueDist(h0: number, h1: number): number {
  const diff = Math.abs(h0 - h1);
  return Math.min(diff, 360 - diff) / 180;
}

export function valueDist(l0: number, l1: number): number {
  return Math.abs(l0 - l1) / 100;
}

export function esNeutro(s: number, l: number): boolean {
  return s <= NEUTRO_S_MAX || l <= NEUTRO_L_MIN || l >= NEUTRO_L_MAX;
}

export interface ScoreColor {
  nivel: NivelCompatibilidad;
  tag?: "tono_sobre_tono" | "combinacion_audaz";
  explicacion: string;
}

/** Núcleo puro del motor: compara dos colores HSL y devuelve nivel + por qué. */
export function scoreColor(base: HSL, candidato: HSL): ScoreColor {
  const hd = hueDist(base.h, candidato.h);
  const vd = valueDist(base.l, candidato.l);
  const baseNeutro = esNeutro(base.s, base.l);
  const candNeutro = esNeutro(candidato.s, candidato.l);

  // 1. Neutro de por medio.
  if (baseNeutro || candNeutro) {
    return {
      nivel: "excelente",
      explicacion: "El neutro no compite con ningún color: combina con lo que sea.",
    };
  }

  // 2. Análogo + saturación baja.
  if (hd <= HUE_ANALOGO && Math.max(base.s, candidato.s) <= SATURACION_BAJA) {
    return {
      nivel: "excelente",
      explicacion: "Matices cercanos y tonos suaves: combinación segura.",
    };
  }

  // 3. Monocromático / tono sobre tono.
  if (hd <= HUE_MONOCROMATICO && vd <= VALUE_MONOCROMATICO) {
    return {
      nivel: "excelente",
      tag: "tono_sobre_tono",
      explicacion: "Es básicamente el mismo color repetido: combinación seguísima.",
    };
  }

  // 4. Complementario audaz.
  if (hd >= HUE_COMPLEMENTARIO && vd >= VALUE_AUDAZ) {
    return {
      nivel: "muy_bueno",
      tag: "combinacion_audaz",
      explicacion:
        "Colores opuestos en el círculo cromático con buen contraste de luminosidad: funciona, pero se nota.",
    };
  }

  // 5. Se funden.
  if (vd < VALUE_FUNDIDO && !baseNeutro && !candNeutro && hd > HUE_ANALOGO) {
    return {
      nivel: "con_cuidado",
      explicacion: "Estos dos se funden en una sola mancha a distancia.",
    };
  }

  // 6. Resto.
  return {
    nivel: "muy_bueno",
    explicacion:
      hd < 0.5
        ? "Matices relacionados, buen equilibrio general."
        : "Contraste moderado, combinación prolija.",
  };
}

const FAMILIA_TEXTURA: Record<string, "liso" | "texturado"> = {
  algodon: "liso",
  seda: "liso",
  cuero_liso: "liso",
  lino: "liso",
  lana: "texturado",
  pana: "texturado",
  corderoy: "texturado",
  tejido_grueso: "texturado",
};

/**
 * Técnica de rescate para un match "con_cuidado". Orden: puente neutro (si
 * hay un neutro disponible en el placard) -> separar por textura (si ambas
 * prendas tienen textura conocida y son de familias distintas) -> repetir
 * color (catch-all, siempre disponible, va al final).
 */
export function tecnicaRescate(
  base: Prenda,
  candidato: Prenda,
  placard: Prenda[],
): string {
  const neutroDisponible = placard.find(
    (p) =>
      p.id !== base.id &&
      p.id !== candidato.id &&
      p.categoria !== base.categoria &&
      p.categoria !== candidato.categoria &&
      esNeutro(p.color_s, p.color_l),
  );
  if (neutroDisponible) {
    return `Sumá tu ${neutroDisponible.categoria} ${neutroDisponible.color_hex} entre las dos para separarlas.`;
  }

  if (base.textura && candidato.textura) {
    const famBase = FAMILIA_TEXTURA[base.textura];
    const famCand = FAMILIA_TEXTURA[candidato.textura];
    if (famBase && famCand && famBase !== famCand) {
      return "Si son de texturas bien distintas, el contraste de textura compensa el de color.";
    }
  }

  return "Repetí uno de los dos colores en un accesorio (cinturón, medias, gorra) para que se lea intencional.";
}

/** Recomienda, sobre un placard completo, las mejores prendas para combinar con `base`. */
export function recomendar(
  base: Prenda,
  candidatas: Prenda[],
  placard: Prenda[],
): Array<{ prenda: Prenda; score: ScoreColor; tecnicaRescate?: string }> {
  return candidatas
    .filter((c) => c.id !== base.id)
    .map((c) => {
      const score = scoreColor(
        { h: base.color_h, s: base.color_s, l: base.color_l },
        { h: c.color_h, s: c.color_s, l: c.color_l },
      );
      return {
        prenda: c,
        score,
        tecnicaRescate: score.nivel === "con_cuidado" ? tecnicaRescate(base, c, placard) : undefined,
      };
    })
    .sort((a, b) => nivelOrden(b.score.nivel) - nivelOrden(a.score.nivel));
}

function nivelOrden(nivel: NivelCompatibilidad): number {
  return { excelente: 2, muy_bueno: 1, con_cuidado: 0 }[nivel];
}

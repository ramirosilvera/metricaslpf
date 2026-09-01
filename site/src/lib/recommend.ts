import type { Categoria, HSL, NivelCompatibilidad, Prenda } from "./types";
import { CATALOGO_CON_HSL, type PresetPrenda } from "./catalogo";

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

const CATEGORIAS_CUERO: Categoria[] = ["calzado", "accesorio"];

/** Cuero negro + cuero de otro color (marrón, tostado...) en cinturón o
 *  calzado: por convención clásica de vestimenta el cuero se coordina
 *  aparte del resto de la ropa -- cinturón a tono con el calzado, sea cual
 *  sea el color -- a diferencia de una remera o un pantalón, donde el
 *  negro sí es un neutro que combina con cualquier cosa. scoreColor no lo
 *  puede saber por sí solo (solo ve HSL, no categoría ni material), así
 *  que se corrige acá, con el Prenda completo disponible. Reportado por el
 *  usuario con un caso real: la app recomendaba "excelente" para cinturón
 *  negro + zapatos de cuero marrones -- negro es neutro en HSL (s=0), pero
 *  en cuero esa regla general no aplica. */
function esDescoordinacionDeCuero(base: Prenda, candidato: Prenda): boolean {
  if (base.textura !== "cuero_liso" || candidato.textura !== "cuero_liso") return false;
  if (!CATEGORIAS_CUERO.includes(base.categoria) || !CATEGORIAS_CUERO.includes(candidato.categoria)) return false;
  // uno acromático (negro, típicamente) y el otro con un matiz real
  // (marrón, tostado...) -- si ambos son acromáticos (negro con negro) o
  // ambos tienen matiz (que en este catálogo siempre es el mismo marrón
  // reusado entre cinturón y zapato), sí combinan.
  return esNeutro(base.color_s, base.color_l) !== esNeutro(candidato.color_s, candidato.color_l);
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
      const cueroDescoordinado = esDescoordinacionDeCuero(base, c);
      const score: ScoreColor = cueroDescoordinado
        ? {
            nivel: "con_cuidado",
            explicacion:
              "El cuero se coordina aparte del resto de la ropa: negro con negro, marrón con marrón. Acá el cinturón y el calzado son de cuero de tonos distintos -- no combina, aunque el negro sea neutro para todo lo demás.",
          }
        : scoreColor(
            { h: base.color_h, s: base.color_s, l: base.color_l },
            { h: c.color_h, s: c.color_s, l: c.color_l },
          );
      return {
        prenda: c,
        score,
        tecnicaRescate:
          score.nivel !== "con_cuidado"
            ? undefined
            : cueroDescoordinado
              ? "Usá cinturón y calzado del mismo tono de cuero -- los dos marrones o los dos negros."
              : tecnicaRescate(base, c, placard),
      };
    })
    .sort((a, b) => nivelOrden(b.score.nivel) - nivelOrden(a.score.nivel));
}

function nivelOrden(nivel: NivelCompatibilidad): number {
  return { excelente: 2, muy_bueno: 1, con_cuidado: 0 }[nivel];
}

// duplicado a propósito de CAPA en Maniqui.tsx -- esa es la agrupación
// "de presentación" (cómo se dibuja); esta es la agrupación "de datos"
// (qué categorías compiten por el mismo lugar del outfit). Mismo criterio
// que color.ts ya documenta para NEUTRO_*: evitar una dependencia cruzada
// entre capas por repetir 5 strings.
const CATEGORIAS_TORSO: Categoria[] = ["remera", "camisa", "buzo", "sweater", "campera"];
const TODAS_LAS_CATEGORIAS: Categoria[] = [
  "remera",
  "camisa",
  "buzo",
  "sweater",
  "campera",
  "pantalon",
  "calzado",
  "accesorio",
];

/** Tanda de `cantidad` elementos de un pool arrancando en `offset`, dando la
 *  vuelta al llegar al final -- para que un botón de "otras opciones" en la
 *  UI nunca choque contra un límite mientras el pool no esté vacío. Un pool
 *  más chico que `cantidad` se muestra entero. Genérico y puro a propósito:
 *  lo usa Outfits.tsx para rotar tanto por armarOutfitsSugeridos como por
 *  armarOutfitsParaComprar sin duplicar la lógica de módulo. */
export function tanda<T>(pool: T[], offset: number, cantidad: number): T[] {
  if (pool.length === 0) return [];
  const vista: T[] = [];
  for (let i = 0; i < Math.min(cantidad, pool.length); i++) {
    vista.push(pool[(offset + i) % pool.length]);
  }
  return vista;
}

export interface OutfitSugerido {
  /** estable por composición: mismo set de prendas -> mismo id, para
   *  deduplicar contra outfits ya guardados y para key en React. */
  id: string;
  prendas: Prenda[];
}

function mejorPropia(
  ancla: Prenda,
  candidatas: Prenda[],
  placard: Prenda[],
): { prenda: Prenda; score: ScoreColor } | undefined {
  const [mejor] = recomendar(ancla, candidatas, placard);
  return mejor && mejor.score.nivel !== "con_cuidado" ? mejor : undefined;
}

/** Todas las candidatas propias que combinan al menos "muy_bueno" con el
 *  ancla, mejor primero -- a diferencia de `mejorPropia`, no se queda solo
 *  con la primera: es la base para ofrecer variantes ("otras opciones") en
 *  vez de una única combinación fija. */
function candidatasPropias(
  ancla: Prenda,
  candidatas: Prenda[],
  placard: Prenda[],
): Array<{ prenda: Prenda; score: ScoreColor }> {
  return recomendar(ancla, candidatas, placard).filter((r) => r.score.nivel !== "con_cuidado");
}

/** Arma outfits completos automáticamente a partir del placard real, sin
 *  que el usuario elija nada -- un outfit por cada pantalón (es la
 *  categoría que conecta con todas las demás en CATEGORIAS_COMPLEMENTARIAS,
 *  el ancla natural) y por cada torso propio que combine al menos
 *  "muy_bueno" con ese pantalón -- nunca fuerza un "con cuidado". Varía el
 *  torso (no calzado/accesorio) porque es la prenda que más define la
 *  identidad visual de un outfit en el maniquí; esto es lo que le da al
 *  usuario "otras opciones" para ir rotando en vez de una sola combinación
 *  fija por pantalón. Devuelve el pool completo, mejor primero por ancla --
 *  la UI decide cuántas mostrar de una vez. */
export function armarOutfitsSugeridos(placard: Prenda[]): OutfitSugerido[] {
  const pantalones = placard.filter((p) => p.categoria === "pantalon");
  const resultados: OutfitSugerido[] = [];
  const vistos = new Set<string>();

  for (const ancla of pantalones) {
    const torsos = candidatasPropias(
      ancla,
      placard.filter((p) => CATEGORIAS_TORSO.includes(p.categoria)),
      placard,
    );
    const calzado = mejorPropia(
      ancla,
      placard.filter((p) => p.categoria === "calzado"),
      placard,
    );
    const accesorio = mejorPropia(
      ancla,
      placard.filter((p) => p.categoria === "accesorio"),
      placard,
    );

    for (const torso of torsos) {
      const prendas = [ancla, torso.prenda, calzado?.prenda, accesorio?.prenda].filter(
        (p): p is Prenda => p !== undefined,
      );

      const clave = [...prendas]
        .map((p) => p.id)
        .sort()
        .join("-");
      if (vistos.has(clave)) continue;
      vistos.add(clave);

      resultados.push({ id: clave, prendas });
    }
  }

  return resultados;
}

export interface OutfitParaComprar {
  id: string;
  /** prendas reales del placard que forman parte del outfit. */
  prendasPropias: Prenda[];
  /** la prenda del catálogo que no tiene y se sugiere comprar -- con hsl
   *  incluido (no solo PresetPrenda) para que quien la use después (p.ej.
   *  presetAPrendaSintetica en catalogo.ts) no tenga que recalcularlo. */
  sugerida: PresetPrenda & { hsl: HSL };
  categoriaSugerida: Categoria;
}

/** Categorías del placard que hoy están en cero -- sin ninguna prenda ahí,
 *  el usuario literalmente no puede armar nada que las use. */
export function categoriasAusentes(placard: Prenda[]): Categoria[] {
  const presentes = new Set(placard.map((p) => p.categoria));
  return TODAS_LAS_CATEGORIAS.filter((c) => !presentes.has(c));
}

/** Para cada pantalón y cada categoría ausente del placard, busca en el
 *  catálogo TODAS las prendas de esa categoría que combinan al menos
 *  "muy_bueno" con ese pantalón (mismo motor de color que el resto de la
 *  app, no una sugerencia inventada) -- una variante por cada una, mejor
 *  primero -- y arma el outfit resultante combinando cada prenda sugerida
 *  con lo mejor que el usuario YA tiene para los demás lugares. No se
 *  ofrece comprar algo que no va a combinar bien. Devuelve el pool
 *  completo; la UI decide cuántas mostrar de una vez. */
export function armarOutfitsParaComprar(
  placard: Prenda[],
  catalogo: (PresetPrenda & { hsl: HSL })[] = CATALOGO_CON_HSL,
): OutfitParaComprar[] {
  const pantalones = placard.filter((p) => p.categoria === "pantalon");
  const ausentes = categoriasAusentes(placard);
  const resultados: OutfitParaComprar[] = [];

  for (const ancla of pantalones) {
    // no depende de categoriaSugerida -- se calcula una sola vez por ancla.
    const torsoPropio = mejorPropia(
      ancla,
      placard.filter((p) => CATEGORIAS_TORSO.includes(p.categoria)),
      placard,
    );

    for (const categoriaSugerida of ausentes) {
      if (categoriaSugerida === "pantalon") continue; // el ancla ya es un pantalón

      const candidatosCatalogo = catalogo.filter((p) => p.categoria === categoriaSugerida);
      if (candidatosCatalogo.length === 0) continue;

      const anclaHsl: HSL = { h: ancla.color_h, s: ancla.color_s, l: ancla.color_l };
      const sugeridosCandidatos = candidatosCatalogo
        .map((preset) => ({ preset, score: scoreColor(anclaHsl, preset.hsl) }))
        .filter((c) => c.score.nivel !== "con_cuidado")
        .sort((a, b) => nivelOrden(b.score.nivel) - nivelOrden(a.score.nivel));
      if (sugeridosCandidatos.length === 0) continue;

      // "ausente" es por categoría puntual, no por grupo -- si falta
      // "campera" el usuario puede perfectamente tener una remera o un
      // sweater que ya combinan bien. Para una sugerencia de torso se
      // arma CON esa prenda propia de por medio (la campera sugerida se ve
      // como una capa extra encima, no como reemplazo -- Maniqui ya sabe
      // priorizar cuál mostrar como principal según PRIORIDAD_TORSO). Para
      // calzado/accesorio no hay ambigüedad: si esa categoría está
      // ausente, no hay nada propio con qué competir por ese lugar.
      const calzadoPropio =
        categoriaSugerida === "calzado"
          ? undefined
          : mejorPropia(
              ancla,
              placard.filter((p) => p.categoria === "calzado"),
              placard,
            );
      const accesorioPropio =
        categoriaSugerida === "accesorio"
          ? undefined
          : mejorPropia(
              ancla,
              placard.filter((p) => p.categoria === "accesorio"),
              placard,
            );

      const prendasPropias = [ancla, torsoPropio?.prenda, calzadoPropio?.prenda, accesorioPropio?.prenda].filter(
        (p): p is Prenda => p !== undefined,
      );

      for (const candidato of sugeridosCandidatos) {
        resultados.push({
          id: `comprar-${ancla.id}-${candidato.preset.id}`,
          prendasPropias,
          sugerida: candidato.preset,
          categoriaSugerida,
        });
      }
    }
  }

  return resultados;
}

/** Diff entre las prendas actuales de un outfit guardado y las que el
 *  usuario dejó tildadas al editarlo -- qué hay que agregar y qué hay que
 *  sacar en la base. Función pura a propósito: quien la llama (Outfits.tsx)
 *  debe hacer el INSERT de `aAgregar` ANTES del DELETE de `aQuitar`, nunca
 *  al revés. Motivo real, no defensivo: si el usuario reemplaza TODAS las
 *  prendas del outfit por otras completamente distintas, `aQuitar` termina
 *  siendo igual a `actuales` -- borrar primero dejaría outfit_prendas en
 *  cero para ese outfit, y el trigger de la migración 0011 borra la fila de
 *  `outfits` apenas se queda sin prendas. El insert posterior fallaría por
 *  FK inexistente. Insertando primero, siempre queda al menos una fila viva. */
export function diffPrendasEdicion(
  actuales: Set<string>,
  deseadas: Set<string>,
): { aAgregar: string[]; aQuitar: string[] } {
  return {
    aAgregar: [...deseadas].filter((id) => !actuales.has(id)),
    aQuitar: [...actuales].filter((id) => !deseadas.has(id)),
  };
}

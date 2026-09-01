import { describe, expect, it } from "vitest";
import {
  armarOutfitsParaComprar,
  armarOutfitsSugeridos,
  categoriasAusentes,
  diffPrendasEdicion,
  esNeutro,
  hueDist,
  scoreColor,
  tanda,
  tecnicaRescate,
  valueDist,
} from "./recommend";
import { hexToHsl, hslToHex, rgbToHsl } from "./color";
import type { HSL, Prenda } from "./types";
import type { PresetPrenda } from "./catalogo";

describe("hueDist", () => {
  it("distancia circular correcta cruzando el 0°", () => {
    // h0=350, h1=10 -> distancia real 20°, no 340°.
    expect(hueDist(350, 10)).toBeCloseTo(20 / 180, 5);
  });

  it("0 para el mismo matiz", () => {
    expect(hueDist(120, 120)).toBe(0);
  });

  it("máximo (1) para matices opuestos", () => {
    expect(hueDist(0, 180)).toBe(1);
  });
});

describe("valueDist", () => {
  it("distancia lineal simple", () => {
    expect(valueDist(20, 50)).toBeCloseTo(0.3, 5);
  });
});

describe("esNeutro", () => {
  it("gris por saturación baja", () => {
    expect(esNeutro(10, 50)).toBe(true);
  });
  it("casi negro por luminosidad baja", () => {
    expect(esNeutro(80, 10)).toBe(true);
  });
  it("casi blanco por luminosidad alta", () => {
    expect(esNeutro(80, 90)).toBe(true);
  });
  it("color saturado de luminosidad media no es neutro", () => {
    expect(esNeutro(80, 50)).toBe(false);
  });
});

describe("scoreColor", () => {
  it("neutro de por medio -> excelente", () => {
    const r = scoreColor({ h: 0, s: 5, l: 50 }, { h: 200, s: 80, l: 50 });
    expect(r.nivel).toBe("excelente");
  });

  it("análogo + saturación baja -> excelente", () => {
    const r = scoreColor({ h: 200, s: 30, l: 50 }, { h: 210, s: 35, l: 55 });
    expect(r.nivel).toBe("excelente");
  });

  it("monocromático (mismo matiz, saturación alta) -> excelente, tag tono sobre tono", () => {
    const r = scoreColor({ h: 0, s: 80, l: 50 }, { h: 2, s: 80, l: 51 });
    expect(r.nivel).toBe("excelente");
    expect(r.tag).toBe("tono_sobre_tono");
  });

  it("complementario con buen contraste -> muy bueno, tag audaz", () => {
    const r = scoreColor({ h: 20, s: 70, l: 45 }, { h: 190, s: 70, l: 80 });
    expect(r.nivel).toBe("muy_bueno");
    expect(r.tag).toBe("combinacion_audaz");
  });

  it("dos oscuros de distinto matiz se funden igual (no solo mismo matiz)", () => {
    // rojo casi-negro vs azul casi-negro, matices opuestos, luminosidad casi igual.
    const r = scoreColor({ h: 0, s: 90, l: 20 }, { h: 240, s: 60, l: 24 });
    expect(r.nivel).toBe("con_cuidado");
  });

  it("banda de neutro ampliada evita el salto de tier por ruido de foto (l=12 vs l=13)", () => {
    const base = { h: 0, s: 90, l: 12 };
    const candidato = { h: 280, s: 60, l: 20 };
    expect(scoreColor(base, candidato).nivel).toBe("excelente"); // l=12 -> neutro
  });

  it("saturación alta + valor casi idéntico, matices distintos -> se funden", () => {
    const r = scoreColor({ h: 0, s: 80, l: 50 }, { h: 100, s: 70, l: 54 });
    expect(r.nivel).toBe("con_cuidado");
  });
});

describe("tecnicaRescate", () => {
  const base: Prenda = mkPrenda("pantalon", "#000000", 0, 80, 50);
  const candidato: Prenda = mkPrenda("remera", "#111111", 100, 70, 54);

  it("sugiere puente neutro si hay un neutro disponible en el placard", () => {
    const neutro = mkPrenda("campera", "#808080", 0, 5, 50);
    const t = tecnicaRescate(base, candidato, [base, candidato, neutro]);
    expect(t).toContain("campera");
  });

  it("sugiere separar por textura si no hay neutro pero las texturas difieren", () => {
    const b = { ...base, textura: "algodon" as const };
    const c = { ...candidato, textura: "lana" as const };
    const t = tecnicaRescate(b, c, [b, c]);
    expect(t).toContain("textura");
  });

  it("cae en repetir color como catch-all cuando nada más aplica", () => {
    const t = tecnicaRescate(base, candidato, [base, candidato]);
    expect(t).toContain("accesorio");
  });
});

describe("color hex <-> HSL roundtrip", () => {
  it("hexToHsl / hslToHex son consistentes", () => {
    const hsl = hexToHsl("#3366CC");
    const hex = hslToHex(hsl.h, hsl.s, hsl.l);
    // margen de redondeo por conversión float, no exacto al pixel
    const back = hexToHsl(hex);
    expect(Math.abs(back.h - hsl.h)).toBeLessThanOrEqual(2);
  });

  it("rgbToHsl de blanco puro da l=100, s=0", () => {
    const hsl = rgbToHsl(255, 255, 255);
    expect(hsl.l).toBe(100);
    expect(hsl.s).toBe(0);
  });

  it("rgbToHsl nunca devuelve h=360 (violaría el CHECK color_h < 360 del schema)", () => {
    // Rojos cuyo hue crudo redondea a 360 antes del %360 -- encontrados por
    // la revisión de Consejo, no un caso de laboratorio: se disparan con
    // fotos reales de remeras/prendas rojas.
    const rojosLimite = [
      [255, 0, 2],
      [255, 0, 1],
      [192, 0, 1],
      [139, 0, 1],
    ];
    for (const [r, g, b] of rojosLimite) {
      const hsl = rgbToHsl(r, g, b);
      expect(hsl.h).toBeGreaterThanOrEqual(0);
      expect(hsl.h).toBeLessThan(360);
    }
  });
});

describe("categoriasAusentes", () => {
  it("devuelve las categorías sin ninguna prenda en el placard", () => {
    const placard = [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10), mkPrenda("remera", "#F5F5F0", 60, 5, 95)];
    const ausentes = categoriasAusentes(placard);
    expect(ausentes).toContain("camisa");
    expect(ausentes).toContain("campera");
    expect(ausentes).toContain("buzo");
    expect(ausentes).toContain("sweater");
    expect(ausentes).toContain("calzado");
    expect(ausentes).toContain("accesorio");
    expect(ausentes).not.toContain("pantalon");
    expect(ausentes).not.toContain("remera");
  });

  it("placard vacío: todas las categorías están ausentes", () => {
    expect(categoriasAusentes([])).toHaveLength(8);
  });
});

describe("armarOutfitsSugeridos", () => {
  it("arma un outfit por pantalón, tomando la mejor prenda propia por lugar", () => {
    const placard = [
      mkPrenda("pantalon", "#1A1A1A", 0, 0, 10), // negro, neutro
      mkPrenda("remera", "#3366CC", 220, 60, 50), // combina excelente con un neutro
      mkPrenda("calzado", "#5C3A21", 25, 50, 30),
      mkPrenda("accesorio", "#C8763F", 25, 60, 45),
    ];
    const outfits = armarOutfitsSugeridos(placard);
    expect(outfits).toHaveLength(1);
    expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(
      ["accesorio", "calzado", "pantalon", "remera"].sort(),
    );
  });

  it("sin pantalón en el placard, no arma nada (no hay ancla)", () => {
    const placard = [mkPrenda("remera", "#3366CC", 220, 60, 50), mkPrenda("calzado", "#5C3A21", 25, 50, 30)];
    expect(armarOutfitsSugeridos(placard)).toHaveLength(0);
  });

  it("sin ninguna prenda de torso que combine, no arma outfit para ese pantalón (nunca fuerza un 'con cuidado')", () => {
    // rojo saturado vs verde saturado, misma luminosidad -- se funden (con_cuidado).
    const placard = [mkPrenda("pantalon", "#CC3333", 0, 60, 50), mkPrenda("remera", "#33CC33", 120, 60, 52)];
    expect(armarOutfitsSugeridos(placard)).toHaveLength(0);
  });

  it("calzado/accesorio son opcionales -- un outfit válido puede tener solo pantalón + torso", () => {
    const placard = [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10), mkPrenda("remera", "#3366CC", 220, 60, 50)];
    const outfits = armarOutfitsSugeridos(placard);
    expect(outfits).toHaveLength(1);
    expect(outfits[0].prendas).toHaveLength(2);
  });

  it("con varios torsos propios que combinan, arma una variante por cada uno (pool para 'otras opciones')", () => {
    const placard = [
      mkPrenda("pantalon", "#1A1A1A", 0, 0, 10), // negro, neutro -- combina con cualquier torso
      mkPrenda("remera", "#3366CC", 220, 60, 50),
      mkPrenda("camisa", "#F5F5F0", 0, 5, 95),
      mkPrenda("sweater", "#6B2737", 350, 55, 35),
    ];
    const outfits = armarOutfitsSugeridos(placard);
    expect(outfits).toHaveLength(3);
    const torsos = outfits.map((o) => o.prendas.find((p) => p.categoria !== "pantalon")?.categoria).sort();
    expect(torsos).toEqual(["camisa", "remera", "sweater"]);
  });
});

describe("armarOutfitsParaComprar", () => {
  const catalogoDePrueba: (PresetPrenda & { hsl: HSL })[] = [
    {
      id: "campera-test-negra",
      nombre: "Campera de prueba negra",
      categoria: "campera",
      colorHex: "#1A1A1A",
      hsl: { h: 0, s: 0, l: 10 },
    },
  ];

  it("sugiere comprar una prenda solo de una categoría ausente en el placard", () => {
    // el placard ya tiene remera Y campera -- "campera" no está ausente,
    // así que no debería aparecer ninguna sugerencia para esa categoría.
    const placard = [
      mkPrenda("pantalon", "#1A1A1A", 0, 0, 10),
      mkPrenda("remera", "#3366CC", 220, 60, 50),
      mkPrenda("campera", "#232323", 0, 0, 15),
    ];
    const sugerencias = armarOutfitsParaComprar(placard, catalogoDePrueba);
    expect(sugerencias.filter((s) => s.categoriaSugerida === "campera")).toHaveLength(0);
  });

  it("sugiere comprar cuando la categoría está ausente y combina bien con el pantalón", () => {
    const placard = [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10), mkPrenda("remera", "#3366CC", 220, 60, 50)];
    const sugerencias = armarOutfitsParaComprar(placard, catalogoDePrueba);
    expect(sugerencias).toHaveLength(1);
    expect(sugerencias[0].categoriaSugerida).toBe("campera");
    expect(sugerencias[0].sugerida.id).toBe("campera-test-negra");
    // la remera propia sigue en el outfit -- la campera sugerida es una
    // capa extra, no un reemplazo.
    expect(sugerencias[0].prendasPropias.some((p) => p.categoria === "remera")).toBe(true);
  });

  it("no sugiere nada si la única opción del catálogo para esa categoría no combina bien", () => {
    // rojo saturado (pantalón) vs verde saturado (campera del catálogo de
    // prueba) -- se funden, no se sugiere.
    const placard = [mkPrenda("pantalon", "#CC3333", 0, 60, 50)];
    const catalogoQueNoCombina: (PresetPrenda & { hsl: HSL })[] = [
      { id: "campera-verde", nombre: "Campera verde", categoria: "campera", colorHex: "#33CC33", hsl: { h: 120, s: 60, l: 52 } },
    ];
    expect(armarOutfitsParaComprar(placard, catalogoQueNoCombina)).toHaveLength(0);
  });

  it("con varias prendas del catálogo que combinan, arma una variante por cada una (pool para 'otras opciones')", () => {
    const placard = [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10)]; // negro, neutro -- combina con cualquiera
    const catalogoConVarias: (PresetPrenda & { hsl: HSL })[] = [
      { id: "campera-pluma-negra", nombre: "Campera de pluma negra", categoria: "campera", colorHex: "#1A1A1A", hsl: { h: 0, s: 0, l: 10 } },
      { id: "campera-pluma-azul", nombre: "Campera de pluma azul marino", categoria: "campera", colorHex: "#1F2A44", hsl: { h: 224, s: 38, l: 20 } },
      { id: "campera-pluma-beige", nombre: "Campera de pluma beige", categoria: "campera", colorHex: "#D8C7A1", hsl: { h: 39, s: 40, l: 76 } },
    ];
    const sugerencias = armarOutfitsParaComprar(placard, catalogoConVarias);
    expect(sugerencias).toHaveLength(3);
    expect(sugerencias.map((s) => s.sugerida.id).sort()).toEqual(
      ["campera-pluma-azul", "campera-pluma-beige", "campera-pluma-negra"].sort(),
    );
  });
});

describe("tanda", () => {
  it("pool vacío -> tanda vacía", () => {
    expect(tanda([1, 2, 3], 0, 0)).toEqual([]);
    expect(tanda([], 0, 2)).toEqual([]);
  });

  it("pool más chico que la cantidad pedida -> se muestra entero, sin repetir", () => {
    expect(tanda(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });

  it("offset dentro de rango -> tanda consecutiva desde ahí", () => {
    expect(tanda([1, 2, 3, 4, 5], 1, 2)).toEqual([2, 3]);
  });

  it("da la vuelta al pasarse del final (para que 'otras opciones' nunca se quede sin nada)", () => {
    expect(tanda([1, 2, 3, 4, 5], 4, 2)).toEqual([5, 1]);
  });

  it("offset mayor al tamaño del pool (p.ej. el pool se achicó tras guardar un outfit) no rompe -- sigue dando la vuelta", () => {
    expect(tanda([1, 2, 3], 10, 2)).toEqual([2, 3]);
  });
});

describe("diffPrendasEdicion", () => {
  it("sin cambios -> nada para agregar ni quitar", () => {
    const actuales = new Set(["a", "b"]);
    expect(diffPrendasEdicion(actuales, new Set(["a", "b"]))).toEqual({ aAgregar: [], aQuitar: [] });
  });

  it("solo agrega una prenda nueva, conserva las que ya estaban", () => {
    const actuales = new Set(["a", "b"]);
    const r = diffPrendasEdicion(actuales, new Set(["a", "b", "c"]));
    expect(r.aAgregar).toEqual(["c"]);
    expect(r.aQuitar).toEqual([]);
  });

  it("solo saca una prenda, conserva el resto", () => {
    const actuales = new Set(["a", "b"]);
    const r = diffPrendasEdicion(actuales, new Set(["a"]));
    expect(r.aAgregar).toEqual([]);
    expect(r.aQuitar).toEqual(["b"]);
  });

  it("reemplaza TODAS las prendas por otras completamente distintas -- el caso que obliga a insertar antes de borrar (ver comentario en recommend.ts)", () => {
    const actuales = new Set(["a", "b"]);
    const r = diffPrendasEdicion(actuales, new Set(["c", "d"]));
    expect(r.aAgregar.sort()).toEqual(["c", "d"]);
    expect(r.aQuitar.sort()).toEqual(["a", "b"]);
  });
});

function mkPrenda(
  categoria: Prenda["categoria"],
  hex: string,
  h: number,
  s: number,
  l: number,
): Prenda {
  return {
    id: hex + categoria,
    user_id: "u1",
    categoria,
    color_hex: hex,
    color_h: h,
    color_s: s,
    color_l: l,
    textura: null,
    estilo: null,
    ocasion: null,
    estacion: null,
    foto_path: null,
    suela_contraste: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

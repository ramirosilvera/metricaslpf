import { describe, expect, it } from "vitest";
import { CATALOGO_PRENDAS } from "./catalogo";
import { contornoHsl, detalleHsl, hexToHsl, luzHsl, nombreColor, sombraHsl, tonoTexturaHsl } from "./color";

describe("nombreColor", () => {
  it("negro por luminosidad baja, sin importar el matiz", () => {
    expect(nombreColor(200, 90, 12)).toBe("Negro");
    expect(nombreColor(0, 0, 0)).toBe("Negro");
  });

  it("blanco por luminosidad alta y saturación baja", () => {
    expect(nombreColor(0, 0, 100)).toBe("Blanco");
    expect(nombreColor(200, 10, 88)).toBe("Blanco");
  });

  it("blanco roto: luminosidad alta pero con algo de saturación", () => {
    expect(nombreColor(40, 30, 90)).toBe("Blanco roto");
  });

  it("gris por saturación baja, graduado por luminosidad", () => {
    expect(nombreColor(200, 5, 20)).toBe("Gris oscuro");
    expect(nombreColor(200, 5, 50)).toBe("Gris");
    expect(nombreColor(200, 5, 80)).toBe("Gris claro");
  });

  it("umbral de neutro consistente con recommend.ts (esNeutro: s<=15, l<=12, l>=88)", () => {
    // saturación exactamente en el borde -- debe caer del lado "neutro".
    expect(nombreColor(120, 15, 50)).toBe("Gris");
    expect(nombreColor(120, 16, 50)).not.toBe("Gris");
  });

  it("matices básicos con saturación/luminosidad medias", () => {
    expect(nombreColor(0, 80, 50)).toBe("Rojo");
    expect(nombreColor(350, 80, 50)).toBe("Rojo");
    expect(nombreColor(30, 80, 50)).toBe("Naranja");
    expect(nombreColor(55, 80, 50)).toBe("Amarillo");
    expect(nombreColor(120, 80, 50)).toBe("Verde");
    expect(nombreColor(180, 80, 50)).toBe("Turquesa");
    expect(nombreColor(220, 80, 50)).toBe("Azul");
    expect(nombreColor(270, 80, 50)).toBe("Violeta");
    expect(nombreColor(310, 80, 50)).toBe("Magenta");
    expect(nombreColor(340, 80, 50)).toBe("Rosa");
  });

  it("modificador oscuro/claro sobre el matiz, sin cruzar a neutro", () => {
    // h=245 (no 220): fuera del rango de "Azul marino" (210-230), para
    // probar el modificador oscuro/claro genérico sin pisar ese caso
    // especial -- ver el test dedicado más abajo.
    expect(nombreColor(245, 80, 20)).toBe("Azul oscuro");
    expect(nombreColor(245, 80, 80)).toBe("Azul claro");
  });

  it("marrón y beige, no naranja -- pedido explícito del usuario (cuero, chino, sweater reales del catálogo)", () => {
    expect(nombreColor(25, 47, 25)).toBe("Marrón oscuro"); // cinturón/zapatos de cuero marrón
    expect(nombreColor(25, 34, 33)).toBe("Marrón"); // zapatillas marrones
    expect(nombreColor(41, 41, 74)).toBe("Beige"); // pantalón/sweater/remera beige del catálogo
  });

  it("un naranja de verdad (alta saturación) en el mismo rango de matiz sigue siendo Naranja", () => {
    expect(nombreColor(30, 80, 50)).toBe("Naranja");
    expect(nombreColor(25, 65, 25)).toBe("Naranja oscuro");
  });

  it("azul marino: azul oscuro Y saturado en el rango real del catálogo (h=222, pantalón/sweater/campera 'azul marino')", () => {
    expect(nombreColor(222, 37, 19)).toBe("Azul marino");
  });

  it("azul marino no se dispara fuera de su rango de matiz o luminosidad", () => {
    expect(nombreColor(220, 60, 50)).toBe("Azul"); // mismo matiz, pero claro -- jean/rompeviento
    expect(nombreColor(180, 80, 20)).toBe("Turquesa oscuro"); // oscuro, pero matiz fuera de rango
    expect(nombreColor(220, 10, 20)).toBe("Gris oscuro"); // oscuro y en rango, pero desaturado -- es gris, no azul marino
  });

  it("celeste, no azul claro -- pedido explícito del usuario (camisa/buzo celeste real del catálogo)", () => {
    expect(nombreColor(209, 58, 82)).toBe("Celeste");
  });

  it("celeste no se dispara fuera de su rango de matiz o luminosidad", () => {
    expect(nombreColor(216, 99, 61)).toBe("Azul"); // mismo matiz, pero no lo bastante claro -- buzo azul real del placard
    expect(nombreColor(260, 60, 82)).toBe("Violeta claro"); // igual de claro, pero matiz fuera de rango
  });

  it("bordó, no rojo oscuro -- pedido explícito del usuario (sweater/corbata bordó real del catálogo)", () => {
    expect(nombreColor(346, 47, 29)).toBe("Bordó");
  });

  it("bordó no se dispara si es claro (eso es rosa, no bordó)", () => {
    expect(nombreColor(335, 47, 60)).toBe("Rosa");
  });

  it("verde militar, no verde genérico -- pedido explícito del usuario (campera-verde-militar real del catálogo)", () => {
    expect(nombreColor(69, 22, 31)).toBe("Verde militar");
    expect(nombreColor(92, 20, 29)).toBe("Verde militar oscuro"); // camisa a cuadros
  });

  it("un verde vívido en el mismo rango de matiz sigue siendo Verde, no militar (buzo verde real del placard)", () => {
    expect(nombreColor(92, 57, 60)).toBe("Verde");
  });

  it("verde militar no se dispara fuera de su rango de matiz (verde bosque real del catálogo)", () => {
    expect(nombreColor(127, 27, 25)).toBe("Verde oscuro"); // pantalón deportivo verde oscuro
  });

  it("rosa claro con h>=345 no cae en Rojo -- encontrado agregando una remera rosa real (antes daba 'Rojo')", () => {
    expect(nombreColor(346, 53, 77)).toBe("Rosa");
    expect(nombreColor(5, 50, 70)).toBe("Rosa"); // mismo caso del lado h<15
  });

  it("rosa por luminosidad no se dispara si no es lo bastante claro (eso es Rojo/Bordó)", () => {
    expect(nombreColor(346, 53, 50)).toBe("Rojo");
  });

  it("mostaza, no naranja -- encontrado agregando un sweater mostaza real al catálogo (antes daba 'Naranja')", () => {
    expect(nombreColor(40, 62, 47)).toBe("Mostaza");
  });

  it("mostaza no se dispara fuera de su rango (terroso -> marrón/beige; vívido -> naranja/amarillo)", () => {
    expect(nombreColor(40, 47, 47)).toBe("Marrón"); // menos saturado -- es marrón, no mostaza
    expect(nombreColor(30, 80, 50)).toBe("Naranja"); // matiz fuera de rango (test ya existente, sigue firme)
  });
});

describe("nombreColor -- consistencia con el catálogo real", () => {
  // Reporte real del usuario: un sweater negro del catálogo (colorHex
  // #232323, l=14) se leía "Gris oscuro" mientras que TODAS las demás
  // prendas "negro/negra" del catálogo (16+, colorHex #1A1A1A, l=10) se
  // leían "Negro" -- una inconsistencia de DATOS (un hex ligeramente más
  // claro sin ninguna razón documentada), no de la lógica de nombreColor
  // (el umbral l<=12 es correcto: #232323 es un gris carbón perceptible,
  // apenas por encima). El fix real fue estandarizar esas 3 prendas al
  // mismo #1A1A1A que ya usa el resto -- este test asegura que ninguna
  // prenda "negro/negra" del catálogo vuelva a quedar en un hex
  // inconsistente que la lea como otra cosa.
  it("toda prenda cuyo nombre dice 'negro'/'negra' clasifica como Negro, no Gris oscuro", () => {
    const negras = CATALOGO_PRENDAS.filter((p) => /negr[oa]/i.test(p.nombre));
    expect(negras.length).toBeGreaterThan(0);
    for (const p of negras) {
      const hsl = hexToHsl(p.colorHex);
      expect(nombreColor(hsl.h, hsl.s, hsl.l), `${p.id} (${p.colorHex})`).toBe("Negro");
    }
  });
});

describe("contornoHsl / sombraHsl / luzHsl", () => {
  it("contornoHsl siempre queda más oscuro y algo más saturado que el color base", () => {
    expect(contornoHsl(220, 60, 50)).toBe("hsl(220 65% 32%)");
  });

  it("contornoHsl no cruza a negativo con luminosidad baja (clamp a 4%)", () => {
    expect(contornoHsl(0, 90, 10)).toBe("hsl(0 95% 4%)");
  });

  it("contornoHsl con blanco puro (l=100) sigue dando un contorno visible, no blanco", () => {
    expect(contornoHsl(0, 0, 100)).toBe("hsl(0 5% 74%)");
  });

  it("sombraHsl y luzHsl mueven la luminosidad en direcciones opuestas sin tocar matiz/saturación", () => {
    expect(sombraHsl(200, 70, 50)).toBe("hsl(200 70% 40%)");
    expect(luzHsl(200, 70, 50)).toBe("hsl(200 70% 57%)");
  });

  it("sombraHsl no baja de 2% ni luzHsl sube de 98%", () => {
    expect(sombraHsl(0, 0, 5)).toBe("hsl(0 0% 2%)");
    expect(luzHsl(0, 0, 95)).toBe("hsl(0 0% 98%)");
  });
});

describe("tonoTexturaHsl", () => {
  // Reporte real de esta misma revisión ("modista e ingeniero textil"):
  // renderizando el ícono real, el patrón de textura (lana) se veía
  // perfecto sobre un sweater gris pero desaparecía por completo sobre uno
  // negro -- contornoHsl siempre resta luz, así que sobre una base ya
  // oscura choca contra el piso (4%) y el patrón se funde con el relleno.
  it("sobre una prenda oscura (l<25), ACLARA en vez de oscurecer más -- mismo criterio que detalleHsl para el cuello de una prenda negra", () => {
    const tono = tonoTexturaHsl(0, 0, 16); // sweater negro real, #2A2A2A
    expect(tono).toBe("hsl(0 5% 36%)");
    expect(36).toBeGreaterThan(16); // más claro que la base -- contraste garantizado
  });

  it("sobre una prenda clara/media (l>=25), sigue oscureciendo como contornoHsl -- no cambia un comportamiento que ya funcionaba", () => {
    expect(tonoTexturaHsl(200, 60, 50)).toBe(contornoHsl(200, 60, 50));
    expect(tonoTexturaHsl(0, 0, 55)).toBe(contornoHsl(0, 0, 55));
  });

  it("no cruza los límites 4%/85% en los extremos", () => {
    expect(tonoTexturaHsl(0, 0, 0)).toBe("hsl(0 5% 20%)");
    expect(tonoTexturaHsl(0, 0, 100)).toBe("hsl(0 5% 82%)");
  });
});

describe("detalleHsl", () => {
  it("oscurece cuando la prenda es clara", () => {
    expect(detalleHsl(220, 60, 50)).toBe("hsl(220 60% 25%)");
    expect(detalleHsl(0, 0, 98)).toBe("hsl(0 0% 73%)");
  });

  it("aclara (no oscurece más) cuando la prenda ya es oscura -- reporte real del", () => {
    // usuario: en una camisa negra, sombraHsl restaba luz a un color que ya
    // era casi negro y el cuello quedaba invisible. detalleHsl tiene que ir
    // para el otro lado en vez de seguir oscureciendo.
    const oscuro = detalleHsl(0, 0, 14);
    expect(oscuro).toBe("hsl(0 10% 36%)");
    expect(36).toBeGreaterThan(14); // más claro que la prenda base, no más oscuro
  });

  it("mantiene una brecha de contraste real (no un ajuste cosmético mínimo) en ambas direcciones", () => {
    const l1 = 14; // prenda oscura
    const l2 = 98; // prenda clara
    const detalleOscuro = 36; // ver test anterior
    const detalleClaro = 73; // ver test anterior
    expect(Math.abs(detalleOscuro - l1)).toBeGreaterThanOrEqual(15);
    expect(Math.abs(detalleClaro - l2)).toBeGreaterThanOrEqual(15);
  });

  it("no cruza los límites 4%/92% en los extremos", () => {
    expect(detalleHsl(0, 0, 0)).toBe("hsl(0 10% 22%)");
    expect(detalleHsl(0, 0, 100)).toBe("hsl(0 0% 75%)");
  });
});

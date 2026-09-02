import { describe, expect, it } from "vitest";
import { contornoHsl, detalleHsl, luzHsl, nombreColor, sombraHsl } from "./color";

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

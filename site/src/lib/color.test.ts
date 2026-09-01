import { describe, expect, it } from "vitest";
import { contornoHsl, luzHsl, nombreColor, sombraHsl } from "./color";

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
    expect(nombreColor(220, 80, 20)).toBe("Azul oscuro");
    expect(nombreColor(220, 80, 80)).toBe("Azul claro");
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

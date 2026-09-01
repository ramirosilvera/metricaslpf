import { describe, expect, it } from "vitest";
import { nombreColor } from "./color";

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

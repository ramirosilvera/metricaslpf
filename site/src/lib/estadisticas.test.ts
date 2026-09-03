import { describe, expect, it } from "vitest";
import { analizarPlacard, coincideBusqueda, contarPorCategoria, contarPorColor, contarPorEstacion, contarPorEstilo } from "./estadisticas";
import type { Prenda } from "./types";

function mkPrenda(
  categoria: Prenda["categoria"],
  hex: string,
  h: number,
  s: number,
  l: number,
  estilo: Prenda["estilo"] = null,
  estilosSecundarios: Prenda["estilos_secundarios"] = [],
  estacion: Prenda["estacion"] = null,
): Prenda {
  return {
    id: `${hex}-${categoria}-${Math.random()}`,
    user_id: "u1",
    categoria,
    color_hex: hex,
    color_h: h,
    color_s: s,
    color_l: l,
    textura: null,
    estilo,
    estilos_secundarios: estilosSecundarios,
    ocasion: null,
    estacion,
    foto_path: null,
    suela_contraste: false,
    requiere_cuello: false,
    posicion_accesorio: "cintura",
    con_capucha: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("contarPorCategoria", () => {
  it("placard vacío -> las 10 categorías en cero", () => {
    const r = contarPorCategoria([]);
    expect(r).toHaveLength(10);
    expect(r.every((c) => c.cantidad === 0)).toBe(true);
  });

  it("cuenta y ordena de mayor a menor, incluyendo las categorías en cero", () => {
    const placard = [
      mkPrenda("pantalon", "#000000", 0, 0, 10),
      mkPrenda("pantalon", "#000001", 0, 0, 11),
      mkPrenda("remera", "#FFFFFF", 0, 0, 90),
    ];
    const r = contarPorCategoria(placard);
    expect(r[0]).toMatchObject({ categoria: "pantalon", cantidad: 2 });
    expect(r[1]).toMatchObject({ categoria: "remera", cantidad: 1 });
    expect(r.find((c) => c.categoria === "calzado")).toMatchObject({ cantidad: 0 });
  });
});

describe("contarPorEstilo", () => {
  it("prenda sin estilo cargado no cuenta para ningún estilo", () => {
    const r = contarPorEstilo([mkPrenda("remera", "#FFFFFF", 0, 0, 90, null)]);
    expect(r.every((e) => e.cantidad === 0)).toBe(true);
  });

  it("cuenta por estilo y ordena de mayor a menor", () => {
    const placard = [
      mkPrenda("pantalon", "#111111", 0, 0, 15, "formal"),
      mkPrenda("camisa", "#FFFFFF", 0, 0, 95, "formal"),
      mkPrenda("remera", "#0000FF", 220, 80, 50, "casual"),
    ];
    const r = contarPorEstilo(placard);
    expect(r[0]).toMatchObject({ estilo: "formal", cantidad: 2 });
    expect(r.find((e) => e.estilo === "casual")).toMatchObject({ cantidad: 1 });
  });

  it("una prenda con estilo secundario cuenta para los dos registros, no solo el principal", () => {
    const placard = [mkPrenda("sweater", "#C3922E", 40, 62, 47, "clasico", ["casual"])];
    const r = contarPorEstilo(placard);
    expect(r.find((e) => e.estilo === "clasico")).toMatchObject({ cantidad: 1 });
    expect(r.find((e) => e.estilo === "casual")).toMatchObject({ cantidad: 1 });
  });
});

describe("contarPorEstacion", () => {
  it("incluye las 3 estaciones siempre, prenda sin estación cargada no cuenta para ninguna", () => {
    const r = contarPorEstacion([mkPrenda("sweater", "#1A1A1A", 0, 0, 10, "clasico")]);
    expect(r).toHaveLength(3);
    expect(r.every((e) => e.cantidad === 0)).toBe(true);
  });

  it("cuenta por estación", () => {
    const placard = [
      mkPrenda("buzo", "#8C8C8C", 0, 0, 55, "casual", [], "entretiempo"),
      mkPrenda("sweater", "#1A1A1A", 0, 0, 10, "clasico", [], "entretiempo"),
      mkPrenda("campera", "#1A1A1A", 0, 0, 10, "casual", [], "invierno"),
    ];
    const r = contarPorEstacion(placard);
    expect(r.find((e) => e.estacion === "entretiempo")).toMatchObject({ cantidad: 2 });
    expect(r.find((e) => e.estacion === "invierno")).toMatchObject({ cantidad: 1 });
    expect(r.find((e) => e.estacion === "verano")).toMatchObject({ cantidad: 0 });
  });

  it("orden fijo verano -> entretiempo -> invierno, no por cantidad", () => {
    const placard = [mkPrenda("campera", "#1A1A1A", 0, 0, 10, "casual", [], "invierno")];
    const r = contarPorEstacion(placard);
    expect(r.map((e) => e.estacion)).toEqual(["verano", "entretiempo", "invierno"]);
  });
});

describe("contarPorColor", () => {
  it("agrupa por el mismo nombre de color que nombreColor()", () => {
    const placard = [
      mkPrenda("remera", "#000000", 0, 0, 5), // Negro
      mkPrenda("pantalon", "#010101", 0, 0, 6), // Negro también
      mkPrenda("camisa", "#FF0000", 0, 80, 50), // Rojo
    ];
    const r = contarPorColor(placard);
    expect(r[0]).toMatchObject({ nombre: "Negro", cantidad: 2 });
    expect(r[1]).toMatchObject({ nombre: "Rojo", cantidad: 1 });
  });
});

describe("analizarPlacard", () => {
  it("placard vacío -> solo una oportunidad, sin fortalezas", () => {
    const r = analizarPlacard([]);
    expect(r.totalPrendas).toBe(0);
    expect(r.fortalezas).toHaveLength(0);
    expect(r.oportunidades.length).toBeGreaterThan(0);
  });

  it("sin ninguna prenda de piernas -> oportunidad específica de ancla", () => {
    const r = analizarPlacard([mkPrenda("remera", "#FFFFFF", 0, 0, 90, "casual")]);
    expect(r.oportunidades.some((o) => o.includes("ancla"))).toBe(true);
  });

  it("con bermuda cargado no pide pantalón por separado (comparten el mismo lugar del outfit)", () => {
    const r = analizarPlacard([mkPrenda("bermuda", "#111111", 0, 0, 15, "casual")]);
    expect(r.oportunidades.some((o) => o.includes("pantalón, bermuda o short"))).toBe(false);
    const categoriasFaltantes = r.oportunidades.find((o) => o.startsWith("Categorías sin ninguna prenda"));
    expect(categoriasFaltantes ?? "").not.toContain("pantalon");
  });

  it("3+ prendas del mismo estilo -> fortaleza de ese estilo", () => {
    const placard = [
      mkPrenda("pantalon", "#111111", 0, 0, 15, "formal"),
      mkPrenda("camisa", "#FFFFFF", 0, 0, 95, "formal"),
      mkPrenda("calzado", "#3B2A1E", 25, 40, 20, "formal"),
    ];
    const r = analizarPlacard(placard);
    expect(r.fortalezas.some((f) => f.includes("Formal"))).toBe(true);
  });

  it("4+ colores distintos -> fortaleza de variedad", () => {
    const placard = [
      mkPrenda("pantalon", "#000000", 0, 0, 5),
      mkPrenda("remera", "#FFFFFF", 0, 0, 95),
      mkPrenda("camisa", "#FF0000", 0, 80, 50),
      mkPrenda("buzo", "#0000FF", 220, 80, 50),
    ];
    const r = analizarPlacard(placard);
    expect(r.variedadColores).toBe(4);
    expect(r.fortalezas.some((f) => f.includes("variedad de colores"))).toBe(true);
  });

  it("1-2 colores con 3+ prendas -> oportunidad de poca variedad", () => {
    const placard = [
      mkPrenda("pantalon", "#000000", 0, 0, 5),
      mkPrenda("remera", "#010101", 0, 0, 6),
      mkPrenda("buzo", "#020202", 0, 0, 4),
    ];
    const r = analizarPlacard(placard);
    expect(r.variedadColores).toBe(1);
    expect(r.oportunidades.some((o) => o.includes("Poca variedad"))).toBe(true);
  });
});

describe("coincideBusqueda", () => {
  it("query vacía o solo espacios -> matchea todo", () => {
    const p = mkPrenda("pantalon", "#111111", 0, 0, 15, "formal");
    expect(coincideBusqueda(p, "")).toBe(true);
    expect(coincideBusqueda(p, "   ")).toBe(true);
  });

  it("matchea por categoría", () => {
    const p = mkPrenda("pantalon", "#111111", 0, 0, 15, "formal");
    expect(coincideBusqueda(p, "pantalon")).toBe(true);
    expect(coincideBusqueda(p, "Pantalon")).toBe(true);
    expect(coincideBusqueda(p, "remera")).toBe(false);
  });

  it("matchea por color (substring, sin importar mayúsculas)", () => {
    const p = mkPrenda("remera", "#000000", 0, 0, 5);
    expect(coincideBusqueda(p, "negro")).toBe(true);
    expect(coincideBusqueda(p, "NEGRO")).toBe(true);
  });

  it("matchea por estilo, y no matchea si la prenda no tiene estilo cargado", () => {
    const conEstilo = mkPrenda("camisa", "#FFFFFF", 0, 0, 95, "formal");
    const sinEstilo = mkPrenda("camisa", "#FFFFFF", 0, 0, 95, null);
    expect(coincideBusqueda(conEstilo, "formal")).toBe(true);
    expect(coincideBusqueda(sinEstilo, "formal")).toBe(false);
  });

  it("matchea también por un estilo secundario, no solo el principal", () => {
    const p = mkPrenda("sweater", "#C3922E", 40, 62, 47, "clasico", ["casual"]);
    expect(coincideBusqueda(p, "casual")).toBe(true);
    expect(coincideBusqueda(p, "clásico")).toBe(true);
  });

  it("matchea por estación, y no matchea si la prenda no tiene estación cargada", () => {
    const conEstacion = mkPrenda("campera", "#1A1A1A", 0, 0, 10, "casual", [], "invierno");
    const sinEstacion = mkPrenda("campera", "#1A1A1A", 0, 0, 10, "casual");
    expect(coincideBusqueda(conEstacion, "invierno")).toBe(true);
    expect(coincideBusqueda(sinEstacion, "invierno")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { descripcionPrenda } from "./types";
import type { Prenda } from "./types";

function mkPrenda(categoria: Prenda["categoria"], overrides: Partial<Prenda> = {}): Prenda {
  return {
    id: "id",
    user_id: "u1",
    categoria,
    color_hex: "#1A1A1A",
    color_h: 0,
    color_s: 0,
    color_l: 10,
    textura: null,
    estilo: null,
    estilos_secundarios: [],
    ocasion: null,
    estacion: null,
    foto_path: null,
    suela_contraste: false,
    requiere_cuello: false,
    posicion_accesorio: "cintura",
    con_capucha: true,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

// Pedido explícito del usuario: "en el catálogo figura Jean pero cuando lo
// agrego a mi placard después la sección de vístete hoy no lo reconoce...
// revisa los nombres tmb, estaría bueno que las prendas den más
// información y al menos aclare pantalón de Jean".
describe("descripcionPrenda", () => {
  it("un pantalón de denim se describe como Jean", () => {
    expect(descripcionPrenda(mkPrenda("pantalon", { textura: "denim" }))).toBe("Jean");
  });

  it("una bermuda de denim se describe como Bermuda de jean", () => {
    expect(descripcionPrenda(mkPrenda("bermuda", { textura: "denim" }))).toBe("Bermuda de jean");
  });

  it("pantalón/bermuda de lana se describen como de vestir", () => {
    expect(descripcionPrenda(mkPrenda("pantalon", { textura: "lana" }))).toBe("Pantalón de vestir");
    expect(descripcionPrenda(mkPrenda("bermuda", { textura: "lana" }))).toBe("Bermuda de vestir");
  });

  it("pantalón de algodón clásico es Pantalón chino, casual es Jogger", () => {
    expect(descripcionPrenda(mkPrenda("pantalon", { textura: "algodon", estilo: "clasico" }))).toBe("Pantalón chino");
    expect(descripcionPrenda(mkPrenda("pantalon", { textura: "algodon", estilo: "casual" }))).toBe("Jogger");
  });

  it("buzo distingue con/sin capucha", () => {
    expect(descripcionPrenda(mkPrenda("buzo", { con_capucha: true }))).toBe("Buzo con capucha");
    expect(descripcionPrenda(mkPrenda("buzo", { con_capucha: false }))).toBe("Buzo sin capucha");
  });

  it("sweater liviano (no lana) se distingue del sweater de lana genérico", () => {
    expect(descripcionPrenda(mkPrenda("sweater", { textura: "viscosa" }))).toBe("Sweater liviano");
    expect(descripcionPrenda(mkPrenda("sweater", { textura: "lana" }))).toBe("Sweater");
  });

  it("campera de denim/acolchado se describe específicamente; campera de lana (ambigua) cae al genérico", () => {
    expect(descripcionPrenda(mkPrenda("campera", { textura: "denim" }))).toBe("Campera de jean");
    expect(descripcionPrenda(mkPrenda("campera", { textura: "acolchado" }))).toBe("Campera de pluma");
    expect(descripcionPrenda(mkPrenda("campera", { textura: "lana" }))).toBe("Campera");
  });

  it("sin textura cargada, cae en CATEGORIA_LABEL capitalizado", () => {
    expect(descripcionPrenda(mkPrenda("remera"))).toBe("Remera");
    expect(descripcionPrenda(mkPrenda("short_deportivo"))).toBe("Short deportivo");
  });

  // saco -- categoría nueva, pedido explícito del usuario ("un traje azul
  // marino"). Sin branch específico (no hay ambigüedad real que resolver
  // como sí la hay en campera/buzo) -- cae en el genérico capitalizado.
  it("saco cae en el genérico capitalizado, sin branch específico", () => {
    expect(descripcionPrenda(mkPrenda("saco", { textura: "lana" }))).toBe("Saco");
  });
});

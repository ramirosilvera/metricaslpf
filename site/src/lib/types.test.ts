import { describe, expect, it } from "vitest";
import { CATEGORIAS_COMPLEMENTARIAS, descripcionPrenda } from "./types";
import type { Categoria, Prenda } from "./types";

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
    patron: "liso",
    color2_hex: null,
    color2_h: null,
    color2_s: null,
    color2_l: null,
    corte_calzado: "zapatilla_urbana",
    calce: "regular",
    necesita_cambio: false,
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

  // Consejo, reporte real del usuario: "en el catálogo hay joggers, pero
  // cuando le pongo que su textura es de poliéster en mi placard lo
  // convierte a pantalón deportivo... es un pantalón casual tipo jogger
  // con ajuste elástico en cadera y tobillos". Bug real: la fibra
  // (poliéster) no distingue un jogger casual de un pantalón de
  // entrenamiento -- ambos se cosen hoy en tela técnica por igual -- lo
  // que los distingue es el corte (calce="holgado", el puño elástico,
  // mismo dato que ya usa esJogger en PrendaIcon.tsx) y el registro real
  // (estilo="deportivo" para un pantalón de entrenamiento de verdad).
  it("pantalón de poliéster holgado, NO deportivo, es Jogger -- la fibra sola no lo hace 'deportivo'", () => {
    expect(descripcionPrenda(mkPrenda("pantalon", { textura: "poliester", calce: "holgado", estilo: "casual" }))).toBe(
      "Jogger",
    );
    expect(descripcionPrenda(mkPrenda("pantalon", { textura: "poliester", calce: "holgado", estilo: "urbano" }))).toBe(
      "Jogger",
    );
  });

  it("pantalón de poliéster holgado Y estilo='deportivo' sigue siendo Pantalón deportivo -- el registro real, no solo la tela", () => {
    expect(
      descripcionPrenda(mkPrenda("pantalon", { textura: "poliester", calce: "holgado", estilo: "deportivo" })),
    ).toBe("Pantalón deportivo");
  });

  it("pantalón de poliéster SIN calce holgado (corte recto) sigue siendo Pantalón deportivo -- sin el puño elástico no es un jogger real", () => {
    expect(descripcionPrenda(mkPrenda("pantalon", { textura: "poliester", calce: "regular", estilo: "casual" }))).toBe(
      "Pantalón deportivo",
    );
  });

  it("bermuda de poliéster sigue siendo Bermuda deportiva sin cambios -- la bermuda no tiene el dato de corte jogger modelado", () => {
    expect(descripcionPrenda(mkPrenda("bermuda", { textura: "poliester", calce: "holgado", estilo: "casual" }))).toBe(
      "Bermuda deportiva",
    );
  });

  it("buzo distingue con/sin capucha", () => {
    expect(descripcionPrenda(mkPrenda("buzo", { con_capucha: true }))).toBe("Buzo con capucha");
    expect(descripcionPrenda(mkPrenda("buzo", { con_capucha: false }))).toBe("Buzo sin capucha");
  });

  it("sweater liviano (no lana) se distingue del sweater de lana genérico", () => {
    expect(descripcionPrenda(mkPrenda("sweater", { textura: "viscosa" }))).toBe("Sweater liviano");
    expect(descripcionPrenda(mkPrenda("sweater", { textura: "lana" }))).toBe("Sweater");
  });

  it("campera de denim/acolchado/poliester/impermeable/tricot se describe específicamente; campera de lana (ambigua) cae al genérico", () => {
    expect(descripcionPrenda(mkPrenda("campera", { textura: "denim" }))).toBe("Campera de jean");
    expect(descripcionPrenda(mkPrenda("campera", { textura: "acolchado" }))).toBe("Campera de pluma");
    expect(descripcionPrenda(mkPrenda("campera", { textura: "poliester" }))).toBe("Campera rompeviento");
    expect(descripcionPrenda(mkPrenda("campera", { textura: "impermeable" }))).toBe("Campera impermeable");
    expect(descripcionPrenda(mkPrenda("campera", { textura: "tricot" }))).toBe("Campera deportiva");
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

  // patron (rayas/cuadros) -- pedido explícito del usuario: "incorpora al
  // catálogo camisas ralladas". Camisa lisa sigue cayendo en el genérico.
  it("camisa distingue por patrón: liso, rayas y cuadros", () => {
    expect(descripcionPrenda(mkPrenda("camisa", { patron: "liso" }))).toBe("Camisa");
    expect(descripcionPrenda(mkPrenda("camisa", { patron: "rayas" }))).toBe("Camisa a rayas");
    expect(descripcionPrenda(mkPrenda("camisa", { patron: "cuadros" }))).toBe("Camisa a cuadros");
  });

  // corte_calzado -- pedido explícito del usuario: "dale más detalles a
  // las zapatillas... revisa todos los estilos". Antes "calzado" siempre
  // caía en el genérico "Calzado" sin importar el corte real.
  it("calzado distingue por corte_calzado, uno por cada registro real", () => {
    expect(descripcionPrenda(mkPrenda("calzado", { corte_calzado: "zapatilla_urbana" }))).toBe("Zapatillas urbanas");
    expect(descripcionPrenda(mkPrenda("calzado", { corte_calzado: "zapatilla_running" }))).toBe("Zapatillas running");
    expect(descripcionPrenda(mkPrenda("calzado", { corte_calzado: "zapato_vestir" }))).toBe("Zapatos de vestir");
    expect(descripcionPrenda(mkPrenda("calzado", { corte_calzado: "mocasin" }))).toBe("Mocasines");
    expect(descripcionPrenda(mkPrenda("calzado", { corte_calzado: "zapatilla_lona" }))).toBe("Zapatillas de lona");
  });
});

describe("CATEGORIAS_COMPLEMENTARIAS", () => {
  it("el mapa es simétrico: si A lista a B, B lista a A", () => {
    const categorias = Object.keys(CATEGORIAS_COMPLEMENTARIAS) as Categoria[];
    for (const a of categorias) {
      for (const b of CATEGORIAS_COMPLEMENTARIAS[a]) {
        expect(CATEGORIAS_COMPLEMENTARIAS[b], `${a} lista a ${b}, pero ${b} no lista a ${a}`).toContain(a);
      }
    }
  });

  // Segunda opinión de sastrería (Consejo, ronda siguiente): blazer +
  // remera lisa (smart casual) y sweater sobre camisa (o bajo un saco,
  // capa de sastrería clásica de invierno) no estaban en el mapa -- el
  // mismo argumento que excluye saco+buzo ("dos capas de afuera") no
  // aplica acá.
  it("saco combina con remera y con sweater; camisa combina con sweater", () => {
    expect(CATEGORIAS_COMPLEMENTARIAS.saco).toContain("remera");
    expect(CATEGORIAS_COMPLEMENTARIAS.saco).toContain("sweater");
    expect(CATEGORIAS_COMPLEMENTARIAS.camisa).toContain("sweater");
  });

  it("saco sigue sin combinar con buzo (sí es una segunda capa de afuera real) ni con bermuda/short_deportivo", () => {
    expect(CATEGORIAS_COMPLEMENTARIAS.saco).not.toContain("buzo");
    expect(CATEGORIAS_COMPLEMENTARIAS.saco).not.toContain("bermuda");
    expect(CATEGORIAS_COMPLEMENTARIAS.saco).not.toContain("short_deportivo");
  });
});

import { describe, expect, it } from "vitest";
import { CATALOGO_PRENDAS } from "./catalogo";
import type { Categoria } from "./types";

// sweater/campera -- las dos categorías de abrigo que SÍ se tagean por
// estación (ver el criterio al principio de catalogo.ts). buzo quedó
// afuera a partir de la revisión de esta ronda -- ver el describe de más
// abajo. Mismo criterio que CATEGORIAS_ABRIGO en recommend.ts (duplicado a
// propósito acá, mismo motivo que ya documenta el resto del archivo: no
// crear una dependencia cruzada por 3 strings).
const CATEGORIAS_ABRIGO_CON_ESTACION: Categoria[] = ["sweater", "campera"];

describe("catálogo -- sweater/campera siempre tageados por estación", () => {
  // Pedido explícito del usuario: diferenciar los abrigos de entretiempo
  // de los de invierno. A diferencia del resto del catálogo (donde
  // `estacion` se deja vacía a propósito por ser ambigua -- ver el
  // criterio al principio de catalogo.ts), un sweater o una campera SIEMPRE
  // tienen un nivel de abrigo real y no deberían quedar sin tagear.
  it("ningún sweater/campera queda sin `estacion`", () => {
    const abrigos = CATALOGO_PRENDAS.filter((p) => CATEGORIAS_ABRIGO_CON_ESTACION.includes(p.categoria));
    expect(abrigos.length).toBeGreaterThan(0);
    const sinEstacion = abrigos.filter((p) => !p.estacion);
    expect(sinEstacion.map((p) => p.id)).toEqual([]);
  });

  // Revisado como ingeniero textil, pedido explícito del usuario: la
  // textura GENÉRICA no alcanza para decidir la estación -- importa el
  // peso/relleno real de cada prenda puntual, no la familia de tela. Una
  // campera acolchada tipo Uniqlo (relleno fino) es de entretiempo real;
  // solo la oversize (mucho más relleno/volumen) es de invierno de
  // verdad -- las dos son "acolchado", pero no la misma estación.
  it("acolchado NO es siempre invierno -- coexisten variantes de entretiempo (relleno fino) e invierno (oversize) real", () => {
    const acolchados = CATALOGO_PRENDAS.filter((p) => p.textura === "acolchado");
    expect(acolchados.length).toBeGreaterThan(0);
    expect(acolchados.some((p) => p.estacion === "entretiempo")).toBe(true);
    expect(acolchados.some((p) => p.estacion === "invierno")).toBe(true);
  });

  // Mismo criterio, del otro lado: "lana" no es siempre entretiempo -- un
  // sweater de lana gruesa es la prenda de punto de invierno por
  // excelencia. La versión liviana de entretiempo es de fibra distinta
  // (viscosa/poliéster), no la misma lana con otro nombre.
  it("lana no es siempre entretiempo -- un sweater de lana es invierno real, la versión liviana usa otra fibra", () => {
    const deLana = CATALOGO_PRENDAS.filter((p) => p.textura === "lana" && p.categoria === "sweater");
    expect(deLana.length).toBeGreaterThan(0);
    for (const p of deLana) {
      expect(p.estacion, p.id).toBe("invierno");
    }
    const livianos = CATALOGO_PRENDAS.filter((p) => p.categoria === "sweater" && p.textura !== "lana");
    expect(livianos.length).toBeGreaterThan(0);
    for (const p of livianos) {
      expect(p.estacion, p.id).toBe("entretiempo");
    }
  });

  it("hay al menos una campera de invierno en registro clásico/formal (no solo pluma casual/urbana)", () => {
    const inviernoClasico = CATALOGO_PRENDAS.filter(
      (p) => p.categoria === "campera" && p.estacion === "invierno" && (p.estilo === "clasico" || p.estilo === "formal"),
    );
    expect(inviernoClasico.length).toBeGreaterThan(0);
  });

  it("las demás categorías (no sweater/campera, incluye buzo) siguen sin forzar `estacion`, a propósito", () => {
    const noAbrigos = CATALOGO_PRENDAS.filter((p) => !CATEGORIAS_ABRIGO_CON_ESTACION.includes(p.categoria));
    expect(noAbrigos.some((p) => !p.estacion)).toBe(true);
  });
});

describe("catálogo -- buzo: peso por textura y capucha, nunca por estación", () => {
  // Corrección explícita de esta ronda, revisado como modista/ingeniero
  // textil: "los buzos tmb algunos son livianos y otros más pesados... pero
  // tampoco los llamaría de invierno o de entretiempo" -- a diferencia de
  // sweater/campera de arriba, ningún buzo del catálogo debería llevar
  // `estacion`.
  it("ningún buzo del catálogo lleva `estacion`", () => {
    const buzos = CATALOGO_PRENDAS.filter((p) => p.categoria === "buzo");
    expect(buzos.length).toBeGreaterThan(0);
    expect(buzos.every((p) => !p.estacion)).toBe(true);
  });

  // El peso real (liviano vs. pesado/frisado) se resuelve con textura, no
  // con estacion -- coexisten las dos variantes en el catálogo.
  it("coexisten buzos livianos (tejido_grueso) y pesados (frisado)", () => {
    const buzos = CATALOGO_PRENDAS.filter((p) => p.categoria === "buzo");
    expect(buzos.some((p) => p.textura === "tejido_grueso")).toBe(true);
    expect(buzos.some((p) => p.textura === "frisado")).toBe(true);
  });

  // con_capucha (hoodie vs. crewneck) es un dato de corte, ortogonal al
  // peso de la tela -- reportado con dos prendas reales del placard del
  // usuario mostrando capucha cuando en realidad son crewneck.
  it("hay al menos un buzo crewneck (sin capucha) además de los hoodie por defecto", () => {
    const buzos = CATALOGO_PRENDAS.filter((p) => p.categoria === "buzo");
    expect(buzos.some((p) => p.conCapucha === false)).toBe(true);
    expect(buzos.some((p) => p.conCapucha !== false)).toBe(true);
  });
});

describe("catálogo -- jean/jogger son urbano sin importar el color", () => {
  // Pedido explícito del usuario, con un caso real: cargó "Jean azul" desde
  // el catálogo y "Vestite hoy" no lo reconocía como Urbano. Causa real: una
  // ronda anterior había agregado el secundario "urbano" solo a jean-negro/
  // jogger-negro, razonando sobre el color en vez de la prenda -- lo que
  // hace urbano/streetwear a un jean o un jogger es el corte/tela (denim o
  // jogger de algodón), no un color puntual. Esta prueba fija esa regla
  // para que no se repita con un color nuevo del catálogo.
  const esUrbano = (p: (typeof CATALOGO_PRENDAS)[number]) =>
    p.estilo === "urbano" || (p.estilosSecundarios ?? []).includes("urbano");

  it("todo jean (pantalón o bermuda, textura denim) es urbano sin importar el color", () => {
    const jeans = CATALOGO_PRENDAS.filter(
      (p) => (p.categoria === "pantalon" || p.categoria === "bermuda") && p.textura === "denim",
    );
    expect(jeans.length).toBeGreaterThan(1); // más de un color, si no la regla no dice nada real
    expect(jeans.every(esUrbano)).toBe(true);
  });

  it("todo jogger (pantalón, algodón + casual) es urbano sin importar el color", () => {
    const joggers = CATALOGO_PRENDAS.filter(
      (p) => p.categoria === "pantalon" && p.textura === "algodon" && p.estilo === "casual",
    );
    expect(joggers.length).toBeGreaterThan(1);
    expect(joggers.every(esUrbano)).toBe(true);
  });
});

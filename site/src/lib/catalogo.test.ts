import { describe, expect, it } from "vitest";
import { CATALOGO_PRENDAS } from "./catalogo";
import type { Categoria } from "./types";

// buzo/sweater/campera -- mismo criterio que CATEGORIAS_ABRIGO en
// recommend.ts (duplicado a propósito acá, mismo motivo que ya documenta
// el resto del archivo: no crear una dependencia cruzada por 3 strings).
const CATEGORIAS_ABRIGO: Categoria[] = ["buzo", "sweater", "campera"];

describe("catálogo -- abrigos siempre tageados por estación", () => {
  // Pedido explícito del usuario: diferenciar los abrigos de entretiempo
  // de los de invierno. A diferencia del resto del catálogo (donde
  // `estacion` se deja vacía a propósito por ser ambigua -- ver el
  // criterio al principio de catalogo.ts), un abrigo SIEMPRE tiene un
  // nivel de abrigo real y no debería quedar sin tagear.
  it("ningún buzo/sweater/campera queda sin `estacion`", () => {
    const abrigos = CATALOGO_PRENDAS.filter((p) => CATEGORIAS_ABRIGO.includes(p.categoria));
    expect(abrigos.length).toBeGreaterThan(0);
    const sinEstacion = abrigos.filter((p) => !p.estacion);
    expect(sinEstacion.map((p) => p.id)).toEqual([]);
  });

  it("toda prenda de textura acolchada es invierno -- es la protección real contra el frío", () => {
    const acolchados = CATALOGO_PRENDAS.filter((p) => p.textura === "acolchado");
    expect(acolchados.length).toBeGreaterThan(0);
    for (const p of acolchados) {
      expect(p.estacion, p.id).toBe("invierno");
    }
  });

  it("hay al menos una campera de invierno en registro clásico/formal (no solo pluma casual/urbana)", () => {
    const inviernoClasico = CATALOGO_PRENDAS.filter(
      (p) => p.categoria === "campera" && p.estacion === "invierno" && (p.estilo === "clasico" || p.estilo === "formal"),
    );
    expect(inviernoClasico.length).toBeGreaterThan(0);
  });

  it("las demás categorías (no abrigo) siguen sin forzar `estacion`, a propósito", () => {
    const noAbrigos = CATALOGO_PRENDAS.filter((p) => !CATEGORIAS_ABRIGO.includes(p.categoria));
    expect(noAbrigos.some((p) => !p.estacion)).toBe(true);
  });
});

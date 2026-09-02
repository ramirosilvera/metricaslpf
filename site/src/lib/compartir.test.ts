import { describe, expect, it } from "vitest";
import { envolverTexto } from "./compartir";

// medir() simulado: cada carácter mide 1 unidad -- no depende de canvas
// real (vitest corre en Node sin DOM), pero alcanza para probar la lógica
// de corte de línea en sí, que es independiente de la medición real.
const medirPorCaracter = (t: string) => t.length;

describe("envolverTexto", () => {
  it("texto vacío -> sin líneas", () => {
    expect(envolverTexto("", 100, medirPorCaracter)).toEqual([]);
  });

  it("texto que entra entero en una línea -> una sola línea", () => {
    expect(envolverTexto("Camisa blanca", 50, medirPorCaracter)).toEqual(["Camisa blanca"]);
  });

  it("corta en el límite de palabra cuando no entra más", () => {
    // "Camisa blanca + Pantalón azul marino" (37 chars) con ancho 20:
    // "Camisa blanca" (13) cabe, sumar " +" (15) cabe, sumar " Pantalón" (24) no cabe -> corta.
    const resultado = envolverTexto("Camisa blanca + Pantalón azul marino", 20, medirPorCaracter);
    expect(resultado.join(" ")).toBe("Camisa blanca + Pantalón azul marino"); // ninguna palabra se pierde
    expect(resultado.every((linea) => medirPorCaracter(linea) <= 20 || linea.split(" ").length === 1)).toBe(true);
  });

  it("una palabra sola más larga que el ancho máximo no se corta a la mitad (queda en su propia línea)", () => {
    const resultado = envolverTexto("Supercalifragilisticoexpialidoso", 10, medirPorCaracter);
    expect(resultado).toEqual(["Supercalifragilisticoexpialidoso"]);
  });

  it("múltiples espacios/espacios de más no generan líneas vacías", () => {
    const resultado = envolverTexto("Camisa   blanca", 100, medirPorCaracter);
    expect(resultado).toEqual(["Camisa blanca"]);
  });

  it("nunca pierde ni duplica palabras, sin importar el ancho", () => {
    const texto = "Sweater gris + Pantalón de vestir negro + Calzado marrón";
    for (const ancho of [5, 10, 20, 40, 100, 1000]) {
      const resultado = envolverTexto(texto, ancho, medirPorCaracter);
      expect(resultado.join(" ")).toBe(texto);
    }
  });
});

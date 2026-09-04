import { describe, expect, it } from "vitest";
import {
  advertenciasDeRegistro,
  armarOutfitsParaComprar,
  armarOutfitsSugeridos,
  candidatosDeContraste,
  categoriasAusentes,
  comboParaExcelencia,
  contarColoresProtagonistas,
  diffPrendasEdicion,
  elegirContraste,
  esNeutro,
  estacionActual,
  estilosDe,
  hueDist,
  mejorCompraParaSubirNota,
  mejorasDeReemplazo,
  outfitEsCoherenteParaEstilo,
  outfitSirveParaEstilo,
  puntuarOutfit,
  recomendar,
  registroOutfit,
  scoreColor,
  semillaDelDia,
  sugerenciaDeAncla,
  sugerenciaDeVariedad,
  tanda,
  tecnicaRescate,
  valueDist,
} from "./recommend";
import { hexToHsl, hslToHex, rgbToHsl } from "./color";
import type { HSL, Prenda } from "./types";
import { CATALOGO_CON_HSL, presetAPrendaSintetica, type PresetPrenda } from "./catalogo";

describe("hueDist", () => {
  it("distancia circular correcta cruzando el 0°", () => {
    // h0=350, h1=10 -> distancia real 20°, no 340°.
    expect(hueDist(350, 10)).toBeCloseTo(20 / 180, 5);
  });

  it("0 para el mismo matiz", () => {
    expect(hueDist(120, 120)).toBe(0);
  });

  it("máximo (1) para matices opuestos", () => {
    expect(hueDist(0, 180)).toBe(1);
  });
});

describe("valueDist", () => {
  it("distancia lineal simple", () => {
    expect(valueDist(20, 50)).toBeCloseTo(0.3, 5);
  });
});

describe("esNeutro", () => {
  it("gris por saturación baja", () => {
    expect(esNeutro(10, 50)).toBe(true);
  });
  it("casi negro por luminosidad baja, SIN tope de saturación (un oscuro saturado también es neutro)", () => {
    // A propósito s=80 (alto): debajo de NEUTRO_L_MIN la discriminación de
    // matiz colapsa (marino, verde botella y negro se leen todos como
    // "oscuro"), así que cualquier oscuro funciona como neutro sin importar
    // su saturación -- a diferencia del extremo claro (ver el test de
    // abajo), donde SÍ hay un tope. Los dos extremos no son simétricos.
    expect(esNeutro(80, 10)).toBe(true);
  });
  it("casi blanco por luminosidad alta Y saturación baja", () => {
    // s=20 (no 80): un blanco roto real, no un pastel vívido.
    expect(esNeutro(20, 90)).toBe(true);
  });
  it("un PASTEL SATURADO de luminosidad alta NO es neutro -- auditoría de color/textiles (Consejo, ronda siguiente)", () => {
    // Antes de este fix, esNeutro(80, 90) daba true: un rosa pastel s=80 es
    // inconfundiblemente rosa (no blanco), y dos tintes pastel bien
    // distintos a esa misma luminosidad (rosa + menta, por ejemplo)
    // compiten sin ninguna jerarquía de valor -- el motor los declaraba
    // "excelente" ("el neutro no compite con nada") cuando en realidad
    // ninguno de los dos es neutro de verdad. Verificado contra el catálogo
    // real: la prenda más clara y saturada que existe (#F5F5F0, zapatillas/
    // running/lona blancas) tiene s=20, muy por debajo del nuevo tope
    // (NEUTRO_S_MAX_CLARO=40) -- ningún veredicto del catálogo curado cambia.
    expect(esNeutro(80, 90)).toBe(false);
  });
  it("color saturado de luminosidad media no es neutro", () => {
    expect(esNeutro(80, 50)).toBe(false);
  });
});

describe("scoreColor", () => {
  it("neutro de por medio -> excelente", () => {
    const r = scoreColor({ h: 0, s: 5, l: 50 }, { h: 200, s: 80, l: 50 });
    expect(r.nivel).toBe("excelente");
  });

  it("análogo + saturación baja -> excelente", () => {
    const r = scoreColor({ h: 200, s: 30, l: 50 }, { h: 210, s: 35, l: 55 });
    expect(r.nivel).toBe("excelente");
  });

  it("monocromático (mismo matiz, saturación alta) -> excelente, tag tono sobre tono", () => {
    const r = scoreColor({ h: 0, s: 80, l: 50 }, { h: 2, s: 80, l: 51 });
    expect(r.nivel).toBe("excelente");
    expect(r.tag).toBe("tono_sobre_tono");
  });

  it("complementario con buen contraste -> muy bueno, tag audaz", () => {
    const r = scoreColor({ h: 20, s: 70, l: 45 }, { h: 190, s: 70, l: 80 });
    expect(r.nivel).toBe("muy_bueno");
    expect(r.tag).toBe("combinacion_audaz");
  });

  it("dos oscuros BIEN SATURADOS de distinto matiz compiten en pie de igualdad (no solo mismo matiz)", () => {
    // rojo oscuro saturado vs azul oscuro saturado, matices opuestos,
    // luminosidad casi igual, s=90/60 -- ambos por encima del piso de
    // saturación (ver SATURACION_ALTA_MINIMA). Ninguno se apaga, así que
    // compiten de verdad -- distinto del caso marino+marrón de abajo.
    const r = scoreColor({ h: 0, s: 90, l: 20 }, { h: 240, s: 60, l: 24 });
    expect(r.nivel).toBe("con_cuidado");
  });

  it("2da ronda de Consejo -- dos oscuros de saturación MODERADA (no alta) NO se marcan con_cuidado -- es la paleta marino+marrón real, no un choque", () => {
    // valores reales del catálogo: pantalón de vestir azul marino (h222 s37
    // l19) + zapato de cuero marrón (h25 s47 l25). Antes de este fix daba
    // con_cuidado -- era el 95% de todos los con_cuidado del motor, y cada
    // uno de esos pares (marino+marrón, marino+bordó, marrón+verde
    // militar) es una combinación real bien vista, no una mancha. El motor
    // viejo no distinguía "saturado de verdad" de "apenas con color".
    const r = scoreColor({ h: 222, s: 37, l: 19 }, { h: 25, s: 47, l: 25 });
    expect(r.nivel).not.toBe("con_cuidado");
  });

  it("banda de neutro ampliada evita el salto de tier por ruido de foto (l=12 vs l=13)", () => {
    const base = { h: 0, s: 90, l: 12 };
    const candidato = { h: 280, s: 60, l: 20 };
    expect(scoreColor(base, candidato).nivel).toBe("excelente"); // l=12 -> neutro
  });

  it("saturación alta + valor casi idéntico, matices distintos -> se funden", () => {
    const r = scoreColor({ h: 0, s: 80, l: 50 }, { h: 100, s: 70, l: 54 });
    expect(r.nivel).toBe("con_cuidado");
  });

  // Auditoría de color/textiles (Consejo, ronda siguiente): un esquema
  // monocromático funciona POR la variación de valor, no a pesar de ella.
  // Regla 1b -- corre ANTES de la 2 (no después, como en su primera
  // versión): al migrar la regla 2 de `s` a croma, empezó a absorber estos
  // mismos pares (croma bajo + matiz cercano) antes de que llegaran acá,
  // dando "excelente" pero con el mensaje genérico en vez del de degradé.
  describe("1b -- degradé monocromático (mismo matiz, luminosidades separadas)", () => {
    it("marino oscuro + celeste claro (mismo matiz, vd bien separado) -> excelente, tag tono sobre tono", () => {
      // valores reales del catálogo: pantalón de vestir azul marino
      // (h222 s37 l19) + camisa celeste (h209 s58 l82).
      const r = scoreColor({ h: 222, s: 37, l: 19 }, { h: 209, s: 58, l: 82 });
      expect(r.nivel).toBe("excelente");
      expect(r.tag).toBe("tono_sobre_tono");
    });

    it("camel + chocolate (mismo matiz tierra, vd separado) -> excelente", () => {
      const r = scoreColor({ h: 41, s: 41, l: 74 }, { h: 25, s: 47, l: 25 });
      expect(r.nivel).toBe("excelente");
    });

    it("mismo matiz saturado con vd en la franja muerta (por encima de la 3 plana, por debajo de la 1b) -> NO excelente por ninguna de las dos", () => {
      // s=70 en las dos puntas: croma(70,74)=36.4 y croma(70,55)=63, por
      // encima de CROMA_ACENTO (40), así la regla 2 (análogo + croma
      // apagado) tampoco puede explicar el resultado. vd=0.19: por encima
      // de VALUE_MONOCROMATICO (0.15, la regla 3 plana) y por debajo de
      // VALUE_DEGRADE_MIN (0.25, la 1b) -- aísla específicamente esa franja
      // intermedia.
      const r = scoreColor({ h: 41, s: 70, l: 74 }, { h: 41, s: 70, l: 55 });
      expect(r.nivel).not.toBe("excelente");
    });
  });

  // Auditoría de color/textiles (Consejo, ronda siguiente): lo que hace
  // "audaz" a un complementario es el croma, no el ángulo de matiz -- camel
  // + marino es la base de la paleta clásica, no un statement.
  describe("4 -- complementarios apagados (croma bajo) son excelente, no audaz", () => {
    it("beige + azul marino (complementarios reales del catálogo, croma bajo) -> excelente, sin tag audaz", () => {
      const r = scoreColor({ h: 41, s: 41, l: 74 }, { h: 222, s: 37, l: 19 });
      expect(r.nivel).toBe("excelente");
      expect(r.tag).toBeUndefined();
    });

    it("mostaza + celeste (complementarios de croma alto, control) sigue siendo audaz", () => {
      const r = scoreColor({ h: 40, s: 62, l: 47 }, { h: 209, s: 58, l: 82 });
      expect(r.nivel).toBe("muy_bueno");
      expect(r.tag).toBe("combinacion_audaz");
    });
  });

  // Auditoría de color/textiles (Consejo, ronda siguiente): la franja
  // "complementarios intensos SIN separación de valor" no tenía regla
  // propia y cae en el catch-all "combinación prolija" -- es al revés de lo
  // que dice la teoría (el contraste de valor es lo que hace legible al
  // complementario, no lo que lo vuelve arriesgado).
  describe("4b -- complementarios de croma alto sin separación de valor -> con_cuidado", () => {
    it("rojo y verde intensos, casi la misma luminosidad -> con_cuidado (se pelean)", () => {
      const r = scoreColor({ h: 5, s: 60, l: 45 }, { h: 145, s: 60, l: 45 });
      expect(r.nivel).toBe("con_cuidado");
    });

    it("el mismo par con un verde apagado (croma bajo) NO choca -- se comporta como un oscuro de base", () => {
      const r = scoreColor({ h: 5, s: 60, l: 45 }, { h: 130, s: 22, l: 31 }); // verde botella real del catálogo
      expect(r.nivel).not.toBe("con_cuidado");
    });
  });
});

describe("recomendar -- coordinación de cuero (cinturón/calzado)", () => {
  it("caso real reportado: cinturón negro + zapato de cuero marrón NO es 'excelente' pese a que el negro es neutro en HSL", () => {
    const cinturonNegro = mkPrenda("accesorio", "#1A1A1A", 0, 0, 10);
    cinturonNegro.textura = "cuero_liso";
    const zapatoMarron = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    zapatoMarron.textura = "cuero_liso";

    const [resultado] = recomendar(cinturonNegro, [zapatoMarron], [cinturonNegro, zapatoMarron]);
    expect(resultado.score.nivel).toBe("con_cuidado");
    expect(resultado.score.explicacion).toContain("cuero");
    expect(resultado.tecnicaRescate).toContain("mismo tono de cuero");
  });

  it("cinturón y zapato de cuero del MISMO tono sí combinan (ambos marrones, mismo hex real del catálogo)", () => {
    const cinturonMarron = mkPrenda("accesorio", "#5C3A21", 25, 47, 25);
    cinturonMarron.textura = "cuero_liso";
    const zapatoMarron = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    zapatoMarron.textura = "cuero_liso";

    const [resultado] = recomendar(cinturonMarron, [zapatoMarron], [cinturonMarron, zapatoMarron]);
    expect(resultado.score.nivel).toBe("excelente");
  });

  it("cinturón y zapato negros (ambos cuero, ambos neutros) sí combinan", () => {
    const cinturonNegro = mkPrenda("accesorio", "#1A1A1A", 0, 0, 10);
    cinturonNegro.textura = "cuero_liso";
    const zapatoNegro = mkPrenda("calzado", "#1C1210", 10, 27, 9);
    zapatoNegro.textura = "cuero_liso";

    const [resultado] = recomendar(cinturonNegro, [zapatoNegro], [cinturonNegro, zapatoNegro]);
    expect(resultado.score.nivel).toBe("excelente");
  });

  it("la regla de cuero NO aplica si alguna de las dos prendas no es cuero_liso (p.ej. remera negra + zapato marrón sigue siendo 'excelente')", () => {
    const remeraNegra = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
    const zapatoMarron = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    zapatoMarron.textura = "cuero_liso";

    const [resultado] = recomendar(remeraNegra, [zapatoMarron], [remeraNegra, zapatoMarron]);
    expect(resultado.score.nivel).toBe("excelente");
  });

  it("2da ronda -- pantalón de vestir negro + zapato de cuero marrón tampoco combina (no solo cinturón+zapato)", () => {
    const pantalonNegro = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonNegro.estilo = "formal";
    const zapatoMarron = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    zapatoMarron.textura = "cuero_liso";

    const [resultado] = recomendar(pantalonNegro, [zapatoMarron], [pantalonNegro, zapatoMarron]);
    expect(resultado.score.nivel).toBe("con_cuidado");
  });

  it("2da ronda -- pantalón beige (de vestir) + zapato de cuero NEGRO tampoco combina (la descoordinación va en las dos direcciones)", () => {
    const pantalonBeige = mkPrenda("pantalon", "#D8C7A1", 39, 40, 76);
    pantalonBeige.estilo = "clasico";
    const zapatoNegro = mkPrenda("calzado", "#1C1210", 10, 27, 9);
    zapatoNegro.textura = "cuero_liso";

    const [resultado] = recomendar(pantalonBeige, [zapatoNegro], [pantalonBeige, zapatoNegro]);
    expect(resultado.score.nivel).toBe("con_cuidado");
  });

  it("la regla no depende de cuál prenda sea la 'base' -- recomendar(zapato, [cinturón]) da lo mismo que al revés", () => {
    // recomendar() se llama con distintas prendas como base según la
    // pantalla (Probar ancla en la prenda elegida, armarOutfits* ancla
    // siempre en el pantalón), así que las reglas tienen que ser simétricas.
    const cinturonNegro = mkPrenda("accesorio", "#1A1A1A", 0, 0, 10);
    cinturonNegro.textura = "cuero_liso";
    const zapatoMarron = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    zapatoMarron.textura = "cuero_liso";

    const [aB] = recomendar(cinturonNegro, [zapatoMarron], [cinturonNegro, zapatoMarron]);
    const [bA] = recomendar(zapatoMarron, [cinturonNegro], [cinturonNegro, zapatoMarron]);
    expect(aB.score.nivel).toBe(bA.score.nivel);
    expect(bA.score.nivel).toBe("con_cuidado");
  });

  it("simetría también en el caso cuero + pantalón de vestir (base = calzado)", () => {
    const pantalonNegro = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonNegro.estilo = "formal";
    const zapatoMarron = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    zapatoMarron.textura = "cuero_liso";

    const [bA] = recomendar(zapatoMarron, [pantalonNegro], [pantalonNegro, zapatoMarron]);
    expect(bA.score.nivel).toBe("con_cuidado");
  });

  it("2da ronda -- un JEAN (pantalón casual, no de vestir) con zapato de cuero marrón SIGUE siendo excelente -- smart casual real, no se toca", () => {
    const jeanNegro = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    jeanNegro.estilo = "casual";
    jeanNegro.textura = "denim";
    const zapatoMarron = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    zapatoMarron.textura = "cuero_liso";

    const [resultado] = recomendar(jeanNegro, [zapatoMarron], [jeanNegro, zapatoMarron]);
    expect(resultado.score.nivel).toBe("excelente");
  });

  it("la coordinación de cuero también aplica con un bermuda clasico (no solo con un pantalón largo): negro + tierra choca igual", () => {
    const bermudaNegroClasico = mkPrenda("bermuda", "#1A1A1A", 0, 0, 10);
    bermudaNegroClasico.estilo = "clasico";
    const zapatoMarron = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    zapatoMarron.textura = "cuero_liso";

    const [resultado] = recomendar(bermudaNegroClasico, [zapatoMarron], [bermudaNegroClasico, zapatoMarron]);
    expect(resultado.score.nivel).toBe("con_cuidado");
  });

  it("un short deportivo (sin estilo de vestir) NO dispara la coordinación de cuero -- nunca es 'de vestir'", () => {
    const shortNegro = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
    shortNegro.estilo = "deportivo";
    const zapatoMarron = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    zapatoMarron.textura = "cuero_liso";

    // Auditoría de sastrería (Consejo, ronda siguiente): sigue sin ser
    // esDescoordinacionDeCuero (verificado por el mensaje) -- pero ahora
    // termina en con_cuidado igual, por una razón distinta y más de fondo:
    // un zapato de cuero es, en sí mismo, categóricamente ajeno a un short
    // deportivo (ver chocaRegistroDeportivo). Antes de ese fix, esta
    // combinación real ("zapatos de vestir marrones con un short de
    // entrenamiento") pasaba como "excelente" sin que ninguna regla la
    // frenara -- este test documentaba solo la ausencia de UN falso
    // positivo (el de cuero) sin notar que quedaba otro (el de registro).
    const [resultado] = recomendar(shortNegro, [zapatoMarron], [shortNegro, zapatoMarron]);
    expect(resultado.score.nivel).toBe("con_cuidado");
    expect(resultado.score.explicacion).not.toContain("cuero se coordina aparte");
  });

  // Auditoría de Consejo (revisor de QA, verificado por ejecución): un
  // cuero marrón oscuro y saturado ("espresso", h=30 s=40 l=10) cumplía a
  // la vez esNegroProfundo (l<=12) y esTierraCalida (s>=20, h 15-60) --
  // dos prendas de ese mismo tono exacto se marcaban con_cuidado entre
  // sí, justo lo contrario de lo que esta regla existe para aprobar.
  it("cinturón y zapato de cuero MARRÓN OSCURO/espresso, del mismo tono exacto, sí combinan (no se confunden con 'negro')", () => {
    const cinturonEspresso = mkPrenda("accesorio", "#3D2B1A", 30, 40, 10);
    cinturonEspresso.textura = "cuero_liso";
    const zapatoEspresso = mkPrenda("calzado", "#3D2B1A", 30, 40, 10);
    zapatoEspresso.textura = "cuero_liso";

    const [resultado] = recomendar(cinturonEspresso, [zapatoEspresso], [cinturonEspresso, zapatoEspresso]);
    expect(resultado.score.nivel).toBe("excelente");
  });

  it("cuero espresso oscuro (marrón, no negro) SIGUE chocando contra un negro de cuero real -- el fix no lo vuelve todo permisivo", () => {
    const zapatoNegroReal = mkPrenda("calzado", "#1C1210", 10, 27, 9); // negro de cuero real del catálogo
    zapatoNegroReal.textura = "cuero_liso";
    const cinturonEspresso = mkPrenda("accesorio", "#3D2B1A", 30, 40, 10);
    cinturonEspresso.textura = "cuero_liso";

    const [resultado] = recomendar(zapatoNegroReal, [cinturonEspresso], [zapatoNegroReal, cinturonEspresso]);
    expect(resultado.score.nivel).toBe("con_cuidado");
  });

  // Auditoría de color/textiles (Consejo, ronda siguiente): tercera familia
  // real de cuero de vestir -- burdeos/oxblood/cordovan, junto a negro y
  // marrón. Antes no encajaba en ninguna familia y volvía a colarse por el
  // mismo agujero que motivó toda la regla (negro=neutro en HSL).
  describe("coordinación de cuero -- tercera familia (burdeos/oxblood/cordovan)", () => {
    it("cinturón negro + zapato de cuero BURDEOS -> con_cuidado, mismo criterio que negro+marrón", () => {
      const cinturonNegro = mkPrenda("accesorio", "#1A1A1A", 0, 0, 10);
      cinturonNegro.textura = "cuero_liso";
      const zapatoBurdeos = mkPrenda("calzado", "#6B2737", 346, 47, 29); // burdeos real (mismo hex que corbata-bordo/sweater-bordo)
      zapatoBurdeos.textura = "cuero_liso";

      const [resultado] = recomendar(cinturonNegro, [zapatoBurdeos], [cinturonNegro, zapatoBurdeos]);
      expect(resultado.score.nivel).toBe("con_cuidado");
    });

    it("cinturón MARRÓN + zapato de cuero burdeos SÍ combinan -- dos tierras/vino no chocan entre sí", () => {
      const cinturonMarron = mkPrenda("accesorio", "#5C3A21", 25, 47, 25);
      cinturonMarron.textura = "cuero_liso";
      const zapatoBurdeos = mkPrenda("calzado", "#6B2737", 346, 47, 29);
      zapatoBurdeos.textura = "cuero_liso";

      const [resultado] = recomendar(cinturonMarron, [zapatoBurdeos], [cinturonMarron, zapatoBurdeos]);
      expect(resultado.score.nivel).not.toBe("con_cuidado");
    });

    it("dos cueros burdeos del mismo tono SÍ combinan", () => {
      const cinturonBurdeos = mkPrenda("accesorio", "#6B2737", 346, 47, 29);
      cinturonBurdeos.textura = "cuero_liso";
      const zapatoBurdeos = mkPrenda("calzado", "#6B2737", 346, 47, 29);
      zapatoBurdeos.textura = "cuero_liso";

      const [resultado] = recomendar(cinturonBurdeos, [zapatoBurdeos], [cinturonBurdeos, zapatoBurdeos]);
      expect(resultado.score.nivel).not.toBe("con_cuidado");
    });

    it("el negro de cuero real del catálogo (#1C1210) sigue siendo esNegroProfundo, no se confunde con burdeos", () => {
      const cinturonNegroReal = mkPrenda("accesorio", "#1C1210", 10, 27, 9);
      cinturonNegroReal.textura = "cuero_liso";
      const zapatoBurdeos = mkPrenda("calzado", "#6B2737", 346, 47, 29);
      zapatoBurdeos.textura = "cuero_liso";

      const [resultado] = recomendar(cinturonNegroReal, [zapatoBurdeos], [cinturonNegroReal, zapatoBurdeos]);
      expect(resultado.score.nivel).toBe("con_cuidado");
    });
  });

  // Segunda opinión de sastrería (Consejo, ronda siguiente), verificada por
  // ejecución directa: un zapato de vestir/mocasín cargado a mano (por
  // foto, SIN textura="cuero_liso" tildada -- el formulario no la marca
  // por defecto) apagaba la coordinación de cuero entera. corte_calzado
  // ahora cuenta como señal de cuero por sí solo, sin necesitar la textura.
  it("zapato de vestir cargado a mano (corte_calzado, SIN textura cuero_liso) sigue disparando la coordinación de cuero", () => {
    const cinturonNegro = mkPrenda("accesorio", "#1A1A1A", 0, 0, 10);
    cinturonNegro.textura = "cuero_liso";
    const zapatoVestirSinTextura = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    zapatoVestirSinTextura.corte_calzado = "zapato_vestir";
    // textura deliberadamente SIN setear (queda null, el default de mkPrenda).

    const [resultado] = recomendar(cinturonNegro, [zapatoVestirSinTextura], [cinturonNegro, zapatoVestirSinTextura]);
    expect(resultado.score.nivel).toBe("con_cuidado");
  });

  it("mocasín cargado a mano (corte_calzado, SIN textura cuero_liso) también dispara la coordinación de cuero", () => {
    const cinturonNegro = mkPrenda("accesorio", "#1A1A1A", 0, 0, 10);
    cinturonNegro.textura = "cuero_liso";
    const mocasinSinTextura = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    mocasinSinTextura.corte_calzado = "mocasin";

    const [resultado] = recomendar(cinturonNegro, [mocasinSinTextura], [cinturonNegro, mocasinSinTextura]);
    expect(resultado.score.nivel).toBe("con_cuidado");
  });

  it("una zapatilla urbana (corte_calzado por defecto) NO dispara la coordinación de cuero, sin importar el color", () => {
    const cinturonNegro = mkPrenda("accesorio", "#1A1A1A", 0, 0, 10);
    cinturonNegro.textura = "cuero_liso";
    const zapatillaUrbana = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    // corte_calzado por defecto es "zapatilla_urbana" (ver mkPrenda).

    const [resultado] = recomendar(cinturonNegro, [zapatillaUrbana], [cinturonNegro, zapatillaUrbana]);
    expect(resultado.score.nivel).not.toBe("con_cuidado");
  });
});

describe("recomendar -- formalidad calzado o torso vs pantalón", () => {
  it("pantalón de vestir + zapatillas: el color combina pero baja de excelente a muy_bueno (el calzado es menos formal)", () => {
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";
    const zapatillas = mkPrenda("calzado", "#F5F5F0", 0, 0, 95);
    zapatillas.estilo = "urbano";

    const [resultado] = recomendar(pantalonVestir, [zapatillas], [pantalonVestir, zapatillas]);
    expect(resultado.score.nivel).toBe("muy_bueno");
    expect(resultado.score.explicacion).toContain("informal");
  });

  it("al revés -- jean (casual) + zapato de cuero (formal) NO se degrada: el pie puede ser MÁS formal que el pantalón sin problema", () => {
    const jean = mkPrenda("pantalon", "#3B5998", 220, 44, 41);
    jean.estilo = "casual";
    const zapatoFormal = mkPrenda("calzado", "#1C1210", 10, 27, 9);
    zapatoFormal.estilo = "formal";
    zapatoFormal.textura = "cuero_liso";

    const [resultado] = recomendar(jean, [zapatoFormal], [jean, zapatoFormal]);
    expect(resultado.score.nivel).toBe("excelente");
  });

  it("la degradación no depende del orden -- recomendar(zapatillas, [pantalón de vestir]) también baja a muy_bueno", () => {
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";
    const zapatillas = mkPrenda("calzado", "#F5F5F0", 0, 0, 95);
    zapatillas.estilo = "urbano";

    const [resultado] = recomendar(zapatillas, [pantalonVestir], [pantalonVestir, zapatillas]);
    expect(resultado.score.nivel).toBe("muy_bueno");
  });

  it("sin estilo declarado en alguna de las dos prendas, no se inventa una degradación", () => {
    const pantalonSinEstilo = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    const zapatillas = mkPrenda("calzado", "#F5F5F0", 0, 0, 95);
    zapatillas.estilo = "urbano";

    const [resultado] = recomendar(pantalonSinEstilo, [zapatillas], [pantalonSinEstilo, zapatillas]);
    expect(resultado.score.nivel).toBe("excelente");
  });

  it("4ta ronda -- caso reportado por el usuario: pantalón de vestir + buzo (hoodie casual) también baja a muy_bueno, no solo calzado", () => {
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";
    const buzo = mkPrenda("buzo", "#1A1A1A", 0, 0, 10);
    buzo.estilo = "casual";

    const [resultado] = recomendar(pantalonVestir, [buzo], [pantalonVestir, buzo]);
    expect(resultado.score.nivel).toBe("muy_bueno");
    expect(resultado.score.explicacion).toContain("informal");
  });

  it("un SWEATER de vestir (no un buzo/hoodie) con un pantalón de vestir NO se degrada -- son categorías distintas con formalidad distinta", () => {
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";
    const sweater = mkPrenda("sweater", "#1A1A1A", 0, 0, 10);
    sweater.estilo = "clasico";

    const [resultado] = recomendar(pantalonVestir, [sweater], [pantalonVestir, sweater]);
    expect(resultado.score.nivel).toBe("excelente");
  });

  it("jean (casual) + campera urbana NO se degrada -- ambos en el mismo registro relajado", () => {
    const jean = mkPrenda("pantalon", "#3B5998", 220, 44, 41);
    jean.estilo = "casual";
    const campera = mkPrenda("campera", "#1A1A1A", 0, 0, 10);
    campera.estilo = "urbano";

    const [resultado] = recomendar(jean, [campera], [jean, campera]);
    expect(resultado.score.nivel).toBe("excelente");
  });
});

describe("recomendar -- deportivo no combina con formal/clasico (ni siquiera accesorio)", () => {
  it("reporte real del usuario: short deportivo + cinturón de cuero clásico -- con_cuidado, no excelente", () => {
    const short = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
    short.estilo = "deportivo";
    const cinturon = mkPrenda("accesorio", "#1A1A1A", 0, 0, 10);
    cinturon.estilo = "clasico";
    cinturon.textura = "cuero_liso";

    const [resultado] = recomendar(short, [cinturon], [short, cinturon]);
    expect(resultado.score.nivel).toBe("con_cuidado");
    expect(resultado.score.explicacion).toContain("deportiv");
  });

  it("reporte real del usuario: pantalón deportivo + sweater clásico -- con_cuidado, no excelente ni muy_bueno", () => {
    const pantalon = mkPrenda("pantalon", "#2F5233", 127, 27, 25);
    pantalon.estilo = "deportivo";
    const sweater = mkPrenda("sweater", "#1F2A44", 222, 37, 19);
    sweater.estilo = "clasico";

    const [resultado] = recomendar(pantalon, [sweater], [pantalon, sweater]);
    expect(resultado.score.nivel).toBe("con_cuidado");
  });

  it("también choca contra 'formal', no solo 'clasico'", () => {
    const short = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
    short.estilo = "deportivo";
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";

    const [resultado] = recomendar(short, [pantalonVestir], [short, pantalonVestir]);
    expect(resultado.score.nivel).toBe("con_cuidado");
  });

  it("no depende del orden -- recomendar(cinturón, [deportivo]) da lo mismo que al revés", () => {
    const short = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
    short.estilo = "deportivo";
    const cinturon = mkPrenda("accesorio", "#1A1A1A", 0, 0, 10);
    cinturon.estilo = "clasico";

    const [aB] = recomendar(short, [cinturon], [short, cinturon]);
    const [bA] = recomendar(cinturon, [short], [short, cinturon]);
    expect(aB.score.nivel).toBe("con_cuidado");
    expect(bA.score.nivel).toBe("con_cuidado");
  });

  it("deportivo + urbano SÍ combina -- zapatillas urbanas con jogger es una combinación real de calle", () => {
    const short = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
    short.estilo = "deportivo";
    const zapatillasUrbanas = mkPrenda("calzado", "#1F2A44", 222, 37, 19);
    zapatillasUrbanas.estilo = "urbano";

    const [resultado] = recomendar(short, [zapatillasUrbanas], [short, zapatillasUrbanas]);
    expect(resultado.score.nivel).not.toBe("con_cuidado");
  });

  it("sin estilo declarado en la otra prenda, no se inventa un choque", () => {
    // pantalón (no short/bermuda) a propósito -- esAbrigoConPiernasAlAire
    // (auditoría de sastrería siguiente) también bloquea sweater/buzo/
    // campera/saco contra un short/bermuda deportivo, sin importar el
    // estilo de la otra prenda (es un choque de género/clima, no de
    // formalidad). Este test aísla específicamente chocaRegistroDeportivo,
    // así que usa un pantalón deportivo (jogger), que no dispara esa otra
    // regla -- mismo patrón que el test de la línea 359.
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalon.estilo = "deportivo";
    const sweaterSinEstilo = mkPrenda("sweater", "#1A1A1A", 0, 0, 10);

    const [resultado] = recomendar(pantalon, [sweaterSinEstilo], [pantalon, sweaterSinEstilo]);
    expect(resultado.score.nivel).not.toBe("con_cuidado");
  });

  it("da una técnica de rescate específica, no la genérica de 'repetí un color'", () => {
    const short = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
    short.estilo = "deportivo";
    const cinturon = mkPrenda("accesorio", "#1A1A1A", 0, 0, 10);
    cinturon.estilo = "clasico";

    const [resultado] = recomendar(short, [cinturon], [short, cinturon]);
    expect(resultado.tecnicaRescate).toContain("No hay técnica de rescate");
  });

  it("mocasines/zapatos de vestir (cuero_liso) chocan con un short/jogger deportivo aunque tengan un estilo secundario casual", () => {
    const short = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
    short.estilo = "deportivo";
    const mocasines = mkPrenda("calzado", "#1A1A1A", 0, 0, 10);
    mocasines.textura = "cuero_liso";
    mocasines.estilo = "clasico";
    mocasines.estilos_secundarios = ["casual"];

    const [resultado] = recomendar(short, [mocasines], [short, mocasines]);
    expect(resultado.score.nivel).toBe("con_cuidado");
  });

  it("el mismo mocasín NO choca contra un jean/pantalón casual (solo se restringe contra un ancla deportiva)", () => {
    const jean = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    jean.estilo = "casual";
    const mocasines = mkPrenda("calzado", "#1A1A1A", 0, 0, 10);
    mocasines.textura = "cuero_liso";
    mocasines.estilo = "clasico";
    mocasines.estilos_secundarios = ["casual"];

    const [resultado] = recomendar(jean, [mocasines], [jean, mocasines]);
    expect(resultado.score.nivel).not.toBe("con_cuidado");
  });
});

describe("estilosDe", () => {
  it("sin secundarios, es solo el principal", () => {
    const p = mkPrenda("sweater", "#1A1A1A", 0, 0, 10);
    p.estilo = "clasico";
    expect(estilosDe(p)).toEqual(["clasico"]);
  });

  it("combina principal + secundarios", () => {
    const p = mkPrenda("sweater", "#C3922E", 40, 62, 47);
    p.estilo = "clasico";
    p.estilos_secundarios = ["casual"];
    expect(estilosDe(p).sort()).toEqual(["casual", "clasico"]);
  });

  it("sin estilo principal, son solo los secundarios", () => {
    const p = mkPrenda("sweater", "#1A1A1A", 0, 0, 10);
    p.estilos_secundarios = ["urbano"];
    expect(estilosDe(p)).toEqual(["urbano"]);
  });

  it("sin nada cargado, lista vacía", () => {
    const p = mkPrenda("sweater", "#1A1A1A", 0, 0, 10);
    expect(estilosDe(p)).toEqual([]);
  });

  it("no duplica si el principal está repetido en los secundarios", () => {
    const p = mkPrenda("sweater", "#1A1A1A", 0, 0, 10);
    p.estilo = "clasico";
    p.estilos_secundarios = ["clasico", "casual"];
    expect(estilosDe(p).sort()).toEqual(["casual", "clasico"]);
  });
});

describe("multi-estilo -- escape hatch del choque deportivo y de la formalidad", () => {
  it("una prenda clasico+casual (secundario) YA NO choca con deportivo, a diferencia de una puramente clasico", () => {
    // pantalón (no short/bermuda) por el mismo motivo que el test de
    // chocaRegistroDeportivo de arriba -- aísla la regla de formalidad de
    // la regla de género/clima (esAbrigoConPiernasAlAire), que sí seguiría
    // bloqueando un sweater contra un short/bermuda sin importar su
    // secundario casual (no es una cuestión de registro, es que un sweater
    // no va con las piernas al aire).
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalon.estilo = "deportivo";
    const sweaterVersatile = mkPrenda("sweater", "#C3922E", 40, 62, 47);
    sweaterVersatile.estilo = "clasico";
    sweaterVersatile.estilos_secundarios = ["casual"];

    const [resultado] = recomendar(pantalon, [sweaterVersatile], [pantalon, sweaterVersatile]);
    expect(resultado.score.nivel).not.toBe("con_cuidado");
  });

  it("control: la misma prenda SIN el secundario casual sigue chocando contra deportivo", () => {
    const short = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
    short.estilo = "deportivo";
    const sweaterPuroClasico = mkPrenda("sweater", "#C3922E", 40, 62, 47);
    sweaterPuroClasico.estilo = "clasico";

    const [resultado] = recomendar(short, [sweaterPuroClasico], [short, sweaterPuroClasico]);
    expect(resultado.score.nivel).toBe("con_cuidado");
  });

  it("un secundario que alcanza la formalidad del pantalón evita la degradación por informalidad", () => {
    // Mismo color exacto en las dos prendas -> scoreColor da "excelente"
    // seguro, así cualquier degradación posterior solo puede venir de
    // prendaMenosFormalQuePantalon.
    const pantalonCasual = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonCasual.estilo = "casual";
    // remera con estilo principal "deportivo" (rango 0, menos formal que el
    // pantalón casual, rango 1) pero con "urbano" (rango 1) como secundario
    // -- el mejor de sus estilos alcanza al pantalón, no debería degradar.
    const remeraConSecundarioUrbano = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
    remeraConSecundarioUrbano.estilo = "deportivo";
    remeraConSecundarioUrbano.estilos_secundarios = ["urbano"];

    const [resultado] = recomendar(pantalonCasual, [remeraConSecundarioUrbano], [pantalonCasual, remeraConSecundarioUrbano]);
    expect(resultado.score.nivel).toBe("excelente");

    // control: sin el secundario, sí degrada.
    const remeraSoloDeportiva = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
    remeraSoloDeportiva.estilo = "deportivo";
    const [resultadoControl] = recomendar(pantalonCasual, [remeraSoloDeportiva], [pantalonCasual, remeraSoloDeportiva]);
    expect(resultadoControl.score.nivel).toBe("muy_bueno");
    expect(resultadoControl.score.explicacion).toContain("más informal");
  });
});

// Auditoría de sastrería (Consejo, ronda de auditoría del motor): tercer
// eje real de un conjunto (después de color y registro), el único que no
// tenía ningún dato. Mismo patrón que la degradación de formalidad: nunca
// bloquea, solo baja "excelente" a "muy_bueno".
describe("recomendar -- volumen (calce): dos prendas holgadas pierden silueta", () => {
  it("jogger holgado + campera holgada (mismo color, excelente seguro) -> se degrada a muy_bueno con sugerencia de volumen", () => {
    const jogger = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    jogger.calce = "holgado";
    const campera = mkPrenda("campera", "#1A1A1A", 0, 0, 10);
    campera.calce = "holgado";

    const [resultado] = recomendar(jogger, [campera], [jogger, campera]);
    expect(resultado.score.nivel).toBe("muy_bueno");
    expect(resultado.score.explicacion).toContain("holgadas");
  });

  it("jogger holgado + campera REGULAR (calce por defecto) -> sigue excelente, no se inventa un choque por falta de dato", () => {
    const jogger = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    jogger.calce = "holgado";
    const campera = mkPrenda("campera", "#1A1A1A", 0, 0, 10);
    // calce por defecto: "regular" (ver mkPrenda).

    const [resultado] = recomendar(jogger, [campera], [jogger, campera]);
    expect(resultado.score.nivel).toBe("excelente");
  });

  it("pantalón AJUSTADO + camisa ajustada (mismo color) -> sigue excelente -- la regla es solo para dos holgadas, no para dos ajustadas", () => {
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalon.calce = "ajustado";
    const camisa = mkPrenda("camisa", "#1A1A1A", 0, 0, 10);
    camisa.calce = "ajustado";

    const [resultado] = recomendar(pantalon, [camisa], [pantalon, camisa]);
    expect(resultado.score.nivel).toBe("excelente");
  });

  it("no aplica entre calzado/accesorio -- dos prendas holgadas en categorías sin calce real no degradan", () => {
    const jogger = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    jogger.calce = "holgado";
    const zapatilla = mkPrenda("calzado", "#1A1A1A", 0, 0, 10);
    zapatilla.calce = "holgado"; // dato sin sentido real en calzado, pero no debería importar

    const [resultado] = recomendar(jogger, [zapatilla], [jogger, zapatilla]);
    expect(resultado.score.nivel).toBe("excelente");
  });

  it("no pisa un con_cuidado ya existente (color roto sigue con_cuidado, no se toca por volumen)", () => {
    const jogger = mkPrenda("pantalon", "#B93A32", 0, 60, 45); // rojo intenso
    jogger.calce = "holgado";
    const campera = mkPrenda("campera", "#2E8B57", 150, 60, 45); // verde intenso, hd~0.83 vd=0 -> 4b con_cuidado
    campera.calce = "holgado";

    const [resultado] = recomendar(jogger, [campera], [jogger, campera]);
    expect(resultado.score.nivel).toBe("con_cuidado");
  });
});

describe("outfitSirveParaEstilo", () => {
  it("matchea por el estilo principal del pantalón", () => {
    // "clasico", no "formal" -- desde que "formal" exige saco (ver el
    // describe dedicado más abajo), este test genérico usa un estilo sin
    // ese requisito extra para probar solo lo que dice el título.
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalon.estilo = "clasico";
    expect(outfitSirveParaEstilo([pantalon], "clasico")).toBe(true);
    expect(outfitSirveParaEstilo([pantalon], "casual")).toBe(false);
  });

  it("matchea también por un estilo secundario del pantalón", () => {
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalon.estilo = "clasico";
    pantalon.estilos_secundarios = ["casual"];
    expect(outfitSirveParaEstilo([pantalon], "casual")).toBe(true);
    expect(outfitSirveParaEstilo([pantalon], "clasico")).toBe(true);
  });

  it("sin ninguna prenda de piernas en el outfit, no matchea nada", () => {
    const remera = mkPrenda("remera", "#3366CC", 220, 60, 50);
    remera.estilo = "casual";
    expect(outfitSirveParaEstilo([remera], "casual")).toBe(false);
  });

  // Consejo, revisión integral: "el motor tampoco respeta los estilos de
  // cada prenda" -- un short deportivo tageado a mano como "formal" (nada
  // en PrendaForm lo impide) nunca puede servir de ancla para "formal" o
  // "clasico": ningún short es indumentaria de vestir, sea cual sea la
  // etiqueta. Ver TECHO_FORMALIDAD_POR_CATEGORIA en recommend.ts.
  it("un short deportivo tageado 'formal' a mano no sirve como ancla de formal/clasico, aunque el tag lo diga", () => {
    const shortFormal = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
    shortFormal.estilo = "formal";
    expect(outfitSirveParaEstilo([shortFormal], "formal")).toBe(false);
    expect(outfitSirveParaEstilo([shortFormal], "clasico")).toBe(false);
  });

  it("el techo no afecta rangos por debajo de él -- un short deportivo sigue sirviendo para su propio estilo real", () => {
    const shortDeportivo = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
    shortDeportivo.estilo = "deportivo";
    expect(outfitSirveParaEstilo([shortDeportivo], "deportivo")).toBe(true);
  });

  it("un pantalón o bermuda SÍ pueden servir para clasico -- el techo es solo para categorías intrínsecamente informales", () => {
    const bermudaFormal = mkPrenda("bermuda", "#1A1A1A", 0, 0, 10);
    bermudaFormal.estilo = "clasico";
    expect(outfitSirveParaEstilo([bermudaFormal], "clasico")).toBe(true);
  });
});

// Consejo, pedido explícito del usuario: "formal y oficina se mezclan...
// quiero un estilo oficina por un lado, y el estilo formal solamente el
// traje (pantalón de vestir, camisa, corbata, cinturón y saco). Formal es
// formal." Roles: asesor de imagen, sastre.
describe("outfitSirveParaEstilo -- formal exige saco, todo lo demás excluye saco/corbata", () => {
  function conPantalonVestir(estilo: Prenda["estilo"], secundarios: Prenda["estilo"][] = []): Prenda {
    const p = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    p.estilo = estilo;
    p.estilos_secundarios = secundarios as never;
    return p;
  }

  it("pantalón de vestir + camisa, SIN saco -> no sirve para 'formal' (es oficina, no traje)", () => {
    const pantalon = conPantalonVestir("formal", ["oficina"]);
    const camisa = mkPrenda("camisa", "#FAFAF7", 0, 0, 98);
    expect(outfitSirveParaEstilo([pantalon, camisa], "formal")).toBe(false);
    expect(outfitSirveParaEstilo([pantalon, camisa], "oficina")).toBe(true);
  });

  it("el mismo pantalón + saco -> SÍ sirve para 'formal' -- el saco es lo que lo convierte en traje", () => {
    const pantalon = conPantalonVestir("formal", ["oficina"]);
    const saco = mkPrenda("saco", "#1F2A44", 222, 39, 21);
    expect(outfitSirveParaEstilo([pantalon, saco], "formal")).toBe(true);
  });

  it("un traje NO necesita corbata para ser 'formal' -- el saco solo ya alcanza (cuello abierto sigue siendo formal)", () => {
    const pantalon = conPantalonVestir("formal");
    const saco = mkPrenda("saco", "#1F2A44", 222, 39, 21);
    expect(outfitSirveParaEstilo([pantalon, saco], "formal")).toBe(true);
  });

  it("una corbata puesta -> nunca sirve para 'oficina', aunque no haya saco", () => {
    const pantalon = conPantalonVestir("formal", ["oficina"]);
    const corbata = mkPrenda("accesorio", "#1F2A44", 222, 37, 19);
    corbata.requiere_cuello = true;
    expect(outfitSirveParaEstilo([pantalon, corbata], "oficina")).toBe(false);
  });

  it("un saco puesto -> nunca sirve para 'oficina', aunque no haya corbata -- el saco también define el traje", () => {
    const pantalon = conPantalonVestir("formal", ["oficina"]);
    const saco = mkPrenda("saco", "#1F2A44", 222, 39, 21);
    expect(outfitSirveParaEstilo([pantalon, saco], "oficina")).toBe(false);
  });

  it("pantalón de vestir + sweater, sin saco ni corbata -> sirve para 'oficina' -- el look 'elegante sport' real", () => {
    const pantalon = conPantalonVestir("formal", ["oficina"]);
    const sweater = mkPrenda("sweater", "#1F2A44", 222, 39, 21);
    sweater.estilo = "clasico";
    sweater.estilos_secundarios = ["oficina"];
    expect(outfitSirveParaEstilo([pantalon, sweater], "oficina")).toBe(true);
  });

  it("un cinturón (accesorio SIN requiere_cuello) no bloquea ni 'formal' ni 'oficina' -- el chequeo es específico de saco/corbata, no de cualquier accesorio", () => {
    const pantalon = conPantalonVestir("formal", ["oficina"]);
    const cinturon = mkPrenda("accesorio", "#5C3A21", 25, 47, 25);
    cinturon.textura = "cuero_liso";
    expect(outfitSirveParaEstilo([pantalon, cinturon], "oficina")).toBe(true);
    const saco = mkPrenda("saco", "#1F2A44", 222, 39, 21);
    expect(outfitSirveParaEstilo([pantalon, saco, cinturon], "formal")).toBe(true);
  });

  // Consejo, reporte real del usuario: "en el estilo urbano, como
  // resultado me arroja outfits con camisa y corbata... corbata es solo
  // formal, ni siquiera de oficina, es exclusivamente formal. Incluso
  // está taggeado de esa manera, pero el sistema no lo reconoce." Antes
  // el chequeo de esPrendaDeTrajeExclusiva solo corría para "oficina" --
  // nada bloqueaba una corbata (o un saco) en urbano/casual/clasico/
  // deportivo más allá del color, que scoreColor sí puede aprobar sin
  // saber nada de registro.
  it("una corbata puesta -> nunca sirve para urbano/casual/clasico/deportivo, solo para 'formal'", () => {
    const pantalonUrbano = conPantalonVestir("casual", ["urbano"]);
    const corbata = mkPrenda("accesorio", "#1F2A44", 222, 37, 19);
    corbata.requiere_cuello = true;
    for (const estilo of ["urbano", "casual", "clasico", "deportivo"] as const) {
      expect(outfitSirveParaEstilo([pantalonUrbano, corbata], estilo)).toBe(false);
    }
    const pantalonFormal = conPantalonVestir("formal");
    const saco = mkPrenda("saco", "#1F2A44", 222, 39, 21);
    expect(outfitSirveParaEstilo([pantalonFormal, saco, corbata], "formal")).toBe(true);
  });

  it("un saco puesto -> nunca sirve para urbano/casual/clasico/deportivo, mismo criterio que la corbata", () => {
    const pantalonUrbano = conPantalonVestir("casual", ["urbano"]);
    const saco = mkPrenda("saco", "#1F2A44", 222, 39, 21);
    for (const estilo of ["urbano", "casual", "clasico", "deportivo"] as const) {
      expect(outfitSirveParaEstilo([pantalonUrbano, saco], estilo)).toBe(false);
    }
  });

  // Consejo, aclaración explícita del usuario: "el zapato de vestir no
  // puede tener suela blanca -- debe ser todo el mismo color, o todo
  // marrón, o todo negro". Rol: sastre. Verificado contra el placard
  // real: 2 de los 3 zapatos de vestir del usuario tienen
  // suela_contraste=true y hoy aparecían igual en "Formal".
  it("un zapato de vestir con suela de contraste (blanca/crema) NO sirve para 'formal', aunque tenga saco puesto", () => {
    const pantalon = conPantalonVestir("formal");
    const saco = mkPrenda("saco", "#1F2A44", 222, 39, 21);
    const zapatoSuelaContraste = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    zapatoSuelaContraste.corte_calzado = "zapato_vestir";
    zapatoSuelaContraste.suela_contraste = true;
    expect(outfitSirveParaEstilo([pantalon, saco, zapatoSuelaContraste], "formal")).toBe(false);
  });

  it("el mismo zapato de vestir, SIN suela de contraste (todo el mismo tono) -> sí sirve para 'formal'", () => {
    const pantalon = conPantalonVestir("formal");
    const saco = mkPrenda("saco", "#1F2A44", 222, 39, 21);
    const zapatoMonocromo = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    zapatoMonocromo.corte_calzado = "zapato_vestir";
    zapatoMonocromo.suela_contraste = false;
    expect(outfitSirveParaEstilo([pantalon, saco, zapatoMonocromo], "formal")).toBe(true);
  });

  it("suela de contraste no bloquea 'oficina' -- es un detalle 'smart' válido fuera del traje estricto", () => {
    const pantalon = conPantalonVestir("formal", ["oficina"]);
    const sweater = mkPrenda("sweater", "#1F2A44", 222, 39, 21);
    sweater.estilo = "clasico";
    sweater.estilos_secundarios = ["oficina"];
    const zapatoSuelaContraste = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    zapatoSuelaContraste.corte_calzado = "zapato_vestir";
    zapatoSuelaContraste.suela_contraste = true;
    expect(outfitSirveParaEstilo([pantalon, sweater, zapatoSuelaContraste], "oficina")).toBe(true);
  });

  it("sin ningún calzado en el outfit, la regla de suela de contraste no tiene nada que bloquear -- 'formal' sigue sirviendo con solo saco", () => {
    const pantalon = conPantalonVestir("formal");
    const saco = mkPrenda("saco", "#1F2A44", 222, 39, 21);
    expect(outfitSirveParaEstilo([pantalon, saco], "formal")).toBe(true);
  });
});

describe("outfitEsCoherenteParaEstilo", () => {
  it("reporte real del usuario: un buzo estilo=casual bajo un pantalón formal pasaba 'sirve para formal' -- acá NO", () => {
    const pantalonFormal = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonFormal.estilo = "formal";
    const saco = mkPrenda("saco", "#1F2A44", 222, 39, 21); // "formal" exige saco -- ver el describe dedicado
    const buzoCasual = mkPrenda("buzo", "#5A5F3D", 90, 30, 30);
    buzoCasual.estilo = "casual";
    // la versión laxa lo dejaba pasar (solo mira el pantalón) -- la estricta no.
    expect(outfitSirveParaEstilo([pantalonFormal, saco, buzoCasual], "formal")).toBe(true);
    expect(outfitEsCoherenteParaEstilo([pantalonFormal, saco, buzoCasual], "formal")).toBe(false);
  });

  it("outfit genuinamente coherente (torso también formal) -> true", () => {
    const pantalonFormal = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonFormal.estilo = "formal";
    const saco = mkPrenda("saco", "#1F2A44", 222, 39, 21);
    const camisaFormal = mkPrenda("camisa", "#FAFAF7", 0, 0, 98);
    camisaFormal.estilo = "formal";
    expect(outfitEsCoherenteParaEstilo([pantalonFormal, saco, camisaFormal], "formal")).toBe(true);
  });

  it("si el pantalón ni siquiera sirve para el estilo pedido, false directo (sin llegar a mirar advertencias)", () => {
    const pantalonFormal = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonFormal.estilo = "formal";
    expect(outfitEsCoherenteParaEstilo([pantalonFormal], "casual")).toBe(false);
  });

  it("también excluye por una democión de CALZADO, no solo de torso -- cualquier advertencia de registro cuenta", () => {
    const pantalonFormal = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonFormal.estilo = "formal";
    const zapatillasUrbanas = mkPrenda("calzado", "#1A1A1A", 0, 0, 15);
    zapatillasUrbanas.estilo = "urbano";
    expect(outfitEsCoherenteParaEstilo([pantalonFormal, zapatillasUrbanas], "formal")).toBe(false);
  });
});

describe("registroOutfit / advertenciasDeRegistro", () => {
  it("toma el estilo del pantalón como registro del outfit completo", () => {
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";
    const camisa = mkPrenda("camisa", "#FAFAF7", 0, 0, 98);
    expect(registroOutfit([pantalonVestir, camisa])).toBe("Formal");
  });

  it("sin pantalón en el outfit, no hay registro (no se inventa)", () => {
    const remera = mkPrenda("remera", "#3366CC", 220, 60, 50);
    expect(registroOutfit([remera])).toBeNull();
  });

  it("sin estilo cargado en el pantalón, no hay registro", () => {
    const pantalonSinEstilo = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    expect(registroOutfit([pantalonSinEstilo])).toBeNull();
  });

  it("avisa cuándo una prenda del outfit es más informal que el pantalón", () => {
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";
    const buzo = mkPrenda("buzo", "#1A1A1A", 0, 0, 10);
    buzo.estilo = "casual";
    const zapatillas = mkPrenda("calzado", "#F5F5F0", 0, 0, 95);
    zapatillas.estilo = "urbano";

    const avisos = advertenciasDeRegistro([pantalonVestir, buzo, zapatillas]);
    expect(avisos).toHaveLength(2);
    expect(avisos.some((a) => a.includes("buzo"))).toBe(true);
    expect(avisos.some((a) => a.includes("calzado"))).toBe(true);
  });

  it("sin ninguna prenda más informal, no hay avisos", () => {
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";
    const camisa = mkPrenda("camisa", "#FAFAF7", 0, 0, 98);
    camisa.estilo = "clasico";
    expect(advertenciasDeRegistro([pantalonVestir, camisa])).toEqual([]);
  });

  // Agregado al ampliar el catálogo con bermuda/short_deportivo: la lógica
  // de registro/formalidad de acá arriba se generalizó de "pantalon" a
  // CATEGORIAS_PIERNAS (recommend.ts) -- estos casos verifican que un
  // outfit sin ningún pantalón largo, pero con un bermuda o un short
  // deportivo, no quede sin registro ni sin avisos de formalidad, como
  // pasaba antes de la generalización.
  it("sin pantalón largo pero con un bermuda con estilo, el bermuda ancla el registro", () => {
    const bermudaClasico = mkPrenda("bermuda", "#D8C7A1", 40, 30, 70);
    bermudaClasico.estilo = "clasico";
    const camisa = mkPrenda("camisa", "#FAFAF7", 0, 0, 98);
    expect(registroOutfit([bermudaClasico, camisa])).toBe("Clásico");
  });

  it("un short deportivo también ancla el registro cuando no hay pantalón ni bermuda", () => {
    const shortDeportivo = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
    shortDeportivo.estilo = "deportivo";
    expect(registroOutfit([shortDeportivo])).toBe("Deportivo");
  });

  it("avisa cuándo una prenda desentona en formalidad con un bermuda (no solo con un pantalón), con el nombre correcto en el mensaje", () => {
    const bermudaClasico = mkPrenda("bermuda", "#D8C7A1", 40, 30, 70);
    bermudaClasico.estilo = "clasico";
    const buzo = mkPrenda("buzo", "#1A1A1A", 0, 0, 10);
    buzo.estilo = "casual";
    const avisos = advertenciasDeRegistro([bermudaClasico, buzo]);
    expect(avisos).toEqual(["buzo más informal que el bermuda"]);
  });

  // Consejo, revisión integral: "el motor tampoco respeta los estilos de
  // cada prenda... en urbano puso un jean con una campera deportiva".
  // Verificado contra el placard REAL del usuario (vía Supabase MCP): no
  // se reprodujo ESE caso puntual (ya lo bloqueaba el fix anterior de
  // outfitEsCoherenteParaEstilo), pero la auditoría completa de su
  // placard encontró un caso real y sí vigente -- una remera básica con
  // estilos_secundarios=["urbano","clasico","formal"] (PrendaForm no
  // restringe qué estilo puede llevar cada categoría) armaba "Vestite
  // hoy > Formal" con pantalón de vestir + esa remera + zapatos de cuero.
  // Ver TECHO_FORMALIDAD_POR_CATEGORIA en recommend.ts.
  it("una remera tageada 'formal' a mano SIGUE avisando -- ninguna remera es indumentaria formal real", () => {
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";
    const remeraFormal = mkPrenda("remera", "#D8C7A1", 40, 30, 70);
    remeraFormal.estilo = "casual";
    remeraFormal.estilos_secundarios = ["urbano", "clasico", "formal"];
    const avisos = advertenciasDeRegistro([pantalonVestir, remeraFormal]);
    expect(avisos).toEqual(["remera más informal que el pantalon"]);
  });

  it("mismo caso pero con la remera tageada 'clasico' puro -- también avisa (clasico y formal comparten rango 2)", () => {
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";
    const remeraClasica = mkPrenda("remera", "#B7D2EC", 209, 58, 82);
    remeraClasica.estilo = "clasico";
    remeraClasica.estilos_secundarios = ["casual"];
    const avisos = advertenciasDeRegistro([pantalonVestir, remeraClasica]);
    expect(avisos).toEqual(["remera más informal que el pantalon"]);
  });

  it("el techo no inventa avisos donde antes no había -- una remera 'clasico' sigue sin chocar contra un pantalón 'casual'", () => {
    const pantalonCasual = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonCasual.estilo = "casual";
    const remeraClasica = mkPrenda("remera", "#B7D2EC", 209, 58, 82);
    remeraClasica.estilo = "clasico";
    expect(advertenciasDeRegistro([pantalonCasual, remeraClasica])).toEqual([]);
  });

  it("una CAMISA (a diferencia de la remera) sí puede ser genuinamente formal -- el techo es solo para remera/buzo/short deportivo", () => {
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";
    const camisaFormal = mkPrenda("camisa", "#FAFAF7", 0, 0, 98);
    camisaFormal.estilo = "formal";
    expect(advertenciasDeRegistro([pantalonVestir, camisaFormal])).toEqual([]);
  });

  // Consejo, auditoría integral (rol: sastre/asesor de imagen) -- verificado
  // contra el placard real del usuario: una zapatilla urbana (corte_calzado
  // default, "zapatilla_urbana") tageada con "clasico" como estilo
  // secundario aparecía como calzado YA LISTO en "Vestite hoy > Formal" y
  // "Clásico" -- ninguna zapatilla (urbana, de lona o de running) es
  // calzado de vestir real por más que se la tagee así, es una cuestión de
  // CONSTRUCCIÓN (suela de goma, sin costura de vestir), no de estilo
  // declarado. Un zapato de vestir o un mocasín (CORTES_DE_VESTIR) siguen
  // sin techo -- esos sí son cuero de vestir real.
  it("una zapatilla (urbana/lona/running) tageada 'clasico' o 'formal' SIGUE avisando -- ninguna zapatilla es calzado de vestir real", () => {
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";
    const zapatillaUrbana = mkPrenda("calzado", "#1F2A44", 222, 39, 21);
    zapatillaUrbana.estilo = "urbano";
    zapatillaUrbana.estilos_secundarios = ["casual", "clasico"];
    zapatillaUrbana.corte_calzado = "zapatilla_urbana";
    expect(advertenciasDeRegistro([pantalonVestir, zapatillaUrbana])).toEqual(["calzado más informal que el pantalon"]);

    const zapatillaRunning = { ...zapatillaUrbana, corte_calzado: "zapatilla_running" as const };
    expect(advertenciasDeRegistro([pantalonVestir, zapatillaRunning])).toEqual(["calzado más informal que el pantalon"]);

    const zapatillaLona = { ...zapatillaUrbana, corte_calzado: "zapatilla_lona" as const };
    expect(advertenciasDeRegistro([pantalonVestir, zapatillaLona])).toEqual(["calzado más informal que el pantalon"]);
  });

  it("un zapato de vestir o un mocasín SÍ pueden ser genuinamente formales/clásicos -- el techo de calzado no los toca", () => {
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";

    const zapatoVestir = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    zapatoVestir.estilo = "formal";
    zapatoVestir.corte_calzado = "zapato_vestir";
    expect(advertenciasDeRegistro([pantalonVestir, zapatoVestir])).toEqual([]);

    const mocasin = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    mocasin.estilo = "clasico";
    mocasin.corte_calzado = "mocasin";
    expect(advertenciasDeRegistro([pantalonVestir, mocasin])).toEqual([]);
  });
});

describe("recomendar -- corbata necesita cuello", () => {
  it("corbata + buzo NO es 'excelente' aunque el color combine perfecto -- no hay dónde apoyarla", () => {
    const corbata = mkPrenda("accesorio", "#1F2A44", 222, 37, 19);
    corbata.requiere_cuello = true;
    const buzo = mkPrenda("buzo", "#1A1A1A", 0, 0, 10); // negro, neutro -- combinaría "excelente" en color puro

    const [resultado] = recomendar(corbata, [buzo], [corbata, buzo]);
    expect(resultado.score.nivel).toBe("con_cuidado");
    expect(resultado.score.explicacion).toContain("cuello");
    expect(resultado.tecnicaRescate).toContain("camisa");
  });

  it("corbata + camisa SÍ combina normalmente por color -- la camisa es justamente la prenda con cuello", () => {
    const corbata = mkPrenda("accesorio", "#1F2A44", 222, 37, 19);
    corbata.requiere_cuello = true;
    const camisaBlanca = mkPrenda("camisa", "#FAFAF7", 0, 0, 98); // neutro -- excelente en color

    const [resultado] = recomendar(corbata, [camisaBlanca], [corbata, camisaBlanca]);
    expect(resultado.score.nivel).toBe("excelente");
  });

  it("corbata + pantalón SÍ combina normalmente -- la regla es solo contra prendas de torso sin cuello", () => {
    const corbata = mkPrenda("accesorio", "#1F2A44", 222, 37, 19);
    corbata.requiere_cuello = true;
    const pantalonNegro = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);

    const [resultado] = recomendar(corbata, [pantalonNegro], [corbata, pantalonNegro]);
    expect(resultado.score.nivel).toBe("excelente");
  });

  it("la regla no depende del orden -- recomendar(buzo, [corbata]) da lo mismo que recomendar(corbata, [buzo])", () => {
    const corbata = mkPrenda("accesorio", "#1F2A44", 222, 37, 19);
    corbata.requiere_cuello = true;
    const buzo = mkPrenda("buzo", "#1A1A1A", 0, 0, 10);

    const [desdeElBuzo] = recomendar(buzo, [corbata], [corbata, buzo]);
    expect(desdeElBuzo.score.nivel).toBe("con_cuidado");
    expect(desdeElBuzo.tecnicaRescate).toContain("camisa");
  });

  it("dos corbatas entre sí no se marcan (ninguna es el torso de la otra) -- se evalúan por color como cualquier accesorio", () => {
    const corbataA = mkPrenda("accesorio", "#1F2A44", 222, 37, 19);
    corbataA.requiere_cuello = true;
    const corbataB = mkPrenda("accesorio", "#6B2737", 350, 45, 29);
    corbataB.id = "corbata-b";
    corbataB.requiere_cuello = true;

    const [resultado] = recomendar(corbataA, [corbataB], [corbataA, corbataB]);
    expect(resultado.score.nivel).not.toBe("con_cuidado");
  });

  it("un cinturón (sin requiere_cuello) SÍ combina normal con un buzo -- la regla no aplica a cualquier accesorio", () => {
    const cinturon = mkPrenda("accesorio", "#1A1A1A", 0, 0, 10);
    const buzo = mkPrenda("buzo", "#3366CC", 220, 60, 50);

    const [resultado] = recomendar(cinturon, [buzo], [cinturon, buzo]);
    expect(resultado.score.nivel).toBe("excelente");
  });

  // saco -- categoría nueva, pedido explícito del usuario ("un traje azul
  // marino"). Mismo criterio que buzo/sweater/campera: un saco por sí solo
  // no tiene cuello real, una corbata necesita la camisa de abajo.
  it("corbata + saco (sin camisa) NO es 'excelente' -- mismo criterio que corbata + buzo", () => {
    const corbata = mkPrenda("accesorio", "#1F2A44", 222, 37, 19);
    corbata.requiere_cuello = true;
    const saco = mkPrenda("saco", "#1F2A44", 222, 37, 19);

    const [resultado] = recomendar(corbata, [saco], [corbata, saco]);
    expect(resultado.score.nivel).toBe("con_cuidado");
    expect(resultado.tecnicaRescate).toContain("camisa");
  });
});

describe("tecnicaRescate", () => {
  const base: Prenda = mkPrenda("pantalon", "#000000", 0, 80, 50);
  const candidato: Prenda = mkPrenda("remera", "#111111", 100, 70, 54);

  it("sugiere puente neutro si hay un neutro disponible en el placard", () => {
    const neutro = mkPrenda("campera", "#808080", 0, 5, 50);
    const t = tecnicaRescate(base, candidato, [base, candidato, neutro]);
    expect(t).toContain("campera");
  });

  it("sugiere separar por textura si no hay neutro pero las texturas difieren", () => {
    const b = { ...base, textura: "algodon" as const };
    const c = { ...candidato, textura: "lana" as const };
    const t = tecnicaRescate(b, c, [b, c]);
    expect(t).toContain("textura");
  });

  it("2da ronda -- denim también cuenta como 'texturado' (antes faltaba en FAMILIA_TEXTURA y nunca se ofrecía este rescate para un jean)", () => {
    const jean = { ...base, textura: "denim" as const };
    const c = { ...candidato, textura: "algodon" as const };
    const t = tecnicaRescate(jean, c, [jean, c]);
    expect(t).toContain("textura");
  });

  it("cae en repetir color como catch-all cuando nada más aplica", () => {
    const t = tecnicaRescate(base, candidato, [base, candidato]);
    expect(t).toContain("accesorio");
  });

  it("poliéster cuenta como 'liso' -- separa por textura contra lana (texturado), pero no contra algodón (liso también)", () => {
    const remeraDeportiva = { ...base, textura: "poliester" as const };
    const sweater = { ...candidato, textura: "lana" as const };
    const conLana = tecnicaRescate(remeraDeportiva, sweater, [remeraDeportiva, sweater]);
    expect(conLana).toContain("textura");

    const remera = { ...candidato, textura: "algodon" as const };
    const conAlgodon = tecnicaRescate(remeraDeportiva, remera, [remeraDeportiva, remera]);
    expect(conAlgodon).not.toContain("textura");
  });

  // Consejo, auditoría integral (rol: ingeniero textil) -- FAMILIA_TEXTURA
  // se armó con 8 valores y se fue actualizando de a pares cada vez que el
  // enum Textura creció (denim/acolchado en la 2da ronda, ver el test de
  // arriba), pero "impermeable" y "tricot" -- agregados en una ronda
  // posterior de catálogo -- quedaron afuera del mapa: sin entrada,
  // tecnicaRescate nunca ofrecía "separar por textura" para ninguna de las
  // dos, aunque el resto del motor (PrendaIcon.tsx, TEXTURA_BRILLO) ya las
  // trata como una familia real y distinta de la lana/tejido grueso.
  it("impermeable y tricot cuentan como 'liso' (mismo grupo que poliéster/seda/viscosa, ver TEXTURA_BRILLO) -- separan por textura contra lana", () => {
    const camperaImpermeable = { ...base, textura: "impermeable" as const };
    const sweaterLana = { ...candidato, textura: "lana" as const };
    expect(tecnicaRescate(camperaImpermeable, sweaterLana, [camperaImpermeable, sweaterLana])).toContain("textura");

    const camperaTricot = { ...base, textura: "tricot" as const };
    expect(tecnicaRescate(camperaTricot, sweaterLana, [camperaTricot, sweaterLana])).toContain("textura");

    // pero NO entre sí, ni contra otro "liso" (poliéster) -- misma familia.
    const remeraPoliester = { ...candidato, textura: "poliester" as const };
    expect(tecnicaRescate(camperaImpermeable, remeraPoliester, [camperaImpermeable, remeraPoliester])).not.toContain(
      "textura",
    );
  });
});

describe("color hex <-> HSL roundtrip", () => {
  it("hexToHsl / hslToHex son consistentes", () => {
    const hsl = hexToHsl("#3366CC");
    const hex = hslToHex(hsl.h, hsl.s, hsl.l);
    // margen de redondeo por conversión float, no exacto al pixel
    const back = hexToHsl(hex);
    expect(Math.abs(back.h - hsl.h)).toBeLessThanOrEqual(2);
  });

  it("rgbToHsl de blanco puro da l=100, s=0", () => {
    const hsl = rgbToHsl(255, 255, 255);
    expect(hsl.l).toBe(100);
    expect(hsl.s).toBe(0);
  });

  it("rgbToHsl nunca devuelve h=360 (violaría el CHECK color_h < 360 del schema)", () => {
    // Rojos cuyo hue crudo redondea a 360 antes del %360 -- encontrados por
    // la revisión de Consejo, no un caso de laboratorio: se disparan con
    // fotos reales de remeras/prendas rojas.
    const rojosLimite = [
      [255, 0, 2],
      [255, 0, 1],
      [192, 0, 1],
      [139, 0, 1],
    ];
    for (const [r, g, b] of rojosLimite) {
      const hsl = rgbToHsl(r, g, b);
      expect(hsl.h).toBeGreaterThanOrEqual(0);
      expect(hsl.h).toBeLessThan(360);
    }
  });
});

describe("categoriasAusentes", () => {
  it("devuelve las categorías sin ninguna prenda en el placard", () => {
    const placard = [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10), mkPrenda("remera", "#F5F5F0", 60, 5, 95)];
    const ausentes = categoriasAusentes(placard);
    expect(ausentes).toContain("camisa");
    expect(ausentes).toContain("campera");
    expect(ausentes).toContain("buzo");
    expect(ausentes).toContain("sweater");
    expect(ausentes).toContain("calzado");
    expect(ausentes).toContain("accesorio");
    expect(ausentes).toContain("saco");
    expect(ausentes).not.toContain("pantalon");
    expect(ausentes).not.toContain("remera");
  });

  it("placard vacío: todas las categorías están ausentes", () => {
    // 11 -- bermuda y short_deportivo (junto con pantalon, remera, camisa,
    // buzo, sweater, campera, calzado y accesorio) más saco, agregada
    // después a pedido explícito del usuario ("un traje azul marino").
    expect(categoriasAusentes([])).toHaveLength(11);
  });
});

describe("estacionActual", () => {
  it("diciembre, enero, febrero -> verano", () => {
    expect(estacionActual(new Date(2026, 11, 15))).toBe("verano");
    expect(estacionActual(new Date(2026, 0, 15))).toBe("verano");
    expect(estacionActual(new Date(2026, 1, 15))).toBe("verano");
  });

  it("junio, julio, agosto -> invierno", () => {
    expect(estacionActual(new Date(2026, 5, 15))).toBe("invierno");
    expect(estacionActual(new Date(2026, 6, 15))).toBe("invierno");
    expect(estacionActual(new Date(2026, 7, 15))).toBe("invierno");
  });

  it("marzo-mayo y septiembre-noviembre -> entretiempo (el tipo no separa otoño de primavera)", () => {
    expect(estacionActual(new Date(2026, 2, 15))).toBe("entretiempo");
    expect(estacionActual(new Date(2026, 4, 15))).toBe("entretiempo");
    expect(estacionActual(new Date(2026, 8, 15))).toBe("entretiempo");
    expect(estacionActual(new Date(2026, 10, 15))).toBe("entretiempo");
  });
});

describe("armarOutfitsSugeridos", () => {
  it("arma un outfit por pantalón, tomando la mejor prenda propia por lugar", () => {
    const placard = [
      mkPrenda("pantalon", "#1A1A1A", 0, 0, 10), // negro, neutro
      mkPrenda("remera", "#3366CC", 220, 60, 50), // combina excelente con un neutro
      mkPrenda("calzado", "#5C3A21", 25, 50, 30),
      mkPrenda("accesorio", "#8C8C8C", 0, 0, 55), // gris neutro -- combina con cualquier cosa, sin ambigüedad
    ];
    const outfits = armarOutfitsSugeridos(placard);
    expect(outfits).toHaveLength(1);
    expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(
      ["accesorio", "calzado", "pantalon", "remera"].sort(),
    );
  });

  it("cada outfit devuelto trae puntaje/explicacionPuntaje, y el pool queda ordenado de mayor a menor puntaje", () => {
    const placard = [
      // dos anclas -- una que arma un outfit perfecto (mismo color exacto
      // en todo) y otra que arma uno con un salto de registro real (calzado
      // urbano contra un pantalón de vestir), para que haya variación de
      // puntaje real que ordenar.
      mkPrenda("pantalon", "#1A1A1A", 0, 0, 10),
      mkPrenda("remera", "#1A1A1A", 0, 0, 10),
    ];
    const pantalonVestir = mkPrenda("pantalon", "#8C8C8C", 0, 0, 55);
    pantalonVestir.estilo = "formal";
    const zapatillasUrbanas = mkPrenda("calzado", "#8C8C8C", 0, 0, 55);
    zapatillasUrbanas.estilo = "urbano";
    placard.push(pantalonVestir, zapatillasUrbanas);

    const outfits = armarOutfitsSugeridos(placard);
    expect(outfits.length).toBeGreaterThan(1);
    for (const o of outfits) {
      expect(typeof o.puntaje).toBe("number");
      expect(o.puntaje).toBeGreaterThanOrEqual(1);
      expect(o.puntaje).toBeLessThanOrEqual(10);
      expect(typeof o.explicacionPuntaje).toBe("string");
    }
    // orden descendente, no ascendente ni al azar.
    for (let i = 1; i < outfits.length; i++) {
      expect(outfits[i - 1].puntaje).toBeGreaterThanOrEqual(outfits[i].puntaje);
    }
    // el mejor puntaje (el primero) tiene que ser el del outfit perfecto,
    // no el que tiene el salto de registro.
    expect(outfits[0].puntaje).toBe(10);
  });

  it("3ra ronda -- si el accesorio elegido choca con el torso (aunque cada uno por separado combine con el pantalón), se cae del outfit en vez de armar una combinación real mala", () => {
    // celeste/azul saturado (remera) + naranja quemado saturado (accesorio),
    // misma luminosidad -- compiten en pie de igualdad (regla 5). Cada uno
    // por separado es "excelente" contra el pantalón negro (neutro), así
    // que antes de este fix mejorPropia los elegía a los dos sin cruzarlos.
    const placard = [
      mkPrenda("pantalon", "#1A1A1A", 0, 0, 10),
      mkPrenda("remera", "#3366CC", 220, 60, 50),
      mkPrenda("accesorio", "#C8763F", 25, 60, 45),
    ];
    const outfits = armarOutfitsSugeridos(placard);
    expect(outfits).toHaveLength(1);
    expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(["pantalon", "remera"].sort());
  });

  it("3ra ronda -- caso reportado en la revisión: cinturón marrón de cuero + zapatos de cuero negros no terminan juntos en el mismo outfit armado solo", () => {
    const jeanNegro = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    const remeraBlanca = mkPrenda("remera", "#FAFAF7", 0, 0, 98);
    const zapatoNegro = mkPrenda("calzado", "#1C1210", 10, 27, 9);
    zapatoNegro.textura = "cuero_liso";
    const cinturonMarron = mkPrenda("accesorio", "#5C3A21", 25, 47, 25);
    cinturonMarron.textura = "cuero_liso";
    const placard = [jeanNegro, remeraBlanca, zapatoNegro, cinturonMarron];

    const [outfit] = armarOutfitsSugeridos(placard);
    const categorias = outfit.prendas.map((p) => p.categoria);
    // el calzado se elige siempre (nunca choca con el jean por sí solo);
    // el accesorio, si choca con el calzado elegido, se cae del outfit --
    // nunca los dos juntos.
    expect(categorias).toContain("calzado");
    expect(categorias).not.toContain("accesorio");
  });

  // Auditoría de Consejo (revisor de QA, verificado por ejecución): antes
  // de este fix, accesorioOk cruzaba accesorio vs. calzado y accesorio
  // vs. torso, pero calzado vs. torso nunca se cruzaban entre sí -- un
  // outfit podía armarse con calzado y torso que chocan directamente
  // entre ellos, aunque cada uno por separado combinara con el pantalón.
  // Mismo par de colores que ya prueba el choque accesorio-vs-torso más
  // arriba (celeste/azul saturado vs. naranja quemado saturado, misma
  // luminosidad -- compiten en pie de igualdad, regla 5), pero acá en
  // calzado en vez de accesorio.
  it("calzado que choca con el torso elegido se cae del outfit, en vez de armar una combinación real mala", () => {
    const placard = [
      mkPrenda("pantalon", "#1A1A1A", 0, 0, 10),
      mkPrenda("remera", "#3366CC", 220, 60, 50),
      mkPrenda("calzado", "#C8763F", 25, 60, 45),
    ];
    const outfits = armarOutfitsSugeridos(placard);
    expect(outfits).toHaveLength(1);
    expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(["pantalon", "remera"].sort());
  });

  it("calzado que combina bien con torso Y pantalón se mantiene en el outfit, sin cambios", () => {
    const placard = [
      mkPrenda("pantalon", "#1A1A1A", 0, 0, 10),
      mkPrenda("remera", "#3366CC", 220, 60, 50),
      mkPrenda("calzado", "#5C3A21", 25, 47, 25),
    ];
    const outfits = armarOutfitsSugeridos(placard);
    expect(outfits).toHaveLength(1);
    expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(["calzado", "pantalon", "remera"].sort());
  });

  it("sin pantalón en el placard, no arma nada (no hay ancla)", () => {
    const placard = [mkPrenda("remera", "#3366CC", 220, 60, 50), mkPrenda("calzado", "#5C3A21", 25, 50, 30)];
    expect(armarOutfitsSugeridos(placard)).toHaveLength(0);
  });

  it("sin ninguna prenda de torso que combine, no arma outfit para ese pantalón (nunca fuerza un 'con cuidado')", () => {
    // rojo saturado vs verde saturado, misma luminosidad -- se funden (con_cuidado).
    const placard = [mkPrenda("pantalon", "#CC3333", 0, 60, 50), mkPrenda("remera", "#33CC33", 120, 60, 52)];
    expect(armarOutfitsSugeridos(placard)).toHaveLength(0);
  });

  it("calzado/accesorio son opcionales -- un outfit válido puede tener solo pantalón + torso", () => {
    const placard = [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10), mkPrenda("remera", "#3366CC", 220, 60, 50)];
    const outfits = armarOutfitsSugeridos(placard);
    expect(outfits).toHaveLength(1);
    expect(outfits[0].prendas).toHaveLength(2);
  });

  it("con varios torsos propios que combinan, arma una variante por cada uno (pool para 'otras opciones')", () => {
    const placard = [
      mkPrenda("pantalon", "#1A1A1A", 0, 0, 10), // negro, neutro -- combina con cualquier torso
      mkPrenda("remera", "#3366CC", 220, 60, 50),
      mkPrenda("camisa", "#F5F5F0", 0, 5, 95),
      mkPrenda("sweater", "#6B2737", 350, 55, 35),
    ];
    const outfits = armarOutfitsSugeridos(placard);
    expect(outfits).toHaveLength(3);
    const torsos = outfits.map((o) => o.prendas.find((p) => p.categoria !== "pantalon")?.categoria).sort();
    expect(torsos).toEqual(["camisa", "remera", "sweater"]);
  });

  // Consejo, auditoría integral -- pedido explícito del usuario: "el motor
  // nunca está ofreciendo las zapatillas blancas... fijate si podés poner
  // alguna ponderación para que las prendas que salen mucho vayan
  // rotando, sin sacrificar puntaje". Verificado por ejecución contra el
  // placard real: antes de este fix, calzado/accesorio se elegían con
  // mejorPropia (UN solo "mejor" por ancla, siempre el mismo) -- un par de
  // zapatillas que nunca fuera el número 1 estricto no aparecía JAMÁS en
  // "Vestite hoy", sin importar cuántas veces se pidieran "otras
  // opciones". candidatasPropias (ya usada para el torso) reemplaza a
  // mejorPropia también acá.
  it("con varios calzados propios que combinan igual de bien, arma una variante por cada uno -- no se queda con uno solo", () => {
    const placard = [
      mkPrenda("pantalon", "#1A1A1A", 0, 0, 10), // negro, neutro -- combina con cualquier calzado
      mkPrenda("remera", "#3366CC", 220, 60, 50),
      mkPrenda("calzado", "#5C3A21", 25, 50, 30), // marrón
      mkPrenda("calzado", "#F5F5F0", 0, 5, 95), // blanco
    ];
    const outfits = armarOutfitsSugeridos(placard);
    expect(outfits).toHaveLength(2);
    const calzados = outfits.map((o) => o.prendas.find((p) => p.categoria === "calzado")?.color_hex).sort();
    expect(calzados).toEqual(["#5C3A21", "#F5F5F0"]);
    // sin sacrificar puntaje: ninguno de los dos se descarta por el otro --
    // cada uno arma su propia combinación, puntuada de verdad por separado
    // (no hay un "ganador único" que tape al resto).
    for (const o of outfits) expect(o.puntaje).toBeGreaterThanOrEqual(8);
  });

  it("con varios accesorios propios que combinan igual de bien, arma una variante por cada uno -- mismo criterio que el calzado", () => {
    const placard = [
      mkPrenda("pantalon", "#1A1A1A", 0, 0, 10),
      mkPrenda("remera", "#3366CC", 220, 60, 50),
      mkPrenda("accesorio", "#5C3A21", 25, 50, 30),
      mkPrenda("accesorio", "#8C8C8C", 0, 0, 55),
    ];
    const outfits = armarOutfitsSugeridos(placard);
    expect(outfits).toHaveLength(2);
    const accesorios = outfits.map((o) => o.prendas.find((p) => p.categoria === "accesorio")?.color_hex).sort();
    expect(accesorios).toEqual(["#5C3A21", "#8C8C8C"]);
  });

  it("combina cada torso con cada calzado válido (producto cartesiano), no solo torso con torso", () => {
    const placard = [
      mkPrenda("pantalon", "#1A1A1A", 0, 0, 10),
      mkPrenda("remera", "#3366CC", 220, 60, 50),
      mkPrenda("camisa", "#F5F5F0", 0, 5, 95),
      mkPrenda("calzado", "#5C3A21", 25, 50, 30),
      mkPrenda("calzado", "#F5F5F0", 0, 5, 95),
    ];
    const outfits = armarOutfitsSugeridos(placard);
    // 2 torsos x 2 calzados = 4 combinaciones (ninguna choca entre sí --
    // pantalón neutro, todo combina).
    expect(outfits).toHaveLength(4);
  });

  it("saco es una prenda de torso válida como cualquier otra (categoría nueva, pedido explícito del usuario: 'un traje azul marino') -- exige una camisa propia debajo, ver el describe dedicado más abajo ('formal exige camisa debajo del saco')", () => {
    const placard = [
      mkPrenda("pantalon", "#1A1A1A", 0, 0, 10), // negro, neutro
      mkPrenda("saco", "#1F2A44", 222, 39, 21),
      mkPrenda("camisa", "#FAFAF7", 0, 0, 98),
    ];
    const outfits = armarOutfitsSugeridos(placard);
    // 2 outfits reales: la camisa sola (torso normal, sin saco) y el
    // saco CON la camisa debajo (ver el describe dedicado más abajo) --
    // ya no "pantalón + saco" solos.
    expect(outfits).toHaveLength(2);
    const conSaco = outfits.find((o) => o.prendas.some((p) => p.categoria === "saco"));
    expect(conSaco?.prendas.map((p) => p.categoria).sort()).toEqual(["camisa", "pantalon", "saco"].sort());
  });

  // Consejo, pedido explícito del usuario: "formal y oficina se
  // mezclan... formal es el traje". Rol: sastre. Un saco no es un torso
  // alternativo más (como remera/buzo/sweater/campera) -- es una capa de
  // afuera que va SOBRE una camisa, nunca solo.
  describe("formal exige camisa debajo del saco -- un saco solo no es un traje real", () => {
    it("saco sin ninguna camisa propia en el placard -> no arma ningún outfit con saco", () => {
      const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
      const saco = mkPrenda("saco", "#1F2A44", 222, 39, 21);
      const remera = mkPrenda("remera", "#3366CC", 220, 60, 50); // torso alternativo -- sin camisa
      const outfits = armarOutfitsSugeridos([pantalon, saco, remera]);
      // arma el outfit con la remera (torso normal, sin capa base) pero
      // ninguno con el saco -- nunca "pantalón + saco" solos.
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(["pantalon", "remera"].sort());
    });

    it("saco + camisa que combina -> arma el outfit con las DOS prendas de torso a la vez (saco y camisa juntos, no una en lugar de la otra)", () => {
      const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
      const saco = mkPrenda("saco", "#1A1A1A", 0, 0, 10);
      const camisa = mkPrenda("camisa", "#1A1A1A", 0, 0, 10);
      const outfits = armarOutfitsSugeridos([pantalon, saco, camisa]);
      // 2 outfits: la camisa sola (torso normal) y el saco CON la camisa
      // debajo -- el punto de este test es el segundo.
      expect(outfits).toHaveLength(2);
      const conSaco = outfits.find((o) => o.prendas.some((p) => p.categoria === "saco"));
      expect(conSaco?.prendas).toHaveLength(3);
      expect(conSaco?.prendas.map((p) => p.categoria).sort()).toEqual(["camisa", "pantalon", "saco"].sort());
    });

    it("saco + camisa que combina + otra camisa que NO combina con el pantalón -> solo arma con la que sí combina, nunca con la que choca", () => {
      const pantalon = mkPrenda("pantalon", "#CC3333", 0, 60, 50); // rojo saturado
      const saco = mkPrenda("saco", "#1A1A1A", 0, 0, 10); // negro, neutro -- combina con cualquier camisa
      const camisaOk = mkPrenda("camisa", "#1A1A1A", 0, 0, 10); // neutra -- combina "excelente" con el pantalón rojo
      // verde saturado, misma luminosidad que el rojo del pantalón -- se
      // funden (con_cuidado), mismo par que ya usa el resto del archivo.
      const camisaChoca = mkPrenda("camisa", "#33CC33", 120, 60, 52);
      const outfits = armarOutfitsSugeridos([pantalon, saco, camisaOk, camisaChoca]);
      const conSaco = outfits.filter((o) => o.prendas.some((p) => p.categoria === "saco"));
      expect(conSaco).toHaveLength(1);
      expect(conSaco[0].prendas.map((p) => p.id)).toContain(camisaOk.id);
      expect(conSaco[0].prendas.map((p) => p.id)).not.toContain(camisaChoca.id);
    });

    it("calzado/accesorio se validan contra saco Y camisa a la vez, no solo contra uno de los dos", () => {
      const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
      const saco = mkPrenda("saco", "#1A1A1A", 0, 0, 10);
      const camisa = mkPrenda("camisa", "#3366CC", 220, 60, 50); // azul saturado
      // naranja quemado saturado, misma luminosidad que el azul de la camisa -- se funden (con_cuidado), mismo par que ya usa el resto del archivo para probar choques cruzados.
      const calzadoChocaConCamisa = mkPrenda("calzado", "#C8763F", 25, 60, 45);
      const outfits = armarOutfitsSugeridos([pantalon, saco, camisa, calzadoChocaConCamisa]);
      const conSaco = outfits.filter((o) => o.prendas.some((p) => p.categoria === "saco"));
      expect(conSaco).toHaveLength(1);
      // el calzado que choca con la camisa (aunque combine con el pantalón/saco neutros) se cae, no arma la combinación real mala.
      expect(conSaco[0].prendas.map((p) => p.categoria)).not.toContain("calzado");
    });
  });

  it("entre dos abrigos que combinan igual de bien por color, prioriza el de la estación de hoy (caso real: 4 sweaters de entretiempo + 1 de invierno del mismo usuario, mismo pantalón)", () => {
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10); // negro, neutro -- combina excelente con cualquiera de los dos
    const sweaterEntretiempo = mkPrenda("sweater", "#787281", 250, 6, 47);
    sweaterEntretiempo.estacion = "entretiempo";
    const sweaterInvierno = mkPrenda("sweater", "#0F0F0F", 0, 0, 6);
    sweaterInvierno.estacion = "invierno";
    const placard = [pantalon, sweaterEntretiempo, sweaterInvierno];

    const enInvierno = armarOutfitsSugeridos(placard, "invierno");
    expect(enInvierno[0].prendas.find((p) => p.categoria === "sweater")).toBe(sweaterInvierno);

    const enEntretiempo = armarOutfitsSugeridos(placard, "entretiempo");
    expect(enEntretiempo[0].prendas.find((p) => p.categoria === "sweater")).toBe(sweaterEntretiempo);
  });

  it("una prenda sin estación cargada (remera/camisa) no se ve afectada por el orden de estación -- mantiene el orden por color", () => {
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    const remera = mkPrenda("remera", "#3366CC", 220, 60, 50); // sin estacion (null)
    const camisa = mkPrenda("camisa", "#F5F5F0", 0, 5, 95); // sin estacion (null)
    const outfits = armarOutfitsSugeridos([pantalon, remera, camisa], "invierno");
    expect(outfits).toHaveLength(2);
  });

  it("con un bermuda pero sin ningún pantalón largo en el placard, el bermuda ancla el outfit igual (CATEGORIAS_PIERNAS, no solo 'pantalon')", () => {
    const placard = [
      mkPrenda("bermuda", "#1A1A1A", 0, 0, 10), // negro, neutro
      mkPrenda("remera", "#3366CC", 220, 60, 50),
    ];
    const outfits = armarOutfitsSugeridos(placard);
    expect(outfits).toHaveLength(1);
    expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(["bermuda", "remera"].sort());
  });

  describe("ancla deportiva -- solo prendas genuinamente deportivas, nunca accesorio", () => {
    // Reporte real del usuario: un pantalón deportivo terminaba armado con
    // un buzo puramente casual y hasta con un cinturón de cuero. Ninguna
    // de las dos existe en un look deportivo real -- ver el comentario en
    // recommend.ts sobre por qué prendaMenosFormalQuePantalon no lo
    // atrapaba (deportivo es el escalón más bajo, nada cuenta como "menos
    // formal" que él).
    function mkConEstilo(categoria: Prenda["categoria"], hex: string, h: number, s: number, l: number, estilo: Prenda["estilo"]): Prenda {
      const p = mkPrenda(categoria, hex, h, s, l);
      p.estilo = estilo;
      return p;
    }

    it("nunca incluye un accesorio, aunque combine bien en color y esté tageado clasico+casual (como el cinturón real reportado)", () => {
      const pantalonDeportivo = mkConEstilo("pantalon", "#1A1A1A", 0, 0, 10, "deportivo");
      const remeraDeportiva = mkConEstilo("remera", "#1A1A1A", 0, 0, 10, "deportivo");
      const cinturon = mkConEstilo("accesorio", "#1A1A1A", 0, 0, 10, "clasico");
      cinturon.estilos_secundarios = ["casual"]; // el mismo escape hatch multi-estilo que reabrió el bug
      cinturon.textura = "cuero_liso";

      const outfits = armarOutfitsSugeridos([pantalonDeportivo, remeraDeportiva, cinturon]);
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria)).not.toContain("accesorio");
    });

    it("no arma un outfit con un torso que no es genuinamente deportivo (buzo casual, aunque combine en color)", () => {
      const pantalonDeportivo = mkConEstilo("pantalon", "#1A1A1A", 0, 0, 10, "deportivo");
      const buzoCasual = mkConEstilo("buzo", "#1A1A1A", 0, 0, 10, "casual");
      buzoCasual.estilos_secundarios = ["urbano"];

      const outfits = armarOutfitsSugeridos([pantalonDeportivo, buzoCasual]);
      expect(outfits).toHaveLength(0);
    });

    it("sí arma el outfit con una remera genuinamente deportiva", () => {
      const pantalonDeportivo = mkConEstilo("pantalon", "#1A1A1A", 0, 0, 10, "deportivo");
      const remeraDeportiva = mkConEstilo("remera", "#1A1A1A", 0, 0, 10, "deportivo");
      const buzoCasual = mkConEstilo("buzo", "#1A1A1A", 0, 0, 10, "casual");

      const outfits = armarOutfitsSugeridos([pantalonDeportivo, remeraDeportiva, buzoCasual]);
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(["pantalon", "remera"].sort());
    });

    it("el calzado urbano NO se restringe -- zapatillas urbanas con jogger siguen siendo válidas (sin cambios de comportamiento acá)", () => {
      const pantalonDeportivo = mkConEstilo("pantalon", "#1A1A1A", 0, 0, 10, "deportivo");
      const remeraDeportiva = mkConEstilo("remera", "#1A1A1A", 0, 0, 10, "deportivo");
      const zapatillasUrbanas = mkConEstilo("calzado", "#1A1A1A", 0, 0, 10, "urbano");

      const outfits = armarOutfitsSugeridos([pantalonDeportivo, remeraDeportiva, zapatillasUrbanas]);
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(["calzado", "pantalon", "remera"].sort());
    });

    it("un ancla NO deportiva (casual) sigue permitiendo torso casual y accesorio, sin cambios", () => {
      const pantalonCasual = mkConEstilo("pantalon", "#1A1A1A", 0, 0, 10, "casual");
      const buzoCasual = mkConEstilo("buzo", "#1A1A1A", 0, 0, 10, "casual");
      const cinturon = mkConEstilo("accesorio", "#1A1A1A", 0, 0, 10, "clasico");

      const outfits = armarOutfitsSugeridos([pantalonCasual, buzoCasual, cinturon]);
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(["accesorio", "buzo", "pantalon"].sort());
    });
  });

  // Pedido explícito del usuario, con captura real: "Bermuda con sweater
  // ambos de color beige?" -- el color combinaba perfecto (los dos beige),
  // el problema real es que nadie se pone un sweater con las piernas al
  // aire salvo que el look sea genuinamente deportivo. Ver el comentario
  // largo de armarOutfitsSugeridos (reglas 1 y 2) para el porqué de cada
  // caso de abajo.
  describe("clima -- bermuda/short 'de calle' nunca combina con abrigo; clima filtra de verdad, no solo ordena", () => {
    it("bermuda no deportivo + sweater (mismo color, combinan perfecto) -> NUNCA se arma ese outfit", () => {
      const bermuda = mkPrenda("bermuda", "#D8C7A1", 40, 25, 75); // beige
      const sweater = mkPrenda("sweater", "#D8C7A1", 40, 25, 75); // mismo beige exacto
      const outfits = armarOutfitsSugeridos([bermuda, sweater]);
      expect(outfits).toHaveLength(0);
    });

    it("bermuda no deportivo + sweater + remera -> arma el outfit con la remera, nunca con el sweater", () => {
      const bermuda = mkPrenda("bermuda", "#D8C7A1", 40, 25, 75);
      const sweater = mkPrenda("sweater", "#D8C7A1", 40, 25, 75);
      const remera = mkPrenda("remera", "#D8C7A1", 40, 25, 75);
      const outfits = armarOutfitsSugeridos([bermuda, sweater, remera]);
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(["bermuda", "remera"].sort());
    });

    it("short deportivo + buzo, los dos tageados deportivo -> SÍ se arma (athleisure real, no bloqueado por la regla nueva)", () => {
      const shortDeportivo = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
      shortDeportivo.estilo = "deportivo";
      const buzoDeportivo = mkPrenda("buzo", "#1A1A1A", 0, 0, 10);
      buzoDeportivo.estilo = "deportivo";
      const outfits = armarOutfitsSugeridos([shortDeportivo, buzoDeportivo]);
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(["buzo", "short_deportivo"].sort());
    });

    // Segunda opinión de sastrería (Consejo, ronda siguiente), caso
    // reportado y verificado por ejecución: exigir "deportivo" tageado a
    // CUALQUIER torso (incluida una remera de algodón lisa, sin ningún
    // estilo cargado) dejaba a "Vestite hoy" sin armar NINGÚN outfit para
    // el placard más común que existe -- short deportivo + remera blanca +
    // zapatillas running. El calzado ya no se restringía (ver el test de
    // arriba); ahora la remera tampoco.
    it("short deportivo + remera blanca SIN estilo declarado + zapatillas running -> SÍ arma un outfit (antes daba 0)", () => {
      const shortDeportivo = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
      shortDeportivo.estilo = "deportivo";
      const remeraBlanca = mkPrenda("remera", "#F5F5F5", 0, 0, 96);
      const zapatillasRunning = mkPrenda("calzado", "#F5F5F5", 0, 0, 96);
      zapatillasRunning.estilo = "deportivo";
      zapatillasRunning.corte_calzado = "zapatilla_running";

      const outfits = armarOutfitsSugeridos([shortDeportivo, remeraBlanca, zapatillasRunning]);
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(["calzado", "remera", "short_deportivo"].sort());
    });

    it("short deportivo + remera de VESTIR (formal/clasico declarado) sigue sin combinar -- la excepción no abre la puerta a cualquier remera", () => {
      const shortDeportivo = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
      shortDeportivo.estilo = "deportivo";
      const remeraDeVestir = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
      remeraDeVestir.estilo = "clasico";

      // única candidata a torso: si chocaRegistroDeportivo la bloquea bien
      // (como corresponde, es de vestir), no queda ningún torso disponible
      // y el resultado es 0 outfits -- no "1 outfit sin remera".
      const outfits = armarOutfitsSugeridos([shortDeportivo, remeraDeVestir]);
      expect(outfits).toHaveLength(0);
    });

    it("short deportivo + BUZO sin estilo declarado (no remera) sigue sin combinar -- la excepción es solo para remera", () => {
      const shortDeportivo = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
      shortDeportivo.estilo = "deportivo";
      const buzoSinEstilo = mkPrenda("buzo", "#1A1A1A", 0, 0, 10);

      const outfits = armarOutfitsSugeridos([shortDeportivo, buzoSinEstilo]);
      expect(outfits).toHaveLength(0);
    });

    it("clima='verano' excluye TODO abrigo, incluso con un pantalón largo (no es solo una regla de bermuda/short)", () => {
      const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
      const sweater = mkPrenda("sweater", "#1A1A1A", 0, 0, 10);
      const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
      const outfits = armarOutfitsSugeridos([pantalon, sweater, remera], "verano");
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(["pantalon", "remera"].sort());
    });

    // Hallazgo del revisor de color/textiles, verificado por ejecución: un
    // saco es paño de lana (aislación térmica real, mismo criterio que ya
    // excluye buzo/sweater/campera con calor) -- pero clima="verano" solo
    // excluía CATEGORIAS_ABRIGO, y saco queda afuera de esa lista a
    // propósito (es formalidad, no temperatura). Antes de este fix, un
    // pantalón largo + saco pasaba igual con clima="verano".
    it("clima='verano' también excluye el saco, incluso con un pantalón largo", () => {
      const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
      const saco = mkPrenda("saco", "#1A1A1A", 0, 0, 10);
      saco.estilo = "clasico";
      const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
      const outfits = armarOutfitsSugeridos([pantalon, saco, remera], "verano");
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(["pantalon", "remera"].sort());
    });

    it("clima='verano' excluye una bufanda de lana del accesorio elegido, incluso con un pantalón largo", () => {
      const pantalon = mkPrenda("pantalon", "#8C8C8C", 0, 0, 55);
      const remera = mkPrenda("remera", "#8C8C8C", 0, 0, 55);
      const bufandaLana = mkPrenda("accesorio", "#8C8C8C", 0, 0, 55);
      bufandaLana.textura = "lana";
      bufandaLana.posicion_accesorio = "cuello";
      const outfits = armarOutfitsSugeridos([pantalon, remera, bufandaLana], "verano");
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria)).not.toContain("accesorio");
    });

    it("clima='invierno' o 'entretiempo' sigue permitiendo saco y bufanda de lana con un pantalón largo", () => {
      const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
      const saco = mkPrenda("saco", "#1A1A1A", 0, 0, 10);
      saco.estilo = "clasico";
      const camisa = mkPrenda("camisa", "#1A1A1A", 0, 0, 10); // saco exige camisa propia debajo (ver "formal exige camisa debajo del saco")
      const outfitsInvierno = armarOutfitsSugeridos([pantalon, saco, camisa], "invierno");
      const outfitsEntretiempo = armarOutfitsSugeridos([pantalon, saco, camisa], "entretiempo");
      // 2 outfits en cada clima: la camisa sola y el saco con la camisa debajo.
      expect(outfitsInvierno.some((o) => o.prendas.some((p) => p.categoria === "saco"))).toBe(true);
      expect(outfitsEntretiempo.some((o) => o.prendas.some((p) => p.categoria === "saco"))).toBe(true);
    });

    it("clima='invierno' -- un bermuda/short no ancla ningún outfit, sea cual sea el torso", () => {
      const bermuda = mkPrenda("bermuda", "#1A1A1A", 0, 0, 10);
      const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
      expect(armarOutfitsSugeridos([bermuda, remera], "invierno")).toHaveLength(0);
    });

    it("clima='invierno' no afecta a un pantalón largo -- sigue combinando con abrigo y con remera", () => {
      const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
      const sweater = mkPrenda("sweater", "#1A1A1A", 0, 0, 10);
      const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
      const outfits = armarOutfitsSugeridos([pantalon, sweater, remera], "invierno");
      expect(outfits).toHaveLength(2);
    });

    it("sin `clima` explícito, usa la estación real de hoy por default (mismo comportamiento que antes de esta ronda)", () => {
      const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
      const remera = mkPrenda("remera", "#3366CC", 220, 60, 50);
      const outfits = armarOutfitsSugeridos([pantalon, remera]);
      expect(outfits).toHaveLength(1);
    });
  });

  // Pedido explícito del usuario, repetido dos rondas seguidas ("bermuda
  // con camisa"): la causa real, encontrada revisando el catálogo, es que
  // `ocasion` (casual/laburo/formal) estaba cargada en cada prenda desde
  // el principio pero nunca se usaba en ninguna regla -- así que una
  // camisa de vestir de oficina (estilo clasico, ocasion LABURO) combinaba
  // con un bermuda sin ninguna fricción real. Ver esDeOficina en
  // recommend.ts.
  describe("ocasion -- ninguna prenda 'de oficina' (laburo/formal) combina con un bermuda/short", () => {
    it("bermuda + camisa ocasion=laburo (mismo estilo, mismo color) -> NUNCA arma ese outfit", () => {
      const bermuda = mkPrenda("bermuda", "#1A1A1A", 0, 0, 10);
      const camisaOficina = mkPrenda("camisa", "#1A1A1A", 0, 0, 10);
      camisaOficina.estilo = "clasico";
      camisaOficina.ocasion = "laburo";
      expect(armarOutfitsSugeridos([bermuda, camisaOficina])).toHaveLength(0);
    });

    it("bermuda + camisa ocasion=casual (resort/fin de semana) -> SÍ combina, mismo estilo que antes", () => {
      const bermuda = mkPrenda("bermuda", "#1A1A1A", 0, 0, 10);
      const camisaCasual = mkPrenda("camisa", "#1A1A1A", 0, 0, 10);
      camisaCasual.estilo = "urbano";
      camisaCasual.ocasion = "casual";
      const outfits = armarOutfitsSugeridos([bermuda, camisaCasual]);
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(["bermuda", "camisa"].sort());
    });

    it("bermuda + zapatos de vestir ocasion=laburo (calzado) -> nunca se elige ese calzado", () => {
      const bermuda = mkPrenda("bermuda", "#1A1A1A", 0, 0, 10);
      const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
      const zapatoVestir = mkPrenda("calzado", "#1A1A1A", 0, 0, 10);
      zapatoVestir.ocasion = "laburo";
      const outfits = armarOutfitsSugeridos([bermuda, remera, zapatoVestir]);
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria)).not.toContain("calzado");
    });

    it("bermuda + accesorio ocasion=laburo (sin requiere_cuello -- esto prueba la regla nueva, no la de corbata/cuello) -> nunca se elige", () => {
      const bermuda = mkPrenda("bermuda", "#1A1A1A", 0, 0, 10);
      const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
      const accesorioOficina = mkPrenda("accesorio", "#1A1A1A", 0, 0, 10);
      accesorioOficina.ocasion = "laburo";
      const outfits = armarOutfitsSugeridos([bermuda, remera, accesorioOficina]);
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria)).not.toContain("accesorio");
    });

    it("un short deportivo (tageado deportivo) tampoco combina con zapatos de vestir ocasion=laburo", () => {
      const shortDeportivo = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
      shortDeportivo.estilo = "deportivo";
      const remeraDeportiva = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
      remeraDeportiva.estilo = "deportivo";
      const zapatoVestir = mkPrenda("calzado", "#1A1A1A", 0, 0, 10);
      zapatoVestir.ocasion = "laburo";
      const outfits = armarOutfitsSugeridos([shortDeportivo, remeraDeportiva, zapatoVestir]);
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria)).not.toContain("calzado");
    });

    it("un pantalón largo sigue combinando con una camisa de oficina, sin cambios", () => {
      const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
      const camisaOficina = mkPrenda("camisa", "#1A1A1A", 0, 0, 10);
      camisaOficina.ocasion = "laburo";
      const outfits = armarOutfitsSugeridos([pantalon, camisaOficina]);
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria).sort()).toEqual(["camisa", "pantalon"].sort());
    });
  });

  // Auditoría de sastrería (Consejo, ronda siguiente), verificada por
  // ejecución directa: esDeOficina de arriba solo se aplicaba como
  // pre-filtro de candidatas DENTRO de armarOutfitsSugeridos/
  // armarOutfitsParaComprar -- recomendar(), la función que llaman DIRECTO
  // las pantallas manuales "Combinar" y "Recomendaciones", nunca la
  // chequeaba. Un bermuda + una camisa de oficina, o un bermuda + zapatos
  // de vestir, daban "excelente" ahí -- la misma combinación que "Vestite
  // hoy" ya rechazaba para ese mismo placard.
  describe("ocasion -- recomendar() (Combinar/Recomendaciones, no solo el armado automático) también rechaza oficina + piernas al aire", () => {
    it("bermuda + camisa ocasion=laburo vía recomendar() directo -> con_cuidado, no excelente", () => {
      const bermuda = mkPrenda("bermuda", "#1A1A1A", 0, 0, 10);
      const camisaOficina = mkPrenda("camisa", "#1A1A1A", 0, 0, 10);
      camisaOficina.estilo = "clasico";
      camisaOficina.ocasion = "laburo";

      const [resultado] = recomendar(bermuda, [camisaOficina], [bermuda, camisaOficina]);
      expect(resultado.score.nivel).toBe("con_cuidado");
    });

    it("bermuda azul marino (no dispara la regla de cuero) + zapato de vestir negro vía recomendar() directo -> con_cuidado igual, por oficina", () => {
      const bermudaAzulMarino = mkPrenda("bermuda", "#1F2A44", 222, 37, 19);
      const zapatoVestir = mkPrenda("calzado", "#1A1A1A", 0, 0, 10);
      zapatoVestir.textura = "cuero_liso";
      zapatoVestir.ocasion = "laburo";

      const [resultado] = recomendar(bermudaAzulMarino, [zapatoVestir], [bermudaAzulMarino, zapatoVestir]);
      expect(resultado.score.nivel).toBe("con_cuidado");
    });

    it("un short deportivo + camisa de oficina también choca vía recomendar() directo (sin excepción por ser deportivo)", () => {
      const short = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
      short.estilo = "deportivo";
      const camisaOficina = mkPrenda("camisa", "#1A1A1A", 0, 0, 10);
      camisaOficina.estilo = "clasico";
      camisaOficina.ocasion = "laburo";

      const [resultado] = recomendar(short, [camisaOficina], [short, camisaOficina]);
      expect(resultado.score.nivel).toBe("con_cuidado");
    });

    it("un pantalón largo con la misma camisa de oficina sigue combinando sin problema vía recomendar() directo", () => {
      const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
      const camisaOficina = mkPrenda("camisa", "#1A1A1A", 0, 0, 10);
      camisaOficina.estilo = "clasico";
      camisaOficina.ocasion = "laburo";

      const [resultado] = recomendar(pantalon, [camisaOficina], [pantalon, camisaOficina]);
      expect(resultado.score.nivel).not.toBe("con_cuidado");
    });
  });

  // Segunda opinión de sastrería (Consejo, ronda siguiente): esDeOficina es
  // demasiado grueso para el calzado -- un mocasín cargado con
  // ocasion="laburo" (donde mucha gente los usa de verdad) quedaba
  // bloqueado con un bermuda igual que un zapato de vestir, cuando el
  // mocasín sin medias es EL zapato de verano de ese registro.
  describe("ocasion -- el mocasín (corte_calzado) es la excepción real al ban de oficina con piernas al aire", () => {
    it("bermuda + mocasín con ocasion=laburo -> SÍ combina (no bloqueado como un zapato de vestir)", () => {
      const bermuda = mkPrenda("bermuda", "#8C8C8C", 0, 0, 55);
      const mocasin = mkPrenda("calzado", "#8C8C8C", 0, 0, 55);
      mocasin.corte_calzado = "mocasin";
      mocasin.ocasion = "laburo";

      const [resultado] = recomendar(bermuda, [mocasin], [bermuda, mocasin]);
      expect(resultado.score.nivel).not.toBe("con_cuidado");
    });

    it("bermuda + zapato de vestir con ocasion=laburo sigue bloqueado (control, sin cambios)", () => {
      const bermuda = mkPrenda("bermuda", "#8C8C8C", 0, 0, 55);
      const zapatoVestir = mkPrenda("calzado", "#8C8C8C", 0, 0, 55);
      zapatoVestir.corte_calzado = "zapato_vestir";
      zapatoVestir.ocasion = "laburo";

      const [resultado] = recomendar(bermuda, [zapatoVestir], [bermuda, zapatoVestir]);
      expect(resultado.score.nivel).toBe("con_cuidado");
    });
  });

  // Segunda opinión de sastrería (Consejo, ronda siguiente), verificada por
  // ejecución directa contra el catálogo real: el mismo agujero de arriba
  // (esDeOficina solo como pre-filtro del armado automático) también existía
  // para abrigo -- un buzo/sweater/campera/saco con las piernas al aire
  // pasaba "excelente"/"muy_bueno" en Combinar/Recomendaciones, la misma
  // combinación real que "Vestite hoy" ya rechazaba para el mismo placard.
  describe("abrigo -- recomendar() también rechaza un abrigo con las piernas al aire (no solo el armado automático)", () => {
    it("bermuda beige + buzo beige (reporte real del usuario, con buzo en vez de sweater) -> con_cuidado, no muy_bueno", () => {
      const bermuda = mkPrenda("bermuda", "#D8C7A1", 40, 30, 75);
      const buzo = mkPrenda("buzo", "#D8C7A1", 40, 30, 75);
      buzo.estilo = "urbano";

      const [resultado] = recomendar(bermuda, [buzo], [bermuda, buzo]);
      expect(resultado.score.nivel).toBe("con_cuidado");
    });

    it("short deportivo + campera urbana (no deportiva) -> con_cuidado", () => {
      const short = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
      short.estilo = "deportivo";
      const campera = mkPrenda("campera", "#1A1A1A", 0, 0, 10);
      campera.estilo = "urbano";

      const [resultado] = recomendar(short, [campera], [short, campera]);
      expect(resultado.score.nivel).toBe("con_cuidado");
    });

    it("short deportivo + buzo TAMBIÉN deportivo (athleisure real) -> sigue combinando, no se bloquea", () => {
      const short = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
      short.estilo = "deportivo";
      const buzoDeportivo = mkPrenda("buzo", "#1A1A1A", 0, 0, 10);
      buzoDeportivo.estilo = "deportivo";

      const [resultado] = recomendar(short, [buzoDeportivo], [short, buzoDeportivo]);
      expect(resultado.score.nivel).not.toBe("con_cuidado");
    });

    it("bermuda + saco (nunca combina con piernas al aire, sin depender de ocasion) -> con_cuidado", () => {
      const bermuda = mkPrenda("bermuda", "#1A1A1A", 0, 0, 10);
      const saco = mkPrenda("saco", "#1A1A1A", 0, 0, 10);
      saco.estilo = "clasico";

      const [resultado] = recomendar(bermuda, [saco], [bermuda, saco]);
      expect(resultado.score.nivel).toBe("con_cuidado");
    });

    it("un pantalón largo con el mismo buzo sigue combinando sin problema", () => {
      const pantalon = mkPrenda("pantalon", "#D8C7A1", 40, 30, 75);
      const buzo = mkPrenda("buzo", "#D8C7A1", 40, 30, 75);
      buzo.estilo = "urbano";

      const [resultado] = recomendar(pantalon, [buzo], [pantalon, buzo]);
      expect(resultado.score.nivel).not.toBe("con_cuidado");
    });

    // Hallazgo del revisor de color/textiles, verificado contra el
    // catálogo real: una bufanda de lana (categoria="accesorio",
    // posicion_accesorio="cuello") es tan abrigo como un sweater, pero
    // ninguna regla la miraba -- se colaba en outfits de bermuda/short.
    it("bermuda + bufanda de lana (accesorio, posicion=cuello) -> con_cuidado, mismo criterio que un sweater", () => {
      const bermuda = mkPrenda("bermuda", "#8C8C8C", 0, 0, 55);
      const bufandaLana = mkPrenda("accesorio", "#8C8C8C", 0, 0, 55);
      bufandaLana.textura = "lana";
      bufandaLana.posicion_accesorio = "cuello";
      bufandaLana.estilo = "casual";

      const [resultado] = recomendar(bermuda, [bufandaLana], [bermuda, bufandaLana]);
      expect(resultado.score.nivel).toBe("con_cuidado");
    });

    it("un cinturón de cuero (cintura, no lana) sigue combinando con bermuda sin problema", () => {
      const bermuda = mkPrenda("bermuda", "#8C8C8C", 0, 0, 55);
      const cinturon = mkPrenda("accesorio", "#8C8C8C", 0, 0, 55);
      cinturon.textura = "cuero_liso";
      cinturon.posicion_accesorio = "cintura";
      cinturon.estilo = "casual";

      const [resultado] = recomendar(bermuda, [cinturon], [bermuda, cinturon]);
      expect(resultado.score.nivel).not.toBe("con_cuidado");
    });

    it("una bufanda de lana sigue combinando sin problema con un pantalón largo", () => {
      const pantalon = mkPrenda("pantalon", "#8C8C8C", 0, 0, 55);
      const bufandaLana = mkPrenda("accesorio", "#8C8C8C", 0, 0, 55);
      bufandaLana.textura = "lana";
      bufandaLana.posicion_accesorio = "cuello";
      bufandaLana.estilo = "casual";

      const [resultado] = recomendar(pantalon, [bufandaLana], [pantalon, bufandaLana]);
      expect(resultado.score.nivel).not.toBe("con_cuidado");
    });
  });

  // Auditoría de Consejo (revisor de sastrería): saco queda afuera de
  // CATEGORIAS_ABRIGO a propósito (formalidad, no temperatura), y por
  // eso solo esDeOficina (basada en `ocasion`) podía frenarlo contra un
  // bermuda/short -- un saco sin `ocasion` cargada (dato ausente/mal
  // cargado, no el caso hoy en el catálogo real) pasaba sin fricción.
  // Se excluye por categoría directamente, sin depender de otro campo.
  describe("saco nunca combina con bermuda/short, por categoría, incluso si le falta la ocasion", () => {
    it("bermuda + saco SIN ocasion cargada -> igual se excluye", () => {
      const bermuda = mkPrenda("bermuda", "#1A1A1A", 0, 0, 10);
      const saco = mkPrenda("saco", "#1A1A1A", 0, 0, 10); // ocasion: null por defecto en mkPrenda
      const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
      const outfits = armarOutfitsSugeridos([bermuda, saco, remera]);
      expect(outfits).toHaveLength(1);
      expect(outfits[0].prendas.map((p) => p.categoria)).not.toContain("saco");
    });

    it("un pantalón largo sigue combinando con un saco, sin cambios", () => {
      const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
      const saco = mkPrenda("saco", "#1A1A1A", 0, 0, 10);
      const camisa = mkPrenda("camisa", "#1A1A1A", 0, 0, 10); // saco exige camisa propia debajo
      const outfits = armarOutfitsSugeridos([pantalon, saco, camisa]);
      const conSaco = outfits.find((o) => o.prendas.some((p) => p.categoria === "saco"));
      expect(conSaco?.prendas.map((p) => p.categoria).sort()).toEqual(["camisa", "pantalon", "saco"].sort());
    });
  });
});

describe("elegirContraste", () => {
  const puntajeDePrueba = { puntaje: 10, explicacionPuntaje: "" };

  it("elige, entre varios candidatos, el que más contrasta en luminosidad contra el pantalón de la principal", () => {
    const principal = { id: "p", prendas: [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10)], ...puntajeDePrueba };
    const parecido = { id: "a", prendas: [mkPrenda("pantalon", "#262626", 0, 0, 15)], ...puntajeDePrueba };
    const contrastante = { id: "b", prendas: [mkPrenda("pantalon", "#E6E6E6", 0, 0, 90)], ...puntajeDePrueba };
    const elegido = elegirContraste(principal, [parecido, contrastante]);
    expect(elegido?.id).toBe("b");
  });

  it("también contrasta por MATIZ, no solo luminosidad/saturación -- mismo h/s/l salvo el matiz", () => {
    // mismo pantalón en las tres (no debería influir, se cancela en la resta).
    const pantalonComun = mkPrenda("pantalon", "#808080", 0, 30, 50);
    const principal = { id: "p", prendas: [pantalonComun, mkPrenda("remera", "#B93A32", 0, 80, 50)], ...puntajeDePrueba };
    const matizCercano = { id: "a", prendas: [pantalonComun, mkPrenda("remera", "#B93A32", 10, 80, 50)], ...puntajeDePrueba };
    const matizOpuesto = { id: "b", prendas: [pantalonComun, mkPrenda("remera", "#B93A32", 180, 80, 50)], ...puntajeDePrueba };
    const elegido = elegirContraste(principal, [matizCercano, matizOpuesto]);
    expect(elegido?.id).toBe("b");
  });

  it("también contrasta por SATURACIÓN -- mismo matiz/luminosidad, distinta saturación", () => {
    const pantalonComun = mkPrenda("pantalon", "#808080", 0, 30, 50);
    const principal = { id: "p", prendas: [pantalonComun, mkPrenda("remera", "#B93A32", 0, 90, 50)], ...puntajeDePrueba };
    const satCercana = { id: "a", prendas: [pantalonComun, mkPrenda("remera", "#B93A32", 0, 85, 50)], ...puntajeDePrueba };
    const satOpuesta = { id: "b", prendas: [pantalonComun, mkPrenda("remera", "#B93A32", 0, 10, 50)], ...puntajeDePrueba };
    const elegido = elegirContraste(principal, [satCercana, satOpuesta]);
    expect(elegido?.id).toBe("b");
  });

  it("revisado como colorista: el matiz NO cuenta entre dos prendas neutras (s=0) -- un gris no tiene matiz real del que alejarse", () => {
    // el h guardado (200 vs 0) es irrelevante en una prenda acromática -- si
    // el matiz contara igual, esta candidata (h muy distinto) ganaría por
    // sobre la que en los hechos contrasta más en luminosidad.
    const principal = { id: "p", prendas: [mkPrenda("pantalon", "#808080", 0, 0, 50)], ...puntajeDePrueba };
    const soloMatizDistintoPeroNeutro = { id: "a", prendas: [mkPrenda("pantalon", "#808080", 200, 0, 50)], ...puntajeDePrueba };
    const luminosidadDistinta = { id: "b", prendas: [mkPrenda("pantalon", "#E6E6E6", 0, 0, 90)], ...puntajeDePrueba };
    const elegido = elegirContraste(principal, [soloMatizDistintoPeroNeutro, luminosidadDistinta]);
    expect(elegido?.id).toBe("b");
  });

  it("solo compara categorías presentes en AMBOS outfits -- una prenda extra en el candidato no infla la distancia", () => {
    const principal = { id: "p", prendas: [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10)], ...puntajeDePrueba };
    // mismo pantalón que la principal + un accesorio muy saturado que la principal ni tiene -- no debería sumar nada.
    const conAccesorioExtra = {
      id: "a",
      prendas: [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10), mkPrenda("accesorio", "#FF0000", 0, 100, 50)],
      ...puntajeDePrueba,
    };
    const conPantalonDistinto = { id: "b", prendas: [mkPrenda("pantalon", "#E6E6E6", 0, 0, 95)], ...puntajeDePrueba };
    const elegido = elegirContraste(principal, [conAccesorioExtra, conPantalonDistinto]);
    expect(elegido?.id).toBe("b");
  });

  it("a igual distancia de color, desempata por mayor puntaje", () => {
    const principal = { id: "p", prendas: [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10)], ...puntajeDePrueba };
    const mismoColorMenosPuntaje = { id: "a", prendas: [mkPrenda("pantalon", "#E6E6E6", 0, 0, 90)], puntaje: 7, explicacionPuntaje: "" };
    const mismoColorMasPuntaje = { id: "b", prendas: [mkPrenda("pantalon", "#E6E6E6", 0, 0, 90)], puntaje: 10, explicacionPuntaje: "" };
    const elegido = elegirContraste(principal, [mismoColorMenosPuntaje, mismoColorMasPuntaje]);
    expect(elegido?.id).toBe("b");
  });

  it("nunca elige a la principal misma, aunque esté en el pool", () => {
    const principal = { id: "p", prendas: [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10)], ...puntajeDePrueba };
    expect(elegirContraste(principal, [principal])).toBeUndefined();
  });

  it("pool sin candidatos (vacío) -> undefined", () => {
    const principal = { id: "p", prendas: [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10)], ...puntajeDePrueba };
    expect(elegirContraste(principal, [])).toBeUndefined();
  });
});

// Reporte real del usuario: "Toco el botón de otras opciones y la otra
// combinación no cambia" -- elegirContraste devolvía SIEMPRE el mismo
// ganador (un solo id), así que "otras opciones" (que solo mueve el offset
// dentro de esta lista) no tenía nada distinto para mostrar en el segundo
// cardo salvo que el primer candidato dejara de existir. candidatosDeContraste
// devuelve la lista RANKEADA completa para que offsetSugeridos pueda indexar
// distintas posiciones y de verdad cambie lo que se ve en pantalla.
describe("candidatosDeContraste", () => {
  const puntajeDePrueba = { puntaje: 10, explicacionPuntaje: "" };

  it("devuelve la lista completa ordenada por distancia descendente, no solo el ganador", () => {
    const principal = { id: "p", prendas: [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10)], ...puntajeDePrueba };
    const bajo = { id: "bajo", prendas: [mkPrenda("pantalon", "#333333", 0, 0, 20)], ...puntajeDePrueba };
    const medio = { id: "medio", prendas: [mkPrenda("pantalon", "#808080", 0, 0, 50)], ...puntajeDePrueba };
    const alto = { id: "alto", prendas: [mkPrenda("pantalon", "#E6E6E6", 0, 0, 90)], ...puntajeDePrueba };
    const candidatos = candidatosDeContraste(principal, [bajo, alto, medio]);
    expect(candidatos.map((c) => c.id)).toEqual(["alto", "medio", "bajo"]);
  });

  it("excluye a la principal misma de la lista, aunque esté en el pool", () => {
    const principal = { id: "p", prendas: [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10)], ...puntajeDePrueba };
    const otro = { id: "o", prendas: [mkPrenda("pantalon", "#E6E6E6", 0, 0, 90)], ...puntajeDePrueba };
    const candidatos = candidatosDeContraste(principal, [principal, otro]);
    expect(candidatos.map((c) => c.id)).toEqual(["o"]);
  });

  it("a igual distancia, desempata por mayor puntaje", () => {
    const principal = { id: "p", prendas: [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10)], ...puntajeDePrueba };
    const menosPuntaje = { id: "a", prendas: [mkPrenda("pantalon", "#E6E6E6", 0, 0, 90)], puntaje: 7, explicacionPuntaje: "" };
    const masPuntaje = { id: "b", prendas: [mkPrenda("pantalon", "#E6E6E6", 0, 0, 90)], puntaje: 10, explicacionPuntaje: "" };
    const candidatos = candidatosDeContraste(principal, [menosPuntaje, masPuntaje]);
    expect(candidatos.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("pool sin candidatos (vacío) -> lista vacía", () => {
    const principal = { id: "p", prendas: [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10)], ...puntajeDePrueba };
    expect(candidatosDeContraste(principal, [])).toEqual([]);
  });

  it("elegirContraste sigue siendo el primer elemento de candidatosDeContraste (compatibilidad)", () => {
    const principal = { id: "p", prendas: [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10)], ...puntajeDePrueba };
    const bajo = { id: "bajo", prendas: [mkPrenda("pantalon", "#333333", 0, 0, 20)], ...puntajeDePrueba };
    const alto = { id: "alto", prendas: [mkPrenda("pantalon", "#E6E6E6", 0, 0, 90)], ...puntajeDePrueba };
    const pool = [bajo, alto];
    expect(elegirContraste(principal, pool)?.id).toBe(candidatosDeContraste(principal, pool)[0]?.id);
  });

  it("distinto principal produce un orden de candidatos genuinamente distinto -- la base del fix de 'otras opciones'", () => {
    // outfit A y outfit B contrastan distinto contra dos principales de matiz opuesto.
    const pantalonComun = mkPrenda("pantalon", "#808080", 0, 30, 50);
    const principalRojo = { id: "p1", prendas: [pantalonComun, mkPrenda("remera", "#B93A32", 0, 80, 50)], ...puntajeDePrueba };
    const principalAzul = { id: "p2", prendas: [pantalonComun, mkPrenda("remera", "#3A5FB9", 220, 80, 50)], ...puntajeDePrueba };
    const candidatoAzul = { id: "azul", prendas: [pantalonComun, mkPrenda("remera", "#3A5FB9", 220, 80, 50)], ...puntajeDePrueba };
    const candidatoRojo = { id: "rojo", prendas: [pantalonComun, mkPrenda("remera", "#B93A32", 0, 80, 50)], ...puntajeDePrueba };
    const pool = [candidatoAzul, candidatoRojo];
    const paraRojo = candidatosDeContraste(principalRojo, pool).map((c) => c.id);
    const paraAzul = candidatosDeContraste(principalAzul, pool).map((c) => c.id);
    expect(paraRojo[0]).toBe("azul");
    expect(paraAzul[0]).toBe("rojo");
  });
});

describe("semillaDelDia", () => {
  const prenda = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
  // 3 outfits empatados en el puntaje máximo (10), 2 por debajo (7) -- el
  // nivel a rotar tiene que ser SOLO los 3 primeros, no los 5.
  const nivelDe3 = [
    { id: "a", prendas: [prenda], puntaje: 10, explicacionPuntaje: "" },
    { id: "b", prendas: [prenda], puntaje: 10, explicacionPuntaje: "" },
    { id: "c", prendas: [prenda], puntaje: 10, explicacionPuntaje: "" },
    { id: "d", prendas: [prenda], puntaje: 7, explicacionPuntaje: "" },
    { id: "e", prendas: [prenda], puntaje: 7, explicacionPuntaje: "" },
  ];

  it("pool vacío -> 0", () => {
    expect(semillaDelDia([], new Date(0))).toBe(0);
  });

  it("un solo outfit en el nivel máximo -> siempre 0, sea cual sea el día", () => {
    const unSolo = [{ id: "a", prendas: [prenda], puntaje: 10, explicacionPuntaje: "" }];
    expect(semillaDelDia(unSolo, new Date(0))).toBe(0);
    expect(semillaDelDia(unSolo, new Date(86400000 * 50))).toBe(0);
  });

  it("rota SOLO dentro del nivel de mayor puntaje -- el tamaño del nivel es 3, no 5", () => {
    // día 0, 1, 2 -> semilla 0, 1, 2 (nunca 3 o 4, que serían los de puntaje 7).
    expect(semillaDelDia(nivelDe3, new Date(0))).toBe(0);
    expect(semillaDelDia(nivelDe3, new Date(86400000))).toBe(1);
    expect(semillaDelDia(nivelDe3, new Date(86400000 * 2))).toBe(2);
    // día 3 -> vuelve a dar la vuelta (3 % 3 = 0).
    expect(semillaDelDia(nivelDe3, new Date(86400000 * 3))).toBe(0);
  });

  it("mismo día -> misma semilla siempre (determinístico, no depende de un reloj oculto)", () => {
    const hoy = new Date(86400000 * 7);
    expect(semillaDelDia(nivelDe3, hoy)).toBe(semillaDelDia(nivelDe3, hoy));
  });

  it("la semilla nunca se sale del rango del nivel", () => {
    for (let dia = 0; dia < 20; dia++) {
      const semilla = semillaDelDia(nivelDe3, new Date(86400000 * dia));
      expect(semilla).toBeGreaterThanOrEqual(0);
      expect(semilla).toBeLessThan(3);
    }
  });
});

describe("armarOutfitsParaComprar", () => {
  const catalogoDePrueba: (PresetPrenda & { hsl: HSL })[] = [
    {
      id: "campera-test-negra",
      nombre: "Campera de prueba negra",
      categoria: "campera",
      colorHex: "#1A1A1A",
      hsl: { h: 0, s: 0, l: 10 },
    },
  ];

  it("sugiere comprar una prenda solo de una categoría ausente en el placard", () => {
    // el placard ya tiene remera Y campera -- "campera" no está ausente,
    // así que no debería aparecer ninguna sugerencia para esa categoría.
    const placard = [
      mkPrenda("pantalon", "#1A1A1A", 0, 0, 10),
      mkPrenda("remera", "#3366CC", 220, 60, 50),
      mkPrenda("campera", "#232323", 0, 0, 15),
    ];
    const sugerencias = armarOutfitsParaComprar(placard, catalogoDePrueba);
    expect(sugerencias.filter((s) => s.categoriaSugerida === "campera")).toHaveLength(0);
  });

  it("sugiere comprar cuando la categoría está ausente y combina bien con el pantalón", () => {
    const placard = [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10), mkPrenda("remera", "#3366CC", 220, 60, 50)];
    const sugerencias = armarOutfitsParaComprar(placard, catalogoDePrueba);
    expect(sugerencias).toHaveLength(1);
    expect(sugerencias[0].categoriaSugerida).toBe("campera");
    expect(sugerencias[0].sugerida.id).toBe("campera-test-negra");
    // la remera propia sigue en el outfit -- la campera sugerida es una
    // capa extra, no un reemplazo.
    expect(sugerencias[0].prendasPropias.some((p) => p.categoria === "remera")).toBe(true);
  });

  it("no sugiere nada si la única opción del catálogo para esa categoría no combina bien", () => {
    // rojo saturado (pantalón) vs verde saturado (campera del catálogo de
    // prueba) -- se funden, no se sugiere.
    const placard = [mkPrenda("pantalon", "#CC3333", 0, 60, 50)];
    const catalogoQueNoCombina: (PresetPrenda & { hsl: HSL })[] = [
      { id: "campera-verde", nombre: "Campera verde", categoria: "campera", colorHex: "#33CC33", hsl: { h: 120, s: 60, l: 52 } },
    ];
    expect(armarOutfitsParaComprar(placard, catalogoQueNoCombina)).toHaveLength(0);
  });

  it("con varias prendas del catálogo que combinan, arma una variante por cada una (pool para 'otras opciones')", () => {
    const placard = [mkPrenda("pantalon", "#1A1A1A", 0, 0, 10)]; // negro, neutro -- combina con cualquiera
    const catalogoConVarias: (PresetPrenda & { hsl: HSL })[] = [
      { id: "campera-pluma-negra", nombre: "Campera de pluma negra", categoria: "campera", colorHex: "#1A1A1A", hsl: { h: 0, s: 0, l: 10 } },
      { id: "campera-pluma-azul", nombre: "Campera de pluma azul marino", categoria: "campera", colorHex: "#1F2A44", hsl: { h: 224, s: 38, l: 20 } },
      { id: "campera-pluma-beige", nombre: "Campera de pluma beige", categoria: "campera", colorHex: "#D8C7A1", hsl: { h: 39, s: 40, l: 76 } },
    ];
    const sugerencias = armarOutfitsParaComprar(placard, catalogoConVarias);
    expect(sugerencias).toHaveLength(3);
    expect(sugerencias.map((s) => s.sugerida.id).sort()).toEqual(
      ["campera-pluma-azul", "campera-pluma-beige", "campera-pluma-negra"].sort(),
    );
  });

  it("3ra ronda -- caso reportado en la revisión: no sugiere comprar zapatos de cuero negros para un pantalón chino beige (antes usaba scoreColor crudo y no veía la regla de cuero)", () => {
    const pantalonBeige = mkPrenda("pantalon", "#D8C7A1", 39, 40, 76);
    pantalonBeige.estilo = "clasico";
    const placard = [pantalonBeige];
    const catalogoDeCalzado: (PresetPrenda & { hsl: HSL })[] = [
      { id: "zapato-negro-test", nombre: "Zapato de cuero negro", categoria: "calzado", colorHex: "#1C1210", textura: "cuero_liso", hsl: { h: 10, s: 27, l: 9 } },
      { id: "zapato-marron-test", nombre: "Zapato de cuero marrón", categoria: "calzado", colorHex: "#5C3A21", textura: "cuero_liso", hsl: { h: 25, s: 47, l: 25 } },
    ];
    const sugerencias = armarOutfitsParaComprar(placard, catalogoDeCalzado);
    expect(sugerencias.map((s) => s.sugerida.id)).toEqual(["zapato-marron-test"]);
  });

  it("3ra ronda -- no sugiere comprar algo que choca con una prenda que el usuario YA tiene en este outfit (no solo contra el pantalón)", () => {
    const pantalonNegro = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    const cinturonMarron = mkPrenda("accesorio", "#5C3A21", 25, 47, 25);
    cinturonMarron.textura = "cuero_liso";
    const placard = [pantalonNegro, cinturonMarron];
    // el pantalón (neutro) no choca con ninguno de los dos, pero el
    // cinturón marrón que el usuario YA tiene sí choca con el zapato negro.
    const catalogoDeCalzado: (PresetPrenda & { hsl: HSL })[] = [
      { id: "zapato-negro-test", nombre: "Zapato de cuero negro", categoria: "calzado", colorHex: "#1C1210", textura: "cuero_liso", hsl: { h: 10, s: 27, l: 9 } },
    ];
    expect(armarOutfitsParaComprar(placard, catalogoDeCalzado)).toHaveLength(0);
  });

  // Auditoría de Consejo (revisor de QA, verificado por ejecución):
  // torsoPropio/calzadoPropio/accesorioPropio se elegían cada uno SOLO
  // contra el pantalón, sin cruzarse entre sí -- el bug insignia de esta
  // sesión ("cinturón negro + zapato marrón", los dos "excelente" contra
  // un pantalón neutro pero chocan entre sí) podía reaparecer mostrado
  // como "esto ya lo tenés" dentro de una idea de compra.
  it("torsoPropio/calzadoPropio/accesorioPropio también se cruzan entre sí -- el cinturón que choca con el zapato no se arrastra a la sugerencia", () => {
    const pantalonNegro = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    const zapatoNegro = mkPrenda("calzado", "#1C1210", 10, 27, 9);
    zapatoNegro.textura = "cuero_liso";
    const cinturonMarron = mkPrenda("accesorio", "#5C3A21", 25, 47, 25);
    cinturonMarron.textura = "cuero_liso";
    const placard = [pantalonNegro, zapatoNegro, cinturonMarron];
    const catalogoConRemera: (PresetPrenda & { hsl: HSL })[] = [
      { id: "remera-test", nombre: "Remera de prueba", categoria: "remera", colorHex: "#3366CC", hsl: { h: 220, s: 60, l: 50 } },
    ];
    const [sugerencia] = armarOutfitsParaComprar(placard, catalogoConRemera);
    expect(sugerencia.prendasPropias.some((p) => p.categoria === "calzado")).toBe(true);
    expect(sugerencia.prendasPropias.some((p) => p.categoria === "accesorio")).toBe(false);
  });

  it("nunca sugiere comprar otra prenda de piernas (pantalon/bermuda/short_deportivo compiten por el mismo lugar del outfit)", () => {
    // ancla en un bermuda; el catálogo de prueba tiene entradas de pantalon
    // Y de short_deportivo (categorías que categoriasAusentes ahora
    // reporta como ausentes, ya que el placard no tiene ninguna) -- ninguna
    // de las dos debería aparecer como sugerencia de compra. "camisa" (no
    // "campera": un bermuda no deportivo no combina con ningún abrigo,
    // ver el describe de más abajo) confirma que SÍ sigue sugiriendo un
    // torso real que no compite por el mismo lugar.
    const bermuda = mkPrenda("bermuda", "#1A1A1A", 0, 0, 10);
    const placard = [bermuda];
    const catalogoConOtrasPiernas: (PresetPrenda & { hsl: HSL })[] = [
      { id: "pantalon-test", nombre: "Pantalón de prueba", categoria: "pantalon", colorHex: "#1A1A1A", hsl: { h: 0, s: 0, l: 10 } },
      { id: "short-test", nombre: "Short de prueba", categoria: "short_deportivo", colorHex: "#1A1A1A", hsl: { h: 0, s: 0, l: 10 } },
      { id: "camisa-test", nombre: "Camisa de prueba", categoria: "camisa", colorHex: "#1A1A1A", hsl: { h: 0, s: 0, l: 10 } },
    ];
    const sugerencias = armarOutfitsParaComprar(placard, catalogoConOtrasPiernas);
    expect(sugerencias.some((s) => s.categoriaSugerida === "pantalon")).toBe(false);
    expect(sugerencias.some((s) => s.categoriaSugerida === "short_deportivo")).toBe(false);
    expect(sugerencias.some((s) => s.categoriaSugerida === "camisa")).toBe(true);
  });

  describe("ancla deportiva -- mismo criterio que armarOutfitsSugeridos", () => {
    function mkConEstilo(categoria: Prenda["categoria"], hex: string, h: number, s: number, l: number, estilo: Prenda["estilo"]): Prenda {
      const p = mkPrenda(categoria, hex, h, s, l);
      p.estilo = estilo;
      return p;
    }

    it("nunca sugiere comprar un accesorio para un ancla deportiva", () => {
      const pantalonDeportivo = mkConEstilo("pantalon", "#1A1A1A", 0, 0, 10, "deportivo");
      const catalogoConAccesorio: (PresetPrenda & { hsl: HSL })[] = [
        { id: "cinturon-test", nombre: "Cinturón de prueba", categoria: "accesorio", colorHex: "#1A1A1A", hsl: { h: 0, s: 0, l: 10 } },
      ];
      const sugerencias = armarOutfitsParaComprar([pantalonDeportivo], catalogoConAccesorio);
      expect(sugerencias).toHaveLength(0);
    });

    it("para una categoría de torso ausente, solo sugiere prendas genuinamente deportivas del catálogo", () => {
      const pantalonDeportivo = mkConEstilo("pantalon", "#1A1A1A", 0, 0, 10, "deportivo");
      const catalogoDeCamperas: (PresetPrenda & { hsl: HSL })[] = [
        { id: "campera-casual", nombre: "Campera casual", categoria: "campera", colorHex: "#1A1A1A", estilo: "casual", hsl: { h: 0, s: 0, l: 10 } },
        { id: "campera-deportiva", nombre: "Campera deportiva", categoria: "campera", colorHex: "#1A1A1A", estilo: "deportivo", hsl: { h: 0, s: 0, l: 10 } },
      ];
      const sugerencias = armarOutfitsParaComprar([pantalonDeportivo], catalogoDeCamperas);
      expect(sugerencias.map((s) => s.sugerida.id)).toEqual(["campera-deportiva"]);
    });

    // Segunda opinión de sastrería (Consejo, ronda siguiente): a diferencia
    // de campera (arriba), una remera lisa SÍ se sugiere para comprar con
    // un ancla deportiva aunque el preset no declare "deportivo" -- es la
    // prenda base del athleisure real, no una capa que necesite el tag.
    it("para categoría 'remera' ausente, sugiere también una remera SIN estilo deportivo declarado (excepción real, a diferencia de campera)", () => {
      const pantalonDeportivo = mkConEstilo("pantalon", "#1A1A1A", 0, 0, 10, "deportivo");
      const catalogoDeRemeras: (PresetPrenda & { hsl: HSL })[] = [
        { id: "remera-casual", nombre: "Remera casual", categoria: "remera", colorHex: "#1A1A1A", estilo: "casual", hsl: { h: 0, s: 0, l: 10 } },
      ];
      const sugerencias = armarOutfitsParaComprar([pantalonDeportivo], catalogoDeRemeras);
      expect(sugerencias.map((s) => s.sugerida.id)).toEqual(["remera-casual"]);
    });

    it("el torso propio combinado con la sugerencia también se restringe a deportivo (no arrastra un buzo casual)", () => {
      const pantalonDeportivo = mkConEstilo("pantalon", "#1A1A1A", 0, 0, 10, "deportivo");
      const buzoCasual = mkConEstilo("buzo", "#1A1A1A", 0, 0, 10, "casual");
      const catalogoDeCalzado: (PresetPrenda & { hsl: HSL })[] = [
        { id: "zapatilla-deportiva", nombre: "Zapatilla deportiva", categoria: "calzado", colorHex: "#1A1A1A", estilo: "deportivo", hsl: { h: 0, s: 0, l: 10 } },
      ];
      const sugerencias = armarOutfitsParaComprar([pantalonDeportivo, buzoCasual], catalogoDeCalzado);
      expect(sugerencias).toHaveLength(1);
      expect(sugerencias[0].prendasPropias.some((p) => p.categoria === "buzo")).toBe(false);
    });

    it("un ancla NO deportiva sigue sugiriendo accesorio y cualquier torso que combine, sin cambios", () => {
      const pantalonCasual = mkConEstilo("pantalon", "#1A1A1A", 0, 0, 10, "casual");
      const catalogoConAccesorio: (PresetPrenda & { hsl: HSL })[] = [
        { id: "cinturon-test", nombre: "Cinturón de prueba", categoria: "accesorio", colorHex: "#1A1A1A", hsl: { h: 0, s: 0, l: 10 } },
      ];
      const sugerencias = armarOutfitsParaComprar([pantalonCasual], catalogoConAccesorio);
      expect(sugerencias).toHaveLength(1);
    });
  });

  // Mismo bug reportado por el usuario que en armarOutfitsSugeridos
  // ("bermuda con sweater, ambos beige") -- "Ideas para comprar" usa
  // torsoPropio para armar el resto del outfit alrededor de la prenda
  // sugerida, así que sin este fix ofrecía "comprá una remera" para sumar
  // a un outfit que YA tenía bermuda + sweater de fondo.
  describe("bermuda/short 'de calle' nunca combina con abrigo (ni como torsoPropio ni como sugerencia de compra)", () => {
    it("torsoPropio nunca elige un sweater/buzo/campera propio para un bermuda no deportivo", () => {
      const bermuda = mkPrenda("bermuda", "#D8C7A1", 40, 25, 75);
      const sweater = mkPrenda("sweater", "#D8C7A1", 40, 25, 75); // mismo color, combinaría perfecto
      const remera = mkPrenda("remera", "#D8C7A1", 40, 25, 75);
      const catalogoConCalzado: (PresetPrenda & { hsl: HSL })[] = [
        { id: "calzado-test", nombre: "Calzado de prueba", categoria: "calzado", colorHex: "#3B2A1E", hsl: { h: 25, s: 30, l: 20 } },
      ];
      const [sugerencia] = armarOutfitsParaComprar([bermuda, sweater, remera], catalogoConCalzado);
      expect(sugerencia.prendasPropias.some((p) => p.categoria === "sweater")).toBe(false);
      expect(sugerencia.prendasPropias.some((p) => p.categoria === "remera")).toBe(true);
    });

    it("nunca sugiere COMPRAR un abrigo para completar un bermuda no deportivo", () => {
      const bermuda = mkPrenda("bermuda", "#1A1A1A", 0, 0, 10);
      const catalogoConAbrigo: (PresetPrenda & { hsl: HSL })[] = [
        { id: "campera-test", nombre: "Campera de prueba", categoria: "campera", colorHex: "#1A1A1A", hsl: { h: 0, s: 0, l: 10 } },
        { id: "camisa-test", nombre: "Camisa de prueba", categoria: "camisa", colorHex: "#1A1A1A", hsl: { h: 0, s: 0, l: 10 } },
      ];
      const sugerencias = armarOutfitsParaComprar([bermuda], catalogoConAbrigo);
      expect(sugerencias.some((s) => s.categoriaSugerida === "campera")).toBe(false);
      expect(sugerencias.some((s) => s.categoriaSugerida === "camisa")).toBe(true);
    });

    it("short deportivo + buzo, los dos deportivos -> sigue combinando (athleisure real, sin cambios)", () => {
      const shortDeportivo = mkPrenda("short_deportivo", "#1A1A1A", 0, 0, 10);
      shortDeportivo.estilo = "deportivo";
      const buzoDeportivo = mkPrenda("buzo", "#1A1A1A", 0, 0, 10);
      buzoDeportivo.estilo = "deportivo";
      const catalogoConCalzadoDeportivo: (PresetPrenda & { hsl: HSL })[] = [
        { id: "zapatilla-deportiva", nombre: "Zapatilla deportiva", categoria: "calzado", colorHex: "#1A1A1A", estilo: "deportivo", hsl: { h: 0, s: 0, l: 10 } },
      ];
      const [sugerencia] = armarOutfitsParaComprar([shortDeportivo, buzoDeportivo], catalogoConCalzadoDeportivo);
      expect(sugerencia.prendasPropias.some((p) => p.categoria === "buzo")).toBe(true);
    });

    it("un pantalón largo (no veraniego) sigue combinando con abrigo, sin cambios", () => {
      const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
      const sweater = mkPrenda("sweater", "#1A1A1A", 0, 0, 10);
      const catalogoConCalzado: (PresetPrenda & { hsl: HSL })[] = [
        { id: "calzado-test", nombre: "Calzado de prueba", categoria: "calzado", colorHex: "#3B2A1E", hsl: { h: 25, s: 30, l: 20 } },
      ];
      const [sugerencia] = armarOutfitsParaComprar([pantalon, sweater], catalogoConCalzado);
      expect(sugerencia.prendasPropias.some((p) => p.categoria === "sweater")).toBe(true);
    });
  });

  // Pedido explícito del usuario, repetido dos rondas seguidas ("bermuda
  // con camisa") -- ver esDeOficina en recommend.ts y el describe análogo
  // en armarOutfitsSugeridos para el porqué completo.
  describe("ocasion -- ninguna prenda 'de oficina' (laburo/formal) se sugiere ni se elige propia para un bermuda/short", () => {
    it("torsoPropio nunca elige una camisa de oficina (ocasion=laburo) propia para un bermuda", () => {
      const bermuda = mkPrenda("bermuda", "#1A1A1A", 0, 0, 10);
      const camisaOficina = mkPrenda("camisa", "#1A1A1A", 0, 0, 10);
      camisaOficina.ocasion = "laburo";
      const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
      const catalogoConCalzado: (PresetPrenda & { hsl: HSL })[] = [
        { id: "calzado-test", nombre: "Calzado de prueba", categoria: "calzado", colorHex: "#3B2A1E", hsl: { h: 25, s: 30, l: 20 } },
      ];
      const [sugerencia] = armarOutfitsParaComprar([bermuda, camisaOficina, remera], catalogoConCalzado);
      expect(sugerencia.prendasPropias.some((p) => p.categoria === "camisa")).toBe(false);
      expect(sugerencia.prendasPropias.some((p) => p.categoria === "remera")).toBe(true);
    });

    it("nunca sugiere COMPRAR zapatos de vestir (ocasion=laburo) para completar un bermuda", () => {
      const bermuda = mkPrenda("bermuda", "#1A1A1A", 0, 0, 10);
      const catalogoConCalzado: (PresetPrenda & { hsl: HSL })[] = [
        { id: "zapato-vestir-test", nombre: "Zapato de vestir de prueba", categoria: "calzado", colorHex: "#1A1A1A", ocasion: "laburo", hsl: { h: 0, s: 0, l: 10 } },
        { id: "zapatilla-test", nombre: "Zapatilla de prueba", categoria: "calzado", colorHex: "#1A1A1A", ocasion: "casual", hsl: { h: 0, s: 0, l: 10 } },
      ];
      const sugerencias = armarOutfitsParaComprar([bermuda], catalogoConCalzado);
      expect(sugerencias.some((s) => s.sugerida.id === "zapato-vestir-test")).toBe(false);
      expect(sugerencias.some((s) => s.sugerida.id === "zapatilla-test")).toBe(true);
    });

    it("calzadoPropio/accesorioPropio de oficina tampoco se arrastran al armar una sugerencia de otra categoría", () => {
      const bermuda = mkPrenda("bermuda", "#1A1A1A", 0, 0, 10);
      const zapatoOficina = mkPrenda("calzado", "#1A1A1A", 0, 0, 10);
      zapatoOficina.ocasion = "laburo";
      const catalogoConRemera: (PresetPrenda & { hsl: HSL })[] = [
        { id: "remera-test", nombre: "Remera de prueba", categoria: "remera", colorHex: "#1A1A1A", hsl: { h: 0, s: 0, l: 10 } },
      ];
      const [sugerencia] = armarOutfitsParaComprar([bermuda, zapatoOficina], catalogoConRemera);
      expect(sugerencia.prendasPropias.some((p) => p.categoria === "calzado")).toBe(false);
    });
  });
});

describe("sugerenciaDeVariedad", () => {
  function mkPrendaEstilo(categoria: Prenda["categoria"], hex: string, h: number, s: number, l: number, estilo: Prenda["estilo"]): Prenda {
    const p = mkPrenda(categoria, hex, h, s, l);
    p.estilo = estilo;
    return p;
  }

  const catalogoDeportivo: (PresetPrenda & { hsl: HSL })[] = [
    { id: "remera-dep-blanca", nombre: "Remera deportiva blanca", categoria: "remera", colorHex: "#FFFFFF", estilo: "deportivo", hsl: { h: 0, s: 0, l: 100 } },
    { id: "remera-dep-negra", nombre: "Remera deportiva negra", categoria: "remera", colorHex: "#1A1A1A", estilo: "deportivo", hsl: { h: 0, s: 0, l: 10 } },
    { id: "buzo-dep-gris", nombre: "Buzo deportivo gris", categoria: "buzo", colorHex: "#8C8C8C", estilo: "deportivo", hsl: { h: 0, s: 0, l: 55 } },
    // otro estilo -- no debería aparecer nunca como sugerencia "deportivo".
    { id: "remera-clasica-celeste", nombre: "Remera clásica celeste", categoria: "remera", colorHex: "#B7D2EC", estilo: "clasico", hsl: { h: 209, s: 58, l: 82 } },
  ];

  it("sin pantalón de ese estilo en el placard, no hay ancla -> null", () => {
    const remeraSola = mkPrendaEstilo("remera", "#1A1A1A", 0, 0, 10, "deportivo");
    expect(sugerenciaDeVariedad("deportivo", [remeraSola], catalogoDeportivo)).toBeNull();
  });

  it("0 prendas de torso en ese estilo -> sugiere la primera categoría de torso que combine, mensaje de 'ninguna'", () => {
    const pantalon = mkPrendaEstilo("pantalon", "#1A1A1A", 0, 0, 10, "deportivo");
    const r = sugerenciaDeVariedad("deportivo", [pantalon], catalogoDeportivo);
    expect(r).not.toBeNull();
    expect(r!.sugerida.categoria).toBe("remera");
    expect(r!.mensaje).toContain("ninguna prenda");
  });

  it("1 sola prenda de torso -> sugiere otra de la MISMA categoría, priorizando un color que todavía no tiene", () => {
    const pantalon = mkPrendaEstilo("pantalon", "#1A1A1A", 0, 0, 10, "deportivo");
    const remeraNegra = mkPrendaEstilo("remera", "#1A1A1A", 0, 0, 10, "deportivo");
    const r = sugerenciaDeVariedad("deportivo", [pantalon, remeraNegra], catalogoDeportivo);
    expect(r).not.toBeNull();
    expect(r!.sugerida.id).toBe("remera-dep-blanca"); // no la negra -- ya tiene ese color
    expect(r!.sugerida.categoria).toBe("remera"); // misma categoría, no buzo
    expect(r!.mensaje).toContain("una sola prenda");
  });

  it("2+ prendas de torso ya variadas en tipo -- no hueco de tipo, pasa a chequear color", () => {
    const pantalon = mkPrendaEstilo("pantalon", "#1A1A1A", 0, 0, 10, "deportivo");
    const remera = mkPrendaEstilo("remera", "#1A1A1A", 0, 0, 10, "deportivo");
    const buzo = mkPrendaEstilo("buzo", "#1A1A1A", 0, 0, 10, "deportivo");
    // 3 prendas deportivas, las 3 negras -- mismo color casi siempre.
    const r = sugerenciaDeVariedad("deportivo", [pantalon, remera, buzo], catalogoDeportivo);
    expect(r).not.toBeNull();
    expect(r!.mensaje).toContain("repiten casi siempre el mismo color");
    expect(r!.sugerida.id).not.toBe("remera-dep-negra"); // no repetir el color que ya sobra
  });

  it("variedad suficiente de tipo y color -> null, sin sugerencia", () => {
    const pantalon = mkPrendaEstilo("pantalon", "#1A1A1A", 0, 0, 10, "deportivo");
    const remeraBlanca = mkPrendaEstilo("remera", "#FFFFFF", 0, 0, 100, "deportivo");
    const buzoGris = mkPrendaEstilo("buzo", "#8C8C8C", 0, 0, 55, "deportivo");
    expect(sugerenciaDeVariedad("deportivo", [pantalon, remeraBlanca, buzoGris], catalogoDeportivo)).toBeNull();
  });

  it("nunca sugiere una prenda de otro estilo, aunque combine mejor en color", () => {
    const pantalon = mkPrendaEstilo("pantalon", "#1A1A1A", 0, 0, 10, "deportivo");
    const r = sugerenciaDeVariedad("deportivo", [pantalon], catalogoDeportivo);
    expect(r!.sugerida.id).not.toBe("remera-clasica-celeste");
  });

  it("prioriza el hueco de TIPO de prenda sobre el de color cuando los dos aplican", () => {
    // 1 sola prenda de torso Y además del mismo color que el resto -- el
    // mensaje tiene que ser de "poca variedad" de tipo, no de color.
    const pantalon = mkPrendaEstilo("pantalon", "#1A1A1A", 0, 0, 10, "deportivo");
    const remeraNegra = mkPrendaEstilo("remera", "#1A1A1A", 0, 0, 10, "deportivo");
    const r = sugerenciaDeVariedad("deportivo", [pantalon, remeraNegra], catalogoDeportivo);
    expect(r!.mensaje).not.toContain("color");
  });
});

describe("sugerenciaDeAncla", () => {
  const catalogoClasico: (PresetPrenda & { hsl: HSL })[] = [
    { id: "pantalon-clasico-negro", nombre: "Pantalón clásico negro", categoria: "pantalon", colorHex: "#1A1A1A", estilo: "clasico", hsl: { h: 0, s: 0, l: 10 } },
    { id: "pantalon-clasico-beige", nombre: "Pantalón clásico beige", categoria: "pantalon", colorHex: "#D8C7A1", estilo: "clasico", hsl: { h: 41, s: 41, l: 74 } },
    // otro estilo -- no debería aparecer nunca como sugerencia "clasico".
    { id: "pantalon-deportivo", nombre: "Pantalón deportivo", categoria: "pantalon", colorHex: "#1A1A1A", estilo: "deportivo", hsl: { h: 0, s: 0, l: 10 } },
  ];

  function mkConEstilo(categoria: Prenda["categoria"], hex: string, h: number, s: number, l: number, estilo: Prenda["estilo"]): Prenda {
    const p = mkPrenda(categoria, hex, h, s, l);
    p.estilo = estilo;
    return p;
  }

  it("con un pantalón de ese estilo ya en el placard, no hay problema de ancla -> null", () => {
    const pantalonClasico = mkConEstilo("pantalon", "#1A1A1A", 0, 0, 10, "clasico");
    expect(sugerenciaDeAncla("clasico", [pantalonClasico], catalogoClasico)).toBeNull();
  });

  it("caso real reportado: sweaters y camisas 'clásico' de sobra, pero NINGÚN pantalón clásico -> sugiere uno que combine, con el mensaje de 'prenda ancla'", () => {
    const sweaterNegro = mkConEstilo("sweater", "#1A1A1A", 0, 0, 10, "clasico");
    const pantalonFormal = mkConEstilo("pantalon", "#1A1A1A", 0, 0, 10, "formal"); // no cuenta como ancla clásica
    const r = sugerenciaDeAncla("clasico", [sweaterNegro, pantalonFormal], catalogoClasico);
    expect(r).not.toBeNull();
    expect(r!.sugerida.categoria).toBe("pantalon");
    expect(r!.sugerida.id).not.toBe("pantalon-deportivo"); // nunca de otro estilo
    expect(r!.mensaje).toContain("prenda ancla");
  });

  it("sin ancla y tampoco ninguna prenda de torso de ese estilo -> igual sugiere, con mensaje distinto ('todavía no tenés ninguna')", () => {
    const r = sugerenciaDeAncla("clasico", [], catalogoClasico);
    expect(r).not.toBeNull();
    expect(r!.mensaje).toContain("Todavía no tenés ninguna");
    expect(r!.mensaje).not.toContain("prenda ancla");
  });

  it("el catálogo sin ningún pantalón/bermuda/short de ese estilo -> null (no hay nada real para sugerir)", () => {
    const catalogoSinPiernas: (PresetPrenda & { hsl: HSL })[] = [
      { id: "sweater-clasico", nombre: "Sweater clásico", categoria: "sweater", colorHex: "#1A1A1A", estilo: "clasico", hsl: { h: 0, s: 0, l: 10 } },
    ];
    expect(sugerenciaDeAncla("clasico", [], catalogoSinPiernas)).toBeNull();
  });
});

// Pedido explícito del usuario: "quiero un sistema de valoración por
// puntos... este outfit es un nueve de diez por esto y por esto". No es una
// escala nueva -- reusa scoreColor/recomendar() sobre TODOS los pares del
// outfit, expresado en una nota de 1 a 10.
// Consejo, pedido explícito del usuario: "reglas universales que toda
// combinación debe seguir... por ejemplo la regla del 60-30-10 -- un color
// principal, uno secundario y un accesorio terciario". Rol: asesor de
// imagen/colorista.
describe("contarColoresProtagonistas", () => {
  it("outfit todo neutro (negro/gris/blanco) -> 0 colores protagonistas, el neutro no compite", () => {
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    const remera = mkPrenda("remera", "#8C8C8C", 0, 0, 55);
    const calzado = mkPrenda("calzado", "#F5F5F5", 0, 0, 96);
    expect(contarColoresProtagonistas([pantalon, remera, calzado])).toBe(0);
  });

  it("un solo color real sobre una base neutra -> 1 protagonista", () => {
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    const remera = mkPrenda("remera", "#3366CC", 220, 70, 50);
    expect(contarColoresProtagonistas([pantalon, remera])).toBe(1);
  });

  it("dos prendas del mismo color de familia (hueDist chico) cuentan como UN solo grupo, no dos", () => {
    const pantalon = mkPrenda("pantalon", "#B93A32", 5, 70, 45);
    const accesorio = mkPrenda("accesorio", "#C24A3A", 10, 70, 48);
    expect(contarColoresProtagonistas([pantalon, accesorio])).toBe(1);
  });

  it("una paleta apagada (croma bajo, tierra) NO cuenta como protagonista aunque no sea neutra por esNeutro", () => {
    // marrón/oliva apagados, saturación real pero croma bajo -- la paleta
    // base de sastrería (mismo criterio que ya usa scoreColor regla 2/4/4b).
    const pantalon = mkPrenda("pantalon", "#8A6D4A", 32, 33, 40);
    const remera = mkPrenda("remera", "#5A6B4A", 90, 20, 35);
    expect(contarColoresProtagonistas([pantalon, remera])).toBe(0);
  });

  it("4 colores saturados y mutuamente distintos (piernas/torso/calzado/accesorio) -> 4 grupos", () => {
    const pantalon = mkPrenda("pantalon", "#FF0000", 0, 90, 30);
    const remera = mkPrenda("remera", "#FFA500", 50, 90, 45);
    const calzado = mkPrenda("calzado", "#00FF00", 90, 90, 60);
    const accesorio = mkPrenda("accesorio", "#0000FF", 130, 90, 75);
    expect(contarColoresProtagonistas([pantalon, remera, calzado, accesorio])).toBe(4);
  });
});

describe("puntuarOutfit", () => {
  it("una sola prenda -> 10, no hay con qué chocar", () => {
    const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
    expect(puntuarOutfit([remera])).toEqual({ puntaje: 10, explicacion: "Una sola prenda: no hay con qué chocar." });
  });

  it("outfit vacío -> 10 por default (mismo caso límite que una sola prenda)", () => {
    expect(puntuarOutfit([]).puntaje).toBe(10);
  });

  it("dos prendas neutras, mismo color exacto -> 10, combinación segura", () => {
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
    const r = puntuarOutfit([pantalon, remera]);
    expect(r.puntaje).toBe(10);
    expect(r.explicacion).toContain("Combinación segura");
  });

  it("una prenda más informal que el pantalón (muy_bueno, no con_cuidado) -> puntaje intermedio con el motivo real citado", () => {
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";
    const zapatillas = mkPrenda("calzado", "#1A1A1A", 0, 0, 10);
    zapatillas.estilo = "urbano";
    const r = puntuarOutfit([pantalonVestir, zapatillas]);
    expect(r.puntaje).toBe(6); // un solo par, muy_bueno -> PUNTOS_POR_NIVEL.muy_bueno
    expect(r.explicacion).toContain("más informal que el pantalón");
  });

  it("un par con_cuidado de verdad (cuero descoordinado) -> puntaje bajo, cita el motivo real de cuero", () => {
    const cinturonNegro = mkPrenda("accesorio", "#1A1A1A", 0, 0, 10);
    cinturonNegro.textura = "cuero_liso";
    const zapatoMarron = mkPrenda("calzado", "#5C3A21", 25, 47, 25);
    zapatoMarron.textura = "cuero_liso";
    const r = puntuarOutfit([cinturonNegro, zapatoMarron]);
    expect(r.puntaje).toBe(3); // un solo par, con_cuidado -> PUNTOS_POR_NIVEL.con_cuidado
    expect(r.explicacion).toContain("cuero se coordina aparte");
  });

  it("promedia sobre TODOS los pares, no solo contra la primera prenda", () => {
    // pantalón + remera (mismo color, excelente) + calzado más informal que
    // el pantalón (muy_bueno) -- promedio (10+10+6)/3 = 8.67 -> redondea a
    // 9 -> topeado a 8 (pantalón-remera, pantalón-calzado, remera-calzado;
    // remera-calzado también excelente por ser el mismo color exacto).
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";
    const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
    const zapatillas = mkPrenda("calzado", "#1A1A1A", 0, 0, 10);
    zapatillas.estilo = "urbano";
    const r = puntuarOutfit([pantalonVestir, remera, zapatillas]);
    expect(r.puntaje).toBe(8);
  });

  it("puntaje siempre entre 1 y 10 (clamp), redondeado", () => {
    const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    const r = puntuarOutfit([remera, pantalon]);
    expect(r.puntaje).toBeGreaterThanOrEqual(1);
    expect(r.puntaje).toBeLessThanOrEqual(10);
    expect(Number.isInteger(r.puntaje)).toBe(true);
  });

  // Auditoría de Consejo (lógica/motor): con 4 prendas hay 6 pares -- 5
  // excelente + 1 muy_bueno promedia (5*10+6)/6 = 9.33, que Math.round
  // sube a 9 -- topeado a 8 (segunda vuelta de auditoría, pedido explícito
  // del usuario: "veo un 9/10 que debería ser menos"). Un outfit de 4
  // prendas con un salto de registro real (acá: pantalón de vestir +
  // zapatillas urbanas, mismo color exacto en las 4 prendas para que el
  // resto de los pares sea excelente sin ambigüedad) mostraba antes
  // "10/10" (bug de redondeo original) y después "9/10" (todavía muy alto
  // para un defecto real) al lado de una explicación citando el defecto
  // -- una contradicción directa entre el número y el texto, confirmada
  // con el catálogo real (180 outfits de armarOutfitsSugeridos caían en
  // este caso antes del primer fix).
  it("5 pares excelente + 1 muy_bueno (avg 9.33) -> topea en 8, nunca en 9 o 10 sin ser todosExcelentes", () => {
    const pantalonVestir = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalonVestir.estilo = "formal";
    const camisa = mkPrenda("camisa", "#1A1A1A", 0, 0, 10);
    const zapatillas = mkPrenda("calzado", "#1A1A1A", 0, 0, 10);
    zapatillas.estilo = "urbano";
    const cinturon = mkPrenda("accesorio", "#1A1A1A", 0, 0, 10);
    const r = puntuarOutfit([pantalonVestir, camisa, zapatillas, cinturon]);
    expect(r.puntaje).toBe(8);
    expect(r.explicacion).not.toContain("Combinación segura");
    expect(r.explicacion).toContain("más informal que el pantalón");
  });

  it("todos los pares excelente -> 10 siempre, sea cual sea el promedio (no hay promedio menor a 10 posible acá)", () => {
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
    const calzado = mkPrenda("calzado", "#1A1A1A", 0, 0, 10);
    const r = puntuarOutfit([pantalon, remera, calzado]);
    expect(r.puntaje).toBe(10);
    expect(r.explicacion).toContain("Combinación segura");
  });

  // Consejo, pedido explícito del usuario ("reglas universales... regla del
  // 60-30-10"): un outfit con las 4 prendas en colores saturados y
  // mutuamente distintos (ninguno análogo a otro) nunca puede dar
  // "todosExcelentes" con las reglas actuales de scoreColor -- dos colores
  // no-neutros y saturados solo dan "excelente" entre sí si son del MISMO
  // grupo de matiz (ver contarColoresProtagonistas), así que 4 grupos
  // reales ya bajan el promedio por su cuenta. Lo que faltaba era la
  // EXPLICACIÓN correcta -- sin el fix, este caso citaba el motivo de un
  // solo par al azar en vez de nombrar la causa real y completa.
  it("4 colores saturados y mutuamente distintos -> cita la regla 60-30-10 como motivo, nunca 10/10", () => {
    const pantalon = mkPrenda("pantalon", "#FF0000", 0, 90, 30);
    const remera = mkPrenda("remera", "#FFA500", 50, 90, 45);
    const calzado = mkPrenda("calzado", "#00FF00", 90, 90, 60);
    const accesorio = mkPrenda("accesorio", "#0000FF", 130, 90, 75);
    const r = puntuarOutfit([pantalon, remera, calzado, accesorio]);
    expect(r.puntaje).toBeLessThan(10);
    expect(r.explicacion).toContain("60-30-10");
  });

  it("2-3 colores reales (el escenario que 60-30-10 pide) NO dispara el aviso -- solo el caso de 4 a la vez", () => {
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10); // neutro, no cuenta
    const remera = mkPrenda("remera", "#FF0000", 0, 90, 30);
    const accesorio = mkPrenda("accesorio", "#0000FF", 130, 90, 75);
    const r = puntuarOutfit([pantalon, remera, accesorio]);
    expect(r.explicacion).not.toContain("60-30-10");
  });
});

// Placard real y chico (mismos ids que el catálogo real) donde el mejor
// outfit "formal" posible queda frenado en 9/10 por el calzado -- el
// usuario solo tiene zapatillas urbanas, nunca un zapato de vestir --
// mientras que variedad de tipo (2 pantalones, 2 camisas + saco) y de
// color ya están cubiertas (sugerenciaDeVariedad no tendría nada que
// avisar). Escenario tomado del ejemplo real del usuario: "la mejor
// valoración de tu outfit es de X, te recomiendo comprar esto para
// subirla" -- este es el caso que arma la validación de punta a punta.
const catalogoPorId = Object.fromEntries(CATALOGO_CON_HSL.map((p) => [p.id, p]));
const placardFormalSinZapatosDeVestir: Prenda[] = [
  "pantalon-vestir-negro",
  "pantalon-vestir-azul",
  "camisa-blanca",
  "camisa-celeste",
  "saco-azul-marino",
  "zapatillas-negras",
  "cinturon-negro",
].map((id) => presetAPrendaSintetica(catalogoPorId[id]));

describe("mejorasDeReemplazo", () => {
  it("caso real: único calzado es informal -> sugiere reemplazarlo por el zapato de vestir del catálogo, y sube la nota", () => {
    const placard = placardFormalSinZapatosDeVestir;
    const mejor = armarOutfitsSugeridos(placard, "entretiempo")
      .filter((s) => outfitSirveParaEstilo(s.prendas, "formal"))
      .sort((a, b) => b.puntaje - a.puntaje)[0];
    expect(mejor.puntaje).toBe(8); // ver el test de puntuarOutfit del fix de redondeo/exigencia
    expect(mejor.explicacionPuntaje).toContain("más informal que el pantalón");

    const reemplazos = mejorasDeReemplazo(mejor, placard);
    expect(reemplazos.length).toBeGreaterThan(0);
    const mejorReemplazo = reemplazos[0];
    expect(mejorReemplazo.categoriaSugerida).toBe("calzado");
    expect(mejorReemplazo.sugerida.id).toBe("zapatos-cuero-negro");
    expect(mejorReemplazo.puntaje).toBe(10);
    expect(mejorReemplazo.puntaje).toBeGreaterThan(mejor.puntaje);
  });

  it("outfit ya perfecto (10/10) -> ningún reemplazo puede superarlo, lista vacía", () => {
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
    const outfitPerfecto = { id: "x", prendas: [pantalon, remera], puntaje: 10, explicacionPuntaje: "" };
    expect(mejorasDeReemplazo(outfitPerfecto, [pantalon, remera])).toEqual([]);
  });

  it("sin ancla (piernas) en el outfit -> no hay nada que anclar la validación, lista vacía", () => {
    const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
    const outfitSinAncla = { id: "x", prendas: [remera], puntaje: 10, explicacionPuntaje: "" };
    expect(mejorasDeReemplazo(outfitSinAncla, [remera])).toEqual([]);
  });
});

describe("mejorCompraParaSubirNota", () => {
  it("junta reemplazos y ausentes, y devuelve la de mayor puntaje que de verdad supera la nota actual", () => {
    const placard = placardFormalSinZapatosDeVestir;
    const mejor = armarOutfitsSugeridos(placard, "entretiempo")
      .filter((s) => outfitSirveParaEstilo(s.prendas, "formal"))
      .sort((a, b) => b.puntaje - a.puntaje)[0];
    const compra = mejorCompraParaSubirNota("formal", mejor, placard);
    expect(compra).toBeDefined();
    expect(compra!.sugerida.id).toBe("zapatos-cuero-negro");
    expect(compra!.puntaje).toBe(10);
  });

  it("nada que comprar supera la nota actual -> undefined (no inventa una mejora que no es real)", () => {
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalon.estilo = "formal";
    const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
    const outfitPerfecto = { id: "x", prendas: [pantalon, remera], puntaje: 10, explicacionPuntaje: "" };
    expect(mejorCompraParaSubirNota("formal", outfitPerfecto, [pantalon, remera])).toBeUndefined();
  });

  // Consejo, pedido explícito del usuario: "revisá la función de recomendar
  // compra" -- verificado por ejecución tras la ronda que agregó "formal
  // exige saco" (outfitSirveParaEstilo): sin este fix, ausentes se
  // chequeaba con outfitSirveParaEstilo(c.prendasPropias, estilo) --
  // prendasPropias por definición NUNCA incluye lo que se está por
  // sugerir comprar, así que "comprate un saco para armar formal" se
  // descartaba a sí misma (sin el saco puesto todavía, ese outfit no era
  // "formal"). Ahora se chequea contra prendasPropias + LA SUGERIDA.
  it("si al usuario le falta directamente el saco (la categoría que 'formal' exige), igual se lo sugiere comprar", () => {
    const pantalon = mkPrenda("pantalon", "#1A1A1A", 0, 0, 10);
    pantalon.estilo = "formal";
    const camisa = mkPrenda("camisa", "#1A1A1A", 0, 0, 10);
    const placard = [pantalon, camisa];
    // puntaje bajo a propósito -- cualquier sugerencia real que arme un
    // outfit razonable lo supera, sin depender de un número exacto.
    const base = { id: "x", prendas: placard, puntaje: 5, explicacionPuntaje: "" };
    const compra = mejorCompraParaSubirNota("formal", base, placard);
    expect(compra).toBeDefined();
    expect(compra!.categoriaSugerida).toBe("saco");
  });
});

// Placard real y chico (mismos ids que el catálogo real) donde NINGUNA
// compra de una sola prenda alcanza un 10 -- hallazgo de la auditoría de
// Consejo sobre el placard REAL del usuario: saco y pantalón azul marino
// "excelente"/"muy_bueno" contra calzado Y accesorio de cuero marrón (los
// dos del MISMO marrón entre sí, por eso "excelente" uno con el otro, pero
// "muy_bueno" cada uno contra el azul marino) -- cambiar solo el calzado a
// negro deja el accesorio marrón sin coordinar (y viceversa), así que
// hacen falta las dos prendas juntas. Confirmado por ejecución contra el
// placard real de producción antes de escribir este test sintético.
const placardFormalMarronSinCoordinar: Prenda[] = [
  "pantalon-vestir-azul",
  "saco-azul-marino",
  "camisa-celeste",
  "zapatos-cuero-marron",
  "cinturon-marron",
].map((id) => presetAPrendaSintetica(catalogoPorId[id]));

describe("comboParaExcelencia", () => {
  it("caso real: cuero marrón (calzado + accesorio) sin coordinar con el azul marino -- ninguna compra de UNA prenda llega a 10, pero la pareja sí", () => {
    const placard = placardFormalMarronSinCoordinar;
    const base = armarOutfitsSugeridos(placard, "entretiempo")
      .filter((s) => outfitEsCoherenteParaEstilo(s.prendas, "formal"))
      .sort((a, b) => b.puntaje - a.puntaje)[0];
    expect(base.puntaje).toBe(8);
    // confirma la premisa del test: con esta base, ni un solo swap alcanza.
    expect(mejorCompraParaSubirNota("formal", base, placard)).toBeUndefined();

    const combo = comboParaExcelencia("formal", base, placard);
    expect(combo).toBeDefined();
    expect(combo!.puntaje).toBe(10);
    expect(combo!.sugeridas.map((s) => s.id).sort()).toEqual(["cinturon-negro", "zapatos-cuero-negro"]);
  });

  it("cuando UNA sola prenda ya alcanza el 10 (mejorCompraParaSubirNota), la reusa en vez de buscar una pareja", () => {
    const placard = placardFormalSinZapatosDeVestir;
    const base = armarOutfitsSugeridos(placard, "entretiempo")
      .filter((s) => outfitSirveParaEstilo(s.prendas, "formal"))
      .sort((a, b) => b.puntaje - a.puntaje)[0];
    const combo = comboParaExcelencia("formal", base, placard);
    expect(combo).toBeDefined();
    expect(combo!.puntaje).toBe(10);
    expect(combo!.sugeridas).toHaveLength(1);
    expect(combo!.sugeridas[0].id).toBe("zapatos-cuero-negro");
  });

  it("ni una prenda ni una pareja alcanzan (catálogo vacío) -> undefined, sin inventar una mejora que no existe", () => {
    const placard = placardFormalMarronSinCoordinar;
    const base = armarOutfitsSugeridos(placard, "entretiempo")
      .filter((s) => outfitEsCoherenteParaEstilo(s.prendas, "formal"))
      .sort((a, b) => b.puntaje - a.puntaje)[0];
    expect(comboParaExcelencia("formal", base, placard, [])).toBeUndefined();
  });

  it("outfit sin ancla (piernas) -> undefined", () => {
    const remera = mkPrenda("remera", "#1A1A1A", 0, 0, 10);
    const outfit = { id: "x", prendas: [remera], puntaje: 5, explicacionPuntaje: "" };
    expect(comboParaExcelencia("formal", outfit, [remera])).toBeUndefined();
  });
});

describe("tanda", () => {
  it("pool vacío -> tanda vacía", () => {
    expect(tanda([1, 2, 3], 0, 0)).toEqual([]);
    expect(tanda([], 0, 2)).toEqual([]);
  });

  it("pool más chico que la cantidad pedida -> se muestra entero, sin repetir", () => {
    expect(tanda(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });

  it("offset dentro de rango -> tanda consecutiva desde ahí", () => {
    expect(tanda([1, 2, 3, 4, 5], 1, 2)).toEqual([2, 3]);
  });

  it("da la vuelta al pasarse del final (para que 'otras opciones' nunca se quede sin nada)", () => {
    expect(tanda([1, 2, 3, 4, 5], 4, 2)).toEqual([5, 1]);
  });

  it("offset mayor al tamaño del pool (p.ej. el pool se achicó tras guardar un outfit) no rompe -- sigue dando la vuelta", () => {
    expect(tanda([1, 2, 3], 10, 2)).toEqual([2, 3]);
  });

  // Auditoría de Consejo (revisor de QA, verificado por ejecución): el %
  // de JS no normaliza negativos -- pool[(offset+i) % pool.length] con
  // offset negativo daba pool[-1], es decir `undefined`, en vez de dar la
  // vuelta hacia atrás. Ningún llamador real pasa un offset negativo hoy,
  // pero tanda() es pública y no tiene ninguna guarda -- esto es
  // robustez, no un bug disparado hoy en la UI.
  it("offset negativo no rompe -- da la vuelta hacia atrás en vez de devolver undefined", () => {
    expect(tanda([1, 2, 3, 4, 5], -1, 3)).toEqual([5, 1, 2]);
    expect(tanda([1, 2, 3, 4, 5], -7, 3)).toEqual([4, 5, 1]);
  });
});

describe("diffPrendasEdicion", () => {
  it("sin cambios -> nada para agregar ni quitar", () => {
    const actuales = new Set(["a", "b"]);
    expect(diffPrendasEdicion(actuales, new Set(["a", "b"]))).toEqual({ aAgregar: [], aQuitar: [] });
  });

  it("solo agrega una prenda nueva, conserva las que ya estaban", () => {
    const actuales = new Set(["a", "b"]);
    const r = diffPrendasEdicion(actuales, new Set(["a", "b", "c"]));
    expect(r.aAgregar).toEqual(["c"]);
    expect(r.aQuitar).toEqual([]);
  });

  it("solo saca una prenda, conserva el resto", () => {
    const actuales = new Set(["a", "b"]);
    const r = diffPrendasEdicion(actuales, new Set(["a"]));
    expect(r.aAgregar).toEqual([]);
    expect(r.aQuitar).toEqual(["b"]);
  });

  it("reemplaza TODAS las prendas por otras completamente distintas -- el caso que obliga a insertar antes de borrar (ver comentario en recommend.ts)", () => {
    const actuales = new Set(["a", "b"]);
    const r = diffPrendasEdicion(actuales, new Set(["c", "d"]));
    expect(r.aAgregar.sort()).toEqual(["c", "d"]);
    expect(r.aQuitar.sort()).toEqual(["a", "b"]);
  });
});

function mkPrenda(
  categoria: Prenda["categoria"],
  hex: string,
  h: number,
  s: number,
  l: number,
): Prenda {
  return {
    id: hex + categoria,
    user_id: "u1",
    categoria,
    color_hex: hex,
    color_h: h,
    color_s: s,
    color_l: l,
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

import { describe, expect, it } from "vitest";
import {
  advertenciasDeRegistro,
  armarOutfitsParaComprar,
  armarOutfitsSugeridos,
  categoriasAusentes,
  diffPrendasEdicion,
  esNeutro,
  hueDist,
  recomendar,
  registroOutfit,
  scoreColor,
  tanda,
  tecnicaRescate,
  valueDist,
} from "./recommend";
import { hexToHsl, hslToHex, rgbToHsl } from "./color";
import type { HSL, Prenda } from "./types";
import type { PresetPrenda } from "./catalogo";

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
  it("casi negro por luminosidad baja", () => {
    expect(esNeutro(80, 10)).toBe(true);
  });
  it("casi blanco por luminosidad alta", () => {
    expect(esNeutro(80, 90)).toBe(true);
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
    expect(ausentes).not.toContain("pantalon");
    expect(ausentes).not.toContain("remera");
  });

  it("placard vacío: todas las categorías están ausentes", () => {
    expect(categoriasAusentes([])).toHaveLength(8);
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
    ocasion: null,
    estacion: null,
    foto_path: null,
    suela_contraste: false,
    requiere_cuello: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

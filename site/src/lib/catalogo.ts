import type { Calce, Categoria, CorteCalzado, Estacion, Estilo, Ocasion, Patron, Prenda, Textura } from "./types";
import { hexToHsl } from "./color";

export interface PresetPrenda {
  id: string;
  nombre: string;
  categoria: Categoria;
  colorHex: string;
  textura?: Textura;
  estilo?: Estilo;
  /** Ver Prenda.estilos_secundarios en types.ts. Se omite (== []) salvo en
   *  las pocas prendas donde de verdad funcionan en más de un registro. */
  estilosSecundarios?: Estilo[];
  ocasion?: Ocasion;
  estacion?: Estacion;
  /** Ver Prenda.suela_contraste en types.ts. Solo tiene sentido en calzado;
   *  se omite (== false) en el resto de las categorías. */
  suelaContraste?: boolean;
  /** Ver Prenda.requiere_cuello en types.ts. Solo tiene sentido en
   *  accesorios tipo corbata; se omite (== false) en el resto. */
  requiereCuello?: boolean;
  /** Ver Prenda.posicion_accesorio en types.ts. Solo tiene sentido en
   *  categoria="accesorio"; se omite (== "cintura", cinturón) en el resto. */
  posicionAccesorio?: "cuello" | "cintura";
  /** Ver Prenda.con_capucha en types.ts. Solo tiene sentido en
   *  categoria="buzo"; se omite (== true, hoodie) salvo en los crewneck
   *  puntuales sin capucha. */
  conCapucha?: boolean;
  /** Ver Prenda.patron en types.ts. Se omite (== "liso") en casi todo el
   *  catálogo -- solo las camisas a rayas/cuadros lo declaran. */
  patron?: Patron;
  /** Segundo color del estampado (ver Prenda.color2_* en types.ts) --
   *  obligatorio en la práctica cuando `patron` no es "liso", si no no hay
   *  con qué dibujar el estampado real. */
  colorHex2?: string;
  /** Ver CorteCalzado en types.ts. Solo tiene sentido en categoria="calzado";
   *  se omite (== "zapatilla_urbana") en el resto de las categorías. */
  corteCalzado?: CorteCalzado;
  /** Ver Calce en types.ts. Se omite (== "regular") en la mayoría del
   *  catálogo -- solo se declara en las prendas donde el volumen real es
   *  claramente distinto de un corte estándar (jogger/short deportivo
   *  holgados, camisa de vestir/blazer ajustados). */
  calce?: Calce;
}

/**
 * Catálogo fijo de prendas comunes, para agregar al placard con un toque en
 * vez de configurar categoría+color+tags a mano cada vez. Curado a
 * propósito, no generado -- criterios:
 *
 * - Cubre casual, ropa de oficina, urbana, clásica y deportiva (pedido
 *   explícito -- el catálogo original no tenía NINGUNA prenda con estilo
 *   "deportivo"), en las 11 categorías que soporta el placard (incluye
 *   bermuda y short_deportivo, agregadas después junto con pantalon como
 *   las tres categorías de "piernas", y saco -- agregada después, pedido
 *   explícito del usuario, "un traje azul marino": un saco de traje no es
 *   una campera, es su propia categoría de torso). Ver CatalogoPicker.tsx
 *   para cómo se agrupa/filtra esto en la UI.
 * - Colores reales y de uso común, no una paleta arcoíris -- para cada
 *   prenda, los 2-4 colores que de verdad se usan más (ej. camisa: blanca/
 *   celeste/negra, no "camisa violeta").
 * - `estilo`/`ocasion` se completan solo cuando son inequívocos para esa
 *   prenda (una camisa de oficina es "laburo" sin duda; un buzo, sea cual
 *   sea su color, es casual sin ambigüedad real -- por eso las 3 entradas
 *   de buzo sí llevan ocasion:"casual").
 * - `estacion` se deja vacía en la mayoría de las categorías: es la
 *   dimensión más dependiente del clima real de cada usuario (una remera
 *   blanca sirve en verano Y en entretiempo) -- forzar una estación ahí
 *   haría más daño que bien. EXCEPCIÓN, pedido explícito del usuario:
 *   sweater y campera sí se tagean -- a diferencia de una remera, el nivel
 *   de abrigo real de la prenda determina sin ambigüedad si es de
 *   entretiempo o de invierno. Revisado como ingeniero textil, pedido
 *   explícito del usuario: la textura GENÉRICA de la categoría no alcanza,
 *   importa la FIBRA/el peso real de cada prenda puntual -- "acolchado" no
 *   es siempre invierno (una campera de pluma tipo Uniqlo, ajustada al
 *   cuerpo y de relleno fino, es una prenda de entretiempo real -- la
 *   protección de invierno de verdad es la de volumen/relleno mucho mayor,
 *   tipo Nuptse) y "lana" no es siempre entretiempo (un sweater de lana
 *   gruesa es LA prenda de punto de invierno por excelencia; lo que sí es
 *   de entretiempo es un sweater más liviano -- viscosa, poliéster, algodón
 *   fino). Por eso cada entrada de abrigo de acá abajo tiene su propio
 *   comentario justificando la estación por peso/fibra real, no una regla
 *   ciega por textura -- ninguna queda sin tagear.
 *   buzo QUEDA AFUERA de esta excepción a partir de esta revisión --
 *   pedido explícito del usuario, revisado como modista/ingeniero textil:
 *   "los buzos tmb algunos son livianos y otros más pesados... pero
 *   tampoco los llamaría de invierno o de entretiempo". A diferencia de un
 *   sweater de lana (fibra distinta = función térmica distinta) o una
 *   campera (volumen/relleno distinto), el peso real que separa un buzo
 *   más pesado (afelpado grueso, "frisado") de uno liviano (jersey/French
 *   terry, "tejido_grueso") es una diferencia de TEXTURA -- el mismo tipo
 *   de dato que ya distingue pana de corderoy -- no una diferencia de uso
 *   estacional que el usuario reconozca como tal. Un buzo, a diferencia de
 *   un sweater de lana o una campera de pluma, se usa indistintamente casi
 *   todo el año en la práctica real de este usuario. `con_capucha` (ver
 *   types.ts) es la tercera dimensión nueva de esta revisión, ortogonal a
 *   las otras dos: si el buzo es hoodie o crewneck, un dato de corte/
 *   diseño, no de tela ni de estación.
 * - `textura` solo cuando el nombre de la prenda ya la implica sin
 *   ambigüedad (zapatos de cuero -> cuero_liso, jean -> denim, campera de
 *   pluma -> acolchado, prenda con estilo "deportivo" -> poliester, pedido
 *   explícito del usuario). Las zapatillas y las camperas "genéricas"
 *   (negra, verde militar) quedan sin textura a propósito: el material
 *   varía demasiado (cuero, lona, nylon...) para asumir uno sin inventar un
 *   dato que no es real -- el calzado deportivo tampoco lleva "poliester"
 *   por el mismo motivo (suela de goma, entresuela de espuma: la prenda
 *   real no es "de tela").
 */
export const CATALOGO_PRENDAS: PresetPrenda[] = [
  // --- Remeras ---
  // #F5F5F5 (gris/blanco neutro, s=0) en vez de #F5F5F0 -- pedido explícito
  // del usuario: el tono anterior tenía una saturación de 20% (matiz
  // amarillento apenas perceptible), suficiente para que nombreColor()
  // (color.ts) lo clasificara como "Blanco roto" en vez de "Blanco" (el
  // umbral es s<=15). Mismo criterio para camisa-blanca más abajo.
  { id: "remera-blanca", nombre: "Remera blanca", categoria: "remera", colorHex: "#F5F5F5", textura: "algodon", estilo: "casual", ocasion: "casual" },
  { id: "remera-negra", nombre: "Remera negra", categoria: "remera", colorHex: "#1A1A1A", textura: "algodon", estilo: "casual", ocasion: "casual" },
  { id: "remera-gris", nombre: "Remera gris", categoria: "remera", colorHex: "#8C8C8C", textura: "algodon", estilo: "casual", ocasion: "casual" },
  { id: "remera-azul-marino", nombre: "Remera azul marino", categoria: "remera", colorHex: "#1F2A44", textura: "algodon", estilo: "casual", ocasion: "casual" },
  // mismo beige (#D8C7A1) que ya usan pantalon-beige/jogger-beige/campera-
  // pluma-beige/bermuda-beige -- reusa el mismo tono en vez de inventar un
  // beige levemente distinto, mismo criterio que ya documenta el archivo
  // para mantener consistente la paleta entre categorías.
  { id: "remera-beige", nombre: "Remera beige", categoria: "remera", colorHex: "#D8C7A1", textura: "algodon", estilo: "casual", ocasion: "casual" },
  // rojo y rosa -- pedido explícito del usuario: "más variedad de colores
  // según usos y costumbres de la moda". El catálogo no tenía NINGÚN rojo
  // ni rosa en ninguna categoría, un vacío real (el rojo cereza es color de
  // acento confirmado por búsqueda web para la temporada actual; rosa es
  // básico habitual en remeras unisex). Al cargar estos dos hex reales se
  // encontraron y corrigieron dos casos más de nombreColor() mal
  // clasificado (ver color.ts/color.test.ts): un rosa pastel con h>=345
  // caía en "Rojo", y un mostaza (ver sweater-mostaza más abajo) caía en
  // "Naranja".
  { id: "remera-roja", nombre: "Remera roja", categoria: "remera", colorHex: "#B93A32", textura: "algodon", estilo: "casual", ocasion: "casual" },
  { id: "remera-rosa", nombre: "Remera rosa", categoria: "remera", colorHex: "#E4A6B4", textura: "algodon", estilo: "casual", ocasion: "casual" },

  // --- Remeras deportivas (agregadas en la ampliación del catálogo: el
  // estilo "deportivo" no tenía NINGUNA prenda cargada en todo el catálogo
  // hasta acá, un vacío real, no una omisión menor). Pedido explícito del
  // usuario: textura "poliester" por defecto en toda prenda deportiva --
  // antes quedaban sin textura porque el enum no tenía un valor para tela
  // técnica sintética; ahora sí (mismo criterio para pantalón/short/campera
  // rompeviento deportivos más abajo). Zapatillas running quedan afuera a
  // propósito: son calzado, no una prenda de tela -- "poliéster" describiría
  // mal una zapatilla real (suela de goma, entresuela de espuma).
  { id: "remera-deportiva-negra", nombre: "Remera deportiva negra", categoria: "remera", colorHex: "#1A1A1A", textura: "poliester", estilo: "deportivo", ocasion: "casual" },
  { id: "remera-deportiva-gris", nombre: "Remera deportiva gris", categoria: "remera", colorHex: "#8C8C8C", textura: "poliester", estilo: "deportivo", ocasion: "casual" },

  // --- Camisas (oficina) ---
  // #F5F5F5 -- ver el comentario de remera-blanca más arriba. #FAFAF7
  // (s=23) también clasificaba como "Blanco roto" en vez de "Blanco".
  // calce "ajustado" en las camisas de vestir clásicas (blanca/celeste/
  // gris/beige, no camisa-negra ni camisa-cuadros, más urbanas/casual) --
  // auditoría de sastrería (Consejo, ronda de auditoría del motor): una
  // camisa de oficina real se usa metida adentro, silueta entallada, la
  // contraparte de volumen contenido de un pantalón de vestir/saco.
  { id: "camisa-blanca", nombre: "Camisa blanca", categoria: "camisa", colorHex: "#F5F5F5", textura: "algodon", estilo: "clasico", ocasion: "laburo", calce: "ajustado" },
  { id: "camisa-celeste", nombre: "Camisa celeste", categoria: "camisa", colorHex: "#B7D2EC", textura: "algodon", estilo: "clasico", ocasion: "laburo", calce: "ajustado" },
  // "urbano" a propósito, no un descuido: una camisa negra lee más
  // "urban professional" que clásica, a diferencia de blanca/celeste/gris.
  // colorHex #1A1A1A -- mismo negro que las otras 16+ prendas "negro/negra"
  // del catálogo (remera-negra, buzo-negro, campera-negra, etc.). Antes
  // usaba #232323 (l=14), un dato inconsistente sin ninguna razón
  // documentada: nombreColor() lo leía "Gris oscuro" en vez de "Negro" --
  // exactamente el bug que reportó el usuario ("una cosa es un gris
  // oscuro y otra un negro").
  { id: "camisa-negra", nombre: "Camisa negra", categoria: "camisa", colorHex: "#1A1A1A", textura: "algodon", estilo: "urbano", ocasion: "laburo" },
  { id: "camisa-gris", nombre: "Camisa gris", categoria: "camisa", colorHex: "#9A9A94", textura: "algodon", estilo: "clasico", ocasion: "laburo", calce: "ajustado" },
  // patron "cuadros" + colorHex2 -- corrección real de esta ronda: esta
  // entrada ya existía nombrada "a cuadros" pero se dibujaba como una
  // camisa lisa de un solo color, sin ningún cuadro real (el modelo de
  // datos no tenía forma de guardar un segundo color hasta esta revisión).
  // Línea del cuadro en el mismo beige de siempre (#D8C7A1) -- un
  // tattersall real sobre verde oliva suele llevar la línea en un tono
  // cálido/crema, no en otro verde (eso se leería como un solo color
  // fundido, no como un cuadro).
  { id: "camisa-cuadros", nombre: "Camisa a cuadros", categoria: "camisa", colorHex: "#4A5A3C", colorHex2: "#D8C7A1", patron: "cuadros", textura: "algodon", estilo: "urbano", ocasion: "casual" },
  // mismo beige que el resto del catálogo (ver remera-beige) -- clasico/
  // laburo, mismo registro que blanca/celeste/gris: una camisa beige es
  // tan de oficina como esas, no informal como la de cuadros.
  { id: "camisa-beige", nombre: "Camisa beige", categoria: "camisa", colorHex: "#D8C7A1", textura: "algodon", estilo: "clasico", ocasion: "laburo", calce: "ajustado" },

  // --- Camisas a rayas -- pedido explícito del usuario: "camisas
  // ralladas, blanca y celestes y de otros colores tmb, inspírate en usos
  // y costumbres, moda". Curadas por real convención de vestimenta, del
  // registro más clásico al más urbano -- no una paleta arcoíris, mismo
  // criterio que el resto del archivo. Todas patron:"rayas", con
  // colorHex2 (la raya) real -- sin esto no habría estampado que dibujar,
  // solo el nombre.
  //
  // celeste sobre blanco -- LA camisa a rayas de oficina por excelencia
  // en Argentina y en el mundo (raya fina celeste sobre fondo blanco,
  // "Bengal stripe" clásico). Mismos hex que camisa-blanca/camisa-celeste
  // ya usan, por consistencia de paleta cross-prenda.
  { id: "camisa-rayas-celeste", nombre: "Camisa a rayas celeste", categoria: "camisa", colorHex: "#F5F5F5", colorHex2: "#B7D2EC", patron: "rayas", textura: "algodon", estilo: "clasico", ocasion: "laburo" },
  // azul marino sobre blanco -- el "pinstripe" clásico de oficina/
  // vestir, un escalón más formal que la celeste de arriba (se banca sin
  // problema una corbata y un traje). Mismo azul marino que ya usan
  // pantalon-vestir-azul/saco-azul-marino/corbata-azul-marino.
  { id: "camisa-rayas-azul-marino", nombre: "Camisa a rayas azul marino", categoria: "camisa", colorHex: "#F5F5F5", colorHex2: "#1F2A44", patron: "rayas", textura: "algodon", estilo: "clasico", ocasion: "laburo" },
  // rosa sobre blanco -- el color "no neutro" más estándar de oficina
  // desde hace años (estilo francés/business casual), tan de laburo como
  // la celeste, no un capricho de color. Mismo rosa que remera-rosa.
  { id: "camisa-rayas-rosa", nombre: "Camisa a rayas rosa", categoria: "camisa", colorHex: "#F5F5F5", colorHex2: "#E4A6B4", patron: "rayas", textura: "algodon", estilo: "clasico", ocasion: "laburo" },
  // Bengal invertida -- fondo celeste con raya blanca, no blanco con raya
  // celeste (la de arriba): mismo par de colores, pero la base más
  // saturada la hace un poco menos "de escritorio estricto" y más
  // versátil para un finde -- estilo secundario "casual" a propósito,
  // mismo criterio multi-estilo que ya usa sweater-mostaza (ejemplo real
  // del usuario: la misma prenda funciona en dos registros).
  { id: "camisa-rayas-celeste-base", nombre: "Camisa celeste a rayas blancas", categoria: "camisa", colorHex: "#B7D2EC", colorHex2: "#F5F5F5", patron: "rayas", textura: "algodon", estilo: "clasico", estilosSecundarios: ["casual"], ocasion: "laburo" },
  // negro sobre blanco, estilo urbano -- una rayada bien de calle
  // (contraste alto, sin color de oficina de por medio), no una variante
  // más de la misma camisa de laburo. Mismo criterio que camisa-negra
  // (también urbano): la lectura de "urban professional" viene del
  // contraste del color, no de la fibra.
  { id: "camisa-rayas-negra", nombre: "Camisa a rayas negras", categoria: "camisa", colorHex: "#F5F5F5", colorHex2: "#1A1A1A", patron: "rayas", textura: "algodon", estilo: "urbano", ocasion: "casual" },

  // --- Pantalones ---
  // estilo secundario "urbano" en TODO jean, sea cual sea el color -- pedido
  // explícito del usuario, reportando que su jean AZUL real (el corte/tela
  // más estándar que existe) no aparecía en la sección Urbano de "Vestite
  // hoy". Corrección real de esta ronda: la ronda anterior que agregó
  // "urbano" solo lo cargó en jean-negro/jogger-negro, razonando "un jean
  // NEGRO es tan de calle como de casual" -- pero lo que hace a un jean
  // urbano/streetwear no es el color, es la PRENDA (denim de corte casual,
  // el pantalón más estándar del streetwear real, con zapatillas y campera
  // urbana) -- un jean azul con esa misma combinación es igual de urbano
  // que uno negro, si no más (es el jean más común de lejos). Mismo
  // criterio aplicado ahora de forma consistente a los joggers y a la
  // bermuda de jean de más abajo.
  { id: "jean-azul", nombre: "Jean azul", categoria: "pantalon", colorHex: "#3B5998", textura: "denim", estilo: "casual", estilosSecundarios: ["urbano"], ocasion: "casual" },
  // colorHex #1A1A1A -- ver el comentario de camisa-negra más arriba:
  // mismo negro estándar del catálogo, corrigiendo el mismo #232323
  // inconsistente que hacía que nombreColor() leyera "Gris oscuro".
  { id: "jean-negro", nombre: "Jean negro", categoria: "pantalon", colorHex: "#1A1A1A", textura: "denim", estilo: "casual", estilosSecundarios: ["urbano"], ocasion: "casual" },
  // calce "ajustado" en los 4 -- auditoría de sastrería (Consejo, ronda de
  // auditoría del motor): un pantalón de vestir real es de corte recto/
  // entallado, no ancho, la contraparte de volumen contenido que hace que
  // un saco/blazer (también "ajustado" más abajo) funcione en proporción.
  { id: "pantalon-vestir-negro", nombre: "Pantalón de vestir negro", categoria: "pantalon", colorHex: "#1A1A1A", textura: "lana", estilo: "formal", ocasion: "laburo", calce: "ajustado" },
  { id: "pantalon-vestir-gris", nombre: "Pantalón de vestir gris", categoria: "pantalon", colorHex: "#6E6E6E", textura: "lana", estilo: "formal", ocasion: "laburo", calce: "ajustado" },
  { id: "pantalon-vestir-azul", nombre: "Pantalón de vestir azul marino", categoria: "pantalon", colorHex: "#1F2A44", textura: "lana", estilo: "formal", ocasion: "laburo", calce: "ajustado" },
  // distinto de pantalon-beige de acá abajo (el chino, algodón/clasico) --
  // mismo beige del resto del catálogo, pero de vestir: lana/formal, igual
  // criterio que negro/gris/azul marino de arriba. No es una entrada
  // duplicada -- un chino y un pantalón de vestir son prendas distintas
  // aunque compartan color.
  { id: "pantalon-vestir-beige", nombre: "Pantalón de vestir beige", categoria: "pantalon", colorHex: "#D8C7A1", textura: "lana", estilo: "formal", ocasion: "laburo", calce: "ajustado" },
  { id: "pantalon-beige", nombre: "Pantalón chino beige", categoria: "pantalon", colorHex: "#D8C7A1", textura: "algodon", estilo: "clasico", ocasion: "laburo" },
  // joggers -- casual como el jean (no "clasico" como el chino: no van a
  // la oficina), textura "algodon" sin ambigüedad porque el usuario la dio
  // así directamente. Colores reusados del resto del catálogo (negro
  // estándar, el mismo beige del chino, el gris de siempre) por la misma
  // razón de consistencia de paleta que ya documenta el resto del archivo.
  // estilo secundario "urbano" en los 3 -- mismo criterio que el jean de
  // arriba: es el jogger como PRENDA lo que lee urbano/streetwear, no un
  // color puntual (corrección de esta ronda: antes solo lo tenía el negro).
  // calce "holgado" en los 3 -- auditoría de sastrería (Consejo, ronda de
  // auditoría del motor): el corte ancho es el rasgo que define al jogger
  // como prenda (ver el comentario de arriba), no un dato aparte.
  { id: "jogger-negro", nombre: "Jogger negro", categoria: "pantalon", colorHex: "#1A1A1A", textura: "algodon", estilo: "casual", estilosSecundarios: ["urbano"], ocasion: "casual", calce: "holgado" },
  { id: "jogger-beige", nombre: "Jogger beige", categoria: "pantalon", colorHex: "#D8C7A1", textura: "algodon", estilo: "casual", estilosSecundarios: ["urbano"], ocasion: "casual", calce: "holgado" },
  { id: "jogger-gris", nombre: "Jogger gris", categoria: "pantalon", colorHex: "#8C8C8C", textura: "algodon", estilo: "casual", estilosSecundarios: ["urbano"], ocasion: "casual", calce: "holgado" },
  // pantalón deportivo (entrenamiento) -- distinto del jogger de arriba:
  // mismo corte ancho, pero tela técnica sintética (poliéster), no algodón
  // (mismo criterio que la remera deportiva de arriba). calce "holgado"
  // mismo motivo que el jogger.
  { id: "pantalon-deportivo-negro", nombre: "Pantalón deportivo negro", categoria: "pantalon", colorHex: "#1A1A1A", textura: "poliester", estilo: "deportivo", ocasion: "casual", calce: "holgado" },
  // verde oscuro real (no el verde militar/oliva de campera-verde-militar
  // más abajo, que es otro tono): un verde bosque/botella, el típico de un
  // pantalón de entrenamiento, no un verde caqui desaturado.
  { id: "pantalon-deportivo-verde-oscuro", nombre: "Pantalón deportivo verde oscuro", categoria: "pantalon", colorHex: "#2F5233", textura: "poliester", estilo: "deportivo", ocasion: "casual", calce: "holgado" },

  // --- Bermudas (chino/algodón, hasta la rodilla) --- agregadas a pedido
  // explícito del usuario: el catálogo no tenía ninguna prenda de piernas
  // más corta que un pantalón largo. Mismo criterio de textura/estilo que
  // el pantalón chino de arriba -- de hecho es la misma prenda en versión
  // corta, así que reusa su mismo estilo ("clasico") y textura
  // ("algodon"). El beige/caqui es a propósito el color más asociado a
  // "bermuda" en el uso real, no una elección arbitraria.
  { id: "bermuda-beige", nombre: "Bermuda beige", categoria: "bermuda", colorHex: "#D8C7A1", textura: "algodon", estilo: "clasico", ocasion: "casual" },
  { id: "bermuda-azul-marino", nombre: "Bermuda azul marino", categoria: "bermuda", colorHex: "#1F2A44", textura: "algodon", estilo: "clasico", ocasion: "casual" },
  // variante denim -- tan real como el jean largo de arriba, mismo criterio
  // de textura/estilo ("casual", no "clasico": un jean corto lee más
  // informal que un chino corto, igual que el jean largo vs. el pantalón
  // de vestir) y mismo secundario "urbano" que el resto de la familia
  // denim/jogger de esta ronda -- una bermuda de jean con zapatillas
  // urbanas es tan de calle como el jean largo.
  { id: "bermuda-jean", nombre: "Bermuda de jean", categoria: "bermuda", colorHex: "#3B5998", textura: "denim", estilo: "casual", estilosSecundarios: ["urbano"], ocasion: "casual" },
  { id: "bermuda-gris", nombre: "Bermuda gris", categoria: "bermuda", colorHex: "#8C8C8C", textura: "algodon", estilo: "clasico", ocasion: "casual" },

  // --- Shorts deportivos (tela técnica, hasta medio muslo) --- distintos
  // de la bermuda de arriba, no una variante del mismo dibujo: son mucho
  // más cortos (Maniqui.tsx los dibuja hasta la mitad del muslo, la
  // bermuda hasta la rodilla) y de tela sintética (poliéster), no chino/
  // denim -- mismo criterio que la remera y el pantalón deportivos de arriba.
  // calce "holgado" en los 3, mismo motivo que jogger/pantalón deportivo.
  { id: "short-deportivo-negro", nombre: "Short deportivo negro", categoria: "short_deportivo", colorHex: "#1A1A1A", textura: "poliester", estilo: "deportivo", ocasion: "casual", calce: "holgado" },
  { id: "short-deportivo-gris", nombre: "Short deportivo gris", categoria: "short_deportivo", colorHex: "#8C8C8C", textura: "poliester", estilo: "deportivo", ocasion: "casual", calce: "holgado" },
  { id: "short-deportivo-azul", nombre: "Short deportivo azul", categoria: "short_deportivo", colorHex: "#3366CC", textura: "poliester", estilo: "deportivo", ocasion: "casual", calce: "holgado" },

  // --- Buzos ---
  // Sin estacion en ninguna entrada de acá abajo -- corrección de esta
  // ronda, pedido explícito del usuario ("los buzos tmb algunos son
  // livianos y otros más pesados... pero tampoco los llamaría de invierno o
  // de entretiempo"): a diferencia de sweater/campera, ver el criterio
  // completo al principio del archivo. `con_capucha` default true (hoodie)
  // en los 6 de acá abajo -- son la variante hoodie del catálogo, la única
  // que existía hasta esta revisión.
  { id: "buzo-gris", nombre: "Buzo gris", categoria: "buzo", colorHex: "#8C8C8C", textura: "tejido_grueso", estilo: "casual", ocasion: "casual" },
  { id: "buzo-negro", nombre: "Buzo negro", categoria: "buzo", colorHex: "#1A1A1A", textura: "tejido_grueso", estilo: "casual", ocasion: "casual" },
  { id: "buzo-azul-marino", nombre: "Buzo azul marino", categoria: "buzo", colorHex: "#1F2A44", textura: "tejido_grueso", estilo: "casual", ocasion: "casual" },
  // mismo celeste que camisa-celeste (#B7D2EC) -- ver el criterio de
  // paleta consistente que ya documenta el archivo.
  { id: "buzo-celeste", nombre: "Buzo celeste", categoria: "buzo", colorHex: "#B7D2EC", textura: "tejido_grueso", estilo: "casual", ocasion: "casual" },
  // mismo beige (#D8C7A1) que ya usan pantalon-beige/bermuda-beige/etc. --
  // ver el comentario de remera-beige más arriba. estilo/ocasion/textura
  // igual que el resto de los buzos (casual/casual/tejido_grueso): el
  // color no cambia el registro de la prenda.
  { id: "buzo-beige", nombre: "Buzo beige", categoria: "buzo", colorHex: "#D8C7A1", textura: "tejido_grueso", estilo: "casual", ocasion: "casual" },
  // verde botella -- color de tendencia confirmado por búsqueda web para
  // la temporada actual ("lo llevamos en camel, verde botella o negro").
  // Matiz bien distinto del verde militar/oliva (h=140, un verde bosque/
  // botella real) y del verde deportivo del pantalón (h=127 pero mucho más
  // desaturado) -- no una variante redundante.
  { id: "buzo-verde", nombre: "Buzo verde botella", categoria: "buzo", colorHex: "#1E5631", textura: "tejido_grueso", estilo: "casual", ocasion: "casual" },
  // frisado -- pedido explícito del usuario ("hay buzos... que son
  // livianos y otros más pesados"): un buzo frisado (interior de felpa/
  // fleece cepillada, más grueso y aislante que el jersey/French terry
  // "tejido_grueso" de los 6 de arriba) es un textil real y puntualmente
  // distinto -- por eso, a partir de esta revisión, tiene su propio valor
  // de Textura ("frisado", ver types.ts) en vez de compartir
  // "tejido_grueso" con una estacion distinta como diferenciador (así se
  // tageaba antes: era el gramaje/aislación real de la TELA, no del uso
  // estacional -- corregido en esta misma ronda). Siguen siendo hoodie
  // (con_capucha default true): el peso de la tela y el corte del cuello
  // son datos independientes.
  { id: "buzo-frisado-negro", nombre: "Buzo frisado negro", categoria: "buzo", colorHex: "#1A1A1A", textura: "frisado", estilo: "casual", ocasion: "casual" },
  { id: "buzo-frisado-gris", nombre: "Buzo frisado gris", categoria: "buzo", colorHex: "#8C8C8C", textura: "frisado", estilo: "casual", ocasion: "casual" },
  // crewneck (sin capucha) -- pedido explícito del usuario, con dos
  // ejemplos reales de su propio placard: un buzo gris frisado/pesado y un
  // buzo verde tejido_grueso/liviano, los dos sin capucha. Estas dos
  // entradas cubren los dos perfiles textiles reales (pesado y liviano) en
  // versión crewneck -- no se duplican los 6 colores hoodie de arriba, dos
  // alcanza para que el motor de "comprar" tenga de dónde sugerir un
  // crewneck de cada peso.
  { id: "buzo-crewneck-gris", nombre: "Buzo crewneck gris (sin capucha)", categoria: "buzo", colorHex: "#8C8C8C", textura: "frisado", estilo: "casual", ocasion: "casual", conCapucha: false },
  { id: "buzo-crewneck-azul-marino", nombre: "Buzo crewneck azul marino (sin capucha)", categoria: "buzo", colorHex: "#1F2A44", textura: "tejido_grueso", estilo: "casual", ocasion: "casual", conCapucha: false },
  // buzo oversize -- auditoría de sastrería (Consejo, ronda de revisión
  // visual del maniquí), pedido explícito del usuario ("revisa en el
  // maniquí cómo quedan las prendas ajustada, regular u holgada... si no
  // hay prendas en el catálogo agrégalas"). Hueco real encontrado: el
  // catálogo tenía calce "holgado" en camperas de pluma, pero ningún buzo
  // ni sweater ni remera -- el hoodie oversize es EL básico "holgado" más
  // usado en indumentaria de calle real, y sin esta entrada no había cómo
  // ver el efecto del calce en un torso de punto (solo en camperas
  // acolchadas). "urbano" (no "casual") por el mismo motivo que ya
  // documenta campera-pluma-negra-oversize: el volumen exagerado es un
  // statement de calle, no un básico neutro.
  { id: "buzo-negro-oversize", nombre: "Buzo negro (oversize)", categoria: "buzo", colorHex: "#1A1A1A", textura: "tejido_grueso", estilo: "urbano", ocasion: "casual", calce: "holgado" },

  // --- Sweaters (oficina/vestir) ---
  // estacion "invierno" en los 6 de lana -- corrección de una ronda
  // anterior, pedido explícito del usuario como ingeniero textil: un
  // sweater de lana gruesa/pullover es LA prenda de punto de invierno por
  // excelencia (fibra con aislación térmica real), no una capa liviana de
  // entretiempo. La versión de entretiempo es la de fibra más liviana
  // (viscosa/poliéster/algodón fino) -- ver "Sweater liviano" más abajo,
  // agregado justo para cubrir ese registro sin forzarlo en la lana.
  { id: "sweater-gris", nombre: "Sweater gris", categoria: "sweater", colorHex: "#8C8C8C", textura: "lana", estilo: "clasico", ocasion: "laburo", estacion: "invierno" },
  { id: "sweater-azul-marino", nombre: "Sweater azul marino", categoria: "sweater", colorHex: "#1F2A44", textura: "lana", estilo: "clasico", ocasion: "laburo", estacion: "invierno" },
  { id: "sweater-bordo", nombre: "Sweater bordo", categoria: "sweater", colorHex: "#6B2737", textura: "lana", estilo: "clasico", ocasion: "laburo", estacion: "invierno" },
  // colorHex #1A1A1A -- ver el comentario de camisa-negra más arriba: el
  // reporte real del usuario que motivó esta corrección era justo este
  // sweater ("tengo un suéter negro que dice gris oscuro").
  { id: "sweater-negro", nombre: "Sweater negro", categoria: "sweater", colorHex: "#1A1A1A", textura: "lana", estilo: "clasico", ocasion: "laburo", estacion: "invierno" },
  // mismo beige que el resto del catálogo -- clasico/laburo, mismo
  // registro que el resto de los sweaters (gris/marino/bordo/negro): un
  // sweater beige es tan de oficina como esos.
  { id: "sweater-beige", nombre: "Sweater beige", categoria: "sweater", colorHex: "#D8C7A1", textura: "lana", estilo: "clasico", ocasion: "laburo", estacion: "invierno" },
  // mostaza -- color evergreen de sweater de oficina, tan estándar como
  // bordó/azul marino/gris de acá arriba. Este hex real (h=40, s=62, l=47)
  // fue justamente el que encontró el bug de nombreColor() clasificándolo
  // como "Naranja" -- ver color.ts.
  // Estilo secundario "casual" a propósito -- el mismo sweater mostaza que
  // se usa con pantalón de vestir para la oficina funciona igual de bien
  // sobre un jean para un finde (ejemplo real que dio el usuario al pedir
  // soporte multi-estilo). "clasico" sigue siendo el principal: define el
  // registro del outfit cuando esta prenda es el ancla.
  {
    id: "sweater-mostaza",
    nombre: "Sweater mostaza",
    categoria: "sweater",
    colorHex: "#C3922E",
    textura: "lana",
    estilo: "clasico",
    estilosSecundarios: ["casual"],
    ocasion: "laburo",
    estacion: "invierno",
  },
  // sweater liviano -- pedido explícito del usuario, agregado para cubrir
  // el hueco real que dejó la corrección de arriba: un sweater de fibra
  // liviana (viscosa/poliéster, no lana) es la prenda de punto real de
  // entretiempo -- mismo corte y uso que un sweater de lana, pero sin el
  // peso/aislación térmica que lo haría de invierno. Textura "viscosa"
  // (nueva en el enum, ver types.ts/Maniqui.tsx/recommend.ts): antes el
  // catálogo no tenía forma de describir esta fibra sin usar "lana" (dato
  // falso) o dejar la textura vacía (perdiendo la distinción real que
  // motivó este pedido). Gris y negro -- los dos colores más versátiles,
  // no una duplicación completa de los 6 sweaters de lana de arriba.
  { id: "sweater-liviano-gris", nombre: "Sweater liviano gris", categoria: "sweater", colorHex: "#8C8C8C", textura: "viscosa", estilo: "clasico", estilosSecundarios: ["casual"], ocasion: "laburo", estacion: "entretiempo" },
  { id: "sweater-liviano-negro", nombre: "Sweater liviano negro", categoria: "sweater", colorHex: "#1A1A1A", textura: "viscosa", estilo: "clasico", estilosSecundarios: ["casual"], ocasion: "laburo", estacion: "entretiempo" },

  // --- Calzado ---
  // Revisado como modista/ingeniero textil, pedido explícito del usuario:
  // "dale más detalles a las zapatillas... revisa todos los estilos...
  // las costuras, cortes y decoración más usadas según usos y costumbres".
  // Antes el catálogo cubría 3 de los 5 registros (urbano/formal/
  // deportivo) con una sola silueta genérica de zapatilla -- ver
  // CorteCalzado en types.ts para el porqué de cada arquetipo real. Las
  // zapatillas negras y marrones aparecen dos veces a propósito -- una
  // versión monocromática de verdad (suela a tono, tan real como la de
  // suela blanca) y otra con la suela de goma en blanco/crema, que es el
  // otro look real y común. Ninguna de las dos es "la correcta": conviven
  // como dos prendas distintas (`suelaContraste`, ver types.ts) para que el
  // catálogo no le imponga una sola variante a todas las zapatillas del
  // mismo color -- eso fue justamente el error de una revisión anterior.
  {
    id: "zapatillas-blancas",
    nombre: "Zapatillas blancas (3 rayas)",
    categoria: "calzado",
    colorHex: "#F5F5F0",
    estilo: "urbano",
    ocasion: "casual",
    corteCalzado: "zapatilla_urbana",
  },
  {
    id: "zapatillas-negras",
    nombre: "Zapatillas negras (3 rayas)",
    categoria: "calzado",
    colorHex: "#1A1A1A",
    estilo: "urbano",
    ocasion: "casual",
    corteCalzado: "zapatilla_urbana",
  },
  {
    id: "zapatillas-negras-suela-blanca",
    nombre: "Zapatillas negras, suela blanca (3 rayas)",
    categoria: "calzado",
    colorHex: "#1A1A1A",
    estilo: "urbano",
    ocasion: "casual",
    suelaContraste: true,
    corteCalzado: "zapatilla_urbana",
  },
  {
    id: "zapatillas-grises",
    nombre: "Zapatillas grises (3 rayas)",
    categoria: "calzado",
    colorHex: "#8C8C8C",
    estilo: "urbano",
    ocasion: "casual",
    corteCalzado: "zapatilla_urbana",
  },
  // sin textura a propósito, mismo criterio que las demás -- una etiqueta
  // real de composición de zapatilla ("capellada 85% sintético / 15%
  // cuero, forro 100% textil sintético") no es "cuero" para nada del
  // motor: la mayoría es sintético, y ninguna Textura del enum describe
  // "sintético" sin inventar un dato que la prenda real no tiene.
  {
    id: "zapatillas-azul-marino",
    nombre: "Zapatillas azul marino (3 rayas)",
    categoria: "calzado",
    colorHex: "#1F2A44",
    estilo: "urbano",
    ocasion: "casual",
    corteCalzado: "zapatilla_urbana",
  },
  // marrón de gamuza/lona (mate), distinto del marrón de cuero lustroso de
  // los zapatos de vestir un par de líneas más abajo -- son materiales que
  // se ven distintos en la vida real, no el mismo color reusado sin razón.
  {
    id: "zapatillas-marrones",
    nombre: "Zapatillas marrones (3 rayas)",
    categoria: "calzado",
    colorHex: "#6F4E37",
    estilo: "urbano",
    ocasion: "casual",
    corteCalzado: "zapatilla_urbana",
  },
  {
    id: "zapatillas-marrones-suela-blanca",
    nombre: "Zapatillas marrones, suela blanca (3 rayas)",
    categoria: "calzado",
    colorHex: "#6F4E37",
    estilo: "urbano",
    ocasion: "casual",
    suelaContraste: true,
    corteCalzado: "zapatilla_urbana",
  },
  {
    id: "zapatos-cuero-negro",
    nombre: "Zapatos de vestir negros",
    categoria: "calzado",
    colorHex: "#1C1210",
    textura: "cuero_liso",
    estilo: "formal",
    ocasion: "laburo",
    corteCalzado: "zapato_vestir",
  },
  {
    id: "zapatos-cuero-marron",
    nombre: "Zapatos de vestir marrones",
    categoria: "calzado",
    colorHex: "#5C3A21",
    textura: "cuero_liso",
    estilo: "formal",
    ocasion: "laburo",
    corteCalzado: "zapato_vestir",
  },
  // zapatillas de running -- silueta técnica (suela alta + panel de malla),
  // deliberadamente SIN las 3 rayas de las urbanas de arriba: esas son un
  // diseño de calle/lifestyle, no de zapatilla técnica de entrenamiento
  // (distinción real entre "deportiva de calle" y "deportiva técnica" --
  // ver el comentario largo de CorteCalzado en types.ts).
  {
    id: "zapatillas-running-blancas",
    nombre: "Zapatillas running blancas",
    categoria: "calzado",
    colorHex: "#F5F5F0",
    estilo: "deportivo",
    ocasion: "casual",
    corteCalzado: "zapatilla_running",
  },
  {
    id: "zapatillas-running-negras",
    nombre: "Zapatillas running negras",
    categoria: "calzado",
    colorHex: "#1A1A1A",
    estilo: "deportivo",
    ocasion: "casual",
    corteCalzado: "zapatilla_running",
  },
  {
    id: "zapatillas-running-grises",
    nombre: "Zapatillas running grises",
    categoria: "calzado",
    colorHex: "#8C8C8C",
    estilo: "deportivo",
    ocasion: "casual",
    corteCalzado: "zapatilla_running",
  },
  // mocasines -- registro clásico, hueco real del catálogo (antes clasico
  // no tenía NINGÚN calzado propio). Sin cordones, con la tira/correa
  // cruzando el empeine (penny loafer) -- el detalle real más definitorio
  // de un mocasín, ver CorteCalzado en types.ts. Mismos 2 colores de cuero
  // ya establecidos para zapatos de vestir (negro/marrón): son la paleta
  // real de cuero de vestir, no una nueva inventada. ocasion "casual", no
  // "laburo" -- un mocasín es smart-casual real (funciona de fin de semana
  // también), a diferencia del zapato de vestir con cordones de arriba.
  {
    id: "mocasines-negros",
    nombre: "Mocasines negros",
    categoria: "calzado",
    colorHex: "#1C1210",
    textura: "cuero_liso",
    estilo: "clasico",
    estilosSecundarios: ["casual"],
    ocasion: "casual",
    corteCalzado: "mocasin",
  },
  {
    id: "mocasines-marrones",
    nombre: "Mocasines marrones",
    categoria: "calzado",
    colorHex: "#5C3A21",
    textura: "cuero_liso",
    estilo: "clasico",
    estilosSecundarios: ["casual"],
    ocasion: "casual",
    corteCalzado: "mocasin",
  },
  // zapatillas de lona -- registro casual, el otro hueco real del catálogo.
  // Los 3 colores clásicos de una zapatilla de lona real (blanco/negro/
  // azul marino), sin textura "cuero_liso" (es lona/textil, no cuero) --
  // mismo criterio que las urbanas de arriba. Puntera de goma + costura
  // lateral son el detalle real, ver CorteCalzado en types.ts.
  {
    id: "zapatillas-lona-blancas",
    nombre: "Zapatillas de lona blancas",
    categoria: "calzado",
    colorHex: "#F5F5F0",
    estilo: "casual",
    ocasion: "casual",
    corteCalzado: "zapatilla_lona",
  },
  {
    id: "zapatillas-lona-negras",
    nombre: "Zapatillas de lona negras",
    categoria: "calzado",
    colorHex: "#1A1A1A",
    estilo: "casual",
    ocasion: "casual",
    corteCalzado: "zapatilla_lona",
  },
  {
    id: "zapatillas-lona-azul-marino",
    nombre: "Zapatillas de lona azul marino",
    categoria: "calzado",
    colorHex: "#1F2A44",
    estilo: "casual",
    estilosSecundarios: ["urbano", "clasico"],
    ocasion: "casual",
    corteCalzado: "zapatilla_lona",
  },

  // --- Camperas ---
  // "entretiempo" en negra/jean/verde militar/piloto -- ninguna lleva
  // relleno (bomber/utility/denim/nylon liviano sin forro): cortan viento
  // pero no abrigan como una pluma o un paño de invierno real.
  { id: "campera-negra", nombre: "Campera negra", categoria: "campera", colorHex: "#1A1A1A", estilo: "urbano", ocasion: "casual", estacion: "entretiempo" },
  { id: "campera-jean", nombre: "Campera de jean", categoria: "campera", colorHex: "#5B7FA6", textura: "denim", estilo: "casual", ocasion: "casual", estacion: "entretiempo" },
  { id: "campera-verde-militar", nombre: "Campera verde militar", categoria: "campera", colorHex: "#5A5F3D", estilo: "urbano", ocasion: "casual", estacion: "entretiempo" },
  // piloto -- no es un rompeviento deportivo (más abajo) ni una campera de
  // vestir: es la campera de lluvia liviana/impermeable de uso diario
  // (nylon/microfibra), verificado por búsqueda web. Pedido explícito del
  // usuario, revisado como sastre/ingeniero textil: "la campera piloto en
  // realidad es una campera impermeable" -- hasta esta revisión se dejaba
  // sin textura (ninguna del enum describía "nylon impermeable" sin
  // inventar un dato falso), lo que la volvía indistinguible de
  // campera-negra en los hechos (mismo estilo/ocasión, ningún otro campo
  // las separaba). Se agrega "impermeable" como textura real (migración
  // 0024), mismo criterio que denim/acolchado/poliéster/viscosa/frisado:
  // dibuja un patrón/brillo real en el ícono y el maniquí (ver
  // TEXTURA_BRILLO en PrendaIcon.tsx -- una tela técnica tratada brilla
  // más que el algodón/lana, mismo criterio que ya vale para poliéster/
  // seda/cuero_liso), y además distingue esta prenda de una campera de
  // tela lisa. "urbano", no "deportivo": se usa a diario en la calle, no
  // para entrenar (mismo criterio que campera-negra, no camisa-negra) --
  // por eso tampoco entra en el "poliéster por defecto" que sí aplica a
  // las prendas con estilo "deportivo".
  { id: "campera-piloto-negra", nombre: "Campera piloto negra", categoria: "campera", colorHex: "#1A1A1A", textura: "impermeable", estilo: "urbano", ocasion: "casual", estacion: "entretiempo" },
  // sweater con cierre -- de punto/lana, no un buzo ni un sweater sin
  // cierre (esos ya están en sus propias categorías): es una prenda de
  // punto que se usa COMO campera, así que va en categoria="campera" con
  // textura "lana" (verificado por búsqueda web: "campera de lana con
  // cierre"), mismo estilo/ocasion que el resto de los sweaters de vestir
  // (clasico/laburo) -- es la misma idea de prenda, solo con cierre en vez
  // de cuello redondo/pullover. Lana fina de punto, no paño grueso -> mismo
  // criterio "entretiempo" que los sweaters de arriba, no invierno.
  { id: "campera-sweater-azul-marino", nombre: "Campera sweater azul marino", categoria: "campera", colorHex: "#1F2A44", textura: "lana", estilo: "clasico", ocasion: "laburo", estacion: "entretiempo" },
  // pluma/puffer (tipo Uniqlo, ajustada al cuerpo, relleno fino) -- colores
  // reusados de otras categorías, ver criterio de "Accesorios" más abajo.
  // Revisado como ingeniero textil, pedido explícito del usuario: "acolchado"
  // no siempre es invierno -- este modelo puntual (Uniqlo Ultra Light Down
  // y equivalentes) es justamente una campera de relleno liviano, pensada y
  // vendida para entretiempo/viaje, no la protección real de un invierno
  // crudo. La de invierno de verdad es la oversize de acá abajo, con mucho
  // más volumen/relleno.
  // calce "ajustado" en las 3 -- son la "Uniqlo-type" que ya menciona el
  // comentario de más abajo, en contraste directo con la oversize: relleno
  // fino, silueta pegada al cuerpo, no voluminosa (auditoría de sastrería,
  // Consejo, ronda de auditoría del motor).
  { id: "campera-pluma-negra", nombre: "Campera de pluma negra", categoria: "campera", colorHex: "#1A1A1A", textura: "acolchado", estilo: "casual", ocasion: "casual", estacion: "entretiempo", calce: "ajustado" },
  { id: "campera-pluma-azul-marino", nombre: "Campera de pluma azul marino", categoria: "campera", colorHex: "#1F2A44", textura: "acolchado", estilo: "casual", ocasion: "casual", estacion: "entretiempo", calce: "ajustado" },
  { id: "campera-pluma-beige", nombre: "Campera de pluma beige", categoria: "campera", colorHex: "#D8C7A1", textura: "acolchado", estilo: "casual", ocasion: "casual", estacion: "entretiempo", calce: "ajustado" },
  // pluma oversize (tipo campera retro estilo Nuptse: mucho más grande y
  // abrigada que la de arriba, silueta voluminosa en vez de ajustada al
  // cuerpo) -- pedido explícito del usuario, distinguiéndola de la
  // Uniqlo-type de arriba. Acá SÍ es "invierno" de verdad: más volumen real
  // significa más relleno/aislación, a diferencia de las tres de arriba
  // (mismo material acolchado, pero relleno fino) -- se distingue por
  // nombre, mismo patrón que ya usa "(suela blanca)" en las zapatillas.
  // "urbano" en vez de "casual": el volumen exagerado es un statement de
  // calle, no una campera básica.
  { id: "campera-pluma-negra-oversize", nombre: "Campera de pluma negra (oversize)", categoria: "campera", colorHex: "#1A1A1A", textura: "acolchado", estilo: "urbano", ocasion: "casual", estacion: "invierno", calce: "holgado" },
  // rompeviento -- deportivo, distinto de la campera de jean/pluma de
  // arriba (esas son casual/urbano, no para entrenar). Poliéster por
  // defecto, mismo criterio que el resto de las prendas "deportivo".
  // "entretiempo": corta viento/llovizna pero no tiene relleno térmico --
  // no protege del frío real de invierno.
  { id: "campera-rompeviento-negra", nombre: "Campera rompeviento negra", categoria: "campera", colorHex: "#1A1A1A", textura: "poliester", estilo: "deportivo", ocasion: "casual", estacion: "entretiempo" },
  { id: "campera-rompeviento-azul", nombre: "Campera rompeviento azul", categoria: "campera", colorHex: "#3366CC", textura: "poliester", estilo: "deportivo", ocasion: "casual", estacion: "entretiempo" },
  // pedido explícito del usuario: campera deportiva de entretiempo, roja y
  // azul marino -- mismo modelo rompeviento de arriba (deportivo,
  // poliéster, entretiempo), solo suma color. "roja" reusa el hex de
  // remera-roja/bufanda-roja (#B93A32), no un rojo nuevo. "azul marino"
  // reusa #1F2A44 -- el mismo criterio documentado en Accesorios más abajo
  // (consistencia cross-categoría: esta campera combina con el resto de
  // las prendas azul marino ya cargadas, no con un azul ligeramente
  // distinto) -- y es DISTINTO a propósito del "azul" de la línea de
  // arriba (#3366CC, un azul eléctrico/cobalto ya reservado para
  // deportivo, ver short-deportivo-azul): "azul marino" es la navy oscura
  // y desaturada de siempre, no una tercera variante de celeste.
  { id: "campera-rompeviento-roja", nombre: "Campera rompeviento roja", categoria: "campera", colorHex: "#B93A32", textura: "poliester", estilo: "deportivo", ocasion: "casual", estacion: "entretiempo" },
  { id: "campera-rompeviento-azul-marino", nombre: "Campera rompeviento azul marino", categoria: "campera", colorHex: "#1F2A44", textura: "poliester", estilo: "deportivo", ocasion: "casual", estacion: "entretiempo" },
  // tapado/sobretodo de paño -- pedido explícito del usuario ("agregá
  // prendas si es necesario" al diferenciar abrigos de invierno):
  // revisando el catálogo, TODAS las prendas de invierno real (acolchado)
  // eran casual/urbano -- un look clásico/formal de invierno no tenía
  // ninguna campera propia, solo le quedaba combinar con una pluma
  // deportiva-casual, algo que no pasa en la vida real (un tapado de paño
  // es la prenda de abrigo estándar sobre un traje o pantalón de vestir,
  // no una campera de pluma). Gris carbón -- combina con el pantalón/
  // sweater gris ya existentes y no repite el negro/azul marino que ya
  // domina el resto de camperas clásicas. Textura "lana": el paño de
  // tapado es lana tejida apretada, la aproximación más cercana que tiene
  // el enum sin inventar una textura "paño" que no existe.
  { id: "tapado-pano-gris", nombre: "Tapado de paño gris", categoria: "campera", colorHex: "#4A4A4A", textura: "lana", estilo: "clasico", ocasion: "laburo", estacion: "invierno" },

  // --- Sacos ---
  // Categoría nueva -- pedido explícito del usuario ("quiero que agregues
  // al catálogo... un traje azul marino"). Revisado como modista: un
  // traje son DOS prendas por separado (saco + pantalón de vestir), no una
  // sola -- el pantalón de vestir ya existe en el catálogo hace rato
  // (pantalon-vestir-azul y compañía, más arriba); lo que faltaba era el
  // saco en sí. No es una "campera" -- una campera es ropa de calle/
  // abrigo (cierre de cremallera, cuello camisero simple, ver Maniqui.tsx),
  // un saco de traje es tailoring (solapas, botones, se usa abierto sobre
  // camisa y corbata) -- por eso su propia categoría, no una campera con
  // otro color. Azul marino (#1F2A44), el mismo hex que ya usan pantalon-
  // vestir-azul/sweater-azul-marino/corbata-azul-marino/zapatillas-azul-
  // marino -- consistencia de paleta cross-categoría, mismo criterio que
  // ya documenta el resto del archivo. Textura "lana": el paño de traje es
  // lana tejida, la aproximación más cercana que tiene el enum (mismo
  // criterio que tapado-pano-gris de acá arriba). Sin `estacion`: a
  // diferencia de sweater/campera, un traje no se elige por temperatura --
  // se usa para una ocasión formal sea la época del año que sea (mismo
  // criterio que se aplicó a buzo en la revisión anterior, por el mismo
  // motivo real: no es una dimensión que determine sin ambigüedad si es de
  // entretiempo o invierno).
  // calce "ajustado" -- un saco/blazer de sastrería real es entallado, no
  // ancho (auditoría de sastrería, Consejo, ronda de auditoría del motor).
  { id: "saco-azul-marino", nombre: "Saco azul marino", categoria: "saco", colorHex: "#1F2A44", textura: "lana", estilo: "formal", ocasion: "laburo", calce: "ajustado" },

  // --- Accesorios ---
  // Reusa hex ya presentes en otras categorías (azul marino, bordo) a
  // propósito, no por pereza: mantiene la consistencia cross-categoría del
  // catálogo (una corbata azul marino combina con las prendas azul marino
  // ya cargadas, no con un azul ligeramente distinto).
  { id: "cinturon-negro", nombre: "Cinturón negro de cuero", categoria: "accesorio", colorHex: "#1A1A1A", textura: "cuero_liso", estilo: "clasico" },
  { id: "cinturon-marron", nombre: "Cinturón marrón de cuero", categoria: "accesorio", colorHex: "#5C3A21", textura: "cuero_liso", estilo: "clasico" },
  { id: "corbata-azul-marino", nombre: "Corbata azul marino", categoria: "accesorio", colorHex: "#1F2A44", textura: "seda", estilo: "formal", ocasion: "laburo", requiereCuello: true, posicionAccesorio: "cuello" },
  { id: "corbata-bordo", nombre: "Corbata bordo", categoria: "accesorio", colorHex: "#6B2737", textura: "seda", estilo: "formal", ocasion: "laburo", requiereCuello: true, posicionAccesorio: "cuello" },
  // roja -- la corbata de vestir más clásica que existe ("power tie"), un
  // vacío real en un catálogo que hasta ahora solo tenía azul marino/bordó.
  { id: "corbata-roja", nombre: "Corbata roja", categoria: "accesorio", colorHex: "#A6332B", textura: "seda", estilo: "formal", ocasion: "laburo", requiereCuello: true, posicionAccesorio: "cuello" },
  { id: "bufanda-gris", nombre: "Bufanda gris", categoria: "accesorio", colorHex: "#8C8C8C", textura: "lana", estilo: "casual", ocasion: "casual", posicionAccesorio: "cuello" },
  // roja -- mismo hex que remera-roja de arriba, mismo criterio de paleta
  // consistente que ya documenta el archivo (una bufanda roja combina con
  // la remera roja ya cargada, no con un rojo ligeramente distinto). Color
  // de acento típico de bufanda de invierno.
  { id: "bufanda-roja", nombre: "Bufanda roja", categoria: "accesorio", colorHex: "#B93A32", textura: "lana", estilo: "casual", ocasion: "casual", posicionAccesorio: "cuello" },
];

/** Deriva h/s/l de cada preset una sola vez (no en cada render). hsl2 solo
 *  cuando el preset declara colorHex2 (estampado real) -- undefined si no,
 *  no se inventa un segundo color para una prenda lisa. */
export const CATALOGO_CON_HSL = CATALOGO_PRENDAS.map((p) => ({
  ...p,
  hsl: hexToHsl(p.colorHex),
  hsl2: p.colorHex2 ? hexToHsl(p.colorHex2) : undefined,
}));

/** Convierte un preset del catálogo en una Prenda sintética -- misma forma
 *  que una fila real de Supabase, para poder pasarla a Maniqui/recomendar()
 *  sin que les importe que no está guardada. Se usa para mostrar "esto es
 *  lo que te sugerimos comprar" en Outfits (armarOutfitsParaComprar en
 *  recommend.ts). El id lleva el prefijo "sugerida-" a propósito: es lo que
 *  Outfits.tsx usa para marcar visualmente esa prenda como "no la tenés
 *  todavía" en el maniquí, y para no intentar guardarla como si fuera una
 *  prenda real del usuario. */
export function presetAPrendaSintetica(preset: PresetPrenda & { hsl: { h: number; s: number; l: number } }): Prenda {
  // hsl2 se recalcula acá (no se exige en el tipo del parámetro) para no
  // tener que tocar la firma en los ~26 lugares que ya la usan sin
  // estampado -- mismo hexToHsl que ya usa CATALOGO_CON_HSL para el color
  // principal.
  const hsl2 = preset.colorHex2 ? hexToHsl(preset.colorHex2) : null;
  return {
    id: `sugerida-${preset.id}`,
    user_id: "",
    categoria: preset.categoria,
    color_hex: preset.colorHex,
    color_h: preset.hsl.h,
    color_s: preset.hsl.s,
    color_l: preset.hsl.l,
    textura: preset.textura ?? null,
    estilo: preset.estilo ?? null,
    estilos_secundarios: preset.estilosSecundarios ?? [],
    ocasion: preset.ocasion ?? null,
    estacion: preset.estacion ?? null,
    foto_path: null,
    suela_contraste: preset.suelaContraste ?? false,
    requiere_cuello: preset.requiereCuello ?? false,
    posicion_accesorio: preset.posicionAccesorio ?? "cintura",
    con_capucha: preset.conCapucha ?? true,
    patron: preset.patron ?? "liso",
    color2_hex: preset.colorHex2 ?? null,
    color2_h: hsl2?.h ?? null,
    color2_s: hsl2?.s ?? null,
    color2_l: hsl2?.l ?? null,
    corte_calzado: preset.corteCalzado ?? "zapatilla_urbana",
    calce: preset.calce ?? "regular",
    created_at: "",
    updated_at: "",
  };
}
